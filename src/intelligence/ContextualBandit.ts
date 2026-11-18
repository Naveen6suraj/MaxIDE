/**
 * MaxIDE APEX — Mission 7: Contextual Bandit Reinforcement Learning Engine (Module C)
 * Implements practical, lightweight, verifiable Contextual Bandit policy optimization:
 * - Upper Confidence Bound (UCB1) with conservative prior regularization
 * - Thompson Sampling (Beta posterior with Marsaglia-Tsang Gamma sampler + seeded deterministic PRNG)
 * - Context-aware arm statistics stored in SQLite (taskCategory::platform::modelTier)
 * - Consecutive-failure penalty to avoid repeatedly selecting failing strategies
 * - Full policy versioning, snapshotting, and instant rollback
 */

import { ExperienceMemory } from './ExperienceMemory.js';
import { DEFAULT_REWARD_WEIGHTS, RewardWeights } from './SelfEvaluationEngine.js';

export type BanditAlgorithm = 'UCB1' | 'THOMPSON_SAMPLING';

export interface BanditContext {
  taskCategory: string;
  platform: string;
  modelTier: 'local-small' | 'local-medium' | 'cloud';
}

export interface ArmStatistics {
  contextKey: string;
  strategyId: string;
  pulls: number;
  totalReward: number;
  meanReward: number;
  alpha: number;
  beta: number;
  successes: number;
  failures: number;
  successRate: number;
  consecutiveFailures: number;
  lastUpdated: string;
}

export interface BanditSelection {
  selectedStrategyId: string;
  contextKey: string;
  algorithm: BanditAlgorithm;
  exploratory: boolean;
  scores: Array<{
    strategyId: string;
    score: number;
    meanReward: number;
    pulls: number;
    uncertaintyBonus: number;
  }>;
  rationale: string;
}

export interface PolicyVersionRecord {
  versionId: string;
  algorithm: BanditAlgorithm;
  explorationC: number;
  rewardWeights: RewardWeights;
  benchmarkScore: number;
  isActive: boolean;
  notes: string;
  createdAt: string;
}

/**
 * Deterministic Mulberry32 PRNG for reproducible offline evaluation tests.
 */
class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  public next(): number {
    this.state += 0x6D2B79F5;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export class ContextualBandit {
  private algorithm: BanditAlgorithm = 'UCB1';
  private explorationC: number = 0.75; // Conservative exploration factor
  private priorPulls: number = 2;      // Regularization preventing single-sample overfitting
  private deterministicMode: boolean = false;
  private rng: SeededRandom = new SeededRandom(42);

  constructor(private memory: ExperienceMemory, options?: { algorithm?: BanditAlgorithm; explorationC?: number; deterministicSeed?: number }) {
    if (options?.algorithm) this.algorithm = options.algorithm;
    if (options?.explorationC !== undefined) this.explorationC = options.explorationC;
    if (options?.deterministicSeed !== undefined) {
      this.deterministicMode = true;
      this.rng = new SeededRandom(options.deterministicSeed);
    }
  }

  public static buildContextKey(ctx: BanditContext): string {
    return `${ctx.taskCategory.toUpperCase()}::${ctx.platform.toUpperCase()}::${ctx.modelTier}`;
  }

  public setAlgorithm(algo: BanditAlgorithm): void {
    this.algorithm = algo;
  }

  public getAlgorithm(): BanditAlgorithm {
    return this.algorithm;
  }

  public setDeterministicMode(enabled: boolean, seed: number = 42): void {
    this.deterministicMode = enabled;
    this.rng = new SeededRandom(seed);
  }

  private random(): number {
    return this.deterministicMode ? this.rng.next() : Math.random();
  }

  public getArm(contextKey: string, strategyId: string): ArmStatistics {
    const row = this.memory.queryAll(
      `SELECT * FROM bandit_arms WHERE context_key = ? AND strategy_id = ?`,
      [contextKey, strategyId]
    )[0];

    if (!row) {
      return {
        contextKey,
        strategyId,
        pulls: 0,
        totalReward: 0,
        meanReward: 0,
        alpha: 1.5, // Conservative neutral Beta prior
        beta: 1.5,
        successes: 0,
        failures: 0,
        successRate: 0,
        consecutiveFailures: 0,
        lastUpdated: '',
      };
    }

    const pulls = Number(row.pulls || 0);
    const totalReward = Number(row.total_reward || 0);
    const successes = Number(row.successes || 0);
    return {
      contextKey: row.context_key,
      strategyId: row.strategy_id,
      pulls,
      totalReward,
      meanReward: pulls > 0 ? round4(totalReward / pulls) : 0,
      alpha: Number(row.alpha || 1.5),
      beta: Number(row.beta || 1.5),
      successes,
      failures: Number(row.failures || 0),
      successRate: pulls > 0 ? round4((successes / pulls) * 100) : 0,
      consecutiveFailures: Number(row.consecutive_failures || 0),
      lastUpdated: row.last_updated || '',
    };
  }

  public getAllArmStats(): ArmStatistics[] {
    return this.memory.queryAll(`SELECT * FROM bandit_arms ORDER BY pulls DESC, total_reward DESC`).map((row) => {
      const pulls = Number(row.pulls || 0);
      const totalReward = Number(row.total_reward || 0);
      const successes = Number(row.successes || 0);
      return {
        contextKey: row.context_key,
        strategyId: row.strategy_id,
        pulls,
        totalReward,
        meanReward: pulls > 0 ? round4(totalReward / pulls) : 0,
        alpha: Number(row.alpha || 1.5),
        beta: Number(row.beta || 1.5),
        successes,
        failures: Number(row.failures || 0),
        successRate: pulls > 0 ? round4((successes / pulls) * 100) : 0,
        consecutiveFailures: Number(row.consecutive_failures || 0),
        lastUpdated: row.last_updated || '',
      };
    });
  }

  /**
   * Select optimal strategy among feasible candidates using Contextual UCB1 or Thompson Sampling.
   * Incorporates heuristic base scores so cold-start decisions remain engineering-sound.
   */
  public selectStrategy(
    context: BanditContext,
    candidateStrategyIds: string[],
    heuristicPriors?: Record<string, number>
  ): BanditSelection {
    if (candidateStrategyIds.length === 0) {
      throw new Error('ContextualBandit.selectStrategy requires at least one candidate strategy.');
    }

    const contextKey = ContextualBandit.buildContextKey(context);
    const arms = candidateStrategyIds.map((id) => this.getArm(contextKey, id));
    const totalPulls = arms.reduce((acc, a) => acc + a.pulls, 0);

    const scores: BanditSelection['scores'] = [];
    let bestId = candidateStrategyIds[0];
    let bestScore = -Infinity;
    let bestExploitId = candidateStrategyIds[0];
    let bestExploitMean = -Infinity;

    for (const arm of arms) {
      const priorNorm = heuristicPriors && heuristicPriors[arm.strategyId] !== undefined
        ? heuristicPriors[arm.strategyId] // expected in [0, 1]
        : 0.5;
      // Regularized empirical mean (prevents overfitting to 1 sample)
      const empirical01 = (arm.meanReward + 1) / 2;
      const regMean = (arm.pulls * empirical01 + this.priorPulls * priorNorm) / (arm.pulls + this.priorPulls);

      // Penalize strategies with repeated consecutive failures in the same context
      const failureDamping = arm.consecutiveFailures >= 2 ? Math.min(0.45, arm.consecutiveFailures * 0.14) : 0;

      let uncertaintyBonus = 0;
      let score = 0;

      if (this.algorithm === 'THOMPSON_SAMPLING') {
        const sampled = this.sampleBeta(arm.alpha, arm.beta);
        // Blend sampled posterior with prior heuristic when sample count is tiny
        const weight = arm.pulls / (arm.pulls + this.priorPulls);
        score = weight * sampled + (1 - weight) * priorNorm - failureDamping;
        uncertaintyBonus = round4(score - regMean);
      } else {
        // Contextual UCB1
        uncertaintyBonus = this.explorationC * Math.sqrt(Math.log(totalPulls + 2) / (arm.pulls + 1));
        score = regMean + uncertaintyBonus - failureDamping;
      }

      if (regMean > bestExploitMean) {
        bestExploitMean = regMean;
        bestExploitId = arm.strategyId;
      }
      if (score > bestScore) {
        bestScore = score;
        bestId = arm.strategyId;
      }

      scores.push({
        strategyId: arm.strategyId,
        score: round4(score),
        meanReward: arm.meanReward,
        pulls: arm.pulls,
        uncertaintyBonus: round4(uncertaintyBonus),
      });
    }

    scores.sort((a, b) => b.score - a.score);
    const exploratory = bestId !== bestExploitId && totalPulls > 0;

    return {
      selectedStrategyId: bestId,
      contextKey,
      algorithm: this.algorithm,
      exploratory,
      scores,
      rationale: `${this.algorithm} selected "${bestId}" for context ${contextKey} (score=${bestScore.toFixed(3)}, totalPulls=${totalPulls}${exploratory ? ', conservative exploration' : ', exploiting verified performance'}).`,
    };
  }

  /**
   * Update arm posterior & empirical statistics after verified evaluation.
   */
  public recordOutcome(context: BanditContext, strategyId: string, reward: number, succeeded: boolean): ArmStatistics {
    const contextKey = ContextualBandit.buildContextKey(context);
    const current = this.getArm(contextKey, strategyId);
    const clampedReward = Math.max(-1, Math.min(1, reward));
    const reward01 = (clampedReward + 1) / 2;

    const pulls = current.pulls + 1;
    const totalReward = round4(current.totalReward + clampedReward);
    const sumSq = round4(current.pulls > 0 ? current.totalReward * current.totalReward / current.pulls + clampedReward * clampedReward : clampedReward * clampedReward);
    const alpha = round4(current.alpha + reward01);
    const beta = round4(current.beta + (1 - reward01));
    const successes = current.successes + (succeeded ? 1 : 0);
    const failures = current.failures + (succeeded ? 0 : 1);
    const consecutiveFailures = succeeded ? 0 : current.consecutiveFailures + 1;
    const now = new Date().toISOString();

    this.memory.execute(
      `INSERT OR REPLACE INTO bandit_arms
       (context_key, strategy_id, pulls, total_reward, sum_sq_reward, alpha, beta, successes, failures, consecutive_failures, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [contextKey, strategyId, pulls, totalReward, sumSq, alpha, beta, successes, failures, consecutiveFailures, now]
    );

    return this.getArm(contextKey, strategyId);
  }

  /**
   * Snapshot current bandit policy & reward weights as an immutable versioned release.
   */
  public createPolicyVersion(notes: string, benchmarkScore: number, rewardWeights: RewardWeights = DEFAULT_REWARD_WEIGHTS, activate: boolean = true): PolicyVersionRecord {
    const versionId = `pol-v${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const createdAt = new Date().toISOString();
    const arms = this.getAllArmStats();

    if (activate) {
      this.memory.execute(`UPDATE policy_versions SET is_active = 0`, [], false);
    }

    this.memory.execute(
      `INSERT INTO policy_versions
       (version_id, algorithm, exploration_c, reward_weights_json, arms_snapshot_json, benchmark_score, is_active, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        this.algorithm,
        this.explorationC,
        JSON.stringify(rewardWeights),
        JSON.stringify(arms),
        round4(benchmarkScore),
        activate ? 1 : 0,
        notes,
        createdAt,
      ]
    );

    return {
      versionId,
      algorithm: this.algorithm,
      explorationC: this.explorationC,
      rewardWeights,
      benchmarkScore: round4(benchmarkScore),
      isActive: activate,
      notes,
      createdAt,
    };
  }

  public getPolicyVersions(): PolicyVersionRecord[] {
    return this.memory.queryAll(`SELECT * FROM policy_versions ORDER BY created_at DESC LIMIT 30`).map((r) => {
      let weights = DEFAULT_REWARD_WEIGHTS;
      try { weights = JSON.parse(r.reward_weights_json); } catch {}
      return {
        versionId: r.version_id,
        algorithm: r.algorithm as BanditAlgorithm,
        explorationC: Number(r.exploration_c || 0.75),
        rewardWeights: weights,
        benchmarkScore: Number(r.benchmark_score || 0),
        isActive: Boolean(r.is_active),
        notes: r.notes || '',
        createdAt: r.created_at,
      };
    });
  }

  /**
   * Roll back arm statistics, algorithm, and weights to any prior versioned snapshot.
   */
  public rollbackPolicy(versionId: string): { success: boolean; restoredVersion?: PolicyVersionRecord; error?: string } {
    const row = this.memory.queryAll(`SELECT * FROM policy_versions WHERE version_id = ?`, [versionId])[0];
    if (!row) {
      return { success: false, error: `Policy version "${versionId}" not found.` };
    }

    let arms: ArmStatistics[] = [];
    try { arms = JSON.parse(row.arms_snapshot_json || '[]'); } catch {}

    this.algorithm = (row.algorithm as BanditAlgorithm) || 'UCB1';
    this.explorationC = Number(row.exploration_c || 0.75);

    this.memory.execute(`DELETE FROM bandit_arms`, [], false);
    for (const a of arms) {
      this.memory.execute(
        `INSERT INTO bandit_arms
         (context_key, strategy_id, pulls, total_reward, sum_sq_reward, alpha, beta, successes, failures, consecutive_failures, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          a.contextKey,
          a.strategyId,
          a.pulls,
          a.totalReward,
          0,
          a.alpha,
          a.beta,
          a.successes,
          a.failures,
          a.consecutiveFailures,
          a.lastUpdated || new Date().toISOString(),
        ],
        false
      );
    }
    this.memory.execute(`UPDATE policy_versions SET is_active = 0`, [], false);
    this.memory.execute(`UPDATE policy_versions SET is_active = 1 WHERE version_id = ?`, [versionId], true);

    const restored = this.getPolicyVersions().find((v) => v.versionId === versionId);
    return { success: true, restoredVersion: restored };
  }

  // --- Beta(alpha, beta) Sampling via Gamma(alpha, 1) / (Gamma(alpha, 1) + Gamma(beta, 1)) ---
  private sampleBeta(alpha: number, beta: number): number {
    const x = this.sampleGamma(Math.max(0.1, alpha));
    const y = this.sampleGamma(Math.max(0.1, beta));
    return x + y > 0 ? x / (x + y) : 0.5;
  }

  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.max(1e-9, this.random()), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (let iter = 0; iter < 50; iter++) {
      let x = 0;
      let v = 0;
      do {
        x = this.sampleStandardNormal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(Math.max(1e-12, u)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
    return d;
  }

  private sampleStandardNormal(): number {
    const u1 = Math.max(1e-12, this.random());
    const u2 = this.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
