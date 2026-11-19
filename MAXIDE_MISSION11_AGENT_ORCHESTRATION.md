# MAXIDE APEX — MISSION 11 AGENT ORCHESTRATION
## Autonomous Multi-Agent Coordination, Contracts, and Specialist Responsibilities

**Product**: MaxIDE APEX — Autonomous Software Engineering Studio  
**Repository**: [https://github.com/Naveen6suraj/MaxIDE](https://github.com/Naveen6suraj/MaxIDE)  
**Workspace**: `C:\Users\navee\.gemini\antigravity\scratch\MaxIDE`  
**Milestone**: Mission 11 — Autonomous Product Development & Engineering Orchestration  

---

## 1. Multi-Agent Roster & Contracts

MaxIDE APEX orchestrates eight specialized agents. Each agent possesses an explicit contract, well-defined inputs, outputs, allowed file modifications, and verification gates.

| Agent | Role Identifier | Inputs | Allowed Files | Primary Deliverables | Verification Gate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Product Architect** | `PRODUCT_ARCHITECT` | User natural language prompt, workspace status | `.maxide/PRODUCT_SPEC.md`, `architecture.json` | Technical specification, user journeys, data models, acceptance criteria | Spec markdown valid, required sections populated |
| **Project Manager** | `PROJECT_MANAGER` | Product specification, target platform | `.maxide/ROADMAP.md`, `.maxide/task_board.json` | Milestones, dependency tasks, specialist assignments | Graph acyclic, task prerequisites resolved |
| **UI/UX Designer** | `UI_UX_DESIGNER` | Domain category, product name, design tokens | `styles.css`, `tokens.css` | Color palette, typography scale, elevation shadows, responsive grid | CSS variables defined, syntax error-free |
| **Frontend Engineer** | `FRONTEND_ENGINEER` | Design tokens, specification user journeys | `index.html`, `app.js` | Semantic HTML5, reactive state, catalog grid, search/filter, cart | Syntax valid (`Function()`), DOM elements match spec |
| **Backend Engineer** | `BACKEND_ENGINEER` | Data schemas, API contract | `server.js`, `db.json` | HTTP REST endpoints (`/api/items`, `/api/health`), CRUD logic | Port non-conflicting (3899), endpoints verified |
| **Native Windows** | `NATIVE_WINDOWS_ENGINEER` | WinForms spec, native controls | `App.cs`, `App.exe` | C# 5 WinForms application, DataGridView, search filter, PE binary | `csc.exe` exit code 0, `App.exe` > 5000 bytes |
| **QA & Debugging** | `QA_ENGINEER` | Deliverable files, automated tests | `.maxide/qa_report.json` | Syntax tests, compiler tests, Playwright checks, defect tickets | Zero open critical/high defects, scorecard evaluated |
| **Release Engineer** | `RELEASE_ENGINEER` | QA report, deliverables on disk | `RELEASE_NOTES.md`, `.maxide/release_manifest.json` | Final documentation, manifest, release readiness status | All required deliverables exist, manifest valid |

---

## 2. File Ownership & Lock Management

To prevent agents from clobbering one another's work (e.g. Frontend Agent overwriting custom design tokens created by UI/UX Designer, or Backend Agent altering frontend script paths), `SharedEngineeringContext` enforces explicit file locking:

```ts
// 1. Specialist acquires exclusive lock before modifying files
const lockAcquired = context.acquireLock('styles.css', 'UI_UX_DESIGNER', 'Design Tokens Generation');

// 2. Any other specialist attempting to modify 'styles.css' is blocked
const check = context.assertCanModify('styles.css', 'FRONTEND_ENGINEER');
// check.allowed === false
// check.reason === 'File "styles.css" is locked by UI_UX_DESIGNER...'

// 3. Lock is released upon task completion
context.releaseLock('styles.css', 'UI_UX_DESIGNER');
```

---

## 3. Reversible Checkpoint Rollback Protocol

When an agent executes an engineering task:
1. `OrchestrationCoordinator` creates a snapshot checkpoint (`context.createCheckpoint('pre-<taskId>')`).
2. The specialist agent acquires required locks, modifies or creates workspace files, and executes verification tests.
3. If verification succeeds, the task is marked `COMPLETED` and locks are released.
4. If verification fails and retries are exhausted (`task.retryCount >= task.maxRetries`), the orchestrator initiates an automated rollback:
   ```ts
   context.rollbackToCheckpoint(checkpointId);
   ```
5. Corrupted intermediate edits are restored to the baseline state before handoff to the next recovery strategy.

---

## 4. Defect Diagnostic & Surgical Repair Loop

QA agents operate independently and never simply trust developer agent claims. When syntax errors, missing DOM elements, or compiler errors occur:
1. The QA Agent logs a structured `EngineeringDefect`:
   - `category`: `SYNTAX` | `COMPILATION` | `DOM_SELECTOR` | `VISUAL` | `MISSING_FEATURE`
   - `severity`: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`
   - `affectedFiles`: List of target files
   - `assignedTo`: Specialist role responsible for repair
2. The assigned specialist executes a targeted surgical edit.
3. The QA Agent re-evaluates the repair. Once confirmed, `context.resolveDefect(defectId, resolution)` marks the defect resolved.
