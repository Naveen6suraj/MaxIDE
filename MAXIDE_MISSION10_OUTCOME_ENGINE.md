# MAXIDE APEX — MISSION 10
# OUTCOME ACCEPTANCE & QUALITY SCORECARD ENGINE
## Independent Outcome Evaluation, Anti-False-Positive Governance, and Fail-Honest Status Invariants

**Document ID:** `MAXIDE_MISSION10_OUTCOME_ENGINE.md`  
**Milestone:** Mission 10 — Outcome-Driven Autonomous Software Engineering  
**Implementation File:** `src/intelligence/OutcomeAcceptanceEngine.ts`  
**Repository:** `https://github.com/Naveen6suraj/MaxIDE`  
**Author:** Software Quality Architect & Principal RL Engineer  

---

## 1. Executive Summary & Problem Formulation

In previous releases, MaxIDE's `AgentEngine.ts` contained a naive safety net:
```typescript
// Legacy Naive Safety Net (ELIMINATED IN MISSION 10)
if (!taskActuallySucceeded && isExecutionTask) {
  const idxPath = path.join(rootPath, 'index.html');
  if (fs.existsSync(idxPath) && fs.statSync(idxPath).size > 200) {
    taskActuallySucceeded = true;
  }
}
```
This naive heuristic created a severe false-positive completion loop:
- A model emitting a 250-byte skeleton file (`<h1>Student Attendance Analyzer</h1><div id="app"></div>`) was marked `COMPLETED`.
- When the user opened the preview, they were greeted by an empty screen.
- When `app.js` crashed due to missing element IDs, MaxIDE still reported success.

The **Outcome Acceptance Engine (`OutcomeAcceptanceEngine.ts`)** completely replaces this heuristic with an independent, multi-dimensional quality scorecard.

---

## 2. Six-Dimensional Outcome Scorecard

Every completed engineering task is independently graded across 6 objective dimensions:

| Dimension | Metric Range | Weight | Evaluation Method |
| :--- | :---: | :---: | :--- |
| **Requirement Coverage** | `0.00` – `1.00` | $25\%$ | Fraction of functional requirements from `TaskContract` implemented and verified in DOM/code |
| **Functional Completeness** | `0.00` – `1.00` | $25\%$ | Pass rate of interactive controls (buttons, forms, arithmetic, modal flows) |
| **Visual Completeness** | `0.00` – `1.00` | $20\%$ | Playwright DOM evaluation: element visibility, layout hierarchy, zero broken images |
| **Runtime Stability** | `0.00` – `1.00` | $15\%$ | Browser console hygiene: penalizes fatal unhandled errors ($1.0 - 0.2 \times \text{errors}$) |
| **Build & Syntax Success** | `0.0` or `1.0` | $10\%$ | Node/TypeScript syntax validation or `csc.exe` compilation output |
| **Deliverable Correctness** | `0.0` or `1.0` | $5\%$ | Physical presence and size check ($> 250\text{ bytes}$) of all required deliverables |

$$\text{Composite Quality Score} = 0.25 R + 0.25 F + 0.20 V + 0.15 S + 0.10 B + 0.05 D$$

---

## 3. Strict Task Acceptance Invariants

A task is **NEVER** awarded `COMPLETED` merely because files were modified or code was generated.

To earn `COMPLETED` status, a project must satisfy ALL of the following gates:
1. $\text{Deliverable Correctness} = 1.0$ (All required files exist and are non-stubs $> 250\text{ bytes}$).
2. $\text{Build Success} = 1.0$ (Zero syntax or compilation errors).
3. $\text{Requirement Coverage} \ge 0.85$ ($85\%$ of specification features implemented).
4. $\text{Functional Completeness} \ge 0.75$ ($75\%$ interactive control checks passing).
5. $\text{Visual Completeness} \ge 0.70$ (Clean typography, layout structure, 0 broken images).

### Status Assignment Matrix:
- `COMPLETED`: All completion criteria satisfied; composite score $\ge 0.80$.
- `PARTIALLY_COMPLETED`: Code was generated and build succeeded, but features, visual styling, or controls are incomplete.
- `FAILED`: Minimal stubs generated, runtime crashes detected, or fatal tool execution errors.
- `BLOCKED`: Required native toolchains (e.g. `csc.exe` for C# WinForms) missing from host system.

---

## 4. Bounded Self-Repair Loop Integration

When `OutcomeAcceptanceEngine` evaluates an incomplete build:
1. It generates concrete, actionable `repairDirectives` (e.g., `"Deliverable index.html is too small"`, `"Implement missing feature: Category Filter Tabs"`, `"Fix console runtime error: Cannot read properties of null"`).
2. If the task is running in autonomous mode and bounded repair iterations remain ($< 5$), `AgentEngine` feeds these directives back into the context.
3. The model executes surgical repairs using `edit_file` or `create_file`.
4. The outcome is re-evaluated. If criteria are met, the project is promoted to `COMPLETED`. If repairs fail after 5 bounded attempts, the task honestly concludes as `PARTIALLY_COMPLETED` or `FAILED` with explicit explanation.

---

## 5. Experience Memory & Reinforcement Learning Grounding

In Mission 7 and 8, experience rewards were estimated using naive file existence.
Under Mission 10, the `OutcomeScorecard` values are passed directly into `AdaptiveIntelligenceCoordinator.completeAndLearn()`:
- `requirementCoverageEstimate` $= \text{scorecard.requirementCoverage}$
- `falseCompletionClaimed` $= \text{true}$ if model claims completion on a rejected stub.
- Rewards accurately penalize shallow code generators while reinforcing strategies that produce complete, verifiable software products.
