# MAXIDE APEX — MISSION 8 NEXT ROADMAP (MISSION 9 ENGINEERING PLAN)

Prioritized strictly from empirical failures and quantitative gaps uncovered during Mission 8 validation.

---

## Priority 1 — Fix High-Impact Production & RL Defects (Immediate)
1. **Fail-Honest Debug Verification in `AgentEngine.ts`**:
   - Add `'debug'`, `'fix'`, `'repair'`, `'patch'`, `'refactor'`, `'update'` to `isExecutionTask` so `ClosedLoopTestEngine` ALWAYS runs discovered tests (`npm test` / `node test.js`) and feeds real stderr failures back into the agent repair loop before concluding.
2. **Calibrate UCB1 Exploration & Separate Production Exploitation**:
   - Lower default `explorationC` from `0.75` to `0.25` (or switch default algorithm to **Thompson Sampling**, which showed higher stability and positive memory gain `+1.7%` in Mission 8).
   - Enable `exploitOnly: true` for deterministic holdout benchmarks and user-selectable "Production Stable" mode, reserving exploration for explicit conservative exploration budget (e.g., $\epsilon = 0.08$).
3. **Confidence-Scaled Consecutive-Failure Damping**:
   - Replace raw `consecutiveFailures * 0.14` with `min(0.35, consecutiveFailures * 0.12) / Math.sqrt(1 + arm.successes * 0.5)` to eliminate the budget-1000 oscillation dip (`75.0% → 65.0%`).

---

## Priority 2 — Upgrade Memory Quality & Retrieval Intelligence
4. **Episode Deduplication & Recency Decay**:
   - Deduplicate identical `(projectId, normalizedPrompt, strategyId, status)` episodes by incrementing a `repeat_count` and updating `created_at` instead of inserting duplicate rows.
   - Multiply cosine similarity by an exponential recency decay factor $e^{-\lambda \cdot \text{ageDays}}$ (half-life ~45 days) so fresh project experiences outrank 180-day-old stale records.
5. **Verified-Only Positive Memory Weighting**:
   - Ensure exploratory failed pulls do not dilute positive prior transfer in System D.

---

## Priority 3 — True Cross-Domain Generalization & Closed-Loop Model Routing
6. **Trait-Based Contextual Bandit (LinUCB / Hierarchical Priors)**:
   - Represent each candidate strategy with explicit engineering trait vectors (`lowToolchainOverhead`, `inspectFirst`, `nativeWinBinary`, `zeroNetworkDeps`, `incrementalDiff`) so learning that `lowToolchainOverhead` excels on `local-small` (3B Ollama) transfers zero-shot to **unseen domains** (raising cross-domain transfer delta above `0.0%`).
7. **Closed-Loop Model Routing Bandit**:
   - Connect `ContextualBandit` directly to `AIGateway` model selection (`qwen2.5-coder:3b` vs `qwen2.5:0.5b` vs configured cloud models) optimizing for verified completion rate per latency/cost.

---

## Priority 4 — Real-World 3B Local Engineering Reliability
8. **Compile-Check Repair Loop for Native Windows C# (`csc.exe`)**:
   - Provide `qwen2.5-coder:3b` an explicit C# 5 WinForms template directive when `native-winforms-csc` is selected and auto-run `csc.exe` verification inside `ClosedLoopTestEngine` so compilation errors trigger automatic self-repair.
9. **Continuous Live-Execution Regression Tracking**:
   - Schedule periodic isolated real-agent experiments (`REAL_AGENT_EXECUTION`) alongside simulated benchmarks (`SIMULATED_BENCHMARK`) inside **APEX Intelligence Center**, promoting policies ONLY when both simulated holdout CI95 and live execution rates pass governance gates.
10. **Storage Evolution Path**:
    - Retain `sql.js` WASM (proven 5 ms flush / 2 MB disk at 5,000 rows + SIGKILL safe) until MaxIDE upgrades to Node 22+ LTS built-in `node:sqlite`, eliminating WASM export copies with zero native C++ build dependencies.
