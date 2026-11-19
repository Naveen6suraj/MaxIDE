/**
 * MaxIDE APEX — Mission 7: Continuous Improvement Engine & Adaptive Intelligence Coordinator (Module F + Facade)
 * Implements the safe 8-step learning loop:
 *   1. EXECUTE -> 2. COLLECT EVIDENCE -> 3. EVALUATE -> 4. STORE EXPERIENCE ->
 *   5. UPDATE STRATEGY STATISTICS -> 6. RUN OFFLINE EVALUATION ->
 *   7. APPROVE POLICY UPDATE -> 8. IMPROVE FUTURE DECISIONS
 *
 * Includes a deterministic, reproducible Offline Benchmark Evaluator comparing Baseline vs Learned policies
 * on unseen evaluation tasks, and exposes the unified AdaptiveIntelligenceCoordinator facade for AgentEngine & UI.
 */

import { BanditAlgorithm, BanditContext, ContextualBandit, PolicyVersionRecord } from './ContextualBandit.js';
import { EvidenceSource, ExperienceMemory, EpisodicRecord, ProceduralRecord, SemanticRecord } from './ExperienceMemory.js';
import { ExecutionEvidenceInput, GovernancePolicy, PolicyGovernance } from './PolicyGovernance.js';
import { DecisionPlan, ReasoningDecisionEngine } from './ReasoningDecisionEngine.js';
import { EvaluationRecord, RewardWeights, SelfEvaluationEngine } from './SelfEvaluationEngine.js';
import { PostTaskReviewResult, SelfImprovementReviewer } from './SelfImprovementReviewer.js';
import { ToolchainCapabilities } from './ToolchainDetector.js';
import { OutcomeAcceptanceReport } from './OutcomeAcceptanceEngine.js';

export interface OfflineBenchmarkScenario {
  id: string;
  taskCategory: string;
  platform: string;
  modelTier: 'local-small' | 'local-medium' | 'cloud';
  candidateStrategies: string[];
  baselineStrategyId: string;
  /** Ground-truth outcome map for each candidate strategy on this unseen evaluation task */
  groundTruthOutcomes: Record<string, { reward: number; verifiedSuccess: boolean }>;
}

export interface OfflineEvaluationReport {
  runId: string;
  timestamp: string;
  sampleSize: number;
  baselineMeanReward: number;
  candidateMeanReward: number;
  rewardDelta: number;
  baselineCompletionRate: number;
  candidateCompletionRate: number;
  completionRateDelta: number;
  strategyShiftCount: number;
  approved: boolean;
  reason: string;
  promotedVersion?: PolicyVersionRecord;
  perScenario: Array<{
    scenarioId: string;
    contextKey: string;
    baselineStrategy: string;
    learnedStrategy: string;
    shifted: boolean;
    baselineReward: number;
    learnedReward: number;
    learnedSucceeded: boolean;
  }>;
}

export interface CompleteAndLearnInput {
  plan: DecisionPlan;
  modelId: string;
  evidence: ExecutionEvidenceInput;
  requirementCoverageEstimate: number;
  summary: string;
  intent?: string;
  evidenceSource?: EvidenceSource;
  toolFailureMessages?: string[];
  repairAttempts?: number;
  cancelled?: boolean;
  blocked?: boolean;
  blockerReason?: string;
  unnecessaryFileModifications?: number;
  userFeedbackRating?: -1 | 0 | 1;
}

export interface CompleteAndLearnResult {
  episodeId: string;
  evaluation: EvaluationRecord;
  learningRecorded: boolean;
  strategyId: string;
  contextKey: string;
  review?: PostTaskReviewResult;
}

export interface ModelPerformanceStat {
  modelId: string;
  totalTasks: number;
  verifiedSuccesses: number;
  failures: number;
  verifiedRate: number;
  avgReward: number;
  avgDurationMs: number;
}

export interface IntelligenceDashboardSnapshot {
  generatedAt: string;
  governance: GovernancePolicy;
  banditAlgorithm: BanditAlgorithm;
  explorationConfig: ReturnType<ContextualBandit['getExplorationConfig']>;
  rewardWeights: RewardWeights;
  memoryStats: ReturnType<ExperienceMemory['getStats']>;
  memoryQualityStats: ReturnType<ExperienceMemory['getMemoryQualityStats']>;
  lastDecisionPlan: DecisionPlan | null;
  episodicMemory: EpisodicRecord[];
  semanticMemory: SemanticRecord[];
  proceduralMemory: ProceduralRecord[];
  evaluations: EvaluationRecord[];
  postTaskReviews: ReturnType<ExperienceMemory['getPostTaskReviews']>;
  strategyStats: ReturnType<ContextualBandit['getAllArmStats']>;
  modelPerformance: ModelPerformanceStat[];
  toolPerformance: ReturnType<ExperienceMemory['getToolTelemetry']>;
  policyVersions: PolicyVersionRecord[];
  rollbackHistory: ReturnType<ContextualBandit['getRollbackHistory']>;
  validationRuns: ReturnType<ExperienceMemory['getValidationRuns']>;
  simulatedBenchmarkRuns: ReturnType<ExperienceMemory['getValidationRuns']>;
  controlledLiveRuns: ReturnType<ExperienceMemory['getValidationRuns']>;
  failedLearningExperiments: ReturnType<ExperienceMemory['getValidationRuns']>;
  strategyDistribution: Array<{ strategyId: string; pulls: number; sharePct: number; verifiedSuccessRate: number }>;
  feasibilityStats: { totalPlans: number; totalCandidatesEvaluated: number; totalFilteredOut: number; blockedCount: number };
  intentStats: Record<string, number>;
  lastOfflineEval: OfflineEvaluationReport | null;
  lastOutcomeAcceptance?: OutcomeAcceptanceReport | null;
}

export class ContinuousImprovementEngine {
  private lastOfflineEval: OfflineEvaluationReport | null = null;

  constructor(
    private memory: ExperienceMemory,
    private bandit: ContextualBandit,
    private evaluator: SelfEvaluationEngine,
    private governance: PolicyGovernance
  ) {}

  public getLastOfflineEval(): OfflineEvaluationReport | null {
    return this.lastOfflineEval;
  }

  /**
   * Step 6 & 7: Deterministic, reproducible offline evaluation comparing baseline strategy
   * choices against the learned contextual bandit policy on unseen scenarios.
   * Promotes a new versioned policy snapshot ONLY if Governance approves (zero regression + sufficient samples).
   */
  public runOfflineEvaluation(
    scenarios: OfflineBenchmarkScenario[],
    options?: { promoteIfApproved?: boolean; seed?: number; notes?: string }
  ): OfflineEvaluationReport {
    const seed = options?.seed ?? 1337;
    const prevAlgo = this.bandit.getAlgorithm();
    this.bandit.setDeterministicMode(true, seed);

    let baselineRewardSum = 0;
    let candidateRewardSum = 0;
    let baselineSuccesses = 0;
    let candidateSuccesses = 0;
    let strategyShiftCount = 0;

    const perScenario: OfflineEvaluationReport['perScenario'] = [];

    for (const sc of scenarios) {
      const ctx: BanditContext = {
        taskCategory: sc.taskCategory,
        platform: sc.platform,
        modelTier: sc.modelTier,
      };
      const contextKey = ContextualBandit.buildContextKey(ctx);
      const selection = this.bandit.selectStrategy(ctx, sc.candidateStrategies);
      const learnedStrategy = selection.selectedStrategyId;

      const baseTruth = sc.groundTruthOutcomes[sc.baselineStrategyId] || { reward: -0.2, verifiedSuccess: false };
      const learnedTruth = sc.groundTruthOutcomes[learnedStrategy] || { reward: -0.2, verifiedSuccess: false };

      baselineRewardSum += baseTruth.reward;
      candidateRewardSum += learnedTruth.reward;
      if (baseTruth.verifiedSuccess) baselineSuccesses++;
      if (learnedTruth.verifiedSuccess) candidateSuccesses++;
      const shifted = learnedStrategy !== sc.baselineStrategyId;
      if (shifted) strategyShiftCount++;

      perScenario.push({
        scenarioId: sc.id,
        contextKey,
        baselineStrategy: sc.baselineStrategyId,
        learnedStrategy,
        shifted,
        baselineReward: round4(baseTruth.reward),
        learnedReward: round4(learnedTruth.reward),
        learnedSucceeded: learnedTruth.verifiedSuccess,
      });
    }

    this.bandit.setDeterministicMode(false);
    this.bandit.setAlgorithm(prevAlgo);

    const n = scenarios.length;
    const baselineMeanReward = n > 0 ? round4(baselineRewardSum / n) : 0;
    const candidateMeanReward = n > 0 ? round4(candidateRewardSum / n) : 0;
    const rewardDelta = round4(candidateMeanReward - baselineMeanReward);
    const baselineCompletionRate = n > 0 ? round4((baselineSuccesses / n) * 100) : 0;
    const candidateCompletionRate = n > 0 ? round4((candidateSuccesses / n) * 100) : 0;
    const completionRateDelta = round4(candidateCompletionRate - baselineCompletionRate);

    const gate = this.governance.approvePolicyUpdate({
      baselineScore: baselineMeanReward,
      candidateScore: candidateMeanReward,
      evaluatedTasks: n,
    });

    let promotedVersion: PolicyVersionRecord | undefined;
    if (gate.approved && options?.promoteIfApproved !== false) {
      promotedVersion = this.bandit.createPolicyVersion(
        options?.notes || `Offline eval promoted (${n} scenarios, reward delta ${rewardDelta >= 0 ? '+' : ''}${rewardDelta})`,
        candidateMeanReward,
        this.evaluator.getWeights(),
        true
      );
    }

    const report: OfflineEvaluationReport = {
      runId: `evalrun-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      timestamp: new Date().toISOString(),
      sampleSize: n,
      baselineMeanReward,
      candidateMeanReward,
      rewardDelta,
      baselineCompletionRate,
      candidateCompletionRate,
      completionRateDelta,
      strategyShiftCount,
      approved: gate.approved,
      reason: gate.reason,
      promotedVersion,
      perScenario,
    };

    this.lastOfflineEval = report;
    // Persist every benchmark run (approved AND rejected/failed) with explicit source labeling
    try {
      this.memory.recordValidationRun({
        id: report.runId,
        source: 'SIMULATED_BENCHMARK',
        benchmarkVersion: 'offline-policy-gate-v1',
        algorithm: this.bandit.getAlgorithm(),
        approved: report.approved,
        baselineCompletionPct: report.baselineCompletionRate,
        learnedCompletionPct: report.candidateCompletionRate,
        baselineReward: report.baselineMeanReward,
        learnedReward: report.candidateMeanReward,
        summary: {
          sampleSize: report.sampleSize,
          strategyShiftCount: report.strategyShiftCount,
          rewardDelta: report.rewardDelta,
          reason: report.reason,
        },
      });
    } catch {}
    return report;
  }

  /**
   * Build offline evaluation scenarios directly from historical verified SQLite episodes
   * (or provide a standard deterministic engineering benchmark suite when DB is freshly initialized).
   */
  public buildDefaultOfflineScenarios(): OfflineBenchmarkScenario[] {
    const episodes = this.memory.getEpisodes({ limit: 100 });
    const byContext = new Map<string, EpisodicRecord[]>();
    for (const ep of episodes) {
      const tier = ReasoningDecisionEngine.inferModelTier(ep.modelId);
      const key = `${ep.taskCategory}::${ep.platform}::${tier}`;
      const list = byContext.get(key) || [];
      list.push(ep);
      byContext.set(key, list);
    }

    const derived: OfflineBenchmarkScenario[] = [];
    for (const [key, list] of byContext.entries()) {
      const strategies = Array.from(new Set(list.map((e) => e.strategyId)));
      if (strategies.length < 2) continue;
      const [taskCategory, platform, modelTier] = key.split('::') as [string, string, 'local-small' | 'local-medium' | 'cloud'];
      const groundTruthOutcomes: Record<string, { reward: number; verifiedSuccess: boolean }> = {};
      for (const s of strategies) {
        const subset = list.filter((e) => e.strategyId === s);
        const avgR = subset.reduce((a, b) => a + b.reward, 0) / subset.length;
        const okRate = subset.filter((e) => e.verified && e.status === 'COMPLETED').length / subset.length;
        groundTruthOutcomes[s] = { reward: round4(avgR), verifiedSuccess: okRate >= 0.5 };
      }
      derived.push({
        id: `hist-${derived.length + 1}`,
        taskCategory,
        platform,
        modelTier,
        candidateStrategies: strategies,
        baselineStrategyId: strategies[0],
        groundTruthOutcomes,
      });
    }

    if (derived.length >= 3) {
      return derived;
    }

    // Standard deterministic held-out engineering benchmark covering Web, Native Desktop, Debug & Improvement
    return [
      {
        id: 'bench-web-local',
        taskCategory: 'WEB_APP_BUILD',
        platform: 'WEB_APP',
        modelTier: 'local-small',
        candidateStrategies: ['vite-typescript-spa', 'self-contained-interactive-web-app', 'modular-multi-file-web-app'],
        baselineStrategyId: 'vite-typescript-spa',
        groundTruthOutcomes: {
          'vite-typescript-spa': { reward: -0.15, verifiedSuccess: false },
          'self-contained-interactive-web-app': { reward: 0.85, verifiedSuccess: true },
          'modular-multi-file-web-app': { reward: 0.65, verifiedSuccess: true },
        },
      },
      {
        id: 'bench-native-win',
        taskCategory: 'NATIVE_DESKTOP_BUILD',
        platform: 'NATIVE_WINDOWS',
        modelTier: 'local-small',
        candidateStrategies: ['native-electron-node', 'native-winforms-csc', 'native-wpf-dotnet'],
        baselineStrategyId: 'native-electron-node',
        groundTruthOutcomes: {
          'native-electron-node': { reward: -0.10, verifiedSuccess: false },
          'native-winforms-csc': { reward: 0.88, verifiedSuccess: true },
          'native-wpf-dotnet': { reward: 0.55, verifiedSuccess: true },
        },
      },
      {
        id: 'bench-debug-repair',
        taskCategory: 'DEBUG_AND_REPAIR',
        platform: 'WEB_APP',
        modelTier: 'local-small',
        candidateStrategies: ['defensive-guard-and-fallback-patch', 'reproduce-root-cause-surgical-fix'],
        baselineStrategyId: 'defensive-guard-and-fallback-patch',
        groundTruthOutcomes: {
          'defensive-guard-and-fallback-patch': { reward: 0.10, verifiedSuccess: false },
          'reproduce-root-cause-surgical-fix': { reward: 0.90, verifiedSuccess: true },
        },
      },
      {
        id: 'bench-self-improve',
        taskCategory: 'SELF_DIRECTED_IMPROVEMENT',
        platform: 'WEB_APP',
        modelTier: 'local-small',
        candidateStrategies: ['incremental-ux-polish-pass', 'self-directed-quality-loop'],
        baselineStrategyId: 'incremental-ux-polish-pass',
        groundTruthOutcomes: {
          'incremental-ux-polish-pass': { reward: 0.35, verifiedSuccess: false },
          'self-directed-quality-loop': { reward: 0.86, verifiedSuccess: true },
        },
      },
    ];
  }
}

/**
 * Unified Adaptive Intelligence Coordinator uniting Modules A through G.
 */
export class AdaptiveIntelligenceCoordinator {
  public readonly governance: PolicyGovernance;
  public readonly memory: ExperienceMemory;
  public readonly evaluator: SelfEvaluationEngine;
  public readonly bandit: ContextualBandit;
  public readonly reasoner: ReasoningDecisionEngine;
  public readonly improver: ContinuousImprovementEngine;
  public readonly reviewer: SelfImprovementReviewer;

  private lastDecisionPlan: DecisionPlan | null = null;
  private lastOutcomeAcceptance: OutcomeAcceptanceReport | null = null;
  private feasibilityStats = { totalPlans: 0, totalCandidatesEvaluated: 0, totalFilteredOut: 0, blockedCount: 0 };
  private intentStats: Record<string, number> = {};

  constructor(dbPath: string, options?: { algorithm?: BanditAlgorithm; deterministicSeed?: number }) {
    this.governance = new PolicyGovernance();
    this.memory = new ExperienceMemory(dbPath);
    this.evaluator = new SelfEvaluationEngine(this.memory);
    this.bandit = new ContextualBandit(this.memory, {
      algorithm: options?.algorithm || 'UCB1',
      deterministicSeed: options?.deterministicSeed,
    });
    this.reasoner = new ReasoningDecisionEngine(this.memory, this.bandit);
    this.improver = new ContinuousImprovementEngine(
      this.memory,
      this.bandit,
      this.evaluator,
      this.governance
    );
    this.reviewer = new SelfImprovementReviewer(this.memory, this.governance);
  }

  public async ready(): Promise<void> {
    await this.memory.ready();
    // Restore persisted governance preferences if saved
    const savedLearn = this.memory.getSetting('learning_enabled');
    if (savedLearn !== null) this.governance.setLearningEnabled(savedLearn === 'true');
    const savedCross = this.memory.getSetting('cross_project_transfer');
    if (savedCross !== null) this.governance.setCrossProjectTransfer(savedCross === 'true');
    const savedAlgo = this.memory.getSetting('bandit_algorithm') as BanditAlgorithm | null;
    if (savedAlgo === 'UCB1' || savedAlgo === 'THOMPSON_SAMPLING') {
      this.bandit.setAlgorithm(savedAlgo);
    }

    // Ensure an initial v0 baseline policy snapshot exists for rollback safety
    if (this.bandit.getPolicyVersions().length === 0) {
      this.bandit.createPolicyVersion(
        'Initial baseline policy (v1.0.0 cold-start priors)',
        0,
        this.evaluator.getWeights(),
        true
      );
    }
  }

  public planTask(input: {
    prompt: string;
    workspacePath: string;
    projectId?: string;
    modelId?: string;
    modelTier?: 'local-small' | 'local-medium' | 'cloud';
    intent?: string;
    capabilityOverrides?: Partial<ToolchainCapabilities>;
    exploitOnly?: boolean;
  }): DecisionPlan {
    const plan = this.reasoner.plan({
      ...input,
      allowCrossProject: this.governance.getPolicy().allowCrossProjectProceduralTransfer,
    });
    this.lastDecisionPlan = plan;

    // Record real feasibility & intent telemetry
    this.feasibilityStats.totalPlans++;
    this.feasibilityStats.totalCandidatesEvaluated += plan.feasibility.totalCandidates;
    this.feasibilityStats.totalFilteredOut += plan.feasibility.filteredOutCount;
    if (plan.feasibility.blockedByCapabilities) this.feasibilityStats.blockedCount++;
    const intentKey = input.intent || plan.analysis.taskCategory;
    this.intentStats[intentKey] = (this.intentStats[intentKey] || 0) + 1;

    // Persist discovered project stack into Semantic Memory when learning is enabled
    if (this.governance.isLearningEnabled() && plan.workspace.detectedStack.length > 0) {
      this.memory.upsertSemantic({
        projectId: plan.projectId,
        category: 'framework',
        key: 'detected_stack',
        value: plan.workspace.detectedStack.join(', '),
      });
    }

    return plan;
  }

  /**
   * Steps 2–5 of the Safe Learning Loop + Part 6 Post-Task Self-Improvement Review:
   * Collect trusted evidence -> Evaluate -> Guard against unverified positive rewards ->
   * Persist Experience (deduplicated) -> Update Bandit & Procedures -> Run Post-Task Review.
   */
  public completeAndLearn(input: CompleteAndLearnInput): CompleteAndLearnResult {
    const episodeId = `ep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const plan = input.plan;
    const strategy = plan.selectedStrategy;
    const modelTier = ReasoningDecisionEngine.inferModelTier(input.modelId);
    const banditCtx: BanditContext = {
      taskCategory: plan.analysis.taskCategory,
      platform: plan.analysis.targetPlatform,
      modelTier,
    };
    const contextKey = ContextualBandit.buildContextKey(banditCtx);
    const currentArm = this.bandit.getArm(contextKey, strategy.id);
    const evidenceSource: EvidenceSource = input.evidenceSource || 'USER_ENGINEERING_EXECUTION';

    const evaluation = this.evaluator.evaluate({
      episodeId,
      projectId: plan.projectId,
      cancelled: input.cancelled,
      blocked: input.blocked,
      blockerReason: input.blockerReason,
      requirementCoverageEstimate: input.requirementCoverageEstimate,
      unnecessaryFileModifications: input.unnecessaryFileModifications,
      repeatedStrategyFailureCount: currentArm.consecutiveFailures,
      userFeedbackRating: input.userFeedbackRating,
      evidence: input.evidence,
    });

    // Strict Part 5 Guard: Prevent an unverified LLM response from generating a positive learning reward
    const learningReward = evaluation.verified ? evaluation.reward : Math.min(0, evaluation.reward);
    const learningEnabled = this.governance.isLearningEnabled();
    let review: PostTaskReviewResult | undefined;

    if (learningEnabled) {
      // Store Episode in SQLite (secret-scrubbed + deduplicated + confidence-tiered + source-labeled)
      this.memory.recordEpisode({
        id: episodeId,
        projectId: plan.projectId,
        taskCategory: plan.analysis.taskCategory,
        platform: plan.analysis.targetPlatform,
        prompt: plan.analysis.rawPrompt,
        strategyId: strategy.id,
        modelId: input.modelId || 'unknown',
        status: evaluation.status,
        verified: evaluation.verified,
        reward: learningReward,
        durationMs: input.evidence.durationMs,
        filesChanged: input.evidence.filesModified,
        toolFailures: input.evidence.repeatedFailureCount > 0 ? [`repeated_failures:${input.evidence.repeatedFailureCount}`] : [],
        testPassed: input.evidence.testsPassed > 0 && input.evidence.testsPassed === input.evidence.testsRun,
        userFeedbackRating: input.userFeedbackRating,
        summary: input.summary || evaluation.explanation,
        evidenceSource,
      });

      // Update Procedural Memory with trusted outcomes
      const succeeded = evaluation.status === 'COMPLETED' && evaluation.verified;
      this.memory.recordProcedureOutcome({
        projectId: plan.projectId,
        taskCategory: plan.analysis.taskCategory,
        strategyId: strategy.id,
        procedureName: strategy.name,
        steps: strategy.executionStages,
        modelId: input.modelId,
        succeeded,
        reward: learningReward,
      });

      // Update Contextual Bandit arm statistics (skip cancelled/blocked tasks)
      if (evaluation.status !== 'CANCELLED' && evaluation.status !== 'BLOCKED') {
        this.bandit.recordOutcome(banditCtx, strategy.id, learningReward, succeeded);
      }

      // Part 6: Post-Task Self-Improvement Review
      review = this.reviewer.review({
        episodeId,
        plan,
        intent: input.intent || plan.analysis.taskCategory,
        evidenceSource,
        evaluation,
        evidence: input.evidence,
        toolFailureMessages: input.toolFailureMessages,
        repairAttempts: input.repairAttempts,
      });
    }

    return {
      episodeId,
      evaluation,
      learningRecorded: learningEnabled,
      strategyId: strategy.id,
      contextKey,
      review,
    };
  }

  public recordUserFeedback(
    episodeId: string,
    projectId: string,
    rating: -1 | 0 | 1,
    comment: string = ''
  ): { id: string; updatedReward?: number } {
    const res = this.memory.recordUserFeedback(episodeId, projectId, rating, comment);
    // Also reflect explicit user feedback into the bandit arm if learning is enabled
    if (this.governance.isLearningEnabled() && rating !== 0) {
      const ep = this.memory.getEpisodes({ limit: 500 }).find((e) => e.id === episodeId);
      if (ep) {
        const ctx: BanditContext = {
          taskCategory: ep.taskCategory,
          platform: ep.platform,
          modelTier: ReasoningDecisionEngine.inferModelTier(ep.modelId),
        };
        const fbReward = rating > 0 ? Math.max(0.5, res.updatedReward ?? 0.6) : Math.min(-0.4, res.updatedReward ?? -0.5);
        this.bandit.recordOutcome(ctx, ep.strategyId, fbReward, rating > 0);
      }
    }
    return res;
  }

  public recordToolTelemetry(toolName: string, success: boolean, latencyMs: number): void {
    if (!this.governance.isLearningEnabled()) return;
    this.memory.recordToolTelemetry(toolName, success, latencyMs);
  }

  public recordOutcomeAcceptance(report: OutcomeAcceptanceReport): void {
    this.lastOutcomeAcceptance = report;
  }

  public getLatestOutcomeAcceptance(): OutcomeAcceptanceReport | null {
    return this.lastOutcomeAcceptance;
  }

  public setLearningEnabled(enabled: boolean): GovernancePolicy {
    this.governance.setLearningEnabled(enabled);
    this.memory.setSetting('learning_enabled', String(Boolean(enabled)));
    return this.governance.getPolicy();
  }

  public setCrossProjectTransfer(enabled: boolean): GovernancePolicy {
    this.governance.setCrossProjectTransfer(enabled);
    this.memory.setSetting('cross_project_transfer', String(Boolean(enabled)));
    return this.governance.getPolicy();
  }

  public setBanditAlgorithm(algo: BanditAlgorithm): BanditAlgorithm {
    this.bandit.setAlgorithm(algo);
    this.memory.setSetting('bandit_algorithm', algo);
    return algo;
  }

  public getModelPerformance(projectId?: string): ModelPerformanceStat[] {
    const episodes = this.memory.getEpisodes({ projectId, limit: 500 });
    const grouped = new Map<string, EpisodicRecord[]>();
    for (const ep of episodes) {
      const list = grouped.get(ep.modelId) || [];
      list.push(ep);
      grouped.set(ep.modelId, list);
    }

    const out: ModelPerformanceStat[] = [];
    for (const [modelId, list] of grouped.entries()) {
      const total = list.length;
      const verifiedSuccesses = list.filter((e) => e.verified && e.status === 'COMPLETED').length;
      const failures = list.filter((e) => e.status === 'FAILED').length;
      const avgReward = total > 0 ? round4(list.reduce((a, b) => a + b.reward, 0) / total) : 0;
      const avgDurationMs = total > 0 ? Math.round(list.reduce((a, b) => a + b.durationMs, 0) / total) : 0;
      out.push({
        modelId,
        totalTasks: total,
        verifiedSuccesses,
        failures,
        verifiedRate: total > 0 ? round4((verifiedSuccesses / total) * 100) : 0,
        avgReward,
        avgDurationMs,
      });
    }
    return out.sort((a, b) => b.totalTasks - a.totalTasks);
  }

  /**
   * Snapshot of ACTUAL verified SQLite metrics for all 10 APEX Intelligence Center sections.
   * Never manufactures percentages or claims improvement without evidence.
   */
  public getDashboardSnapshot(projectId?: string): IntelligenceDashboardSnapshot {
    const strategyStats = this.bandit.getAllArmStats();
    const totalPulls = strategyStats.reduce((a, s) => a + s.pulls, 0);
    const byStrat = new Map<string, { pulls: number; successes: number }>();
    for (const s of strategyStats) {
      const cur = byStrat.get(s.strategyId) || { pulls: 0, successes: 0 };
      cur.pulls += s.pulls;
      cur.successes += s.successes;
      byStrat.set(s.strategyId, cur);
    }
    const strategyDistribution = Array.from(byStrat.entries())
      .map(([strategyId, v]) => ({
        strategyId,
        pulls: v.pulls,
        sharePct: totalPulls > 0 ? round4((v.pulls / totalPulls) * 100) : 0,
        verifiedSuccessRate: v.pulls > 0 ? round4((v.successes / v.pulls) * 100) : 0,
      }))
      .sort((a, b) => b.pulls - a.pulls);

    const validationRuns = this.memory.getValidationRuns(40);
    const simulatedBenchmarkRuns = validationRuns.filter((r) => r.source === 'SIMULATED_BENCHMARK');
    const controlledLiveRuns = validationRuns.filter((r) => r.source === 'CONTROLLED_LIVE_EXPERIMENT');
    const failedLearningExperiments = validationRuns.filter((r) => !r.approved || r.learnedCompletionPct < r.baselineCompletionPct);

    return {
      generatedAt: new Date().toISOString(),
      governance: this.governance.getPolicy(),
      banditAlgorithm: this.bandit.getAlgorithm(),
      explorationConfig: this.bandit.getExplorationConfig(),
      rewardWeights: this.evaluator.getWeights(),
      memoryStats: this.memory.getStats(projectId),
      memoryQualityStats: this.memory.getMemoryQualityStats(projectId),
      lastDecisionPlan: this.lastDecisionPlan,
      episodicMemory: this.memory.getEpisodes({ projectId, limit: 50 }),
      semanticMemory: projectId
        ? this.memory.getSemanticMemory(projectId)
        : this.memory.queryAll(`SELECT * FROM semantic_memory ORDER BY updated_at DESC LIMIT 60`).map((r) => ({
            id: r.id,
            projectId: r.project_id,
            category: r.category,
            key: r.key,
            value: r.value,
            version: Number(r.version || 1),
            updatedAt: r.updated_at,
          })),
      proceduralMemory: this.memory.getProcedures(projectId),
      evaluations: this.evaluator.getRecentEvaluations(projectId, 40),
      postTaskReviews: this.memory.getPostTaskReviews(25),
      strategyStats,
      modelPerformance: this.getModelPerformance(projectId),
      toolPerformance: this.memory.getToolTelemetry(),
      policyVersions: this.bandit.getPolicyVersions(),
      rollbackHistory: this.bandit.getRollbackHistory(),
      validationRuns,
      simulatedBenchmarkRuns,
      controlledLiveRuns,
      failedLearningExperiments,
      strategyDistribution,
      feasibilityStats: { ...this.feasibilityStats },
      intentStats: { ...this.intentStats },
      lastOfflineEval: this.improver.getLastOfflineEval(),
      lastOutcomeAcceptance: this.lastOutcomeAcceptance,
    };
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
