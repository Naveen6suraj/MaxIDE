# MaxIDE — AI-Native Software Engineering Studio

MaxIDE is an open-ended, provider-independent, AI-native software engineering environment combining a universal AI Gateway with a complete desktop-grade IDE workspace.

![MaxIDE Banner](https://img.shields.io/badge/MaxIDE-AI--Native%20IDE-cyan?style=for-the-badge)
![Providers](https://img.shields.io/badge/AI%20Providers-OpenAI%20%7C%20Gemini%20%7C%20Anthropic%20%7C%20Groq%20%7C%20Ollama-emerald?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=for-the-badge)
![Production Tests](https://img.shields.io/badge/Production%20Battery-20%2F20%20PASS%20(100%25)-brightgreen?style=for-the-badge)

---

## 🌟 Key Capabilities

### 1. Production Multi-Provider AI Architecture
- **Multi-Provider Cloud & Local**: Seamless integration with **Google Gemini**, **OpenAI** (GPT-4o, o1, o3-mini), **Anthropic Claude**, **Groq LPUs**, **Ollama**, and **LM Studio / vLLM**.
- **Resilient Fallback & Zero Dependency Crash**: MaxIDE never fails or crashes if Ollama is closed. Automatically routes and cascades across active cloud and local providers.
- **Model Categories**: Dynamic category-based routing:
  - `AUTO` — Intelligently resolves the optimal active model for current task.
  - `CODING` — Prioritizes high-precision code synthesis models.
  - `REASONING` — Routes deep logic, algorithms, and architectural tasks to reasoning models.
  - `FAST` — Instant interactive conversational responses.
  - `BALANCED` — Optimized balance of latency and capability.

### 2. Intent-Based Chat vs. Autonomous Agent Engine
- **Explicit Intent Classifier**: Accurately classifies user prompts into:
  - `CHAT` & `EXPLAIN` — Returns direct conversational answers with **ZERO file edits**, **ZERO commands**, and **NO unwanted previews**.
  - `BUILD` & `CODE_EDIT` — Enters the structured 6-stage engineering loop.
  - `BROWSER_TASK` — Directly routes to external URLs or live application previews.
  - `GIT_TASK` — Safely inspects status, diffs, and manages commits/pushes.
  - `DEBUG`, `TEST`, `REFACTOR`, and `PROJECT_TASK`.
- **6-Stage Engineering Loop**:
  1. **OBSERVE**: Inspect workspace architecture, dependencies, and requirements.
  2. **PLAN**: Formulate clear milestones and tool execution sequence.
  3. **ACT**: Synthesize code, create/edit files, and run commands.
  4. **VERIFY**: Test the application in real browser environments and run diagnostics.
  5. **REPAIR**: Detect and auto-resolve any runtime defects or compiler errors.
  6. **VERIFY AGAIN & COMPLETE**: Confirm verified working state with live preview.

### 3. Modern AI-Native Studio UX
- **Live SSE Streaming with Stop Button**: Real-time response streaming over Server-Sent Events (`/api/agent/stream`) with instantaneous cancellation abort controller (`/api/agent/stop`).
- **Collapsible Activity Progress**: Clean progressive disclosure for thoughts, tool calls, and diagnostics.
- **Focus Mode (`Ctrl+Shift+F`)**: Instantly expands the editor and preview workspace while keeping agent activity docked.
- **Command Palette (`Ctrl+K` / `Ctrl+P`)**: Search files, switch autonomy modes, toggle categories, and run commands.
- **Tabbed Settings Modal**: Unified 5-tab configuration for Providers & API Keys, Agent Autonomy, Editor, Git, and Security & Safety.

### 4. Isolated Preview Architecture & Playwright Verification
- **Application Isolation**: Guarantees generated user web apps (`index.html`, `style.css`, `app.js`) are served in complete isolation from the MaxIDE UI.
- **Dynamic Port & Dev Server Support**: Automatic detection and routing for Vite, Next.js, Express, and static projects.

---

## 📊 Verification Test Battery (100% Passed)

| Test Suite | Purpose | Tests | Status |
| :--- | :--- | :--- | :--- |
| **`npm run test:production`** | Comprehensive 20-Scenario Production Acceptance Suite | 20 | **20/20 PASSED** |
| **`npm run test:preview`** | Workspace Preview URL Routing & Security Isolation | 10 | **10/10 PASSED** |
| **`npm test`** | Multi-Provider Gateway & Fallback Chain Acceptance | 16 | **16/16 PASSED** |
| **`npm run test:e2e`** | Full Autonomous IDE Workbench E2E | 13 | **13/13 PASSED** |

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
