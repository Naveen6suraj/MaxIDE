# MAXIDE APEX — AI INFRASTRUCTURE & HARDWARE OPTIMIZATION REPORT
## Native Ollama Lifecycle, Real Capability Probing & RTX 3050 4GB VRAM Budgeting

### 1. Ollama Provider Lifecycle (`src/ai/providers/ollama/OllamaProvider.ts`)
* **Configurable IPv4-Safe Endpoint**: Defaults to `http://127.0.0.1:11434` (configurable via `OLLAMA_BASE_URL` or AI Control Center) and normalizes `http://localhost:` -> `http://127.0.0.1:` to eliminate Windows Node.js IPv6 `::1` connection failures.
* **Binary Detection & Safe Startup**: Detects `C:\Users\navee\AppData\Local\Programs\Ollama\ollama.exe` and exposes `POST /api/providers/ollama/start` to launch `ollama serve` detached when stopped, polling `/api/tags` up to 5 seconds for readiness.
* **Real Capability Inspection (`POST /api/show`)**: Never blindly assumes tool calling support. Inspects Ollama's `capabilities` metadata and modelfile templates (`.Tools`, `<tool_call>`) plus exact `context_length`.
* **Live Endpoint Probing (`POST /api/providers/ollama/test`)**: Tests actual `POST /api/generate` and `POST /api/chat` with a tool schema and reports measured latency and response evidence.

### 2. Verified Live Machine Results (Ryzen 5 5600H • 16 GB RAM • RTX 3050 4 GB VRAM)
* **Installed Models Discovered**:
  - `qwen2.5-coder:3b` (`3.1B`, `1841 MB`, `PERFECT_VRAM`, `Text`, `Code`, `Tool Calling: Native`, `32,768` context) — **Auto-Activated on Startup**
  - `qwen2.5:0.5b` (`494M`, `379 MB`, `PERFECT_VRAM`, `Text`, `Code`, `Tool Calling: Native`, `32,768` context)
* **Live `nvidia-smi` GPU Telemetry**: `NVIDIA GeForce RTX 3050 Laptop GPU`, `2147 / 4096 MB VRAM (52%)`, `46°C`.
* **VRAM Context Budgeting Fix**: Capping `num_ctx: 4096` for agent tool requests and `num_ctx: 2048` for health probes keeps both model weights and KV cache resident inside the 4 GB VRAM budget, reducing cold-load generation from >25s timeout to **6.2 seconds** (`READY`).

### 3. Honest Routing & Privacy Boundary
* Default startup mode changed from dishonest `CLOUD` to `HYBRID` (`LOCAL ONLY` strictly blocks cloud egress via `PrivacyManager`).
* When 0 cloud API keys are configured, UI explicitly displays `Configured Cloud Providers: 0 (₹0 Local-First Mode — No Paid API Required)` and warns if `CLOUD` mode is selected without keys.
