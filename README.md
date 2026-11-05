# MaxIDE — AI-Native Autonomous Software Engineering Studio

MaxIDE is an open-ended, provider-independent, AI-native software development IDE designed for Windows 11. It pairs an autonomous 6-stage engineering agent with a universal AI Gateway (supporting local Ollama and major cloud APIs), headless browser verification, and a native Windows desktop runtime.

![MaxIDE Banner](https://img.shields.io/badge/MaxIDE-Autonomous%20AI%20IDE-cyan?style=for-the-badge)
![Target OS](https://img.shields.io/badge/Platform-Windows%2011%20x64-blue?style=for-the-badge)
![Target GPU](https://img.shields.io/badge/Hardware-RTX%203050%20(4GB%20VRAM)%20%7C%2016GB%20RAM-purple?style=for-the-badge)
![Providers](https://img.shields.io/badge/AI%20Providers-Ollama%20%7C%20Gemini%20%7C%20OpenAI%20%7C%20Anthropic%20%7C%20Groq-emerald?style=for-the-badge)
![Production Tests](https://img.shields.io/badge/Automated%20Tests-244%2F244%20PASS%20(100%25)-brightgreen?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-orange?style=for-the-badge)

---

## 🌟 Key Capabilities

### 1. 6-Stage Autonomous Engineering Loop
MaxIDE does not merely generate code snippets—it plans, modifies multiple project files, executes commands, tests applications, and repairs bugs autonomously:
1. **OBSERVE**: Inspects workspace hierarchy, AST symbols, and dependencies.
2. **PLAN**: Formulates milestones, required tools, and checkpoints.
3. **ACT**: Synthesizes clean code across files, runs builds, and applies atomic patches.
4. **VERIFY**: Tests applications with Playwright headless browsers and checks console logs.
5. **REPAIR**: Automatically detects and fixes syntax errors or runtime exceptions.
6. **COMPLETE**: Produces a comprehensive report and serves a live preview.

### 2. Universal AI Gateway & Hardware-Aware Local AI
- **100% Private Local AI (Ollama)**: Zero cloud dependencies, zero telemetry.
- **Hardware-Tuned for NVIDIA RTX 3050 (4 GB VRAM)**:
  - Recommended: `qwen2.5-coder:1.5b` (Q4_K_M, ~1.3 GB VRAM, 50+ tok/s).
  - Advanced: `qwen2.5-coder:3b` or `deepseek-r1:1.5b` (~2.2 GB VRAM, 35+ tok/s).
  - Automatic VRAM advisory warnings for models > 7B.
- **Cloud AI Fallback Cascade**: Support for **Google Gemini** (Gemini 2.5 Flash, 1.5 Pro), **OpenAI** (GPT-4o, o1, o3-mini), **Anthropic Claude** (Claude 3.5 Sonnet), and **Groq** LPUs.
- **Dynamic Model Categories**: `AUTO`, `CODING`, `REASONING`, `FAST`, and `BALANCED`.

### 3. Enterprise Sandboxing & Security
- **WorkspaceGuard**: Enforces canonical path resolution; strictly blocks directory traversal (`../`), Windows device paths (`CON`, `PRN`), and secret files (`.env`, `id_rsa`).
- **SafeTerminal**: AST-based command validation. Blocks destructive commands (`rmdir /s`, `format`, `dd`, fork bombs) and monitors execution timeouts.
- **Atomic Persistence**: State persistence via `AtomicStorage` eliminates corrupted zero-byte files during sudden power losses or crashes.

### 4. Native Windows Desktop Shell & Installer
- **Compiled C# Host (`MaxIDE.exe`)**: Single-instance mutex enforcement, multi-path Node.js auto-discovery, system tray menu, and child process containment.
- **Windows Installer (`dist\MaxIDE-Setup.exe`)**: Automatic installation to `%LOCALAPPDATA%\Programs\MaxIDE`, Start Menu shortcuts, and user PATH registration.

---

## 📊 Automated Verification Battery (100% Passed)

| Test Suite | Subsystem Verified | Tests | Status |
| :--- | :--- | :---: | :---: |
| `npm run test:production` | 20-Scenario Full IDE Production Battery | 20 | **20/20 PASSED** |
| `npm run test:preview` | Preview Routing & Playwright Browser Verification | 10 | **10/10 PASSED** |
| `npm test` | Multi-Provider Gateway & Fallback Chain | 16 | **16/16 PASSED** |
| `npm run test:persistence`| ACID Storage, Checkpoints & Crash Recovery | 36 | **36/36 PASSED** |
| `npm run test:desktop` | Native C# Host, Node Discovery & Single-Instance | 30 | **30/30 PASSED** |
| `npm run test:artifacts` | Artifact Generation, Media Slicing & Security | 57 | **57/57 PASSED** |
| `npm run test:e2e` | Full Workbench End-to-End Workflow | 13 | **13/13 PASSED** |
| `npm run test:formats` | CSV Tabular, JSON & Markdown Multi-Format Ingestion | 3 | **3/3 PASSED** |
| `npm run test:media` | Media Inspection, SVG Generation & Audio Tools | 7 | **7/7 PASSED** |
| `npm run test:universal` | Cross-Platform Document Pipelines | 7 | **7/7 PASSED** |
| `npm run test:master` | Master Platform Capability Verification | 11 | **11/11 PASSED** |
| **All Test Suites** | **Complete System Verification Battery** | **244** | **100% PASSED** |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Operating System**: Windows 10 (64-bit) build 19041 or Windows 11.
- **Node.js**: v18.0.0 or higher.
- **Ollama** *(Optional for local AI)*: [ollama.com](https://ollama.com).

### 2. Launch with Native Desktop Launcher (Recommended)
Simply double-click:
```cmd
.\MaxIDE.exe
```
Or run from PowerShell:
```powershell
npm run desktop
```
MaxIDE will locate Node.js, launch the background engine, dock into the Windows system tray, and open `http://localhost:3456` in your default browser.

### 3. Launch in Developer / CLI Mode
```powershell
# Clone the repository
git clone https://github.com/Naveen6suraj/MaxIDE.git
cd MaxIDE

# Install dependencies
npm install

# Build TypeScript and assets
npm run build

# Start MaxIDE Studio
npm start
```
Navigate to `http://localhost:3456`.

---

## 🛠️ Windows Packaging & Distribution

To compile the native Windows executable and assemble the distribution package:
```powershell
# Package desktop executable (dist\MaxIDE.exe and MaxIDE.exe)
npm run package

# Compile standalone Windows installer (dist\MaxIDE-Setup.exe)
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /target:winexe /out:dist\MaxIDE-Setup.exe /r:System.Windows.Forms.dll installer\MaxIDE-Setup.cs
```

---

## 📖 Comprehensive Documentation Reports

In-depth technical reports are available in the repository root:
- [**`MAXIDE_AUDIT.md`**](file:///C:/Users/navee/.gemini/antigravity/scratch/MaxIDE/MAXIDE_AUDIT.md): Complete codebase audit, technical debt analysis, and component inventory.
- [**`MAXIDE_ARCHITECTURE.md`**](file:///C:/Users/navee/.gemini/antigravity/scratch/MaxIDE/MAXIDE_ARCHITECTURE.md): System architecture specifications and 5 detailed Mermaid flow diagrams.
- [**`MAXIDE_IMPLEMENTATION_STATUS.md`**](file:///C:/Users/navee/.gemini/antigravity/scratch/MaxIDE/MAXIDE_IMPLEMENTATION_STATUS.md): Feature-by-feature verification matrix across all 18 engineering phases.
- [**`MAXIDE_SECURITY_REPORT.md`**](file:///C:/Users/navee/.gemini/antigravity/scratch/MaxIDE/MAXIDE_SECURITY_REPORT.md): Security analysis, WorkspaceGuard, SafeTerminal, and secret shielding.
- [**`MAXIDE_TEST_REPORT.md`**](file:///C:/Users/navee/.gemini/antigravity/scratch/MaxIDE/MAXIDE_TEST_REPORT.md): Evidence and logs for all 244 automated test runs.
- [**`MAXIDE_PERFORMANCE_REPORT.md`**](file:///C:/Users/navee/.gemini/antigravity/scratch/MaxIDE/MAXIDE_PERFORMANCE_REPORT.md): Performance benchmarks and NVIDIA RTX 3050 (4 GB VRAM) tuning guide.
- [**`MAXIDE_PRODUCTION_READINESS.md`**](file:///C:/Users/navee/.gemini/antigravity/scratch/MaxIDE/MAXIDE_PRODUCTION_READINESS.md): Production readiness certification and operations manual.
- [**`MAXIDE_CHANGELOG.md`**](file:///C:/Users/navee/.gemini/antigravity/scratch/MaxIDE/MAXIDE_CHANGELOG.md): Chronological record of all repairs, enhancements, and features.

---

## 📄 License
MIT License. Created by Burra Naveen Suraj.
