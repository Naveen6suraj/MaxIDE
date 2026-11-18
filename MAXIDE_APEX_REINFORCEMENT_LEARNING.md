# MAXIDE APEX — REINFORCEMENT LEARNING & POLICY OPTIMIZATION

**Modules:** `src/intelligence/ContextualBandit.ts`, `src/intelligence/ContinuousImprovementEngine.ts`

---

## 1. Practical Local-First Contextual Bandit Design

Instead of expensive deep RL or continuous GPU fine-tuning, MaxIDE APEX uses a lightweight, mathematically transparent **Contextual Multi-Armed Bandit** stored directly in SQLite (`bandit_arms`).

### Context Space
Each decision context is normalized into a composite key:
```text
contextKey = "<TASK_CATEGORY>::<TARGET_PLATFORM>::<MODEL_TIER>"
```
Example: `NATIVE_DESKTOP_BUILD::NATIVE_WINDOWS::local-small` or `WEB_APP_BUILD::WEB_APP::local-small`.

This prevents strategies that work only on cloud models or web projects from polluting local-small or native Windows desktop decisions.

---

## 2. Supported Bandit Algorithms

### A. Contextual UCB1 (Default)
Balances regularized empirical performance with conservative exploration:
- Empirical reward $r \in [-1, 1]$ is mapped to $r_{01} = (r + 1) / 2 \in [0, 1]$.
- Regularized mean prevents single-sample overfitting using prior strength $p_0 = 2$ and 9-criteria heuristic prior $h(a) \in [0, 1]$:
  $$\hat{\mu}_{\text{reg}}(a) = \frac{n_a \cdot \bar{r}_{01}(a) + p_0 \cdot h(a)}{n_a + p_0}$$
- Upper Confidence Bound score with $c = 0.75$ and consecutive-failure damping $d(a)$:
  $$\text{UCB1}(a) = \hat{\mu}_{\text{reg}}(a) + c \sqrt{\frac{\ln(N + 2)}{n_a + 1}} - d(a)$$
- **Consecutive-Failure Damping**: When an arm accumulates $k \ge 2$ consecutive failures in the same context, $d(a) = \min(0.45, 0.14 \cdot k)$ forces rapid shift away from failing strategies.

### B. Thompson Sampling (Beta Posterior)
- Maintains Beta parameters $(\alpha_a, \beta_a)$ initialized at conservative neutral prior $(1.5, 1.5)$.
- Updates after each verified outcome: $\alpha_a \leftarrow \alpha_a + r_{01}$, $\beta_a \leftarrow \beta_a + (1 - r_{01})$.
- Samples $\theta_a \sim \text{Beta}(\alpha_a, \beta_a)$ using Marsaglia-Tsang Gamma sampling powered by a deterministic **Mulberry32** seeded PRNG when `deterministicMode` is enabled.

---

## 3. Policy Versioning, Offline Evaluation & Rollback

1. **Snapshots (`createPolicyVersion`)**: Captures `algorithm`, `explorationC`, `rewardWeights`, `arms_snapshot_json`, and `benchmarkScore` into `policy_versions`.
2. **Deterministic Offline Evaluator (`runOfflineEvaluation`)**: Replays held-out unseen engineering scenarios comparing Baseline vs Learned Bandit policies in deterministic seeded mode, reporting `baselineMeanReward`, `candidateMeanReward`, `rewardDelta`, `completionRateDelta`, and `strategyShiftCount`.
3. **Governance Promotion Gate**: `PolicyGovernance.approvePolicyUpdate()` blocks promotion if learning is disabled, evaluated sample size is below `minSampleSizeForPromotion` (`3`), or `candidateScore < baselineScore`.
4. **Instant Rollback (`rollbackPolicy(versionId)`)**: Atomically restores `bandit_arms`, active algorithm, and exploration parameters to any prior versioned snapshot.
