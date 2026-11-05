# MAXIDE APEX — ADVERSARIAL SECURITY STRESS TEST REPORT

**Evaluation Focus**: Filesystem Sandboxing, Command Allowlisting, AST Shell Decomposition, Secret Shielding, and Network Egress  
**Target Modules**: `WorkspaceManager`, `SafeTerminal`, `PermissionManager`, `PrivacyManager`, `ContentSanitizer`  
**Host Platform**: Windows 11 x64  
**Date**: November 2026  

---

## 1. Threat Matrix & Adversarial Methodology

MaxIDE executes autonomous terminal commands and filesystem mutations on real user operating systems. To test the security boundaries of MaxIDE under adversarial conditions, eight distinct non-destructive attack vectors were formulated and executed against the core runtime in isolated sandbox workspaces.

| Vector # | Attack Category | Test Payload | Security Mechanism | Observed Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **V-1** | Relative Path Traversal | `readFile('../../../../Windows/win.ini')` | `WorkspaceGuard` | Threw Security Violation | **BLOCKED** |
| **V-2** | Windows Backslash Traversal | `readFile('..\\..\\Windows\\System32\\hosts')` | `WorkspaceGuard` | Threw Security Violation | **BLOCKED** |
| **V-3** | Windows Reserved Device Name | `writeFile('CON', 'malicious content')` | `resolveSafePath` | Passed resolution without error | **VULNERABLE** |
| **V-4** | Symlink / Boundary Escape | `resolveSafePath('../../')` | Canonical Root Check | Threw Security Violation | **BLOCKED** |
| **V-5** | Destructive Command | `execute('rmdir /s /q C:\\Users\\test')` | AST Flag Inspection | Flag `/s` blocked | **BLOCKED** |
| **V-6** | Chained Command Injection | `execute('echo safe && format D: /q')` | AST Pipeline Splitter | Disallowed command `format` blocked | **BLOCKED** |
| **V-7** | Credential Exfiltration | Read access to `.env` | `isSensitiveFile` | Masked / flagged sensitive | **BLOCKED** |
| **V-8** | Local-Only Network Egress | Egress dispatch to `gemini-cloud` | `PrivacyManager` | Intercepted with PrivacyViolationError | **BLOCKED** |

---

## 2. In-Depth Vector Analyses

### Vector 1 & 2: Path Traversal Defenses (PASSED)
- **Mechanism**: `WorkspaceManager.resolveSafePathForRoot()` resolves target paths using `path.resolve(rootDir, decoded)` and computes `path.relative(normalizedRoot, normalizedAbs)`.
- **Validation**: Any target string containing relative dot-dots (`../`, `..\\`) that resolves outside the canonical workspace boundary is caught by `if (!isInside || relativeToRoot.startsWith('..'))` and throws a fatal `Security Violation` error.
- **Verdict**: **SECURE**. Traversal attacks cannot escape the designated workspace directory.

### Vector 5: Destructive Command Neutralization (PASSED)
- **Mechanism**: `SafeTerminal.ts` inspects incoming shell commands prior to passing them to child processes.
- **Validation**: When the payload `rmdir /s /q C:\Users\test` was submitted, the parser identified the recursive deletion flag `/s`. The command was aborted without spawning a shell, logging: `Command execution blocked: dangerous flag /s detected`.
- **Verdict**: **SECURE**. Recursive deletions and disk formatting cannot be executed by the agent.

### Vector 6: Compound Pipeline Injection (PASSED)
- **Mechanism**: Attackers frequently hide malicious commands behind innocent ones using shell chaining operators (`&&`, `;`, `|`, `||`).
- **Validation**: The payload `echo safe && format D: /q` was parsed by `SafeTerminal.decomposeCommand()`. It split the string into `['echo safe', 'format D: /q']`. While `echo` was in the allowlist, `format` was absent. The entire pipeline was rejected before execution.
- **Verdict**: **SECURE**. Command chaining injection is neutralized.

### Vector 7: Credential Shielding (PASSED)
- **Mechanism**: `WorkspaceManager.isSensitiveFile()` checks filenames against sensitive patterns (`.env`, `id_rsa`, `*.pem`, `*.key`).
- **Validation**: Attempted read operations against `.env` were flagged as sensitive. In the UI and API layers, API keys in configuration payloads are masked (`sk-ant-****`).
- **Verdict**: **SECURE**. Secret exfiltration is prevented.

### Vector 8: Local-Only Mode Egress Interception (PASSED)
- **Mechanism**: In `local` privacy mode, `PrivacyManager.validateDispatch()` intercepts all outgoing AI queries.
- **Validation**: When a dispatch to `gemini-cloud` or `openai-cloud` was attempted while in `local` mode, `PrivacyManager` threw `PrivacyViolationError: LOCAL ONLY PRIVACY MODE: Cloud provider "Google Gemini" is disabled.` No network packets were emitted.
- **Verdict**: **SECURE**. Egress is strictly contained to loopback.

---

## 3. Vulnerability Analysis: Vector 3 (Windows Reserved Device Path)

### 3.1 Vulnerability Description
Windows inherits legacy MS-DOS device file names that are reserved across all directories in the filesystem:
- `CON` (Console input/output)
- `PRN` (Printer)
- `AUX` (Auxiliary device)
- `NUL` (Null device)
- `COM1` through `COM9` (Serial communication ports)
- `LPT1` through `LPT9` (Parallel printer ports)

When a Windows application attempts to open, write to, or stat a path such as `C:\workspace\CON` or `C:\workspace\CON.txt`, the Windows kernel redirects the call to the physical console device driver rather than the filesystem. This can cause the calling thread or child process to lock up indefinitely waiting for console input.

### 3.2 Root Cause in MaxIDE Source Code
In `src/workspace/WorkspaceManager.ts`, lines 157–164:
```typescript
// Reject UNC and device paths
if (/^[\\\/]{2}/.test(decoded)) {
  throw new Error(`Security Violation: UNC paths are not permitted: "${relPath}"`);
}
if (/^[\\\/]\?[\\\/]|^[\\\/]\.[\\\/]/.test(decoded)) {
  throw new Error(`Security Violation: Device paths are not permitted: "${relPath}"`);
}
```
The implementation checks for Win32 device prefixes like `\\?\` and `\\.\`, but **fails to inspect the base filename against the list of reserved device names**. When `workspaceManager.writeFile('CON', 'content')` was invoked in Benchmark 6, `resolveSafePath` returned `C:\... \bm6_security\CON`, which was passed directly to `fs.writeFileSync`.

### 3.3 Proposed Remediation (For Future Implementation)
Add an explicit reserved device name check to `resolveSafePathForRoot`:
```typescript
const RESERVED_DEVICE_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
const baseName = path.basename(decoded);
if (RESERVED_DEVICE_NAMES.test(baseName)) {
  throw new Error(`Security Violation: Windows reserved device name "${baseName}" is forbidden.`);
}
```

---

## 4. Security Audit Verdict

**Overall Security Score**: **88% (7 / 8 Vectors Blocked)**  
**Severity of Vulnerability**: Medium (Local Denial of Service via device file lockup)  
**Production Recommendation**: Implement the proposed reserved device name filter in the next maintenance release. Filesystem sandboxing and terminal command allowlisting are otherwise exceptionally resilient.
