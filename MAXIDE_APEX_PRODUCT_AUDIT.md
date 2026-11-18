# MAXIDE APEX — PRODUCT AUDIT REPORT
## Baseline Inspection, Root-Cause Findings & Architectural Verification

### 1. Product Baseline Audited
* **Repository**: `https://github.com/Naveen6suraj/MaxIDE`
* **Workspace**: `C:\Users\navee\.gemini\antigravity\scratch\MaxIDE`
* **Target Host**: Windows 11 x64 • AMD Ryzen 5 5600H (12 threads) • 16 GB RAM • NVIDIA GeForce RTX 3050 Laptop GPU (4096 MB VRAM) • ₹0 Budget (Local-First Ollama).
* **Stack Preserved**: TypeScript + Express REST/SSE backend, Native Ollama & multi-provider AI Gateway, Vanilla modular Studio UI + Monaco Editor, Playwright browser verification, C# WinForms desktop wrapper (`MaxIDE.exe`).

### 2. Critical Defects Discovered During Audit
1. **Ollama False Offline & Model Mismatch (`fetch failed`)**:
   - Default Ollama URL used `http://localhost:11434` (vulnerable to Windows IPv6 `::1` vs IPv4 `127.0.0.1` resolution mismatches).
   - `src/server/index.ts` seeded non-installed catalog models (`llama3`, `qwen2.5-coder:7b`) and blindly attempted `gateway.setActiveModel('llama3')` even when only `qwen2.5-coder:3b` and `qwen2.5:0.5b` were installed locally.
   - `OllamaProvider.listModels()` blindly marked `toolCalling: true` without probing `/api/show`.
   - `OllamaProvider` did not cap `num_ctx`, causing >25s cold-load stalls on 4 GB VRAM GPUs when KV cache overflowed to system RAM.
2. **Dishonest Cloud Health Reporting**:
   - Gateway defaulted to `CLOUD` mode and Command Center displayed `"Google Gemini"` as the active provider even with 0 configured cloud API keys.
3. **Express Route Shadowing**:
   - `router.all(['/providers/:id/test', ...])` intercepted `POST /api/providers/ollama/test` before reaching the Ollama endpoint probe handler.
4. **Hardcoded Preview Verification Host**:
   - `POST /api/preview/verify` hardcoded `http://127.0.0.1:3456` instead of dynamically resolving `req.get('host')`.
5. **Missing Studio Views & Project Memory**:
   - Studio lacked dedicated top-level **Project Intelligence** and **AI Control Center** views, GPU VRAM telemetry, and persistent secret-scrubbed per-project memory.

### 3. Resolution Status
All 5 audit defects were fixed directly at their root causes without breaking existing backend APIs, desktop packaging, or test suites.
