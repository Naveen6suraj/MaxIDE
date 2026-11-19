# MAXIDE APEX — MISSION 11 SECURITY & APPROVALS
## Containment Boundaries, Workspace Guardrails, and Permission Gates

**Product**: MaxIDE APEX — Autonomous Software Engineering Studio  
**Repository**: [https://github.com/Naveen6suraj/MaxIDE](https://github.com/Naveen6suraj/MaxIDE)  
**Workspace**: `C:\Users\navee\.gemini\antigravity\scratch\MaxIDE`  
**Milestone**: Mission 11 — Autonomous Product Development & Engineering Orchestration  

---

## 1. Security Architecture Principles

MaxIDE APEX operates directly on the user's physical Windows 11 computer with real file access, compiler access (`csc.exe`), and local terminal execution. Because autonomous multi-agent pipelines generate and modify code autonomously, strict security boundaries are enforced to prevent destructive or unauthorized operations.

```
       [Specialist Agent Action]
                   ↓
         [WorkspaceGuard Gate]
         /                   \
[Routine Safe Action]    [Sensitive / Destructive]
         ↓                          ↓
   [Auto-Approve]          [Require User Approval]
  (e.g., write file,       (e.g., git push, rm -rf,
   run unit tests,          cloud deploy, secret read,
   compile csc.exe)         delete critical project file)
```

---

## 2. Operations Requiring Explicit User Approval

The following operations are classified as sensitive or destructive by `WorkspaceGuard` and **strictly require explicit user approval**:

1. **Destructive Filesystem Actions**:
   - Commands: `rm -rf`, `rmdir /s`, `del /f`, `format <drive>:`, `drop database`
   - Filesystem: Attempting to delete core project deliverables (`index.html`, `App.cs`, `package.json`, `.env`, `.git`)
2. **External Remote Git Operations**:
   - `git push`, `git publish` to external remote repositories
3. **External Cloud Deployments**:
   - `vercel deploy`, `netlify deploy`, `aws s3`, `fly deploy`
4. **Secret & Credential Access**:
   - `type .env`, `cat .env`, `printenv`, reading secrets from disk
5. **Workspace Escape Attempts**:
   - Any path traversal (`../`) that resolves outside the active workspace directory

---

## 3. Autonomous Routine Operations (Pre-Approved)

To prevent annoying friction during normal software development, routine reversible engineering operations are allowed to execute autonomously:
- Reading files within workspace boundaries
- Creating or editing project source files (`.html`, `.css`, `.js`, `.ts`, `.cs`, `.json`)
- Capturing snapshot checkpoints before modifying files
- Compiling code with native host compilers (`csc.exe`)
- Running local unit tests, syntax linters, and Playwright headless browser checks
- Starting local development servers on non-conflicting user ports (e.g. 3899)
