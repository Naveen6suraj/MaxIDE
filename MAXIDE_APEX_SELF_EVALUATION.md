# MAXIDE APEX — SELF-EVALUATION ENGINE & REWARD SYSTEM

**Module:** `src/intelligence/SelfEvaluationEngine.ts`

---

## 1. Trusted Evidence-Only Evaluation

Self-evaluation runs exclusively in trusted TypeScript runtime code using hard execution signals (`ExecutionEvidenceInput`) captured by `AgentEngine`—never LLM self-assertions:
- `toolsExecutedCount`, `filesInspected`, `filesModified`, `commandsExecuted`
- `buildAttempted`, `buildPassed`
- `testsAttempted`, `testsRun`, `testsPassed`
- `browserOrAppVerified`
- `securityViolationDetected`, `destructiveUnauthorizedAttempt`, `falseCompletionClaimed`
- `repeatedFailureCount`, `durationMs`

## 2. Honest Status Classification

Every evaluated task is classified into exactly one honest status:
- `COMPLETED` — trusted runtime evidence verified + requirement coverage $\ge 70\%$ + zero violations
- `PARTIALLY_COMPLETED` — partial verified progress or partial test/build completion
- `FAILED` — zero verified progress, failed tests/build, false completion claim, or security violation
- `BLOCKED` — external dependency or AI provider unavailable (excluded from corrupting bandit arms)
- `CANCELLED` — user cancelled execution (excluded from corrupting bandit arms)

## 3. Versioned Configurable Reward Function (`v1.0.0`)

Rewards are bounded to $[-1.0, +1.0]$ and persisted with their full breakdown in SQLite (`evaluations`):

| Component | Weight | Rule |
| :--- | :---: | :--- |
| `requirementCoverage` | `+0.30` | Scaled by verified requirement coverage $[0, 1]$ |
| `testSuccess` | `+0.25` | Full pass earns `+0.25`; partial/failing passes penalize proportionally |
| `buildSuccess` | `+0.15` | `+0.15` if build passed, `-0.15` if build failed |
| `userAcceptance` | `+0.15` | `+0.15` on 👍 positive user feedback, `-0.225` on 👎 rejection |
| `browserOrAppVerified` | `+0.10` | Awarded only when preview/app runtime verification passed |
| `securityClean` | `+0.10` | Awarded when zero security/destructive violations occurred |
| `efficiencyBonus` | `+0.05` | **STRICTLY gated** on `verified === true && status === 'COMPLETED'` — **NEVER rewards speed alone** |
| `falseCompletionPenalty` | `-0.80` | Zeros all positive bonuses + applies heavy penalty |
| `securityViolationPenalty` | `-1.00` | Zeros all positive bonuses -> guaranteed `-1.0` reward |
| `destructiveUnauthorizedPenalty` | `-1.00` | Zeros all positive bonuses -> guaranteed `-1.0` reward |
| `unverifiedClaimPenalty` | `-0.40` | Applied when task claims finish with zero tool actions |
| `repeatedFailedStrategyPenalty` | `-0.25` | Applied when same strategy fails $\ge 2$ times consecutively |
| `repeatedFailurePenalty` | `-0.20` | Applied when tool failure count $\ge 2$ |
| `unnecessaryModificationsPenalty` | `-0.15` | Per unnecessary file modification (capped at 3×) |

## 4. Nine Structured Evaluation Dimensions

Every evaluation record stores structured scores across `requirementCoverage`, `correctness`, `buildStatus`, `testStatus`, `security`, `performance`, `visualQuality`, `regressionRisk`, and `userAcceptance`.
