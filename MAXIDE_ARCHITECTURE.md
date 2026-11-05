# MAXIDE SYSTEM ARCHITECTURE & DATA FLOW SPECIFICATION

**System**: MaxIDE Autonomous AI Software Engineering Studio  
**Target Architecture**: Windows x64 Desktop Application (.NET C# WinForms Host + Node.js/TypeScript Engine)  
**Revision**: Production Release 1.0  

---

## 1. High-Level Architectural Overview

MaxIDE is structured in three decoupled tiers:
1. **Desktop Host Layer (`desktop/MaxIDE.cs`)**: A native C# Windows application providing the system tray icon, single-instance mutex, automatic Node.js discovery, child process lifecycle management, and window management.
2. **Server & Engine Tier (`src/server/` & `src/agent/`)**: An Express-powered TypeScript runtime hosting the REST API, SSE event streams, AI Gateway, 6-stage autonomous agent execution loop, codebase intelligence indexer, and security sandboxes.
3. **Studio UI Layer (`src/ui/`)**: A responsive single-page IDE workbench providing Monaco-style code editing, split-pane workspace previews, live SSE activity streams, command palettes, and visual checkpoint rollbacks.

```mermaid
flowchart TD
    subgraph Desktop["Native Windows Desktop Host (MaxIDE.exe)"]
        Launcher["C# WinForms Runner / Tray"]
        ProcMgr["Node Process Lifecycle Manager"]
        PortProber["Dynamic Loopback Port Prober"]
    end

    subgraph Server["MaxIDE Core Backend Runtime (Node.js / Express)"]
        APIRouter["API Router & SSE Bus (/api/agent/stream)"]
        PreviewRouter["Preview Manager (/workspace-preview/*)"]
        
        subgraph AgentSub["Autonomous Agent Core"]
            Intent["Intent Classifier"]
            Gate["Clarification Gate"]
            Engine["Agent Engine (6-Stage Loop)"]
            Intel["Codebase Intelligence Indexer"]
            Patch["Patch Manager & AST Diffing"]
            Checkpoint["Checkpoint & Rollback Manager"]
        end

        subgraph SafetySub["Security & Sandboxing"]
            Guard["WorkspaceGuard (Path Sandboxing)"]
            SafeTerm["SafeTerminal (AST Command Validator)"]
            PermMgr["Permission Manager (ACID ACL)"]
            PrivMgr["Privacy Manager (Egress Limiter)"]
        end

        subgraph AIGatewaySub["Universal AI Gateway"]
            Router["Model Router (Auto/Coding/Fast/Reasoning)"]
            Fallback["Fallback Cascade Engine"]
            OllamaProv["Local Ollama Provider (RTX 3050 Optimized)"]
            CloudProv["Cloud Providers (Gemini, OpenAI, Claude, Groq)"]
        end
    end

    subgraph Client["Studio Web UI (Client Workspace)"]
        Editor["File Tree & Code Editor"]
        Chat["Agent Activity Feed & SSE Consumer"]
        PreviewFrame["Isolated Preview Iframe"]
        ConfigModal["Tabbed Settings & Provider Config"]
    end

    Launcher --> ProcMgr
    ProcMgr -->|Spawn & Monitor| APIRouter
    Client -->|REST & SSE| APIRouter
    APIRouter --> Intent
    Intent -->|Complex Task| Gate
    Gate --> Engine
    Engine --> Intel
    Engine --> Patch
    Engine --> Checkpoint
    Engine --> SafeTerm
    Engine --> Guard
    Engine --> Router
    Router --> Fallback
    Fallback --> OllamaProv
    Fallback --> CloudProv
    PreviewRouter -->|Sandboxed Static/Dev Server| PreviewFrame
```

---

## 2. Autonomous Agent Execution Lifecycle

When a prompt is delivered to MaxIDE, it transitions through a deterministic 6-stage engineering loop designed to prevent infinite loops, enforce permission boundaries, and guarantee working builds.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Intent as Intent Classifier
    participant Gate as Clarification Gate
    participant Agent as Agent Engine
    participant Intel as Codebase Intelligence
    participant Check as Checkpoint Manager
    participant Tools as Tool Execution & SafeTerminal
    participant Verify as Verification Engine
    participant UI as Studio UI

    User->>Intent: Submit Prompt ("Add dark mode toggle...")
    Intent->>Intent: Classify (CHAT vs BUILD vs EDIT vs BROWSER)
    alt Intent == CHAT
        Intent->>User: Return conversational response (0 file edits, 0 commands)
    else Intent == BUILD / EDIT
        Intent->>Gate: Evaluate Request Ambiguity
        opt Ambiguous Requirements
            Gate->>User: Request Clarification Questionnaire
            User->>Gate: Answer Questions
        end
        Gate->>Agent: Initiate 6-Stage Autonomous Loop
        Agent->>UI: SSE Event: agent_stage_change (OBSERVE)
        Agent->>Intel: Index Codebase & Extract AST Symbols
        Intel-->>Agent: Relevant Files, Dependencies & Context
        Agent->>UI: SSE Event: agent_stage_change (PLAN)
        Agent->>Agent: Generate Plan & Tool Sequence
        Agent->>Check: Create Reversible Checkpoint
        Check-->>Agent: Checkpoint ID Recorded
        Agent->>UI: SSE Event: agent_stage_change (ACT)
        loop Tool Execution Steps
            Agent->>Tools: Request File Edit / Command
            Tools->>Tools: Validate WorkspaceGuard & SafeTerminal
            Tools-->>Agent: Execution Result
            Agent->>UI: SSE Event: tool_call & tool_result
        end
        Agent->>UI: SSE Event: agent_stage_change (VERIFY)
        Agent->>Verify: Run Playwright Preview & Compiler Check
        alt Verification Failed
            Agent->>UI: SSE Event: agent_stage_change (REPAIR)
            Agent->>Agent: Analyze Console Errors & Auto-Patch
            Agent->>Verify: Re-Verify Clean State
        end
        Agent->>UI: SSE Event: agent_stage_change (COMPLETE)
        Agent->>User: Final Report & Live Preview Ready
    end
```

---

## 3. Universal AI Gateway & Fallback Architecture

MaxIDE decouples the application from specific AI providers. The `AIGateway` dynamically routes requests based on capability categories (`AUTO`, `CODING`, `REASONING`, `FAST`, `BALANCED`) and executes automatic fallback if any provider encounters rate limits, timeouts, or disconnection.

```mermaid
flowchart TD
    Req["Incoming AI Request (Prompt, Schema, Category)"]
    CatSelect{"Category Resolution"}
    Req --> CatSelect

    CatSelect -->|AUTO| Router["Model Router Heuristic"]
    CatSelect -->|CODING| CodePref["Coding Models (DeepSeek-Coder, Qwen2.5, Claude-3.5)"]
    CatSelect -->|REASONING| ReasonPref["Reasoning Models (o1, DeepSeek-R1, Gemini-Thinking)"]
    CatSelect -->|FAST| FastPref["Fast Models (Groq Llama-3-8B, Gemini-Flash)"]

    Router --> CandidateQueue["Sorted Candidate Model Queue"]
    CodePref --> CandidateQueue
    ReasonPref --> CandidateQueue
    FastPref --> CandidateQueue

    CandidateQueue --> Dispatch["Fallback Manager Dispatch"]

    subgraph Cascade["Resilient Cascade Loop"]
        Dispatch --> TryPrimary["Try Primary Model (e.g. Ollama Local)"]
        TryPrimary -->|Success| StreamResponse["Stream Tokens via SSE"]
        TryPrimary -->|Timeout / Offline / 429| TrySecondary["Try Secondary Cloud Model (e.g. Gemini 2.5 Flash)"]
        TrySecondary -->|Success| StreamResponse
        TrySecondary -->|Error| TryTertiary["Try Tertiary Model (e.g. Groq / OpenAI)"]
        TryTertiary -->|Success| StreamResponse
        TryTertiary -->|Exhausted| EmergencyError["Return User-Friendly Diagnostic Error"]
    end
```

---

## 4. Secure Filesystem & SafeTerminal Pipeline

Filesystem actions and shell command executions are subjected to multi-layered security gates prior to execution.

```mermaid
flowchart TD
    subgraph FilesystemSecurity["Filesystem Sandboxing"]
        FSAction["File Read / Write / Delete Request"]
        Resolve["WorkspaceGuard: Resolve Absolute Canonical Path"]
        CheckRoot{"Within Workspace Root?"}
        CheckDevice{"Device / UNC Path (CON, AUX, \\\\?\\)?"}
        CheckSecret{"Matches Secret Pattern (.env, id_rsa)?"}
        AllowFS["Execute Filesystem Operation"]
        RejectFS["Reject with 403 Security Exception"]

        FSAction --> Resolve
        Resolve --> CheckRoot
        CheckRoot -->|No| RejectFS
        CheckRoot -->|Yes| CheckDevice
        CheckDevice -->|Yes| RejectFS
        CheckDevice -->|No| CheckSecret
        CheckSecret -->|Yes| RejectFS
        CheckSecret -->|No| AllowFS
    end

    subgraph TerminalSecurity["Terminal Command Sandboxing"]
        CmdInput["Raw Shell Command String"]
        Decompose["AST Decomposition (Split &&, ;, |, `)"]
        AllowlistCheck{"Each Subcommand in Safe Allowlist?"}
        DenylistCheck{"Contains Destructive Flags (rmdir /s, format, dd)?"}
        PermCheck{"Requires Elevated User Approval?"}
        ExecCmd["Execute in Isolated ChildProcess (Timeout Capped)"]
        RejectCmd["Block & Notify User of Security Violation"]

        CmdInput --> Decompose
        Decompose --> AllowlistCheck
        AllowlistCheck -->|No| RejectCmd
        AllowlistCheck -->|Yes| DenylistCheck
        DenylistCheck -->|Yes| RejectCmd
        DenylistCheck -->|No| PermCheck
        PermCheck -->|Approved or Autonomous| ExecCmd
        PermCheck -->|Needs Approval| AskUser["Prompt Approval Modal in Studio UI"]
    end
```

---

## 5. Preview & Dev Server Reverse Proxy

MaxIDE isolates previewed user applications from the IDE studio interface:
1. **MIME Integrity**: All static assets (.html, .css, .js, .wasm, .svg, .json) are served with correct Content-Type headers.
2. **Reverse Proxy**: Dynamic framework servers (Vite on 5173, Next.js on 3000, Express on 8080) are proxied through `/api/preview/proxy` with automatic header rewriting.
3. **Loopback Protection**: Preview endpoints prevent directory escaping and reject external network rebinding.

---

## 6. Atomic Persistence Storage Layer

All stateful data (providers, project list, permissions, checkpoints, conversation logs) is handled by `AtomicStorage`:
1. **Write Staging**: Data is serialized to a `.tmp.[timestamp]` file in the same directory.
2. **Atomic Rename**: `fs.renameSync` atomically swaps the temporary file over the target file, guaranteeing that a crash mid-write never leaves corrupt zero-byte files.
3. **Concurrent Lock**: In-memory file mutex queues concurrent writes.
