# MAXIDE APEX — MISSION 9 FAILURE & PATHOLOGY ANALYSIS

**Benchmark:** Mission 8 (120 Scenarios) + Mission 9 (30 Real Live Tasks + 20-Item Regression Suite)  
**Philosophy:** Report real defects, root causes, and limitations transparently without manufacturing success.

---

## 1. Primary Defect Audited: Mission 8 Sim-to-Real Live Execution Divergence

In Mission 8, simulated benchmark holdout results showed high completion (`72.2%–76.1%`), yet live execution tied at `1/3 (33.3%)`. The audit established 4 root causes:

### A. UCB1 Over-Exploration Overriding Seeded Winners
- **Mechanism:** For an arm with 0 pulls when total pulls $N=8$, the exploration bonus was $0.75 \sqrt{\ln(10)/1} = +1.14$.
- **Consequence:** In Live Exp 3, despite 4 verified successes on `native-winforms-csc`, the agent selected `native-wpf-dotnet`, generating XAML that failed to compile without the .NET 8 SDK.
- **Mission 9 Fix:** `explorationC` calibrated to $0.30$; `maxExplorationBonus` hard-capped at $0.35$; `minSamplesBeforeDefaultChange` enforced at $\ge 3$. Stage 1 capability filtering excludes `native-wpf-dotnet` entirely when `dotnetAvailable = false`.

### B. Missing Closed-Loop Verification on Debugging Tasks
- **Mechanism:** In `AgentEngine.ts`, `executionKeywords` checked `['build', 'create', 'make', 'implement', 'write', 'code', ...]` but omitted `'debug'`, `'fix'`, and `'repair'`.
- **Consequence:** In Live Exp 2 (`calc.js`), the agent claimed completion after editing without running the discovered `node test.js` suite.
- **Mission 9 Fix:** Intent classification directly determines execution status (`taskIntent.isExecution`). Any task classified as `DEBUG`, `TEST`, `BUILD`, `CODE_EDIT`, or `NATIVE_APP_BUILD` triggers automated test discovery, compiler verification, and error-feedback loops before concluding.

### C. Absence of Mid-Task Compiler/Test Diagnostic Feedback
- **Mechanism:** When `qwen2.5-coder:3b` generated a minor syntax mistake or failed a unit test, the agent terminated on turn 1 rather than reading the diagnostic output.
- **Consequence:** Single-turn failure without recovery.
- **Mission 9 Fix:** `AgentEngine.ts` now inspects test exit codes and `csc.exe` output before concluding. If errors occur and steps remain, it feeds the exact failure back as a `[Closed-Loop Self-Repair]` prompt, giving the agent up to 2 targeted repair attempts.

### D. Silent Corrupt SQLite Crash on Startup
- **Mechanism:** `sql.js` constructs an in-memory database object without validating the file header until the first DDL statement.
- **Consequence:** Corrupt SQLite files threw an unhandled error inside `createSchema()` outside `try/catch`.
- **Mission 9 Fix:** Added explicit 16-byte magic-header check (`SQLite format 3`) and `PRAGMA quick_check` inside the constructor's `try/catch`, cleanly triggering auto-quarantine (`*.corrupt.*`) and fresh recovery.

---

## 2. Remaining Limitations & Honest Scope Boundaries

1. **Local 3B Context Window & Multi-File Reasoning**: Small local models (`qwen2.5-coder:3b`) remain prone to hallucinating imports or missing subtle edge cases when editing codebases exceeding 4 files simultaneously.
2. **C# 5 Language Limitations on Zero-SDK Windows**: Because Windows 11 includes `csc.exe` v4.0 (.NET Framework 4.0 runtime) by default without the modern .NET 8 SDK, C# code must restrict itself to C# 5 syntax (no `$"..."` string interpolation, no `=>` expression-bodied members). Mission 9 injects explicit prompt guidance to steer the 3B model into valid C# 5 syntax.
3. **Exploration Cold-Start in Unseen Domains**: Without cross-domain trait vectors, tabular bandit arms still rely on 9-criteria engineering heuristics for the first 1–2 observations in a brand-new domain before empirical learning begins.
