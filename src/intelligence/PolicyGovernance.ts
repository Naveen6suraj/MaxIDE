/**
 * MaxIDE APEX — Mission 7: Safety & Policy Governance Engine (Module G)
 * Enforces immutable safety invariants over adaptive learning:
 * - Never allows automatic modification of core system instructions or security policies
 * - Never allows the LLM to self-manipulate reward calculations
 * - Strictly scrubs credentials/secrets before any memory persistence
 * - Requires verified execution evidence before storing positive experiences
 * - Gates policy promotion on non-regressive offline evaluation
 */

export interface GovernancePolicy {
  learningEnabled: boolean;
  allowCrossProjectProceduralTransfer: boolean;
  requireExecutionEvidenceForSuccess: boolean;
  minSampleSizeForPromotion: number;
  maxRegressionTolerance: number;
  // Immutable safety locks (cannot be disabled via API or learning loop)
  readonly coreSystemPromptLocked: true;
  readonly securityBoundariesLocked: true;
  readonly rewardCalculationTrustedOnly: true;
}

export interface ExecutionEvidenceInput {
  toolsExecutedCount: number;
  filesInspected: string[];
  filesModified: string[];
  commandsExecuted: string[];
  buildAttempted: boolean;
  buildPassed: boolean;
  testsAttempted: boolean;
  testsRun: number;
  testsPassed: number;
  browserOrAppVerified: boolean;
  securityViolationDetected: boolean;
  destructiveUnauthorizedAttempt: boolean;
  falseCompletionClaimed: boolean;
  repeatedFailureCount: number;
  durationMs: number;
}

export class PolicyGovernance {
  private learningEnabled: boolean = true;
  private allowCrossProjectTransfer: boolean = true;
  private minSampleSizeForPromotion: number = 3;

  public getPolicy(): GovernancePolicy {
    return {
      learningEnabled: this.learningEnabled,
      allowCrossProjectProceduralTransfer: this.allowCrossProjectTransfer,
      requireExecutionEvidenceForSuccess: true,
      minSampleSizeForPromotion: this.minSampleSizeForPromotion,
      maxRegressionTolerance: 0.0,
      coreSystemPromptLocked: true,
      securityBoundariesLocked: true,
      rewardCalculationTrustedOnly: true,
    };
  }

  public setLearningEnabled(enabled: boolean): void {
    this.learningEnabled = Boolean(enabled);
  }

  public isLearningEnabled(): boolean {
    return this.learningEnabled;
  }

  public setCrossProjectTransfer(enabled: boolean): void {
    this.allowCrossProjectTransfer = Boolean(enabled);
  }

  /**
   * Immutable safety invariants — always false.
   */
  public canModifyCoreSystemInstructions(): boolean {
    return false;
  }

  public canModifySecurityPolicies(): boolean {
    return false;
  }

  public canAgentManipulateOwnReward(): boolean {
    return false;
  }

  /**
   * Scrub passwords, API keys, bearer tokens, private keys, and env secrets
   * before persisting any learning or memory record.
   */
  public static sanitizeSecretText(input: string): string {
    if (!input) return '';
    return String(input)
      .replace(/-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
      .replace(/\b(sk-[a-zA-Z0-9_-]{10,})\b/g, '[REDACTED_API_KEY]')
      .replace(/\b(AIza[0-9A-Za-z_-]{16,})\b/g, '[REDACTED_API_KEY]')
      .replace(/\b(gsk_[0-9A-Za-z_-]{14,})\b/g, '[REDACTED_API_KEY]')
      .replace(/\b(ghp_[0-9A-Za-z]{16,}|github_pat_[0-9A-Za-z_]{20,})\b/g, '[REDACTED_TOKEN]')
      .replace(/\b(xox[baprs]-[0-9A-Za-z-]{10,})\b/g, '[REDACTED_TOKEN]')
      .replace(/(Bearer\s+)[A-Za-z0-9._-]{12,}/gi, '$1[REDACTED_TOKEN]')
      .replace(/((?:api[_-]?key|password|passwd|secret|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*['"]?)[^\s'",;}{]{6,}/gi, '$1[REDACTED_SECRET]');
  }

  public static sanitizeObject<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return PolicyGovernance.sanitizeSecretText(obj) as unknown as T;
    if (Array.isArray(obj)) return obj.map((item) => PolicyGovernance.sanitizeObject(item)) as unknown as T;
    if (typeof obj === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj as Record<string, any>)) {
        if (/^(apiKey|password|secret|token|privateKey|authHeader)$/i.test(k)) {
          out[k] = '[REDACTED_SECRET]';
        } else {
          out[k] = PolicyGovernance.sanitizeObject(v);
        }
      }
      return out as T;
    }
    return obj;
  }

  /**
   * Verify whether an execution record carries real trusted evidence before
   * being stored as a verified successful experience.
   */
  public static isSuccessEvidenceVerified(evidence: ExecutionEvidenceInput): { verified: boolean; reason: string } {
    if (evidence.securityViolationDetected || evidence.destructiveUnauthorizedAttempt) {
      return { verified: false, reason: 'Security violation or unauthorized destructive operation detected.' };
    }
    if (evidence.falseCompletionClaimed) {
      return { verified: false, reason: 'False completion claim cannot be stored as verified success.' };
    }
    if (evidence.toolsExecutedCount <= 0 && evidence.filesModified.length === 0 && evidence.commandsExecuted.length === 0) {
      return { verified: false, reason: 'Zero tool executions or verifiable artifacts recorded.' };
    }
    if (evidence.buildAttempted && !evidence.buildPassed) {
      return { verified: false, reason: 'Build failed; cannot mark experience as verified success.' };
    }
    if (evidence.testsAttempted && (evidence.testsRun === 0 || evidence.testsPassed < evidence.testsRun)) {
      return { verified: false, reason: 'Automated tests did not pass.' };
    }
    return { verified: true, reason: 'Execution evidence verified by trusted runtime checks.' };
  }

  /**
   * Gate policy updates on offline evaluation — prevent regressions and catastrophic forgetting.
   */
  public approvePolicyUpdate(params: {
    baselineScore: number;
    candidateScore: number;
    evaluatedTasks: number;
    modifiesCoreInstructions?: boolean;
    modifiesSecurityPolicy?: boolean;
  }): { approved: boolean; reason: string } {
    if (!this.learningEnabled) {
      return { approved: false, reason: 'Adaptive learning is currently disabled by user governance settings.' };
    }
    if (params.modifiesCoreInstructions) {
      return { approved: false, reason: 'Blocked: Core system instructions are immutably locked.' };
    }
    if (params.modifiesSecurityPolicy) {
      return { approved: false, reason: 'Blocked: Security policies cannot be modified automatically.' };
    }
    if (params.evaluatedTasks < this.minSampleSizeForPromotion) {
      return {
        approved: false,
        reason: `Insufficient offline evaluation tasks (${params.evaluatedTasks} < ${this.minSampleSizeForPromotion} required).`,
      };
    }
    if (params.candidateScore < params.baselineScore) {
      return {
        approved: false,
        reason: `Rejected: Candidate policy regressed (${params.candidateScore.toFixed(3)} < baseline ${params.baselineScore.toFixed(3)}).`,
      };
    }
    return {
      approved: true,
      reason: `Approved: Candidate policy achieved ${params.candidateScore.toFixed(3)} vs baseline ${params.baselineScore.toFixed(3)} across ${params.evaluatedTasks} tasks.`,
    };
  }
}
