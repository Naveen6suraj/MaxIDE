# MAXIDE APEX — REASONING & DECISION ENGINE

**Module:** `src/intelligence/ReasoningDecisionEngine.ts`

---

## 1. 12-Step Objective-Driven Planning Pipeline

For every engineering request, `ReasoningDecisionEngine.plan()` executes:
1. Understand requested outcome and parse concrete clauses.
2. Extract functional requirements.
3. Extract quality expectations (polish, security, resource efficiency, identity preservation).
4. Identify platform constraints (Windows 11 x64, 16 GB RAM, RTX 3050 4 GB VRAM, ₹0 budget, native vs web constraints).
5. Inspect the actual workspace on disk (file count, detected stack, `package.json`, `.html`, `.cs`/`.csproj`, `.py`, existing tests).
6. Identify missing information—applying sensible defaults unless a missing detail is genuinely critical or destructive (zero unnecessary clarification loops).
7. Generate multiple genuinely distinct candidate strategies for the task category & platform.
8. Score every candidate across **9 explicit engineering criteria**:
   - `requirementCoverage` (22%)
   - `technicalFeasibility` (16%)
   - `maintainability` (11%)
   - `security` (11%)
   - `verificationFeasibility` (10%)
   - `performance` (9%)
   - `hardwareCompatibility` (8%)
   - `cost` (7%)
   - `complexity` (6%)
9. Retrieve similar verified experiences from SQLite `ExperienceMemory` and blend heuristic priors into `ContextualBandit.selectStrategy()`.
10. Emit a transparent `decisionRationale` comparing the chosen strategy against runner-up alternatives.
11. Emit ordered `executionStages` and inject compact `promptGuidance` into `AgentEngine`.
12. Hand off execution to `AgentEngine` for tool execution and post-run trusted verification.

---

## 2. Native Windows Desktop Engineering Intelligence

MaxIDE APEX strictly differentiates target platforms:
- `NATIVE_WINDOWS`, `WEB_APP`, `FULLSTACK_WEB`, `BACKEND_SERVICE`, `MOBILE_APP`, `CROSS_PLATFORM`, `CLI_UTILITY`.
- When a user requests a **native Windows desktop application** (e.g., *"Build a native Windows desktop inventory management app (.exe)"*), the engine:
  - Classifies `targetPlatform = NATIVE_WINDOWS` and `taskCategory = NATIVE_DESKTOP_BUILD`.
  - Evaluates 4 native desktop architectures (`native-winforms-csc`, `native-wpf-dotnet`, `native-tauri-rust`, `native-electron-node`).
  - Selects `native-winforms-csc` by default on Windows 11 zero-SDK systems (or switches via bandit evidence).
  - Injects an explicit **CRITICAL PLATFORM CONSTRAINT** prohibiting browser-only HTML substitution.

---

## 3. Self-Directed Application Improvement

When given open-ended quality directives (e.g., *"Improve this application until it meets quality standards"*):
- Classifies `taskCategory = SELF_DIRECTED_IMPROVEMENT`.
- Selects `self-directed-quality-loop` with 7 ordered stages:
  1. Inspect existing workspace files & architecture (never overwrite blindly)
  2. Launch or build current application and capture live runtime baseline
  3. Audit visual hierarchy, responsiveness, error handling, edge cases, and security
  4. Prioritize findings (Critical -> Functional -> Visual Polish)
  5. Apply surgical improvements while preserving existing application identity
  6. Run automated build/test/browser regression suite
  7. Re-inspect updated build and report verified improvements
