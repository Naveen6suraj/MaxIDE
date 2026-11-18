# MAXIDE APEX — MISSION 9 ARCHITECTURE SPECIFICATION

**Product:** MaxIDE APEX — Autonomous AI Software Engineering Studio  
**Mission:** Mission 9 — Sim-to-Real Intelligence & Autonomous Engineering Reliability  
**Target Hardware:** Windows 11 x64 | AMD Ryzen 5 5600H | 16 GB RAM | NVIDIA RTX 3050 4 GB VRAM | Ollama `qwen2.5-coder:3b` | ₹0 Local-First

---

## 1. Sim-to-Real Vision

Mission 7 established the initial 7-module adaptive intelligence architecture, and Mission 8 audited it across 120 simulated scenarios, uncovering two critical sim-to-real failure modes:
1. **Uncalibrated UCB1 Exploration Overriding Proven Winners**: An untested arm (`pulls=0`) received a massive $+1.14$ uncertainty bonus under $\beta=0.75$, causing the agent to choose uncompilable WPF XAML over a proven zero-SDK C# WinForms strategy in live execution.
2. **Missing Closed-Loop Verification on Debugging Tasks**: `executionKeywords` omitted `'debug'`, `'fix'`, and `'repair'`, allowing the agent to claim victory on failing tests without entering the self-repair loop.

Mission 9 converts these findings into **production-grade engineering reliability** by enforcing two-stage feasibility filtering, bounded exploration, structured intent classification, stable episode deduplication, temporal recency decay, and automated test/compiler self-repair loops.

---

## 2. Mission 9 Core Subsystems

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MaxIDE APEX Mission 9 Pipeline                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ User Prompt                                                                 │
│     │                                                                       │
│     ▼                                                                       │
│ [IntentClassifier] ────────────────► Target Platform + Workflow Route       │
│     │                               (CHAT, EXPLAIN, BUILD, NATIVE_APP,      │
│     ▼                                DEBUG, TEST, REFACTOR, GIT, BROWSER)   │
│ [ToolchainDetector] ───────────────► Host Capabilities Probe                │
│     │                               (csc.exe, dotnet, node, npm, python)   │
│     ▼                                                                       │
│ [ReasoningDecisionEngine]                                                   │
│     ├── STAGE 1: Capability Filter ─► Discards Infeasible Strategies        │
│     │                               (blocks WPF if dotnet missing;          │
│     │                                refuses HTML substitution on native)   │
│     └── STAGE 2: Adaptive Ranking                                           │
│             ▲                                                               │
│             ├── [ExperienceMemory] ─► Deduplicated + Recency-Decayed P@3    │
│             └── [ContextualBandit] ─► Bounded UCB1 / Thompson Sampling     │
│                     │                                                       │
│                     ▼                                                       │
│             [Selected Strategy]                                             │
│                     │                                                       │
│                     ▼                                                       │
│ [AgentEngine Tool Loop] ───────────► SafeTerminal / Filesystem / DevServer  │
│     │                                                                       │
│     ▼                                                                       │
│ [Closed-Loop Test & Compiler Gate] ─► Auto-discovers tests & csc.exe        │
│     │                                (feeds real compiler/test errors back  │
│     │                                 for up to 2 self-repair attempts)     │
│     ▼                                                                       │
│ [SelfEvaluationEngine] ─────────────► Trusted Evidence Status & Reward      │
│     │                                                                       │
│     ▼                                                                       │
│ [SelfImprovementReviewer] ──────────► Post-Task Review & SQLite Persistence │
│     │                                (3-way separation: SIMULATED vs        │
│     ▼                                 CONTROLLED_LIVE vs USER_EXECUTION)    │
│ [APEX Intelligence Center] ────────► 12 Live Metric & Telemetry Panes       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Preserved Invariants & Safety Locks
- **Reward Math Unmodified**: `DEFAULT_REWARD_WEIGHTS` (`v1.0.0`) preserved identically. False completions and security violations remain capped at $-1.0$.
- **Immutable Safety Locks**: Core prompt instructions, security boundaries, and trusted reward calculations remain completely locked from automatic modification.
- **Data Integrity**: All 8 credential classes scrubbed recursively before SQLite write or JSON export.
- **Evidence Source Separation**: `SIMULATED_BENCHMARK`, `CONTROLLED_LIVE_EXPERIMENT`, and `USER_ENGINEERING_EXECUTION` are tracked with distinct badges and never mixed in reports.
