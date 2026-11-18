/**
 * MaxIDE APEX — Mission 7: Self-Evaluation Engine & Trusted Reward System (Module E)
 * Evaluates completed tasks using trusted runtime evidence (never LLM self-reports).
 * Computes versioned, configurable rewards in [-1.0, +1.0], penalizes false completions,
 * security violations, and repeated failures, and never rewards speed alone.
 */

import { ExperienceMemory } from './ExperienceMemory.js';
import { ExecutionEvidenceInput, PolicyGovernance } from './PolicyGovernance.js';

export type EvaluationStatus = 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED' | 'BLOCKED' | 'CANCELLED';

export interface RewardWeights {
  version: string;
  requirementCoverage: number;
  buildSuccess: number;
  testSuccess: number;
  browserOrAppVerified: number;
  userAcceptance: number;
  securityClean: number;
  efficiencyBonus: number; // Applied ONLY when task is verified!
  // Penalties
  falseCompletionPenalty: number;
  securityViolationPenalty: number;
  destructiveUnauthorizedPenalty: number;
  unnecessaryModificationsPenalty: number;
  repeatedFailurePenalty: number;
  unverifiedClaimPenalty: number;
  repeatedFailedStrategyPenalty: number;
}

export const DEFAULT_REWARD_WEIGHTS: RewardWeights = {
  version: '1.0.0',
  requirementCoverage: 0.30,
  buildSuccess: 0.15,
  testSuccess: 0.25,
  browserOrAppVerified: 0.10,
  userAcceptance: 0.15,
  securityClean: 0.10,
  efficiencyBonus: 0.05,
  falseCompletionPenalty: -0.80,
  securityViolationPenalty: -1.00,
  destructiveUnauthorizedPenalty: -1.00,
  unnecessaryModificationsPenalty: -0.15,
  repeatedFailurePenalty: -0.20,
  unverifiedClaimPenalty: -0.40,
  repeatedFailedStrategyPenalty: -0.25,
};

export interface EvaluationDimensions {
  requirementCoverage: number; // 0..1
  correctness: number;         // 0..1
  buildStatus: 'PASSED' | 'FAILED' | 'NOT_RUN';
  testStatus: 'PASSED' | 'FAILED' | 'NOT_RUN';
  security: 'CLEAN' | 'VIOLATION';
  performance: number;         // 0..1
  visualQuality: 'VERIFIED' | 'UNVERIFIED';
  regressionRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  userAcceptance: 'ACCEPTED' | 'REJECTED' | 'PENDING';
}

export interface EvaluationRecord {
  id: string;
  episodeId: string;
  projectId: string;
  status: EvaluationStatus;
  verified: boolean;
  reward: number; // [-1.0, +1.0]
  normalizedReward01: number; // [0.0, 1.0] for Beta bandit updates
  rewardBreakdown: Record<string, number>;
  dimensions: EvaluationDimensions;
  explanation: string;
  rewardVersion: string;
  createdAt: string;
}

export interface TaskEvaluationInput {
  episodeId: string;
  projectId: string;
  cancelled?: boolean;
  blocked?: boolean;
  blockerReason?: string;
  requirementCoverageEstimate: number; // Computed from checked criteria / modified targets (0..1)
  unnecessaryFileModifications?: number;
  repeatedStrategyFailureCount?: number;
  userFeedbackRating?: -1 | 0 | 1;
  evidence: ExecutionEvidenceInput;
}

export class SelfEvaluationEngine {
  private weights: RewardWeights;

  constructor(private memory?: ExperienceMemory, customWeights?: Partial<RewardWeights>) {
    this.weights = { ...DEFAULT_REWARD_WEIGHTS, ...(customWeights || {}) };
  }

  public getWeights(): RewardWeights {
    return { ...this.weights };
  }

  public setWeights(next: Partial<RewardWeights>): RewardWeights {
    this.weights = { ...this.weights, ...next };
    return this.getWeights();
  }

  /**
   * Trusted evaluation & reward calculation — never relies on LLM self-assertion.
   */
  public evaluate(input: TaskEvaluationInput): EvaluationRecord {
    const ev = input.evidence;
    const w = this.weights;
    const breakdown: Record<string, number> = {};

    // 1. Determine honest EvaluationStatus from hard runtime evidence
    let status: EvaluationStatus;
    let verified = false;

    if (input.cancelled) {
      status = 'CANCELLED';
    } else if (input.blocked) {
      status = 'BLOCKED';
    } else if (ev.securityViolationDetected || ev.destructiveUnauthorizedAttempt) {
      status = 'FAILED';
    } else if (ev.falseCompletionClaimed) {
      status = 'FAILED';
    } else {
      const check = PolicyGovernance.isSuccessEvidenceVerified(ev);
      if (check.verified) {
        const cov = Math.max(0, Math.min(1, input.requirementCoverageEstimate));
        if (cov >= 0.7) {
          status = 'COMPLETED';
          verified = true;
        } else if (cov > 0) {
          status = 'PARTIALLY_COMPLETED';
          verified = true;
        } else {
          status = 'FAILED';
        }
      } else if (ev.filesModified.length > 0 && ((ev.testsAttempted && ev.testsPassed > 0) || ev.buildPassed)) {
        status = 'PARTIALLY_COMPLETED';
        verified = false;
      } else {
        status = 'FAILED';
      }
    }

    // 2. Compute positive reward components ONLY when free of security violations & false completion claims
    const cov = Math.max(0, Math.min(1, input.requirementCoverageEstimate));
    const hardViolation = ev.securityViolationDetected || ev.destructiveUnauthorizedAttempt || ev.falseCompletionClaimed;

    if (!hardViolation) {
      if (status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED') {
        breakdown.requirementCoverage = round4(cov * w.requirementCoverage);
      }

      if (ev.buildAttempted) {
        breakdown.buildSuccess = ev.buildPassed ? w.buildSuccess : -w.buildSuccess;
      }

      if (ev.testsAttempted && ev.testsRun > 0) {
        const passRatio = ev.testsPassed / ev.testsRun;
        breakdown.testSuccess = passRatio === 1 ? w.testSuccess : round4((passRatio - 0.5) * w.testSuccess);
      }

      if (ev.browserOrAppVerified) {
        breakdown.browserOrAppVerified = w.browserOrAppVerified;
      }

      breakdown.securityClean = status === 'COMPLETED' ? w.securityClean : round4(w.securityClean * 0.25);

      if (input.userFeedbackRating === 1) {
        breakdown.userAcceptance = w.userAcceptance;
      } else if (input.userFeedbackRating === -1) {
        breakdown.userAcceptance = -w.userAcceptance * 1.5;
      }

      // Efficiency bonus STRICTLY gated on verified completion — NEVER reward speed alone!
      if (verified && status === 'COMPLETED' && ev.durationMs > 0 && ev.durationMs < 30000) {
        breakdown.efficiencyBonus = w.efficiencyBonus;
      }
    }

    // 3. Apply strict penalties
    if (ev.falseCompletionClaimed) {
      breakdown.falseCompletionPenalty = w.falseCompletionPenalty;
    }
    if (ev.securityViolationDetected) {
      breakdown.securityViolationPenalty = w.securityViolationPenalty;
    }
    if (ev.destructiveUnauthorizedAttempt) {
      breakdown.destructiveUnauthorizedPenalty = w.destructiveUnauthorizedPenalty;
    }
    if ((input.unnecessaryFileModifications || 0) > 0) {
      breakdown.unnecessaryModificationsPenalty = round4(
        Math.min(3, input.unnecessaryFileModifications || 0) * w.unnecessaryModificationsPenalty
      );
    }
    if (ev.repeatedFailureCount >= 2) {
      breakdown.repeatedFailurePenalty = w.repeatedFailurePenalty;
    }
    if (!verified && status === 'FAILED' && ev.toolsExecutedCount === 0) {
      breakdown.unverifiedClaimPenalty = w.unverifiedClaimPenalty;
    }
    if ((input.repeatedStrategyFailureCount || 0) >= 2) {
      breakdown.repeatedFailedStrategyPenalty = w.repeatedFailedStrategyPenalty;
    }

    const rawSum = Object.values(breakdown).reduce((acc, v) => acc + v, 0);
    const reward = round4(Math.max(-1.0, Math.min(1.0, rawSum)));
    const normalizedReward01 = round4((reward + 1.0) / 2.0);

    const dimensions: EvaluationDimensions = {
      requirementCoverage: round4(cov),
      correctness: status === 'COMPLETED' ? 1 : status === 'PARTIALLY_COMPLETED' ? 0.55 : 0.1,
      buildStatus: ev.buildAttempted ? (ev.buildPassed ? 'PASSED' : 'FAILED') : 'NOT_RUN',
      testStatus: ev.testsAttempted ? (ev.testsRun > 0 && ev.testsPassed === ev.testsRun ? 'PASSED' : 'FAILED') : 'NOT_RUN',
      security: (ev.securityViolationDetected || ev.destructiveUnauthorizedAttempt) ? 'VIOLATION' : 'CLEAN',
      performance: ev.durationMs > 0 ? round4(Math.max(0.1, Math.min(1, 1 - ev.durationMs / 120000))) : 0.5,
      visualQuality: ev.browserOrAppVerified ? 'VERIFIED' : 'UNVERIFIED',
      regressionRisk: (ev.testsAttempted && ev.testsPassed === ev.testsRun) ? 'LOW' : ev.filesModified.length > 5 ? 'HIGH' : 'MEDIUM',
      userAcceptance: input.userFeedbackRating === 1 ? 'ACCEPTED' : input.userFeedbackRating === -1 ? 'REJECTED' : 'PENDING',
    };

    const explanation = this.buildExplanation(status, verified, reward, dimensions, input.blockerReason);

    const record: EvaluationRecord = {
      id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      episodeId: input.episodeId,
      projectId: input.projectId,
      status,
      verified,
      reward,
      normalizedReward01,
      rewardBreakdown: breakdown,
      dimensions,
      explanation,
      rewardVersion: w.version,
      createdAt: new Date().toISOString(),
    };

    if (this.memory) {
      this.memory.execute(
        `INSERT OR REPLACE INTO evaluations (id, episode_id, project_id, status, reward, scores_json, explanation, reward_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.episodeId,
          record.projectId,
          record.status,
          record.reward,
          JSON.stringify({ dimensions, breakdown }),
          record.explanation,
          record.rewardVersion,
          record.createdAt,
        ]
      );
    }

    return record;
  }

  private buildExplanation(
    status: EvaluationStatus,
    verified: boolean,
    reward: number,
    d: EvaluationDimensions,
    blockerReason?: string
  ): string {
    if (status === 'BLOCKED') return `Task BLOCKED: ${blockerReason || 'external dependency or provider unavailable'}.`;
    if (status === 'CANCELLED') return 'Task CANCELLED by user request.';
    if (d.security === 'VIOLATION') return `Task FAILED security evaluation (reward ${reward}). Security boundary violation penalized.`;
    return `Evaluated ${status} (verified=${verified}, reward=${reward.toFixed(2)}): build=${d.buildStatus}, tests=${d.testStatus}, visual=${d.visualQuality}, coverage=${Math.round(d.requirementCoverage * 100)}%.`;
  }

  public getRecentEvaluations(projectId?: string, limit: number = 30): EvaluationRecord[] {
    if (!this.memory) return [];
    const sql = projectId
      ? `SELECT * FROM evaluations WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`
      : `SELECT * FROM evaluations ORDER BY created_at DESC LIMIT ?`;
    const rows = this.memory.queryAll(sql, projectId ? [projectId, limit] : [limit]);
    return rows.map((r) => {
      let parsed: any = {};
      try { parsed = JSON.parse(r.scores_json || '{}'); } catch {}
      const reward = Number(r.reward || 0);
      return {
        id: r.id,
        episodeId: r.episode_id,
        projectId: r.project_id,
        status: r.status as EvaluationStatus,
        verified: r.status === 'COMPLETED' || r.status === 'PARTIALLY_COMPLETED',
        reward,
        normalizedReward01: round4((reward + 1) / 2),
        rewardBreakdown: parsed.breakdown || {},
        dimensions: parsed.dimensions || {},
        explanation: r.explanation || '',
        rewardVersion: r.reward_version || '1.0.0',
        createdAt: r.created_at,
      };
    });
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
