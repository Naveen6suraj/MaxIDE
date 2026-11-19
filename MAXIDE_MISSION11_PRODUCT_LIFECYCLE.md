# MAXIDE APEX — MISSION 11 PRODUCT LIFECYCLE
## The End-to-End Autonomous Engineering Lifecycle: From User Idea to Production Release

**Product**: MaxIDE APEX — Autonomous Software Engineering Studio  
**Repository**: [https://github.com/Naveen6suraj/MaxIDE](https://github.com/Naveen6suraj/MaxIDE)  
**Workspace**: `C:\Users\navee\.gemini\antigravity\scratch\MaxIDE`  
**Milestone**: Mission 11 — Autonomous Product Development & Engineering Orchestration  

---

## 1. Lifecycle Overview

The autonomous product lifecycle in MaxIDE APEX spans seven deterministic, verifiable phases:

```
[Phase 1] Ideation & Architectural Specification
    ↓
[Phase 2] Engineering Roadmap & Dependency Decomposition
    ↓
[Phase 3] Design Token Synthesis & Visual Systems
    ↓
[Phase 4] Core Implementation (Frontend / Backend / Native)
    ↓
[Phase 5] Independent QA & Defect Discovery
    ↓
[Phase 6] Surgical Defect Repair & Regression Verification
    ↓
[Phase 7] Packaging, Startup Verification & Release Documentation
```

---

## 2. Phase-by-Phase Walkthrough

### Phase 1: Ideation & Architectural Specification
- **Agent**: `ProductArchitectAgent`
- **Actions**:
  1. Classifies intent and determines target platform (`WEB_APP`, `FULLSTACK`, `NATIVE_WINDOWS`).
  2. Synthesizes `ProductSpec` via `ProductSpecEngine` with domain models, user journeys, and acceptance tests.
  3. Records architecture decisions (`architecture.json`).
  4. Saves specification to `.maxide/PRODUCT_SPEC.md`.

### Phase 2: Engineering Roadmap & Dependency Decomposition
- **Agent**: `ProjectManagerAgent`
- **Actions**:
  1. Decomposes spec into 5 milestones (`M1_SPEC`, `M2_DESIGN`, `M3_CORE_ENG`, `M4_QA`, `M5_RELEASE`).
  2. Generates task dependency graph (`tasks` with explicit `dependencies: ['task-arch-spec', ...]`).
  3. Establishes file ownership permissions.
  4. Persists `.maxide/ROADMAP.md` and `.maxide/task_board.json`.

### Phase 3: Design Token Synthesis & Visual Systems
- **Agent**: `UIDesignAgent`
- **Actions**:
  1. Acquires lock on `styles.css`.
  2. Invokes `ProfessionalDesignEngine` to derive visual direction (`MINIMALIST`, `MODERN_SAAS`, `ARTISANAL_WARM`, `NATIVE_WINDOWS_FLUENT`).
  3. Writes CSS custom properties for palette, typography scale, shadows, and responsive grid rules.
  4. Releases lock on `styles.css`.

### Phase 4: Core Implementation
- **Web App**: `FrontendEngineerAgent` acquires locks on `index.html` and `app.js`, builds semantic structure, attaches event listeners, implements reactive cart/search state.
- **Fullstack**: `BackendEngineerAgent` acquires locks on `server.js` and `db.json`, constructs REST endpoints (`GET /api/items`, `POST /api/items`), sets up CORS, and assigns port `3899`. `FrontendEngineerAgent` connects client fetch calls to the backend API.
- **Native Windows**: `NativeWindowsEngineerAgent` acquires locks on `App.cs` and `App.exe`, creates WinForms layout with DataGridView and search filter, verifies host compiler `csc.exe`, compiles `App.exe`, and verifies PE size > 5000 bytes.

### Phase 5: Independent QA & Defect Discovery
- **Agent**: `QADebuggingAgent`
- **Actions**:
  1. Verifies physical existence and size of required deliverables.
  2. Executes syntax parsing (`new Function(...)` or AST check).
  3. Runs compiler check (`csc.exe` or `tsc`).
  4. Evaluates outcome quality via `OutcomeAcceptanceEngine`.
  5. If failures are detected, logs structured `EngineeringDefect` records into the shared context.

### Phase 6: Surgical Defect Repair & Regression Verification
- **Agent**: Assigned Specialist (`FRONTEND_ENGINEER`, `BACKEND_ENGINEER`, or `NATIVE_WINDOWS_ENGINEER`)
- **Actions**:
  1. Reads defect diagnostic.
  2. Performs targeted surgical edit to fix root cause without rewriting the application architecture.
  3. Re-runs QA verification until zero critical/high defects remain.
  4. Marks defect `RESOLVED`.

### Phase 7: Packaging, Startup Verification & Release Documentation
- **Agent**: `ReleaseEngineerAgent`
- **Actions**:
  1. Confirms all deliverables exist on disk.
  2. Confirms zero open blocking defects.
  3. Generates comprehensive `RELEASE_NOTES.md`.
  4. Outputs release metadata to `.maxide/release_manifest.json`.
  5. Marks project milestone `COMPLETED` and awards `PRODUCTION_READY` tier.
