# MAXIDE SECURITY AUDIT & HARDENING REPORT

**Application**: MaxIDE — Autonomous Software Development IDE  
**Environment**: Windows 11 x64  
**Classification**: High-Autonomy Desktop Development System  
**Audit Status**: VERIFIED & HARDENED  
**Date**: November 2026  

---

## 1. Threat Model & Security Perimeter

MaxIDE is designed to run autonomous code generation, execute terminal commands, and serve live application previews. This operational profile introduces specific security risks:
1. **Arbitrary Code Execution**: An AI agent executing malicious or unintended terminal commands.
2. **Path Traversal & Filesystem Escape**: Escaping the designated workspace directory to read, modify, or delete sensitive system or user files (`C:\Windows`, `%USERPROFILE%\.ssh`).
3. **Secret Exfiltration**: LLM prompts inadvertently transmitting credentials, `.env` variables, or private keys to external cloud APIs.
4. **Denial of Service / System Freezes**: Spawning infinite loops, memory leaks, or running models exceeding the local GPU's 4 GB VRAM capacity.
5. **Port Rebinding & Preview Hijacking**: Malicious previews accessing internal IDE endpoints.

To mitigate these risks, MaxIDE implements defense-in-depth across five hardened security perimeters.

---

## 2. Filesystem Sandboxing (`WorkspaceGuard`)

All filesystem tools (`FileSystemTools.ts`, `WorkspaceManager.ts`, `PreviewManager.ts`) enforce strict canonical boundary checking through `WorkspaceGuard`:

```typescript
// Architectural Pattern in WorkspaceGuard
const canonicalRoot = path.resolve(workspaceRoot);
const resolvedTarget = path.resolve(workspaceRoot, requestedPath);

if (!resolvedTarget.startsWith(canonicalRoot + path.sep) && resolvedTarget !== canonicalRoot) {
  throw new SecurityViolationError(`Access denied: Target path escapes workspace root.`);
}
```

### 2.1 Enforced Protections
- **Directory Traversal Mitigation**: Relative escapes (`../../Windows/System32`, `..\\..\\Windows`) are resolved to their canonical target and blocked before any filesystem API call.
- **Windows Device Path Rejection**: Windows-specific reserved device identifiers (`CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, `LPT1` through `LPT9`) are explicitly intercepted and rejected, preventing device lockups.
- **UNC & Extended Path Protection**: Rejection of `\\?\` and `\\.\` prefixes to prevent bypass of canonical path normalization.
- **Sensitive File Shielding**: Automatic exclusion of files matching secret patterns:
  - `.env`, `.env.*`
  - `id_rsa`, `id_ed25519`, `*.pem`, `*.key`
  - `.git/credentials`, `.git/config`
  - Windows registry hive files and SAM databases

---

## 3. Terminal Command Sandboxing (`SafeTerminal`)

MaxIDE executes commands via `SafeTerminal`, replacing raw unmonitored shell executions with AST decomposition, allowlist validation, and flag inspection.

### 3.1 Command Allowlist
Only recognized development binaries can be invoked without explicit interactive elevation:
- `npm`, `npx`, `node`
- `git` (read, commit, status, branch, diff)
- `python`, `py`, `pip`
- `tsc`, `vite`, `next`
- `dir`, `echo`, `type`, `cat`, `ls`, `mkdir`

### 3.2 Blocked Commands & Dangerous Flags
Any command containing dangerous flags or operations is rejected immediately:
- `rmdir /s`, `rmdir /s /q` (destructive recursive directory removal)
- `format`, `diskpart`, `chkdsk /f`
- `del /f /s /q C:\`
- `dd`, `mkfs`
- Fork bombs (`:(){ :|:& };:`, `%0|%0`)
- Silent background daemon spawns without tracking

### 3.3 Chained Command AST Inspection
Commands containing shell chaining operators (`&&`, `;`, `|`, `||`) are split into individual subcommands. Each subcommand is validated independently against the allowlist and denylist. If any constituent command fails validation, the entire pipeline is rejected.

### 3.4 Process Timeout & Resource Containment
- Standard command timeout: 30 seconds (configurable up to 120s for builds).
- Hanging processes are automatically sent `SIGTERM` followed by `SIGKILL` after 3 seconds if non-responsive.

---

## 4. API Key & Credential Protection

1. **Storage Isolation**: Provider configurations and API keys are stored in `data/providers.json` in user data directories, never committed to Git (`.gitignore` enforced).
2. **UI Masking**: API keys returned to the browser client are masked (e.g., `sk-ant-api03-****`). Full keys are never exposed in UI JSON responses or client logs.
3. **Prompt Sanitization**: `ContentSanitizer` scans outgoing prompt buffers for known API key formats (OpenAI `sk-...`, Anthropic `sk-ant-...`, Google `AIza...`) and redacts them prior to transmission.

---

## 5. Local-Only Privacy Mode & Network Egress

MaxIDE provides a 1-click **Local Only (🛡️)** privacy setting:
- **Loopback Enforcement**: When active, all AI queries are strictly routed to the local Ollama instance (`127.0.0.1:11434`) or local OpenAI-compatible endpoints (`127.0.0.1:1234`).
- **Egress Interception**: Cloud API providers (OpenAI, Gemini, Anthropic, Groq) are disabled at the gateway layer, guaranteeing that zero code or project data leaves the developer's laptop.

---

## 6. Windows Desktop Safety & Process Containment

The native C# desktop launcher (`MaxIDE.exe`) acts as an active supervisor:
1. **Single-Instance Mutex**: Uses a system-wide named mutex (`Global\MaxIDE_SingleInstance_Mutex`) to prevent duplicate processes from conflicting on database files or ports.
2. **Child Process Clean Exit**: Spawns the Node.js backend with process tracking. When the desktop window or tray application is closed, the launcher cleanly sends a shutdown signal and terminates child processes, preventing zombie Node.js instances.

---

## 7. Security Verification Test Results

| Security Test Vector | Test Scenario | Result |
| :--- | :--- | :--- |
| **Path Traversal Attack** | Attempted `readFile('../../../../Windows/win.ini')` | **BLOCKED (403 Forbidden)** |
| **Device Path Lockup** | Attempted write to `workspace/CON.txt` | **BLOCKED (Invalid Path)** |
| **Destructive Command** | Attempted `SafeTerminal.execute('rmdir /s /q C:\\')` | **REJECTED (Dangerous Flag)** |
| **Chained Injection** | Attempted `echo hello && format D:` | **REJECTED (Pipeline Blocked)** |
| **Secret Masking** | Inspect `GET /api/providers` response payload | **PASSED (Keys Masked)** |
| **Local-Only Egress** | Attempt cloud dispatch in `local_only` mode | **BLOCKED (Egress Intercepted)**|

---

## 8. Security Verdict

**Security Status**: **HARDENED & SECURE FOR PRODUCTION USE**
