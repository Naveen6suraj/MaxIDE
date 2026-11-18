# MAXIDE APEX — MISSION 8 FAILURE ANALYSIS

**Philosophy:** Report every real defect, limitation, and failed experiment transparently without inflating results.

---

## 1. Failure #1 — UCB1 Over-Exploration Override (Caught in BOTH Benchmark & Live Ollama Exp 3!)
- **Observed Symptom:**
  - In **120-Scenario Benchmark** (Default Eval): System D dropped from `71.1%` (budget 10) to `57.8%–58.9%` (budgets 50–250) and trailed Fixed Heuristic (`70.0%`).
  - In **Live Real Agent Experiment 3 (Native Windows C#)**: Even after seeding `native-winforms-csc` with **4 verified successes (`reward=0.90`)**, UCB1 selected `native-wpf-dotnet` (`pulls=0`), which generated uncompilable XAML!
- **Root Cause:** `ContextualBandit.ts` sets `explorationC = 0.75`. For an arm with `pulls = 0` when `totalPulls = 8`, the exploration bonus is $0.75 \sqrt{\ln(10)/1} = +1.14$, exceeding the entire $[0, 1]$ normalized reward range. Furthermore, production/holdout calls did not disable exploration (`exploitOnly = false`).
- **Evidence of Cause:** Controlled `exploitOnHoldout: true` ablation immediately jumped System C to **`74.4%`** and System D to **`76.1%`** (surpassing Fixed Heuristic `70.0%` by `+6.1%`).

---

## 2. Failure #2 — Late-Budget Consecutive-Failure Damping Oscillation (Budget 1000)
- **Observed Symptom:** Under exploit-only evaluation, System C peaked at `75.0%` (budget 500) and dipped to `65.0%` (budget 1000), while System D held `71.1%`.
- **Root Cause:** `ContextualBandit.ts` applies a hard penalty (`failureDamping = min(0.45, consecutiveFailures * 0.14)`) whenever `consecutiveFailures >= 2`, regardless of how many prior verified successes the arm has (`pulls = 30, successes = 26`). In a 1,000-step stochastic stream, even an 86%-reliable optimal arm experiences 2 consecutive random failures roughly ~20 times, transiently knocking it below a suboptimal arm until the next reset.
- **Fix for Mission 9:** Scale failure damping inversely by historical confidence: `failureDamping / sqrt(1 + arm.successes)` or use sliding-window exponentially weighted moving average (EWMA) rewards.

---

## 3. Failure #3 — Real-World Live Experiment 2 (`calc.js` Debug) False-Positive Agent Completion
- **Observed Symptom:** Both Baseline and Learned live agents (`qwen2.5-coder:3b`) left the bug (`price + price * pct / 100`) unfixed in `calc.js`, `node test.js` exited non-zero (`actual 120 !== expected 80`), yet `AgentEngine.runTask()` reported `agentReportedSuccess: true`!
- **Root Cause:** In `AgentEngine.ts`, `executionKeywords` (`['build', 'create', 'make', 'implement', ...]`) omitted `'debug'`, `'fix'`, `'repair'`, and `'patch'`. Consequently `isExecutionTask` evaluated to `false`, skipping `ClosedLoopTestEngine.runTests()` completely!
- **Severity:** **HIGH** — violates MaxIDE's Fail-Honest invariant on debugging tasks.

---

## 4. Failure #4 — Real-World Live Experiment 3 (C# 5 `csc.exe` Compilation Failure on 3B Local Model)
- **Observed Symptom:** Both Baseline (`Program.cs`) and Learned (`MainWindow.xaml.cs`) generated C# code that failed `.NET Framework 4.0 csc.exe` compilation (missing `System.Windows.Forms` C# 5 compatible syntax or emitting `.csproj`/WPF XAML when no `.NET 8 SDK` is installed).
- **Root Cause:** (1) UCB1 over-explored `native-wpf-dotnet`, and (2) `AgentEngine` did not enforce an iterative `csc.exe` compile-error repair loop before concluding.

---

## 5. Failure #5 — Memory Quality Gaps Identified in Section 7 Audit
1. **No Episode Deduplication (`Test 7.3`):** Writing the exact same `(projectId, prompt, strategyId, status)` 5 times produced 5 duplicate rows, which can saturate `topK = 5` similarity retrieval with a single repeated task.
2. **No Staleness / Recency Decay (`Test 7.4`):** A 180-day-old episode scored identically (`0.674`) to a 0-day fresh episode (`0.674`).
3. **Corrupt SQLite Crash (`Test 8.3`, FIXED in Mission 8):** `sql.js` deferred corrupt header failure into `createSchema()` outside `try/catch` — fixed immediately during Mission 8 with magic-byte + `PRAGMA quick_check` validation.
4. **Backup 200-Row Silent Truncation (`Test 8.4`, FIXED in Mission 8):** `getEpisodes()` clamped `limit` at `200` — raised to `5000`.
5. **Model Routing Disconnection:** `selectBestFreeModelForPrompt()` runs before `AdaptiveIntelligenceCoordinator.planTask()`, so bandit learning optimizes strategy IDs but does not yet steer model routing.
