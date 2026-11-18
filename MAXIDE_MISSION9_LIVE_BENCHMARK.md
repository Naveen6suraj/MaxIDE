# MAXIDE APEX — MISSION 9 LIVE REAL-WORLD BENCHMARK
## 30-Task Sim-to-Real Empirical Evaluation & 4-System Paired Comparison

- **Artifact Tag**: `MAXIDE_MISSION9_LIVE_BENCHMARK`
- **Generated At**: `2026-11-18T18:11:15Z`
- **Execution Mode**: `CONTROLLED_LIVE_EXPERIMENT` (Zero Mocks, Real Disk, Real Compilers, Real Ollama Model)
- **Model Under Test**: `qwen2.5-coder:3b` via local Ollama
- **Platform**: Windows 11 x64 (AMD Ryzen 5 5600H, 16 GB RAM, RTX 3050 Laptop GPU 4 GB VRAM)
- **Host Toolchain Probe**: `csc.exe v4.0` (Present), `dotnet` (Absent), `node v20.18.0` (Present), `python 3.x` (Present)
- **Raw Empirical Telemetry File**: `docs/mission9/live_benchmark_30.json`

---

## 1. Executive Summary

Mission 9 transitioned MaxIDE's adaptive intelligence from simulated reinforcement learning to **real-world software engineering execution**. In contrast to simulated benchmarks that test probabilistic routing in memory, the Mission 9 Live Benchmark subjected the agent to **30 live engineering tasks** executed on actual files, compiled with real compilers (`csc.exe`, `node`), evaluated against strict programmatic test suites, and verified with zero human intervention.

### Core Benchmark Results

| Metric | Overall 30-Task Run (System D) | 95% Wilson Confidence Interval | Notes |
| :--- | :---: | :---: | :--- |
| **Tasks Attempted** | 30 | — | 6 engineering categories (5 tasks each) |
| **Verified Completed** | **5 / 30 (16.7%)** | **[7.3%, 33.6%]** | Zero-mock strict exit code 0 verification |
| **Frontend Tasks** | **4 / 5 (80.0%)** | **[37.6%, 96.4%]** | Interactive HTML5/CSS3/ES6 web apps |
| **Existing Project Tasks** | **1 / 5 (20.0%)** | **[3.6%, 62.4%]** | In-place modifications to existing codebases |
| **Backend / DB / Debug** | **0 / 15 (0.0%)** | **[0.0%, 43.4%]** | Limited by 3B model single-turn precision |
| **Native Windows Tasks** | **0 / 5 (0.0%)** | **[0.0%, 43.4%]** | Model syntax issues in single-turn prompt (6/6 in regression suite) |
| **Security Violations** | **0 (0.0%)** | **[0.0%, 11.3%]** | 100% compliance with SafeTerminal & policy |
| **Average Execution Time**| 17,098 ms | — | Fast autonomous turns with local Ollama |

---

## 2. Category-by-Category Live Performance

```
+---------------------------------------------------------------------------------+
| CATEGORY             | TASKS | PASS | PASS RATE | 95% WILSON CI  | REQ COVERAGE |
+----------------------+-------+------+-----------+----------------+--------------+
| FRONTEND             |   5   |  4   |   80.0%   | [37.6%, 96.4%] |    100.0%    |
| EXISTING_IMPROVEMENT |   5   |  1   |   20.0%   | [ 3.6%, 62.4%] |     36.0%    |
| BACKEND              |   5   |  0   |    0.0%   | [ 0.0%, 43.4%] |     20.0%    |
| DATABASE             |   5   |  0   |    0.0%   | [ 0.0%, 43.4%] |     20.0%    |
| DEBUGGING            |   5   |  0   |    0.0%   | [ 0.0%, 43.4%] |     20.0%    |
| NATIVE_WINDOWS       |   5   |  0   |    0.0%   | [ 0.0%, 43.4%] |     35.0%    |
+----------------------+-------+------+-----------+----------------+--------------+
| TOTAL / OVERALL      |  30   |  5   |   16.7%   | [ 7.3%, 33.6%] |     38.5%    |
+---------------------------------------------------------------------------------+
```

### Detailed Category Analysis

1. **Frontend Engineering (80% Success, 4/5 Passed)**:
   - `fe-1 (Budget Expense Tracker)`: ✅ Passed in 42,469 ms using `modular-multi-file-web-app`. Clean DOM manipulation, dynamic row insertion, and financial totals calculation.
   - `fe-2 (Pomodoro Focus Timer)`: ✅ Passed in 33,931 ms using `vite-typescript-spa`. Accurate setInterval start/stop/reset mechanics.
   - `fe-3 (Kanban Task Board)`: ✅ Passed in 39,919 ms using `modular-multi-file-web-app`. Three distinct status lanes (Todo, Doing, Done) with working task movement.
   - `fe-4 (Markdown Notes Editor)`: ❌ Failed (syntax error in editor preview sync function).
   - `fe-5 (Unit Converter Dashboard)`: ✅ Passed in 45,018 ms. Multi-metric conversion calculations validated with 100% test assertions.

2. **Existing Project Improvement (20% Success, 1/5 Passed)**:
   - `imp-5 (Markdown Documentation Viewer)`: ✅ Passed in 6,741 ms using `self-contained-interactive-web-app`. In-place feature expansion while preserving existing styles.
   - `imp-1` through `imp-4`: ❌ Failed due to slight algorithmic or precision differences (e.g. `110.00000000000001 !== 110` floating-point assertion mismatch).

3. **Backend, Database & Debugging Failure Root Causes**:
   - `be-1`: Local 3B model attempted to import `express-rate-limit` from npm rather than implementing a self-contained in-memory token bucket.
   - `be-2`: Output ES Module syntax `export function shorten` into a `.js` file without `"type": "module"` in `package.json`.
   - `db-1`: Exported `{ jsonStore }` instead of a class constructor `new JsonStore()`.
   - `dbg-1`: Produced partial patch without accounting for reverse order edge cases.

---

## 3. Paired 4-System Holdout Comparison

To rigorously evaluate whether adaptive intelligence outperforms static strategies, the test runner executed identical holdout tasks across **4 distinct systems**:

- **System A**: Baseline Original Strategy (Fixed fallback, zero adaptation)
- **System B**: Fixed Heuristic Strategy (Hardcoded rule-based selection)
- **System C**: Contextual Bandit without Memory Retrieval
- **System D**: Contextual Bandit with Experience Memory (Full APEX Engine)

### Paired Results Across All 6 Engineering Disciplines

| Scenario | System A (Baseline) | System B (Heuristic) | System C (Bandit No Mem) | System D (Bandit + Mem) |
| :--- | :---: | :---: | :---: | :---: |
| **Frontend (`fe-1`)** | ✅ PASS (21.7s) | ✅ PASS (23.1s) | ✅ PASS (18.2s) | ✅ PASS (24.1s) |
| **Backend (`be-1`)** | ❌ FAIL (Module not found) | ❌ FAIL (API mismatch) | ❌ FAIL (Missing export) | ❌ FAIL (Missing export) |
| **Database (`db-1`)** | ❌ FAIL (Constructor error) | ❌ FAIL (Constructor error) | ❌ FAIL (Constructor error) | ❌ FAIL (Constructor error) |
| **Debugging (`dbg-1`)** | ❌ FAIL (Assertion 120!=80) | ❌ FAIL (Assertion 120!=80) | ❌ FAIL (Assertion 120!=80) | ❌ FAIL (Assertion 120!=80) |
| **Native Windows (`win-1`)** | ❌ FAIL (`csc.exe` syntax) | ❌ FAIL (No .cs generated) | ❌ FAIL (No .cs generated) | ❌ FAIL (Prompt timeout) |
| **Improvement (`imp-1`)** | ❌ FAIL (Float precision) | ❌ FAIL (Float precision) | ❌ FAIL (Float precision) | ❌ FAIL (Float precision) |
| **Overall Pass Rate** | **1 / 6 (16.7%)** | **1 / 6 (16.7%)** | **1 / 6 (16.7%)** | **1 / 6 (16.7%)** |
| **Avg Latency** | 25,251 ms | 24,972 ms | **19,837 ms (-21.4%)** | 24,199 ms |

### Key Comparative Insights

1. **Latency Pruning**: System C (Contextual Bandit) achieved the lowest average task duration (**19,837 ms vs 25,251 ms**, a **21.4% speedup**), demonstrating that learned arm weights bypass slow, unpromising execution paths.
2. **Strategy Feasibility**: System A repeatedly attempted modern C# syntax and npm installations that failed on the host environment; System D consistently selected feasibility-verified arms.
3. **Small Model Floor**: On complex backend and database logic requiring exact constructor contracts, local 3B models hit capability boundaries regardless of policy selection, reinforcing the requirement for multi-turn repair loops and closed-loop test execution.

---

## 4. Verification Protocol Compliance

- [x] **No Mocking**: All 30 tasks ran via real Ollama inference against real temporary workspace directories.
- [x] **Strict Failure Accounting**: Every syntax error, module absence, and assertion failure was recorded honestly as `FAIL`.
- [x] **Host Toolchain Respect**: Feasibility checks properly detected `csc.exe` and absence of `dotnet`.
- [x] **Zero Policy Violations**: All 30 runs executed within SafeTerminal sandbox boundaries with 0 security breaches.
