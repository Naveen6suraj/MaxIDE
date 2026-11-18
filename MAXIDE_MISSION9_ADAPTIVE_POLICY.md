# MAXIDE APEX — MISSION 9 ADAPTIVE POLICY SPECIFICATION

**Modules:** `src/intelligence/ContextualBandit.ts`, `src/intelligence/ToolchainDetector.ts`, `src/intelligence/ReasoningDecisionEngine.ts`  
**Regression Tests:** `src/tests/mission9_regression_suite.test.ts` (Tests 6–9)

---

## 1. Root Cause of Mission 8 Native Windows Failure

In Mission 8 Real Experiment 3, `native-winforms-csc` had been seeded with **4 verified successes** (`reward = 0.90`). However, `ContextualBandit` selected `native-wpf-dotnet` (`pulls = 0`), which generated uncompilable XAML because the host machine lacked the .NET 8 SDK (`dotnet: False` in probe).

Two mathematical and architectural defects caused this:
1. **Unbounded Exploration Bonus**: `explorationC = 0.75` assigned an untested arm $+0.75 \sqrt{\ln(9)/1} = +1.11$, overwhelming the entire $[0, 1]$ reward scale.
2. **Zero Feasibility Filtering**: The system evaluated strategies without checking whether required compilers or SDKs were installed.

---

## 2. Two-Stage Decision Architecture

Mission 9 enforces strict separation between **feasibility** and **ranking**:

```text
Candidate Strategies (All possible approaches)
       │
       ▼
[STAGE 1: ToolchainDetector Capability Filter]
   - Is csc.exe available?
   - Is dotnet SDK available?
   - Is node / cargo available?
   - Are workspace dependencies present?
       │
       ├── Infeasible ──► Excluded from execution + emit exact install instructions
       ▼
Feasible Strategies Only
       │
       ▼
[STAGE 2: Bounded Adaptive Ranking]
   - Bounded UCB1 (c=0.30, cap=0.35) or Thompson Sampling
   - Heuristic priors from 9 criteria
   - Deduplicated, recency-weighted Experience Memory
```

---

## 3. Calibrated Exploration Controls

```typescript
export interface ExplorationConfig {
  explorationC: number;                   // Calibrated to 0.30 (down from 0.75)
  maxExplorationBonus: number;            // Capped at 0.35 (prevents overriding proven winners)
  minSamplesBeforeDefaultChange: number;  // Requires >= 3 samples before flipping defaults
  confidenceScaledDamping: boolean;       // Damping scaled inversely by sqrt(1 + successes)
}
```

### Confidence-Scaled Failure Damping
Mission 8 identified that 2 consecutive stochastic failures knocked an arm with 25 prior successes down into an oscillatory dip. Mission 9 scales damping by historical sample confidence:
$$\text{damping} = \frac{\min(0.35, \text{consecutiveFailures} \times 0.12)}{\sqrt{1 + 0.5 \times \text{successes}}}$$

This allows fast pivots away from genuinely failing new strategies while protecting established high-confidence workflows from temporary stochastic noise.
