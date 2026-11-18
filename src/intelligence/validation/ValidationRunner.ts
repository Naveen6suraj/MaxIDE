/**
 * MaxIDE APEX — Mission 8: Independent Scientific Validation Runner
 * Evaluates Systems A, B, C, D on identical 120-scenario benchmark tasks using
 * the UNMODIFIED Mission 7 SelfEvaluationEngine, ContextualBandit, and ExperienceMemory.
 *
 * Implements:
 *  - 4-System Comparison across 9 engineering metrics + 95% CI (5 seeds)
 *  - Learning Curves over 10, 50, 100, 250, 500, 1000 tasks (mean, variance, 95% CI)
 *  - Pathology Checks: Overfitting, Catastrophic Forgetting, Strategy Collapse,
 *    Reward Exploitation, Poor Exploration, Excessive Retries, Memory Contamination
 *  - Generalization Tests: Unseen Domains, Unseen Model Tiers, Unseen Combos
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { BanditAlgorithm, BanditContext, ContextualBandit } from '../ContextualBandit.js';
import { ExperienceMemory } from '../ExperienceMemory.js';
import { SelfEvaluationEngine } from '../SelfEvaluationEngine.js';
import {
  BENCHMARK_VERSION,
  BenchmarkDomain,
  BenchmarkRng,
  BenchmarkScenario,
  buildMission8Benchmark,
  simulateExecutionOutcome,
  verifyZeroDataLeakage,
} from './BenchmarkSuite.js';

export type SystemVariant = 'A_BASELINE' | 'B_HEURISTIC' | 'C_BANDIT_NO_MEM' | 'D_BANDIT_WITH_MEM';

export interface MetricsSummary {
  verifiedCompletionRate: number; // %
  requirementCoverage: number;    // %
  buildSuccessRate: number;       // %
  testSuccessRate: number;        // %
  regressionRate: number;         // %
  securityViolationRate: number;  // %
  securityViolationsCount: number;
  userCorrectionRate: number;     // %
  meanExecutionCostMs: number;
  recoverySuccessRate: number;    // %
  meanReward: number;             // [-1, +1]
}

export interface ConfidenceIntervalStat {
  mean: number;
  variance: number;
  stdDev: number;
  ci95Low: number;
  ci95High: number;
  n: number;
}

export interface SystemComparisonResult {
  system: SystemVariant;
  label: string;
  seeds: number[];
  holdoutTasksPerSeed: number;
  metrics: MetricsSummary;
  completionCI95: ConfidenceIntervalStat;
  rewardCI95: ConfidenceIntervalStat;
  strategyDistribution: Record<string, number>;
}

export interface LearningCurvePoint {
  budget: number;
  systemC_completion: ConfidenceIntervalStat;
  systemD_completion: ConfidenceIntervalStat;
  systemD_reward: ConfidenceIntervalStat;
  trainCompletionMean: number;
  overfitGapPct: number;
  strategyEntropyNorm: number;
  armCoveragePct: number;
}

export interface PathologyAuditReport {
  overfitting: { trainCompletionPct: number; holdoutCompletionPct: number; gapPct: number; detected: boolean };
  catastrophicForgetting: {
    group1BeforePct: number;
    group1AfterGroup2TrainingPct: number;
    forgettingDeltaPct: number;
    detected: boolean;
  };
  strategyCollapse: { normalizedEntropy: number; uniqueStrategiesUsed: number; totalCandidateStrategies: number; detected: boolean };
  rewardExploitation: { baselineReward: number; learnedReward: number; baselineCompletionPct: number; learnedCompletionPct: number; rewardWithoutCompletionGain: boolean };
  poorExploration: { exploredArms: number; totalArms: number; coveragePct: number; detected: boolean };
  excessiveRetries: { baselineRetryRatePct: number; learnedRetryRatePct: number; detected: boolean };
  memoryContamination: {
    cleanHoldoutCompletionPct: number;
    contaminatedHoldoutCompletionPct: number;
    degradationPct: number;
    detected: boolean;
  };
}

export interface GeneralizationReport {
  crossDomain: {
    trainDomains: BenchmarkDomain[];
    unseenDomains: BenchmarkDomain[];
    baselineCompletionPct: number;
    heuristicCompletionPct: number;
    banditNoMemCompletionPct: number;
    banditWithMemCompletionPct: number;
    memoryTransferDeltaPct: number;
  };
  crossModelTier: {
    trainTier: string;
    unseenTiers: string[];
    baselineCompletionPct: number;
    heuristicCompletionPct: number;
    banditNoMemCompletionPct: number;
    banditWithMemCompletionPct: number;
    notes: string;
  };
  unseenCombos: Array<{
    comboLabel: string;
    baselinePct: number;
    learnedPct: number;
    deltaPct: number;
  }>;
}

export interface FullValidationReport {
  benchmarkVersion: string;
  generatedAt: string;
  source: 'SIMULATED_BENCHMARK';
  totalScenarios: number;
  trainCount: number;
  validationCount: number;
  holdoutCount: number;
  zeroLeakageVerified: boolean;
  algorithm: BanditAlgorithm;
  seeds: number[];
  systemComparison: SystemComparisonResult[];
  learningCurves: LearningCurvePoint[];
  pathologies: PathologyAuditReport;
  generalization: GeneralizationReport;
}

export function computeCI95(values: number[]): ConfidenceIntervalStat {
  const n = values.length;
  if (n === 0) return { mean: 0, variance: 0, stdDev: 0, ci95Low: 0, ci95High: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const margin = n > 1 ? 1.96 * (stdDev / Math.sqrt(n)) : 0;
  return {
    mean: round3(mean),
    variance: round4(variance),
    stdDev: round3(stdDev),
    ci95Low: round3(mean - margin),
    ci95High: round3(mean + margin),
    n,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function buildScenarioContext(sc: BenchmarkScenario): BanditContext {
  // Include domain in taskCategory context so domain-specific strategies are cleanly scoped
  return {
    taskCategory: `${sc.taskCategory}_${sc.domain}`,
    platform: sc.targetPlatform,
    modelTier: sc.modelTier,
  };
}

function selectStrategyForSystem(
  system: SystemVariant,
  sc: BenchmarkScenario,
  bandit: ContextualBandit | null,
  memory: ExperienceMemory | null,
  exploitOnly: boolean = false
): string {
  if (system === 'A_BASELINE') {
    return sc.baselineStrategyId;
  }

  if (system === 'B_HEURISTIC') {
    let best = sc.candidateStrategies[0];
    let bestScore = -Infinity;
    for (const s of sc.candidateStrategies) {
      const h = sc.heuristicPriors[s] ?? 0.5;
      if (h > bestScore) {
        bestScore = h;
        best = s;
      }
    }
    return best;
  }

  // Systems C & D use ContextualBandit
  const ctx = buildScenarioContext(sc);
  const priors: Record<string, number> = { ...sc.heuristicPriors };

  if (system === 'D_BANDIT_WITH_MEM' && memory) {
    // Retrieve similar past experiences from SQLite ExperienceMemory (cross-domain similarity!)
    const similar = memory.retrieveSimilarEpisodes(
      `${sc.prompt} ${sc.language} ${sc.framework} ${sc.domain} ${sc.errorCategory}`,
      { topK: 6, minSimilarity: 0.12 }
    );
    for (const strat of sc.candidateStrategies) {
      let p = priors[strat] ?? 0.5;
      const verifiedPos = similar.filter((m) => m.episode.strategyId === strat && m.episode.verified && m.episode.reward > 0.3);
      const verifiedNeg = similar.filter((m) => m.episode.strategyId === strat && (!m.episode.verified || m.episode.reward < 0));
      if (verifiedPos.length > 0) {
        const avgSim = verifiedPos.reduce((a, b) => a + b.similarity, 0) / verifiedPos.length;
        p = Math.min(0.98, p + 0.12 * avgSim * Math.min(3, verifiedPos.length));
      }
      if (verifiedNeg.length > 0) {
        const avgSim = verifiedNeg.reduce((a, b) => a + b.similarity, 0) / verifiedNeg.length;
        p = Math.max(0.05, p - 0.14 * avgSim * Math.min(3, verifiedNeg.length));
      }
      priors[strat] = round4(p);
    }
  }

  return bandit!.selectStrategy(ctx, sc.candidateStrategies, priors, { exploitOnly }).selectedStrategyId;
}

/**
 * Train Systems C or D for exactly `budget` episodes drawn deterministically from `trainScenarios`.
 * Uses fast in-memory SQLite transaction without redundant per-row disk renames, then flushes once.
 */
async function createAndTrainSystem(
  system: SystemVariant,
  trainScenarios: BenchmarkScenario[],
  budget: number,
  seed: number,
  algorithm: BanditAlgorithm,
  tmpDir: string
): Promise<{
  memory: ExperienceMemory;
  bandit: ContextualBandit;
  evaluator: SelfEvaluationEngine;
  trainCompletionPct: number;
  exploredArms: number;
  totalArms: number;
}> {
  const dbPath = path.join(tmpDir, `val-${system}-${budget}-${seed}-${Math.random().toString(36).slice(2, 6)}.sqlite`);
  const memory = new ExperienceMemory(dbPath);
  await memory.ready();
  const evaluator = new SelfEvaluationEngine(memory);
  const bandit = new ContextualBandit(memory, { algorithm, deterministicSeed: seed });

  // Disable per-statement disk flush during high-volume simulation training (keeps exact SQLite engine!)
  const origFlush = memory.flush.bind(memory);
  (memory as any).flush = () => {};

  const rng = new BenchmarkRng(seed * 7919 + budget);
  let trainSuccesses = 0;

  if (system === 'C_BANDIT_NO_MEM' || system === 'D_BANDIT_WITH_MEM') {
    for (let step = 0; step < budget; step++) {
      const sc = trainScenarios[step % trainScenarios.length];
      const chosen = selectStrategyForSystem(
        system,
        sc,
        bandit,
        system === 'D_BANDIT_WITH_MEM' ? memory : null
      );
      const outcome = simulateExecutionOutcome(sc, chosen, rng);
      const ctx = buildScenarioContext(sc);
      const currentArm = bandit.getArm(ContextualBandit.buildContextKey(ctx), chosen);

      // Evaluate through UNMODIFIED Mission 7 SelfEvaluationEngine!
      const evalRec = evaluator.evaluate({
        episodeId: `tr-${step}`,
        projectId: `proj-${sc.domain}`,
        requirementCoverageEstimate: outcome.requirementCoverage,
        repeatedStrategyFailureCount: currentArm.consecutiveFailures,
        userFeedbackRating: outcome.userFeedbackRating,
        evidence: outcome.evidence,
      });

      const succeeded = evalRec.status === 'COMPLETED' && evalRec.verified;
      if (succeeded) trainSuccesses++;

      bandit.recordOutcome(ctx, chosen, evalRec.reward, succeeded);

      if (system === 'D_BANDIT_WITH_MEM') {
        memory.recordEpisode({
          id: `tr-${step}-${seed}`,
          projectId: `proj-${sc.domain}`,
          taskCategory: sc.taskCategory,
          platform: sc.targetPlatform,
          prompt: `${sc.prompt} [${sc.language} ${sc.framework} ${sc.domain}]`,
          strategyId: chosen,
          modelId: sc.modelTier === 'cloud' ? 'gemini-2.5-flash' : sc.modelTier === 'local-medium' ? 'qwen2.5-coder:7b' : 'qwen2.5-coder:3b',
          status: evalRec.status,
          verified: evalRec.verified,
          reward: evalRec.reward,
          durationMs: outcome.durationMs,
          filesChanged: outcome.evidence.filesModified,
          toolFailures: outcome.hadInitialError ? ['initial_tool_error'] : [],
          testPassed: outcome.testPassed,
          userFeedbackRating: outcome.userFeedbackRating,
          summary: `${sc.domain} ${sc.framework} via ${chosen}: ${evalRec.status}`,
        });
      }
    }
  }

  (memory as any).flush = origFlush;
  const totalUniqueArms = new Set(
    trainScenarios.flatMap((sc) =>
      sc.candidateStrategies.map((s) => `${ContextualBandit.buildContextKey(buildScenarioContext(sc))}::${s}`)
    )
  ).size;
  const exploredArms = bandit.getAllArmStats().filter((a) => a.pulls > 0).length;

  return {
    memory,
    bandit,
    evaluator,
    trainCompletionPct: budget > 0 ? round3((trainSuccesses / budget) * 100) : 0,
    exploredArms,
    totalArms: totalUniqueArms,
  };
}

function evaluateOnSet(
  system: SystemVariant,
  evalScenarios: BenchmarkScenario[],
  bandit: ContextualBandit | null,
  memory: ExperienceMemory | null,
  evaluator: SelfEvaluationEngine,
  seed: number,
  exploitOnly: boolean = false
): { metrics: MetricsSummary; strategyCounts: Record<string, number>; retryRatePct: number } {
  const rng = new BenchmarkRng(seed * 104729 + 31);
  // Deterministic exploitation check on holdout
  if (bandit) bandit.setDeterministicMode(true, seed * 313 + 7);

  let verifiedOk = 0;
  let coverageSum = 0;
  let buildOk = 0;
  let testOk = 0;
  let regressed = 0;
  let secViolations = 0;
  let userCorrections = 0;
  let durationSum = 0;
  let hadErrCount = 0;
  let recoveredCount = 0;
  let rewardSum = 0;
  const strategyCounts: Record<string, number> = {};

  for (let i = 0; i < evalScenarios.length; i++) {
    const sc = evalScenarios[i];
    const chosen = selectStrategyForSystem(system, sc, bandit, system === 'D_BANDIT_WITH_MEM' ? memory : null, exploitOnly);
    strategyCounts[chosen] = (strategyCounts[chosen] || 0) + 1;

    const outcome = simulateExecutionOutcome(sc, chosen, rng);
    const evalRec = evaluator.evaluate({
      episodeId: `ev-${seed}-${i}`,
      projectId: `proj-${sc.domain}`,
      requirementCoverageEstimate: outcome.requirementCoverage,
      userFeedbackRating: outcome.userFeedbackRating,
      evidence: outcome.evidence,
    });

    if (outcome.verifiedCompleted) verifiedOk++;
    coverageSum += outcome.requirementCoverage;
    if (outcome.buildPassed) buildOk++;
    if (outcome.testPassed) testOk++;
    if (outcome.regressed) regressed++;
    if (outcome.securityViolation) secViolations++;
    if (outcome.userCorrectionRequired) userCorrections++;
    durationSum += outcome.durationMs;
    if (outcome.hadInitialError) {
      hadErrCount++;
      if (outcome.recoveredFromError) recoveredCount++;
    }
    rewardSum += evalRec.reward;
  }

  const n = Math.max(1, evalScenarios.length);
  return {
    metrics: {
      verifiedCompletionRate: round3((verifiedOk / n) * 100),
      requirementCoverage: round3((coverageSum / n) * 100),
      buildSuccessRate: round3((buildOk / n) * 100),
      testSuccessRate: round3((testOk / n) * 100),
      regressionRate: round3((regressed / n) * 100),
      securityViolationRate: round3((secViolations / n) * 100),
      securityViolationsCount: secViolations,
      userCorrectionRate: round3((userCorrections / n) * 100),
      meanExecutionCostMs: Math.round(durationSum / n),
      recoverySuccessRate: hadErrCount > 0 ? round3((recoveredCount / hadErrCount) * 100) : 100,
      meanReward: round4(rewardSum / n),
    },
    strategyCounts,
    retryRatePct: round3((hadErrCount / n) * 100),
  };
}

function normalizedEntropy(counts: Record<string, number>): number {
  const vals = Object.values(counts).filter((v) => v > 0);
  if (vals.length <= 1) return 0;
  const total = vals.reduce((a, b) => a + b, 0);
  let h = 0;
  for (const v of vals) {
    const p = v / total;
    h -= p * Math.log2(p);
  }
  return round4(h / Math.log2(vals.length));
}

function averageMetrics(list: MetricsSummary[]): MetricsSummary {
  const n = Math.max(1, list.length);
  return {
    verifiedCompletionRate: round3(list.reduce((a, m) => a + m.verifiedCompletionRate, 0) / n),
    requirementCoverage: round3(list.reduce((a, m) => a + m.requirementCoverage, 0) / n),
    buildSuccessRate: round3(list.reduce((a, m) => a + m.buildSuccessRate, 0) / n),
    testSuccessRate: round3(list.reduce((a, m) => a + m.testSuccessRate, 0) / n),
    regressionRate: round3(list.reduce((a, m) => a + m.regressionRate, 0) / n),
    securityViolationRate: round3(list.reduce((a, m) => a + m.securityViolationRate, 0) / n),
    securityViolationsCount: list.reduce((a, m) => a + m.securityViolationsCount, 0),
    userCorrectionRate: round3(list.reduce((a, m) => a + m.userCorrectionRate, 0) / n),
    meanExecutionCostMs: Math.round(list.reduce((a, m) => a + m.meanExecutionCostMs, 0) / n),
    recoverySuccessRate: round3(list.reduce((a, m) => a + m.recoverySuccessRate, 0) / n),
    meanReward: round4(list.reduce((a, m) => a + m.meanReward, 0) / n),
  };
}

/**
 * Execute the complete Mission 8 validation study (Sections 2, 3, 4, 5).
 */
export async function runFullMission8Validation(options?: {
  algorithm?: BanditAlgorithm;
  seeds?: number[];
  budgets?: number[];
  exploitOnHoldout?: boolean;
}): Promise<FullValidationReport> {
  const algorithm: BanditAlgorithm = options?.algorithm || 'UCB1';
  const seeds = options?.seeds || [101, 202, 303, 404, 505];
  const budgets = options?.budgets || [10, 50, 100, 250, 500, 1000];
  const exploitOnHoldout = Boolean(options?.exploitOnHoldout);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxide-m8-val-'));

  try {
    const scenarios = buildMission8Benchmark('local-small');
    const leakage = verifyZeroDataLeakage(scenarios);
    const trainSet = scenarios.filter((s) => s.split === 'TRAIN');
    const valSet = scenarios.filter((s) => s.split === 'VALIDATION');
    const holdoutSet = scenarios.filter((s) => s.split === 'HOLDOUT');

    // =========================================================================
    // 1. FOUR-SYSTEM HEAD-TO-HEAD COMPARISON (budget = 250 training tasks)
    // =========================================================================
    const variants: Array<{ id: SystemVariant; label: string }> = [
      { id: 'A_BASELINE', label: 'A. Original Baseline Strategy' },
      { id: 'B_HEURISTIC', label: 'B. Fixed 9-Criteria Heuristic' },
      { id: 'C_BANDIT_NO_MEM', label: 'C. Contextual Bandit (No Memory)' },
      { id: 'D_BANDIT_WITH_MEM', label: 'D. Contextual Bandit + Experience Memory' },
    ];

    const systemComparison: SystemComparisonResult[] = [];
    let baselineRetrySum = 0;
    let learnedRetrySum = 0;
    let lastStrategyCountsD: Record<string, number> = {};

    for (const v of variants) {
      const seedMetrics: MetricsSummary[] = [];
      const mergedCounts: Record<string, number> = {};
      for (const seed of seeds) {
        const trained = await createAndTrainSystem(v.id, trainSet, 250, seed, algorithm, tmpDir);
        const ev = evaluateOnSet(
          v.id,
          holdoutSet,
          v.id === 'C_BANDIT_NO_MEM' || v.id === 'D_BANDIT_WITH_MEM' ? trained.bandit : null,
          v.id === 'D_BANDIT_WITH_MEM' ? trained.memory : null,
          trained.evaluator,
          seed,
          exploitOnHoldout
        );
        seedMetrics.push(ev.metrics);
        for (const [k, cnt] of Object.entries(ev.strategyCounts)) {
          mergedCounts[k] = (mergedCounts[k] || 0) + cnt;
        }
        if (v.id === 'A_BASELINE') baselineRetrySum += ev.retryRatePct;
        if (v.id === 'D_BANDIT_WITH_MEM') learnedRetrySum += ev.retryRatePct;
      }
      if (v.id === 'D_BANDIT_WITH_MEM') lastStrategyCountsD = mergedCounts;

      systemComparison.push({
        system: v.id,
        label: v.label,
        seeds,
        holdoutTasksPerSeed: holdoutSet.length,
        metrics: averageMetrics(seedMetrics),
        completionCI95: computeCI95(seedMetrics.map((m) => m.verifiedCompletionRate)),
        rewardCI95: computeCI95(seedMetrics.map((m) => m.meanReward)),
        strategyDistribution: mergedCounts,
      });
    }

    // =========================================================================
    // 2. LEARNING CURVES OVER EXPERIENCE BUDGETS (10..1000 TASKS, 5 SEEDS)
    // =========================================================================
    const learningCurves: LearningCurvePoint[] = [];
    let finalExplored = 0;
    let finalTotalArms = 1;

    for (const budget of budgets) {
      const cComps: number[] = [];
      const dComps: number[] = [];
      const dRews: number[] = [];
      const trainComps: number[] = [];
      const entropies: number[] = [];
      const coverages: number[] = [];

      for (const seed of seeds) {
        const trC = await createAndTrainSystem('C_BANDIT_NO_MEM', trainSet, budget, seed, algorithm, tmpDir);
        const evC = evaluateOnSet('C_BANDIT_NO_MEM', holdoutSet, trC.bandit, null, trC.evaluator, seed, exploitOnHoldout);
        cComps.push(evC.metrics.verifiedCompletionRate);

        const trD = await createAndTrainSystem('D_BANDIT_WITH_MEM', trainSet, budget, seed, algorithm, tmpDir);
        const evD = evaluateOnSet('D_BANDIT_WITH_MEM', holdoutSet, trD.bandit, trD.memory, trD.evaluator, seed, exploitOnHoldout);
        dComps.push(evD.metrics.verifiedCompletionRate);
        dRews.push(evD.metrics.meanReward);
        trainComps.push(trD.trainCompletionPct);
        entropies.push(normalizedEntropy(evD.strategyCounts));
        coverages.push(trD.totalArms > 0 ? (trD.exploredArms / trD.totalArms) * 100 : 0);

        if (budget === budgets[budgets.length - 1] && seed === seeds[0]) {
          finalExplored = trD.exploredArms;
          finalTotalArms = trD.totalArms;
        }
      }

      const dCI = computeCI95(dComps);
      const trainMean = round3(trainComps.reduce((a, b) => a + b, 0) / trainComps.length);
      learningCurves.push({
        budget,
        systemC_completion: computeCI95(cComps),
        systemD_completion: dCI,
        systemD_reward: computeCI95(dRews),
        trainCompletionMean: trainMean,
        overfitGapPct: round3(trainMean - dCI.mean),
        strategyEntropyNorm: round4(entropies.reduce((a, b) => a + b, 0) / entropies.length),
        armCoveragePct: round3(coverages.reduce((a, b) => a + b, 0) / coverages.length),
      });
    }

    // =========================================================================
    // 3. PATHOLOGY AUDIT (Catastrophic Forgetting + Memory Contamination)
    // =========================================================================
    const group1Domains: BenchmarkDomain[] = ['REACT', 'BACKEND', 'DEBUGGING', 'TESTING', 'REFACTORING', 'ARCHITECTURE'];
    const group2Domains: BenchmarkDomain[] = ['NATIVE_WINDOWS', 'NEXTJS', 'DATABASE', 'UI_IMPROVEMENT', 'DEPENDENCY_FAILURE', 'EXISTING_CODEBASE'];
    const g1Train = trainSet.filter((s) => group1Domains.includes(s.domain));
    const g1Holdout = holdoutSet.filter((s) => group1Domains.includes(s.domain));
    const g2Train = trainSet.filter((s) => group2Domains.includes(s.domain));

    // Train on Group 1 -> measure Holdout 1 -> continue training 300 steps on Group 2 -> re-measure Holdout 1
    const forgetTr = await createAndTrainSystem('D_BANDIT_WITH_MEM', g1Train, 180, 101, algorithm, tmpDir);
    const g1Before = evaluateOnSet('D_BANDIT_WITH_MEM', g1Holdout, forgetTr.bandit, forgetTr.memory, forgetTr.evaluator, 101).metrics.verifiedCompletionRate;
    const rngG2 = new BenchmarkRng(909);
    const origF = forgetTr.memory.flush.bind(forgetTr.memory);
    (forgetTr.memory as any).flush = () => {};
    for (let step = 0; step < 300; step++) {
      const sc = g2Train[step % g2Train.length];
      const chosen = selectStrategyForSystem('D_BANDIT_WITH_MEM', sc, forgetTr.bandit, forgetTr.memory);
      const out = simulateExecutionOutcome(sc, chosen, rngG2);
      const ctx = buildScenarioContext(sc);
      const ev = forgetTr.evaluator.evaluate({
        episodeId: `g2-${step}`,
        projectId: `proj-${sc.domain}`,
        requirementCoverageEstimate: out.requirementCoverage,
        evidence: out.evidence,
      });
      forgetTr.bandit.recordOutcome(ctx, chosen, ev.reward, ev.status === 'COMPLETED' && ev.verified);
    }
    (forgetTr.memory as any).flush = origF;
    const g1After = evaluateOnSet('D_BANDIT_WITH_MEM', g1Holdout, forgetTr.bandit, forgetTr.memory, forgetTr.evaluator, 101).metrics.verifiedCompletionRate;
    const forgettingDeltaPct = round3(g1Before - g1After);

    // Memory Contamination Stress Test: Inject 30 adversarial/corrupted failed episodes
    const cleanTr = await createAndTrainSystem('D_BANDIT_WITH_MEM', trainSet, 250, 202, algorithm, tmpDir);
    const cleanHoldoutPct = evaluateOnSet('D_BANDIT_WITH_MEM', holdoutSet, cleanTr.bandit, cleanTr.memory, cleanTr.evaluator, 202).metrics.verifiedCompletionRate;
    (cleanTr.memory as any).flush = () => {};
    for (let k = 0; k < 30; k++) {
      const sc = holdoutSet[k % holdoutSet.length];
      cleanTr.memory.recordEpisode({
        id: `poison-${k}`,
        projectId: `proj-${sc.domain}`,
        taskCategory: sc.taskCategory,
        platform: sc.targetPlatform,
        prompt: sc.prompt,
        strategyId: sc.baselineStrategyId, // Poison: claim baseline succeeded with +1.0!
        modelId: 'qwen2.5-coder:3b',
        status: 'COMPLETED',
        verified: true,
        reward: 0.99,
        durationMs: 1000,
        filesChanged: ['fake.ts'],
        toolFailures: [],
        testPassed: true,
        summary: 'Adversarial poisoned memory record',
      });
    }
    const contaminatedPct = evaluateOnSet('D_BANDIT_WITH_MEM', holdoutSet, cleanTr.bandit, cleanTr.memory, cleanTr.evaluator, 202).metrics.verifiedCompletionRate;

    const sysA = systemComparison.find((s) => s.system === 'A_BASELINE')!;
    const sysD = systemComparison.find((s) => s.system === 'D_BANDIT_WITH_MEM')!;
    const finalCurve = learningCurves[learningCurves.length - 1];
    const allCandidateStrategiesCount = new Set(scenarios.flatMap((s) => s.candidateStrategies)).size;

    const pathologies: PathologyAuditReport = {
      overfitting: {
        trainCompletionPct: finalCurve.trainCompletionMean,
        holdoutCompletionPct: finalCurve.systemD_completion.mean,
        gapPct: finalCurve.overfitGapPct,
        detected: finalCurve.overfitGapPct > 10.0,
      },
      catastrophicForgetting: {
        group1BeforePct: g1Before,
        group1AfterGroup2TrainingPct: g1After,
        forgettingDeltaPct,
        detected: forgettingDeltaPct > 5.0,
      },
      strategyCollapse: {
        normalizedEntropy: normalizedEntropy(lastStrategyCountsD),
        uniqueStrategiesUsed: Object.keys(lastStrategyCountsD).length,
        totalCandidateStrategies: allCandidateStrategiesCount,
        detected: normalizedEntropy(lastStrategyCountsD) < 0.4,
      },
      rewardExploitation: {
        baselineReward: sysA.metrics.meanReward,
        learnedReward: sysD.metrics.meanReward,
        baselineCompletionPct: sysA.metrics.verifiedCompletionRate,
        learnedCompletionPct: sysD.metrics.verifiedCompletionRate,
        rewardWithoutCompletionGain: sysD.metrics.meanReward > sysA.metrics.meanReward && sysD.metrics.verifiedCompletionRate <= sysA.metrics.verifiedCompletionRate,
      },
      poorExploration: {
        exploredArms: finalExplored,
        totalArms: finalTotalArms,
        coveragePct: round3((finalExplored / Math.max(1, finalTotalArms)) * 100),
        detected: (finalExplored / Math.max(1, finalTotalArms)) < 0.5,
      },
      excessiveRetries: {
        baselineRetryRatePct: round3(baselineRetrySum / seeds.length),
        learnedRetryRatePct: round3(learnedRetrySum / seeds.length),
        detected: learnedRetrySum > baselineRetrySum,
      },
      memoryContamination: {
        cleanHoldoutCompletionPct: cleanHoldoutPct,
        contaminatedHoldoutCompletionPct: contaminatedPct,
        degradationPct: round3(cleanHoldoutPct - contaminatedPct),
        detected: cleanHoldoutPct - contaminatedPct > 8.0,
      },
    };

    // =========================================================================
    // 4. GENERALIZATION EXPERIMENTS (Unseen Domains + Unseen Model Tiers + Combos)
    // =========================================================================
    const unseenDomainEvalSet = scenarios.filter((s) => group2Domains.includes(s.domain) && s.split === 'HOLDOUT');
    const cdA: number[] = [];
    const cdB: number[] = [];
    const cdC: number[] = [];
    const cdD: number[] = [];

    for (const seed of seeds) {
      const trC = await createAndTrainSystem('C_BANDIT_NO_MEM', g1Train, 200, seed, algorithm, tmpDir);
      const trD = await createAndTrainSystem('D_BANDIT_WITH_MEM', g1Train, 200, seed, algorithm, tmpDir);
      cdA.push(evaluateOnSet('A_BASELINE', unseenDomainEvalSet, null, null, trD.evaluator, seed).metrics.verifiedCompletionRate);
      cdB.push(evaluateOnSet('B_HEURISTIC', unseenDomainEvalSet, null, null, trD.evaluator, seed).metrics.verifiedCompletionRate);
      cdC.push(evaluateOnSet('C_BANDIT_NO_MEM', unseenDomainEvalSet, trC.bandit, null, trC.evaluator, seed).metrics.verifiedCompletionRate);
      cdD.push(evaluateOnSet('D_BANDIT_WITH_MEM', unseenDomainEvalSet, trD.bandit, trD.memory, trD.evaluator, seed).metrics.verifiedCompletionRate);
    }

    // Cross-Model-Tier Transfer: Train strictly on local-small -> Evaluate on unseen local-medium & cloud
    const localSmallTrain = scenarios.filter((s) => s.split === 'TRAIN' && s.modelTier === 'local-small');
    const unseenTierEval = scenarios.filter((s) => s.split !== 'TRAIN' && s.modelTier !== 'local-small');
    const ctA: number[] = [];
    const ctB: number[] = [];
    const ctC: number[] = [];
    const ctD: number[] = [];

    for (const seed of seeds) {
      const trC = await createAndTrainSystem('C_BANDIT_NO_MEM', localSmallTrain, 200, seed, algorithm, tmpDir);
      const trD = await createAndTrainSystem('D_BANDIT_WITH_MEM', localSmallTrain, 200, seed, algorithm, tmpDir);
      ctA.push(evaluateOnSet('A_BASELINE', unseenTierEval, null, null, trD.evaluator, seed).metrics.verifiedCompletionRate);
      ctB.push(evaluateOnSet('B_HEURISTIC', unseenTierEval, null, null, trD.evaluator, seed).metrics.verifiedCompletionRate);
      ctC.push(evaluateOnSet('C_BANDIT_NO_MEM', unseenTierEval, trC.bandit, null, trC.evaluator, seed).metrics.verifiedCompletionRate);
      ctD.push(evaluateOnSet('D_BANDIT_WITH_MEM', unseenTierEval, trD.bandit, trD.memory, trD.evaluator, seed).metrics.verifiedCompletionRate);
    }

    // Unseen combinations by projectStructure / errorCategory
    const comboBuckets: Array<{ label: string; subset: BenchmarkScenario[] }> = [
      { label: 'Legacy Codebase + Runtime/Dependency Errors', subset: holdoutSet.filter((s) => s.projectStructure === 'legacy-existing') },
      { label: 'Monorepo TypeScript (Next.js / Refactor / Arch)', subset: holdoutSet.filter((s) => s.projectStructure === 'monorepo') },
      { label: 'Greenfield Native Windows & React UI', subset: holdoutSet.filter((s) => s.projectStructure === 'greenfield') },
      { label: 'Microservice Backend Services', subset: holdoutSet.filter((s) => s.projectStructure === 'microservice') },
    ];
    const unseenCombos: GeneralizationReport['unseenCombos'] = [];
    const trFullD = await createAndTrainSystem('D_BANDIT_WITH_MEM', trainSet, 250, 101, algorithm, tmpDir);
    for (const b of comboBuckets) {
      if (b.subset.length === 0) continue;
      const basePct = evaluateOnSet('A_BASELINE', b.subset, null, null, trFullD.evaluator, 101).metrics.verifiedCompletionRate;
      const learnPct = evaluateOnSet('D_BANDIT_WITH_MEM', b.subset, trFullD.bandit, trFullD.memory, trFullD.evaluator, 101).metrics.verifiedCompletionRate;
      unseenCombos.push({
        comboLabel: `${b.label} (n=${b.subset.length})`,
        baselinePct: basePct,
        learnedPct: learnPct,
        deltaPct: round3(learnPct - basePct),
      });
    }

    const avg = (arr: number[]) => round3(arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length));
    const generalization: GeneralizationReport = {
      crossDomain: {
        trainDomains: group1Domains,
        unseenDomains: group2Domains,
        baselineCompletionPct: avg(cdA),
        heuristicCompletionPct: avg(cdB),
        banditNoMemCompletionPct: avg(cdC),
        banditWithMemCompletionPct: avg(cdD),
        memoryTransferDeltaPct: round3(avg(cdD) - avg(cdC)),
      },
      crossModelTier: {
        trainTier: 'local-small',
        unseenTiers: ['local-medium', 'cloud'],
        baselineCompletionPct: avg(ctA),
        heuristicCompletionPct: avg(ctB),
        banditNoMemCompletionPct: avg(ctC),
        banditWithMemCompletionPct: avg(ctD),
        notes: 'Exact context keys isolate modelTier so local-small failure patterns do not overwrite cloud arms; unseen tiers fall back to 9-criteria heuristics + similar memory.',
      },
      unseenCombos,
    };

    return {
      benchmarkVersion: BENCHMARK_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'SIMULATED_BENCHMARK',
      totalScenarios: scenarios.length,
      trainCount: trainSet.length,
      validationCount: valSet.length,
      holdoutCount: holdoutSet.length,
      zeroLeakageVerified: leakage.clean,
      algorithm,
      seeds,
      systemComparison,
      learningCurves,
      pathologies,
      generalization,
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
