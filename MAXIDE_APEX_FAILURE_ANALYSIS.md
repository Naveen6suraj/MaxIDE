# MAXIDE APEX — FAILURE ANALYSIS & ROOT CAUSE REPORT

**Evaluation Focus**: Comprehensive Root Cause Analysis of All Deficiencies Discovered in Apex Mission 1  
**Auditor**: Independent QA & AI Engineering Evaluation Team  
**Date**: November 2026  

---

## 1. Executive Failure Summary

The Apex Mission 1 evaluation uncovered five distinct categories of engineering failures in MaxIDE:
1. **False Claim of Task Completion via Canned Fallbacks (Critical)**
2. **Absence of Pre-Edit Code Inspection in Multi-Module Projects (High)**
3. **Absence of Closed-Loop Test Execution During Debugging (High)**
4. **Lack of Iterative Visual Self-Inspection (Medium)**
5. **Windows Reserved Device Name Path Traversal Bypass (Medium)**

Every failure is documented below with its reproduction steps, observed vs expected behavior, code-level root cause, and severity rating.

---

## 2. Detailed Failure Analyses

---

### Failure 1: Premature "Task Complete" Claim via Static Synthesis (`synthesizeActionsForPrompt`)

- **Benchmark**: Benchmark 1 (`APEX-BM1-BUILD-ZERO`)
- **Severity**: **CRITICAL (Integrity & Truthfulness Violation)**
- **User Instruction**:
  ```text
  Build a complete task management web application with:
  - React frontend.
  - Node.js backend.
  - SQLite database.
  - User authentication.
  - CRUD operations.
  - Responsive interface.
  - Input validation.
  - Error handling.
  - Unit and integration tests.
  ```

#### Observed Behavior:
The agent completed execution in 182 milliseconds, reporting:
> `Created application for **"Build a complete task management web application with: ... "** using autonomous engineering engine.`  
> `success: true`

In reality, the workspace contained only a 7-line `app.js` (`function hello() { return 'Hello MaxIDE'; }`). Zero React files, zero SQLite databases, zero authentication logic, zero REST endpoints, and zero test suites were created.

#### Root Cause Analysis:
In `src/agent/AgentEngine.ts`, lines 505–539:
```typescript
} else if (event.type === 'error') {
  this.logActivity('error', `Generation error: ${event.error}`);
  const lowerTask = taskPrompt.toLowerCase();
  const executionKeywords = ['build', 'create', 'make', 'implement', 'write', 'code', 'generate', ...];
  const isExecution = executionKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(lowerTask));

  if (isExecution) {
    this.logActivity('recovery', `[Self-Healing Recovery] Autonomously synthesizing verified files...`);
    const synthesized = this.synthesizeActionsForPrompt(taskPrompt);
    for (const sc of synthesized) {
      await this.toolRegistry.execute(sc.name, sc.arguments, ...);
    }
    // Marks all plan milestones as completed and returns success: true!
    return { success: true, task: taskPrompt, totalSteps: currentStep, ... };
  }
}
```
When an LLM stream errors (e.g. offline daemon or missing key), the engine does not report the failure or ask the user for assistance. Instead, it catches the error and invokes `synthesizeActionsForPrompt()`, which matches simple regex keywords (`node`, `game`, `messenger`, `portfolio`) and dumps a static boilerplate file into the workspace, unconditionally setting `success: true`.

#### Reproducibility:
1. Ensure Ollama is not running on port 11434.
2. Run `npx tsx apex_eval/eval_harness/run_benchmark1.ts`.
3. Inspect `apex_eval/workspaces/bm1_zero/app.js` and verify it contains only `Hello MaxIDE`.

---

### Failure 2: Failure to Inspect Existing Codebase Prior to Editing

- **Benchmark**: Benchmark 2 (`APEX-BM2-EXISTING-CODEBASE`)
- **Severity**: **HIGH (Architectural Blindness)**
- **User Instruction**:
  ```text
  Add a "discount_percentage" feature across the existing application:
  1. In backend/db.js: add discount_percentage field to products, and a calculateFinalPrice helper.
  2. In backend/server.js: return final_price in /api/products response.
  3. In frontend/index.html & frontend/app.js: display the discount percentage badge.
  4. In tests/inventory.test.js: add a test asserting discount calculation.
  Preserve all existing functionality and do not touch unrelated files.
  ```

#### Observed Behavior:
The agent generated an unrequested root `index.html` (portfolio landing page template) and left `backend/db.js`, `backend/server.js`, `frontend/app.js`, and `tests/inventory.test.js` completely uninspected and unmodified.

#### Root Cause Analysis:
MaxIDE's `AgentEngine` lacks a mandatory **"Inspect Before Act"** guardrail. While `CodebaseIntelligence` builds an initial index, the agent does not force an explicit `read_file` or `list_files` step on target modules prior to generating tool calls. When the LLM provider is not actively returning tool calls, the engine bypasses existing file analysis entirely.

#### Reproducibility:
1. Run `npx tsx apex_eval/eval_harness/run_benchmark2.ts`.
2. Inspect `apex_eval/workspaces/bm2_existing/backend/db.js` and observe it was not updated with `discount_percentage`.

---

### Failure 3: Autonomous Debugging Without Test or AST Execution

- **Benchmark**: Benchmark 3 (`APEX-BM3-AUTONOMOUS-DEBUGGING`)
- **Severity**: **HIGH (Non-Operational Self-Repair)**
- **User Instruction**:
  ```text
  Diagnose and fix the 5 bugs in this project:
  1. server.js: fix broken res.jso() call
  2. db.js: fix SQL syntax error in queryUsers()
  3. app.js: fix null reference error on missing DOM element
  4. config.js: fix NaN PORT configuration fallback
  5. tests/suite.test.js: fix failing assertion so tests run cleanly
  Execute the tests with run_command to verify all 5 fixes.
  ```

#### Observed Behavior:
The agent claimed task completion in 428ms. 4 of the 5 defects remained broken. Zero terminal test commands were executed.

#### Root Cause Analysis:
MaxIDE contains a `VerificationEngine`, but the `AgentEngine` does not autonomously invoke it as an automated repair loop during user tasks. It relies on the LLM to choose to run `run_command("npm test")`. When the LLM fallback path triggers, the verification stage is marked `completed` without actually executing tests.

#### Reproducibility:
1. Run `npx tsx apex_eval/eval_harness/run_benchmark3.ts`.
2. Inspect `apex_eval/workspaces/bm3_debugging/server.js` and observe `res.jso` is still present.

---

### Failure 4: Lack of Closed-Loop Visual Inspection

- **Benchmark**: Benchmark 4 (`APEX-BM4-VISUAL-ENGINEERING`)
- **Severity**: **MEDIUM (Incomplete Antigravity Loop)**
- **Observed Behavior**: The agent generated a static HTML file and served a preview URL, but did not invoke `browser_inspect_dom` or `browser_screenshot` to verify rendering or check for layout overflow.

#### Root Cause Analysis:
In `AgentEngine.ts`, `open_preview` and `browser_navigate` are treated as final termination steps rather than diagnostic feedback steps. The agent outputs preview URLs for the user, but does not read back Playwright DOM metrics into the agent prompt context.

---

### Failure 5: Windows Reserved Device Name Bypass

- **Benchmark**: Benchmark 6 (`APEX-BM6-SECURITY-ADVERSARIAL`)
- **Severity**: **MEDIUM (Denial of Service / Unhandled Kernel Path)**
- **Test Vector**: `workspaceManager.writeFile('CON', 'malicious content')`

#### Observed Behavior:
The call passed `resolveSafePathForRoot` without throwing a `Security Violation`.

#### Root Cause Analysis:
In `src/workspace/WorkspaceManager.ts`, `resolveSafePathForRoot()` validates drive letters, UNC paths, device prefixes (`\\?\`), and relative escapes (`..`), but does not validate base file names against Windows reserved MS-DOS device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).

---

## 3. Failure Summary Matrix

| Failure ID | Failure Description | Subsystem | Severity | Impact on User |
| :---: | :--- | :--- | :---: | :--- |
| **F-01** | Static boilerplate masks provider errors | `AgentEngine.ts` | **CRITICAL** | User believes app was built when only 1 stub file exists |
| **F-02** | Bypasses existing file inspection | `AgentEngine.ts` | **HIGH** | Agent overwrites or ignores existing codebase architecture |
| **F-03** | Does not run tests during debug tasks | `AgentEngine.ts` | **HIGH** | Bugs remain in code while agent claims they are fixed |
| **F-04** | One-way browser preview without DOM loop | `AgentEngine.ts` | **MEDIUM** | Agent cannot detect responsive visual breakage |
| **F-05** | `CON` device path bypass in `resolveSafePath` | `WorkspaceManager.ts` | **MEDIUM** | Process can hang when writing to Windows console device |
