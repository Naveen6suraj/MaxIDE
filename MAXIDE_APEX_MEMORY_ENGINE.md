# MAXIDE APEX — EXPERIENCE MEMORY ENGINE

**Module:** `src/intelligence/ExperienceMemory.ts`  
**Storage Engine:** Local SQLite 3 via MIT-licensed `sql.js` (WASM) — zero external DB daemon, zero native C++ `node-gyp` fragility on Windows 11, atomic temp-file-and-rename persistence (`flush()`).  
**Default Database Path:** `%APPDATA%\MaxIDE\apex_intelligence.sqlite`

---

## 1. Three Memory Categories

### A. Episodic Memory (`episodic_memory`)
Stores concrete task executions and verified outcomes:
- `project_id`, `task_category`, `platform`, `prompt`, `strategy_id`, `model_id`
- `status` (`COMPLETED` | `PARTIALLY_COMPLETED` | `FAILED` | `BLOCKED` | `CANCELLED`)
- `verified` (boolean integer: `1` only when supported by trusted runtime evidence)
- `reward` (`[-1.0, +1.0]`), `duration_ms`, `files_changed_json`, `tool_failures_json`, `test_passed`
- `user_feedback_rating` (`-1`, `0`, `+1`), `summary`, `version`, `created_at`

### B. Semantic Memory (`semantic_memory`)
Stores durable project-specific engineering knowledge keyed uniquely by `(project_id, category, key)`:
- Categories: `architecture`, `framework`, `dependency`, `decision`, `convention`, `knowledge`
- Automatically populated during workspace inspection (e.g., detected stack) and editable/deletable by the user with automatic version incrementing.

### C. Procedural Memory (`procedural_memory`)
Stores verified engineering procedures and strategy outcomes keyed by `(project_id, task_category, strategy_id)`:
- `procedure_name`, `steps_json`, `model_id`, `success_count`, `failure_count`, `avg_reward`, `version`, `updated_at`.

### Supporting Tables
- `user_feedback`: explicit user ratings and comments tied to `episode_id`.
- `bandit_arms`: contextual bandit statistics keyed by `(context_key, strategy_id)`.
- `policy_versions`: immutable JSON snapshots of arm states, bandit algorithm, exploration constant, and reward weights.
- `evaluations`: full multi-dimension trusted evaluation records & reward breakdowns.
- `tool_telemetry`: per-tool call counts, success/failure counts, and rolling average latency in milliseconds.
- `governance_settings`: persisted user preferences (`learning_enabled`, `cross_project_transfer`, `bandit_algorithm`).

---

## 2. Similarity Retrieval & Project Isolation

- **Zero-GPU Local Retrieval (`retrieveSimilarEpisodes`)**: Computes stopword-filtered bag-of-words cosine similarity across episode prompts, task categories, platforms, strategy IDs, and summaries with a `+0.15` bonus for exact `taskCategory` match. Runs in `<2 ms` on CPU.
- **Strict Project Isolation**: Passing `{ projectId }` restricts queries exclusively to that workspace's deterministic project ID (`ReasoningDecisionEngine.deriveProjectId(workspacePath)`), guaranteeing zero cross-project memory leakage when isolation is active.

---

## 3. User Control, Backup & Privacy

- **Edit & Delete**: Users can edit semantic facts (`PUT /api/intelligence-center/memory/semantic/:id`), delete any episodic/semantic/procedural entry (`DELETE /api/intelligence-center/memory/:table/:id`), or clear workspace/global memory (`POST /api/intelligence-center/memory/clear`).
- **Sanitized Export**: `GET /api/intelligence-center/memory/export` exports a complete versioned JSON backup passed through `PolicyGovernance.sanitizeObject()`.
- **Corrupt File Recovery**: If a corrupted `.sqlite` file is encountered on startup, it is quarantined to `*.corrupt.<timestamp>` and a clean database is initialized without crashing.
