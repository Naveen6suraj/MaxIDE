# MAXIDE APEX — ADAPTIVE INTELLIGENCE ARCHITECTURE

**Product:** MaxIDE APEX — Autonomous Software Engineering Studio  
**Mission:** Mission 7 — Adaptive Intelligence, Reinforcement Learning & Self-Directed Engineering  
**Target Platform:** Windows 11 x64 | AMD Ryzen 5 5600H | 16 GB RAM | NVIDIA RTX 3050 4 GB VRAM | ₹0 Budget (Local-First)

---

## 1. Architectural Vision

MaxIDE APEX implements a practical, resource-efficient, measurable **Adaptive Intelligence Engine** that improves engineering strategy selection over time using verified runtime evidence, persistent SQLite experience memory, contextual bandit reinforcement learning, and user feedback—without requiring expensive continuous LLM weight training or cloud GPUs.

## 2. Seven Independent, Testable Modules

All adaptive intelligence components reside under `src/intelligence/` and are exported through `src/intelligence/index.ts`:

| Module | File | Responsibility |
| :--- | :--- | :--- |
| **A & D. Reasoning, Decision & Strategy Selection** | `src/intelligence/ReasoningDecisionEngine.ts` | 12-step objective analysis, workspace inspection, 9-criteria multi-strategy comparison, native Windows desktop vs web/backend discernment, self-directed improvement planning, and Experience Memory + Bandit fusion. |
| **B. Persistent Experience Memory** | `src/intelligence/ExperienceMemory.ts` | Local SQLite 3 database (`sql.js` WASM, zero native C++ build requirements) storing Episodic, Semantic, and Procedural memory with cosine-similarity retrieval, project isolation, schema versioning, edit/delete/clear/export, and mandatory secret scrubbing. |
| **C. Reinforcement Learning / Policy Optimization** | `src/intelligence/ContextualBandit.ts` | Context-aware **UCB1** and **Thompson Sampling** (Beta posterior via Marsaglia-Tsang Gamma + deterministic seeded Mulberry32 PRNG), conservative prior regularization, consecutive-failure damping, policy snapshotting, and instant rollback. |
| **E. Self-Evaluation & Trusted Reward System** | `src/intelligence/SelfEvaluationEngine.ts` | Non-LLM-manipulable runtime evidence evaluation, versioned reward weights (`v1.0.0`), strict anti-gaming penalties, never rewards speed alone, honest status classification (`COMPLETED`, `PARTIALLY_COMPLETED`, `FAILED`, `BLOCKED`, `CANCELLED`). |
| **F. Continuous Improvement Engine & Coordinator** | `src/intelligence/ContinuousImprovementEngine.ts` | Safe 8-step learning loop, deterministic reproducible Offline Benchmark Evaluator (Baseline vs Learned), governance-gated policy promotion, and unified `AdaptiveIntelligenceCoordinator` facade. |
| **G. Safety & Policy Governance** | `src/intelligence/PolicyGovernance.ts` | Immutable safety locks on core system instructions, security boundaries, and trusted reward computation; regex & recursive object credential scrubbing; learning toggle; regression-blocking promotion gate. |

---

## 3. Safe 8-Step Learning Loop Integration

```text
User Objective
   │
   ▼
[1. ReasoningDecisionEngine.plan()] ──► Queries ExperienceMemory (similar episodes)
   │                                ──► Queries ContextualBandit (UCB1 / Thompson)
   ▼
[2. AgentEngine.runTask()]          ──► Executes tools + records Tool Telemetry
   │
   ▼
[3. Collect Trusted Evidence]       ──► Files modified, build/test exit codes, preview checks
   │
   ▼
[4. SelfEvaluationEngine.evaluate()]──► Computes honest status & reward ∈ [-1.0, +1.0]
   │
   ▼
[5. ExperienceMemory Persistence]   ──► Secret-scrubbed Episodic + Procedural + Semantic SQLite write
   │
   ▼
[6. ContextualBandit.recordOutcome()]──► Updates context arm pulls, mean reward, Beta(α, β)
   │
   ▼
[7. ContinuousImprovementEngine]    ──► Deterministic Offline Eval (Baseline vs Learned)
   │                                ──► PolicyGovernance.approvePolicyUpdate() gate
   ▼
[8. Versioned Policy Promotion]     ──► Immutable snapshot in policy_versions (1-click Rollback)
```

---

## 4. Runtime & UI Integration

- **Server Bootstrap (`src/server/index.ts`)**: Instantiates `AdaptiveIntelligenceCoordinator` backed by `%APPDATA%\MaxIDE\apex_intelligence.sqlite` and attaches it to `AgentEngine`.
- **Agent Execution (`src/agent/AgentEngine.ts`)**: Runs objective planning before execution, appends concise strategy guidance to the prompt without mutating immutable system rules, records per-tool latency/success telemetry, evaluates final runtime evidence, and returns `episodeId`, `strategyId`, `decisionRationale`, and `evaluation` to the client.
- **REST API (`src/server/routes.ts`)**: 11 dedicated `/api/intelligence-center/*` endpoints powering dashboard metrics, plan simulation, user feedback, offline evaluation, policy rollback, algorithm switching, governance toggles, and memory CRUD/export.
- **UI Studio (`src/ui/js/intelligence-center.js`, `src/ui/index.html`)**: Dedicated **APEX Intelligence Center** featuring all 10 required telemetry & control sections displaying **actual SQLite metrics only** (zero fabricated numbers).
