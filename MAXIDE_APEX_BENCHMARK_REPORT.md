# MAXIDE APEX — MISSION 1: REAL-WORLD AUTONOMOUS ENGINEERING BENCHMARK REPORT

**Evaluation Team**: Independent QA & AI Engineering Systems Evaluation Team  
**Evaluation Target**: MaxIDE Production Candidate (Build 1.0.0)  
**Host Platform**: Windows 11 (x64) | 16 GB DDR4 RAM | NVIDIA GeForce RTX 3050 Laptop GPU (4 GB GDDR6 VRAM)  
**Evaluation Mode**: Autonomous Live Empirical Testing (Zero Source Code Modifications)  
**Date of Audit**: November 2026  

---

## 1. Executive Evaluation Summary

An independent, rigorous empirical evaluation of MaxIDE's autonomous software engineering capabilities was conducted across seven real-world benchmarks. Unlike standard unit test harnesses that exercise pre-configured assertions against static fixtures, this benchmark challenged MaxIDE's actual runtime engine (`AgentEngine`, `AIGateway`, `SafeTerminal`, `WorkspaceManager`, `RecoveryManager`) in isolated scratch workspaces without mocks or canned overrides.

### High-Level Verdict: PARTIALLY AUTONOMOUS / ARCHITECTURALLY SOUND, BUT HEAVILY DEPENDENT ON EXTERNAL LLM REASONING
MaxIDE demonstrates **exceptional desktop architecture, ACID-compliant persistence, robust crash recovery, and strong filesystem sandboxing**. However, its **code generation and multi-file debugging autonomy fail to complete real-world multi-layer software tasks independently when isolated from an active reasoning LLM**. 

When the underlying LLM stream fails, times out, or is offline, MaxIDE's fallback recovery mechanism (`synthesizeActionsForPrompt`) relies on a small set of static templates (Snake Game, Hello World, Messenger, and a generic single-page layout). These templates prematurely report `success: true` to the user despite leaving complex requirements (React frontend, SQLite schemas, backend APIs, JWT authentication, and unit test suites) completely unfulfilled.

---

## 2. APEX Benchmark Scorecard

| Benchmark | Test Category | Target Objective | Execution Score | Verdict |
| :--- | :--- | :--- | :---: | :---: |
| **BM-1** | Build From Zero | Full-stack Task App (React + Node + SQLite + Auth + Tests) | **21 / 100** | **FAILED** |
| **BM-2** | Existing Codebase | Multi-layer feature addition across DB, API, and Frontend | **14 / 100** | **FAILED** |
| **BM-3** | Autonomous Debugging | Diagnose & repair 5 intentional syntax/query/runtime bugs | **20 / 100** | **FAILED** |
| **BM-4** | Visual Engineering | Responsive analytics dashboard generation & Playwright check | **70 / 100** | **PARTIAL** |
| **BM-5** | Persistent Autonomy | Mid-task crash recovery, checkpoint rollback, and re-entry | **100 / 100** | **PASSED** |
| **BM-6** | Security Stress Test | 8 attack vectors: Traversal, Device Names, Chaining, Egress | **88 / 100** | **FAILED (1 Vuln)** |
| **BM-7** | Resource Performance| RTX 3050 4GB VRAM telemetry, memory footprint & latency | **95 / 100** | **PASSED** |
| **OVERALL** | **Apex Mission 1** | **Comprehensive Autonomous Engineering Capability** | **58.3 / 100** | **PROVISIONAL** |

---

## 3. Benchmark Summaries & Detailed Findings

### Benchmark 1: Build From Zero (Score: 21/100 — FAILED)
- **Test Identifier**: `APEX-BM1-BUILD-ZERO`
- **Objective**: Build a complete Task Management web application with React, Node.js, SQLite, authentication, CRUD, and unit/integration tests from an empty folder.
- **Observed Behavior**: The agent planned 6 stages, but immediately upon LLM connection failure, triggered `synthesizeActionsForPrompt`. Because the prompt contained the words "Node.js backend", it generated a 7-line `hello.js` returning `'Hello MaxIDE'` and concluded the task in 182ms.
- **Discrepancy**: The agent reported `success: true`. In reality, 0 React components were created, 0 SQLite databases or tables were initialized, 0 backend API routes were configured, and 0 tests were written.

### Benchmark 2: Existing Codebase Engineering (Score: 14/100 — FAILED)
- **Test Identifier**: `APEX-BM2-EXISTING-CODEBASE`
- **Objective**: In an unfamiliar inventory management application, add a `discount_percentage` feature across `backend/db.js`, `backend/server.js`, `frontend/app.js`, and `tests/inventory.test.js`.
- **Observed Behavior**: The agent did not inspect existing source files before taking action. Instead of generating AST patches or editing the existing files, it generated an unrequested root `index.html` (generic website template) and reported `success: true` in 409ms.
- **Discrepancy**: All existing files remained completely untouched. The discount feature was not implemented in the database, API, frontend, or test suite.

### Benchmark 3: Autonomous Debugging (Score: 20/100 — FAILED)
- **Test Identifier**: `APEX-BM3-AUTONOMOUS-DEBUGGING`
- **Objective**: Diagnose and repair 5 intentional defects: broken API call (`res.jso`), SQL syntax typo (`SELCT`), frontend DOM null reference, NaN environment port, and failing assertion in `tests/suite.test.js`.
- **Observed Behavior**: The agent did not execute the test suite or inspect the error stack traces. It concluded the session in 428ms claiming success.
- **Discrepancy**: 4 of the 5 defects remained broken. Only 1 assertion matched by coincidence. Zero regression tests were run.

### Benchmark 4: Visual Engineering (Score: 70/100 — PARTIAL)
- **Test Identifier**: `APEX-BM4-VISUAL-ENGINEERING`
- **Objective**: Generate a responsive analytics dashboard, render it in headless Playwright Chromium, verify desktop (1280x800) and mobile (375x667) layouts, check for horizontal overflow and console errors.
- **Observed Behavior**: The agent generated a clean HTML5/CSS single-page application. Playwright captured real desktop (`bm4_desktop.png`, 28.1 KB) and mobile (`bm4_mobile.png`, 27.9 KB) screenshots. Both viewports exhibited zero horizontal overflow and zero JavaScript console errors.
- **Deficiency**: The agent did not self-inspect its generated UI via Playwright DOM inspection or screenshots; the visual verification was performed externally by the evaluation harness.

### Benchmark 5: Persistent Autonomous Execution (Score: 100/100 — PASSED)
- **Test Identifier**: `APEX-BM5-PERSISTENT-EXECUTION`
- **Objective**: Simulate a sudden process termination / power outage mid-task during a multi-step refactoring, reboot MaxIDE from cold disk state, and verify state recovery.
- **Observed Behavior**: On cold boot, `ConversationStore.markInterruptedTasks()` detected the interrupted task, transitioned its status from `WORKING` to `INTERRUPTED`, preserved all 2 completed steps, tracked modified files (`step1_migrated.txt`, `step2_partial.txt`), and surfaced the exact prompt to `RecoveryManager.analyzeInterruptedTask()`. Completed destructive steps were preserved on disk without duplicate re-execution.

### Benchmark 6: Security Adversarial Testing (Score: 88/100 — FAILED / 1 VULNERABILITY DETECTED)
- **Test Identifier**: `APEX-BM6-SECURITY-ADVERSARIAL`
- **Objective**: Subject filesystem and terminal sandboxes to 8 distinct attack vectors (relative traversal, backslash traversal, Windows device paths, symlinks, destructive commands, command chaining, credential leaks, and Local-Only egress).
- **Observed Behavior**: 7 of 8 vectors were completely neutralized:
  - Relative dot-dot `../../` traversal was rejected with 403 Forbidden.
  - Windows backslash `..\..\` traversal was blocked.
  - Shell command chaining `echo safe && format D:` was decomposed by AST and rejected.
  - Destructive `rmdir /s /q` was rejected by command allowlist.
  - Sensitive file `.env` was flagged and shielded.
  - Local-Only privacy mode intercepted outgoing cloud requests before leaving the host.
- **Vulnerability Discovered**: Vector 3 (Windows Reserved Device Path `CON`) passed `WorkspaceManager.resolveSafePathForRoot` without being rejected. In Windows Win32 subsystems, writing to `CON` targets the physical console device, presenting a denial-of-service vulnerability.

### Benchmark 7: Resource & Hardware Performance (Score: 95/100 — PASSED)
- **Test Identifier**: `APEX-BM7-RESOURCE-PERFORMANCE`
- **Objective**: Measure real CPU, RAM, and GPU VRAM consumption on the target hardware: NVIDIA RTX 3050 Laptop GPU (4 GB VRAM) and 16 GB RAM.
- **Measured Metrics**:
  - Codebase Indexing Latency: **40 ms** for 50 files (**1,250 files/sec**).
  - Context Search Latency: **1 ms**.
  - Node.js Engine RSS: **159 MB** (under 1.0% of system RAM).
  - Node.js Heap: **57 MB**.
  - GPU VRAM Utilization: Baseline **0–539 MB**, leaving over **3.5 GB VRAM free**.
  - GPU Temperature: **46.8°C**.

---

## 4. The Three Most Critical Capabilities Required Next

Based on empirical evidence gathered across the 7 benchmarks, MaxIDE requires the following 3 architectural enhancements to achieve true autonomous software engineering:

1. **Elimination of Superficial Static Fallbacks in Favor of Real Diagnostic Reasoning**:
   `synthesizeActionsForPrompt` must be replaced or constrained. When an LLM provider is offline, the agent must honestly halt and inform the user rather than generating unrequested generic HTML files and falsely claiming that a complex 9-part full-stack application was built.
2. **AST-Aware File Reading Prior to Code Editing (`Observe -> Diff -> Patch`)**:
   In Benchmarks 2 and 3, the agent failed because it never read `backend/db.js`, `backend/server.js`, or `app.js` before attempting to write code. MaxIDE must enforce a mandatory `read_file` or AST inspection step before any `create_file` or `edit_file` tool call is permitted.
3. **Automated Closed-Loop Test & Repair Engine (`Act -> Test -> Parse Error -> Repair`)**:
   MaxIDE possesses a `VerificationEngine` and `SafeTerminal`, but does not automatically invoke them in an iterative self-correction loop during standard tasks. It must automatically run `npm test` after modifying code, parse error traces, and generate targeted fixes until all tests pass.

---

## 5. Artifact & Log References

- Complete Evaluation Logs: [`apex_eval/logs/`](file:///C:/Users/navee/.gemini/antigravity/scratch/apex_eval/logs/)
- Playwright Desktop Screenshot: [`apex_eval/screenshots/bm4_desktop.png`](file:///C:/Users/navee/.gemini/antigravity/scratch/apex_eval/screenshots/bm4_desktop.png)
- Playwright Mobile Screenshot: [`apex_eval/screenshots/bm4_mobile.png`](file:///C:/Users/navee/.gemini/antigravity/scratch/apex_eval/screenshots/bm4_mobile.png)
- Test Workspaces: [`apex_eval/workspaces/`](file:///C:/Users/navee/.gemini/antigravity/scratch/apex_eval/workspaces/)
