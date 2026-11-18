/**
 * MaxIDE APEX — Mission 9: Post-Task Self-Improvement Review System (Part 6)
 * Reviews every completed task against original requirements, build/test evidence,
 * unnecessary changes, failed approaches, and historical experiences.
 * Never modifies security policies or core agent instructions.
 * Never promotes a strategy without independent offline evaluation.
 */

import { EvidenceSource, ExperienceMemory } from './ExperienceMemory.js';
import { ExecutionEvidenceInput, PolicyGovernance } from './PolicyGovernance.js';
import { DecisionPlan } from './ReasoningDecisionEngine.js';
import { EvaluationRecord } from './SelfEvaluationEngine.js';

export interface PostTaskReviewInput {
  episodeId: string;
  plan: DecisionPlan;
  intent: string;
  evidenceSource: EvidenceSource;
  evaluation: EvaluationRecord;
  evidence: ExecutionEvidenceInput;
  toolFailureMessages?: string[];
  repairAttempts?: number;
}

export interface PostTaskReviewResult {
  reviewId: string;
  episodeId: string;
  requirementsMet: boolean;
  unnecessaryChanges: string[];
  failedApproaches: string[];
  improvements: string[];
  historicalComparisonCount: number;
  offlineEvalScheduled: boolean;
  securityPoliciesUntouched: true;
  coreInstructionsUntouched: true;
}

export class SelfImprovementReviewer {
  private completedSinceLastEval: number = 0;
  private readonly offlineEvalIntervalTasks: number = 5;

  constructor(
    private memory: ExperienceMemory,
    private governance: PolicyGovernance
  ) {}

  public review(input: PostTaskReviewInput): PostTaskReviewResult {
    const { plan, evaluation, evidence } = input;
    const requirementsMet = evaluation.status === 'COMPLETED' && evaluation.verified;

    // 1. Detect unnecessary changes (e.g., touching unrelated files or zero-byte artifacts)
    const unnecessaryChanges: string[] = [];
    if (plan.analysis.targetPlatform === 'NATIVE_WINDOWS') {
      const strayHtml = evidence.filesModified.filter((f) => f.toLowerCase().endsWith('.html'));
      for (const h of strayHtml) {
        unnecessaryChanges.push(`Created web file "${h}" during a NATIVE_WINDOWS desktop task`);
      }
    }
    if (evidence.filesModified.length > 8 && plan.analysis.taskCategory === 'DEBUG_AND_REPAIR') {
      unnecessaryChanges.push(`Broad edit footprint (${evidence.filesModified.length} files modified) for a targeted DEBUG_AND_REPAIR task`);
    }

    // 2. Identify failed approaches
    const failedApproaches: string[] = [];
    if (evidence.buildAttempted && !evidence.buildPassed) {
      failedApproaches.push(`Build failed under strategy "${plan.selectedStrategy.id}"`);
    }
    if (evidence.testsAttempted && evidence.testsPassed < evidence.testsRun) {
      failedApproaches.push(`Automated tests failed (${evidence.testsPassed}/${evidence.testsRun} passed)`);
    }
    if (evidence.repeatedFailureCount >= 2) {
      failedApproaches.push(`Repeated tool failures detected (${evidence.repeatedFailureCount} errors)`);
    }
    for (const msg of (input.toolFailureMessages || []).slice(0, 3)) {
      failedApproaches.push(PolicyGovernance.sanitizeSecretText(msg).slice(0, 140));
    }

    // 3. Retrieve relevant historical experiences for comparison
    const historical = this.memory.retrieveSimilarEpisodes(plan.analysis.rawPrompt, {
      projectId: plan.projectId,
      topK: 3,
    });

    // 4. Synthesize actionable improvements
    const improvements: string[] = [];
    if (!requirementsMet) {
      if (evidence.filesInspected.length === 0 && !plan.workspace.isEmptyWorkspace) {
        improvements.push('Inspect existing project files before applying edits.');
      }
      if (!evidence.testsAttempted) {
        improvements.push('Run automated tests or compiler verification before concluding.');
      }
      if (plan.feasibility.filteredOutCount > 0) {
        improvements.push(
          `Keep capability-infeasible strategies excluded (${plan.feasibility.filteredOutStrategies.map((f) => f.strategyId).join(', ')}).`
        );
      }
      const betterPast = historical.find((h) => h.episode.verified && h.episode.strategyId !== plan.selectedStrategy.id);
      if (betterPast) {
        improvements.push(
          `Consider verified historical strategy "${betterPast.episode.strategyId}" (reward=${betterPast.episode.reward.toFixed(2)}).`
        );
      }
    } else if ((input.repairAttempts || 0) > 0) {
      improvements.push(`Resolved after ${input.repairAttempts} repair attempt(s); record working procedure for faster first-pass execution.`);
    } else {
      improvements.push(`Strategy "${plan.selectedStrategy.id}" satisfied verified runtime criteria cleanly.`);
    }

    // 5. Schedule offline policy evaluation when enough verified samples accumulate (never auto-promote without eval!)
    this.completedSinceLastEval++;
    const offlineEvalScheduled =
      this.governance.isLearningEnabled() &&
      this.completedSinceLastEval >= this.offlineEvalIntervalTasks;
    if (offlineEvalScheduled) {
      this.completedSinceLastEval = 0;
    }

    // 6. Persist review record in SQLite
    const reviewId = this.governance.isLearningEnabled()
      ? this.memory.recordPostTaskReview({
          episodeId: input.episodeId,
          projectId: plan.projectId,
          strategyId: plan.selectedStrategy.id,
          intent: input.intent,
          evidenceSource: input.evidenceSource,
          requirementsMet,
          unnecessaryChanges,
          failedApproaches,
          improvements,
          offlineEvalScheduled,
        })
      : `rev-skipped-${Date.now()}`;

    return {
      reviewId,
      episodeId: input.episodeId,
      requirementsMet,
      unnecessaryChanges,
      failedApproaches,
      improvements,
      historicalComparisonCount: historical.length,
      offlineEvalScheduled,
      securityPoliciesUntouched: true,
      coreInstructionsUntouched: true,
    };
  }
}
