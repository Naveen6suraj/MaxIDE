# MaxIDE — AI-Native Software Engineering Studio

MaxIDE is an open-ended, provider-independent, AI-native software engineering environment combining a universal AI Gateway with a complete desktop-grade IDE workspace.

![MaxIDE Banner](https://img.shields.io/badge/MaxIDE-AI--Native%20IDE-cyan?style=for-the-badge)
![Ollama](https://img.shields.io/badge/Local%20AI-Ollama%20Free-emerald?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=for-the-badge)
![Tests Passing](https://img.shields.io/badge/Acceptance%20Tests-38%2F38%20PASS-brightgreen?style=for-the-badge)

---

## 🌟 Key Capabilities

### 1. Free Local AI & Unlimited Provider Gateway
- **Zero Subscriptions Required**: Seamlessly connects to local Ollama daemons (`http://localhost:11434`) out-of-the-box.
- **Pre-Configured Free Models**:
  - `gemma4:31b-cloud` (Google Gemma 4 31B)
  - `minimax-m2.7:cloud` (MiniMax M2.7 Coding Engine)
  - `qwen3.5:397b-cloud` (Qwen 3.5 High-Capacity Model)
  - `nemotron-70b` (NVIDIA Nemotron Reasoning Engine)
- **Extensible Providers**: Also supports Google Gemini, Groq LPUs, and any OpenAI-compatible endpoint (vLLM, LM Studio, Ollama, NVIDIA NIM).

### 2. Antigravity-Style Autonomous Agent Studio
- **Autonomous & Assist Modes**: Distinguishes between conversational questions ("Explain React hooks") and software engineering execution tasks ("Build a modern portfolio with Tailwind").
- **Workbench Action Dispatch**: Natural commands like *"open the portfolio"*, *"show preview"*, or *"open it so that i can see it"* immediately switch Monaco tabs and launch the live web preview.
- **Clickable File Links**: Every file path mentioned in chat is rendered as an interactive, clickable chip that opens directly in Monaco Editor.

### 3. Live Interactive App Preview & Playwright Verification
- **Embedded Live Browser**: A real, live interactive preview pane rendered directly within the IDE bottom drawer.
- **1-Click Fullscreen Tab**: Direct button to launch generated applications in a standalone browser window.
- **Playwright Headless Chromium Audit**: Headless browser verification testing DOM elements, navigation status, and visual screenshots.

### 4. Professional IDE Workbench
- **Monaco Editor**: Multi-tab editing, line numbers, minimap, keyboard shortcuts (`Ctrl+S`, `Ctrl+K`), and syntax highlighting for 15+ languages.
- **Reversible AI Diff Viewer**: Inspect exact code patches with `+` additions and `-` deletions before applying or reverting.
- **SafeTerminal & Security Boundary Guard**: 3-tier risk classifier (`SAFE`, `APPROVAL_REQUIRED`, `BLOCKED`) with workspace containment.
- **Checkpoints & Instant Rollback**: Byte-for-byte project state snapshots and 1-click restore.
- **Universal Multi-Format Ingestion**: Drag & drop or attach PDFs, Word `.docx`, Excel `.xlsx`, CSV tabular data, and zip archives with automatic extraction.

---

## 📊 Verification Test Battery (38/38 Tests Passed — 100%)

| Test Suite | Purpose | Tests | Status |
| :--- | :--- | :--- | :--- |
| **`npm test`** | AI Provider Gateway & Failover Chain Acceptance | 16 | **16/16 PASSED** |
| **`npm run test:e2e`** | Full Antigravity-Style IDE Workbench E2E | 13 | **13/13 PASSED** |
| **`npm run test:agentic`** | Conversational vs Execution Dispatch & Zip Ingestion | 4 | **4/4 PASSED** |
| **`npm run test:formats`** | Universal Multi-Format Documents (.pdf, .docx, .xlsx, .csv) | 5 | **5/5 PASSED** |

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18 or later
- **Ollama** (Optional for free local AI): [ollama.com](https://ollama.com)

### 2. Installation & Startup
```bash
# Clone the repository
git clone https://github.com/Naveen6suraj/MaxIDE.git
cd MaxIDE

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start MaxIDE Studio
npm start
```

### 3. Open in Browser
Navigate to:
```text
http://localhost:3456
```

---

## 🛠️ Configuration & Privacy Modes

MaxIDE provides strict hardware-level privacy boundaries configurable with 1 click:
- **Local Only 🛡️**: Enforces local execution only. Cloud network egress is strictly intercepted and blocked.
- **Cloud AI**: Utilizes configured cloud providers (Gemini, Groq, OpenAI).
- **Hybrid**: Routes heavy reasoning tasks to cloud while keeping sensitive files on local models.

---

## 📄 License
MIT License. Created by Burra Naveen Suraj.
