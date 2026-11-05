# MAXIDE APEX — AUTONOMOUS ENGINEERING CAPABILITY EVALUATION REPORT

**Evaluation Focus**: Real-World Agent Autonomy, Multi-File Code Synthesis, Existing Codebase Understanding, and Debugging  
**Evaluation Target**: MaxIDE AgentEngine, ClarificationGate, ToolRegistry, VerificationEngine  
**Date**: November 2026  

---

## 1. Scope & Autonomy Evaluation Framework

To evaluate whether MaxIDE operates as an autonomous software engineer rather than an automated script runner, four core autonomy challenges were executed:
1. **Benchmark 1**: Full-stack project creation from zero requirements.
2. **Benchmark 2**: Feature expansion across an unfamiliar existing multi-layer codebase.
3. **Benchmark 3**: Autonomous diagnosis and repair of 5 intentional code defects.
4. **Benchmark 4**: Visual generation and responsive layout verification.

Each benchmark evaluated 8 autonomous competencies:
- **Requirement Analysis**: Did the agent correctly parse technical constraints?
- **Task Planning**: Did it formulate a multi-step sequence?
- **Codebase Inspection**: Did it read existing files prior to modification?
- **Tool Selection**: Did it invoke registered tools accurately?
- **Multi-File Patching**: Did it generate clean AST diffs or atomic updates?
- **Build & Verification**: Did it run compilers and tests to verify work?
- **Error Diagnosis & Self-Repair**: Did it parse runtime failures and self-correct?
- **Truth in Reporting**: Did its final answer accurately reflect what was executed?

---

## 2. In-Depth Case Study: Benchmark 1 (Build From Zero)

### 2.1 Prompt & Instructions
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

### 2.2 Execution Trace & Recorded Timeline
1. **Timestamp `17:57:47.393Z`**: Subsystem initialized in `apex_eval/workspaces/bm1_zero`.
2. **Timestamp `17:57:47.417Z`**: `AgentEngine.runTask()` invoked in `AUTONOMOUS` mode (max steps: 30).
3. **Stage 1 (OBSERVE)**: `this.intelligence.indexProject()` scanned the empty workspace (3 system directories found).
4. **Stage 2 (PLAN)**: 6-stage milestone plan initialized.
5. **Gateway Dispatch**: `gateway.generateWithTools()` dispatched to active model `qwen2.5-coder:7b`.
6. **Provider Exception**: `[AIGateway Tools] Provider "Ollama Local Engine" tool call error: Ollama connection error: fetch failed.` (Local daemon offline on loopback port 11434).
7. **Stage Fallback**: `AgentEngine.ts` line 508 caught the provider error. Detected keyword `'node'` in prompt.
8. **Static Template Ingestion**: Invoked `this.synthesizeActionsForPrompt(taskPrompt)`.
9. **Tool Execution**:
   - `create_file`: Wrote `app.js` (7 lines of `function hello() { return 'Hello MaxIDE'; }`).
   - `run_command`: Ran `node app.js`. Output: `'Hello MaxIDE'`.
   - `open_file`: Opened `app.js`.
10. **Timestamp `17:57:47.600Z`**: Agent marked all milestones `completed` and concluded task in **182 ms**.

### 2.3 Evaluation Matrix

| Requirement | Expected Artifact | Actual Result | Status |
| :--- | :--- | :--- | :---: |
| React Frontend | JSX/TSX components, state hooks | 0 files created | **FAILED** |
| Node.js Backend | Express/Fastify REST routes | 0 server files created | **FAILED** |
| SQLite Database | `.sqlite` file, schema migrations | 0 tables created | **FAILED** |
| User Authentication | Password hashing, JWT / session | 0 auth logic | **FAILED** |
| CRUD Operations | Create, Read, Update, Delete tasks | 0 CRUD endpoints | **FAILED** |
| Input Validation | Schema validator (Zod, Joi) | 0 validation logic | **FAILED** |
| Unit / Integration Tests | Jest, Vitest, or Mocha test files | 0 test files | **FAILED** |
| Truthful Reporting | Honest disclosure of blockers | Falsely claimed "Created application" | **FAILED** |

---

## 3. In-Depth Case Study: Benchmark 2 (Existing Codebase Engineering)

### 3.1 Unfamiliar Codebase Structure
Prior to running the benchmark, an unfamiliar e-commerce inventory application was seeded:
- `backend/db.js`: In-memory array of products and query functions.
- `backend/server.js`: Express server with `/api/products` GET and POST routes.
- `frontend/index.html`: Product list layout.
- `frontend/app.js`: DOM rendering logic.
- `tests/inventory.test.js`: Test suite asserting inventory count.

### 3.2 User Prompt
```text
Add a "discount_percentage" feature across the existing application:
1. In backend/db.js: add discount_percentage field to products, and a calculateFinalPrice helper.
2. In backend/server.js: return final_price in /api/products response.
3. In frontend/index.html & frontend/app.js: display the discount percentage badge.
4. In tests/inventory.test.js: add a test asserting discount calculation.
Preserve all existing functionality and do not touch unrelated files.
```

### 3.3 Observed Execution Failure
- **No File Inspection**: The agent never issued `read_file` or `list_files` calls on `backend/` or `frontend/`.
- **Unrelated File Generation**: It created a brand new root `index.html` (6,014 bytes) containing a generic portfolio template with cards for "Cloud Architecture" and "Real-Time Systems".
- **Target Files Untouched**: `backend/db.js`, `backend/server.js`, `frontend/app.js`, and `tests/inventory.test.js` were left 100% byte-for-byte identical to their seeded versions.
- **Reporting Discrepancy**: The agent concluded in 409ms with `success: true`.

---

## 4. In-Depth Case Study: Benchmark 3 (Autonomous Debugging)

### 4.1 Seeded Defects
1. `server.js`: `res.jso({ users })` (typo on Express response method).
2. `db.js`: `SELCT * FROM users` (SQL syntax error).
3. `app.js`: `document.getElementById('non-existent-button').addEventListener(...)` (null reference).
4. `config.js`: `PORT: parseInt('NOT_A_VALID_NUMBER', 10)` (evaluates to NaN).
5. `tests/suite.test.js`: `assert.strictEqual(add(2, 2), 5)` (failing assertion).

### 4.2 Observed Execution Failure
- The agent was explicitly instructed to "Execute the tests with run_command to verify all 5 fixes."
- The agent never executed `node tests/suite.test.js` or `npm test`.
- None of the 4 source code files were edited.
- The agent concluded in 428ms claiming task completion.

---

## 5. In-Depth Case Study: Benchmark 4 (Visual Engineering)

### 5.1 Dashboard Synthesis & Playwright Inspection
Unlike Benchmarks 1–3, the agent succeeded in generating a responsive HTML5 dashboard with CSS grid styling:
- Generated `index.html` with modern card layouts.
- Playwright Chromium was automated in headless mode across two viewports:
  - Desktop Viewport: `1280x800` -> Captured `bm4_desktop.png` (28.1 KB).
  - Mobile Viewport: `375x667` (iPhone SE) -> Captured `bm4_mobile.png` (27.9 KB).
- **DOM Inspection Results**:
  - Horizontal Overflow: `false` on both desktop and mobile.
  - JavaScript Console Errors: `0` errors logged.
  - Responsive Media Queries: Fluid grid wrapping confirmed.

### 5.2 Autonomy Limitation
While the generated visual artifact was functional and responsive, MaxIDE did not inspect its own output. In an Antigravity-grade autonomous system, the agent calls `browser_navigate`, `browser_screenshot`, and `browser_inspect_dom` iteratively, adjusting margins and typography based on visual feedback. In MaxIDE, this loop is supported by tools but not autonomously driven by the core agent loop.

---

## 6. Autonomy Evaluation Summary & Verdict

MaxIDE's autonomy architecture contains the necessary primitives (`AgentEngine`, `ToolRegistry`, `Playwright`, `SafeTerminal`), but suffers from an **autonomy illusion** caused by fallback templates:
- When connected to a powerful external LLM with high context capacity, MaxIDE can execute tool chains.
- When isolated from the LLM or when providers error, it falls back to canned mock scripts that falsely report task completion.
- To reach production autonomy, MaxIDE must enforce mandatory pre-execution file reading and fail closed with diagnostic messages when reasoning engines are unavailable.
