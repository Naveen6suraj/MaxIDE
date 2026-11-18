# MAXIDE APEX — DESIGN & UX CHANGELOG

## [APEX UI Transformation] — 2026-11-18

### Added
* **Centralized Design System (`src/ui/styles/design-system.css`)**: Self-contained CSS token architecture (`#0B0D12` graphite canvas, `#8B5CF6` violet accent, `#6366F1` indigo accent, `#22D3EE` cyan highlights, 4px spacing scale, WCAG AA contrast, Light/Dark themes, reduced-motion support).
* **Command Center Dashboard**: First-launch engineering cockpit with contextual greeting, task launcher, suggested engineering workflows, 5 quick engineering actions, recent project cards, and real-time CPU/RAM/Ollama/Agent telemetry.
* **Agent Mission Control View**: Dedicated full-screen mission view with 7-stage lifecycle stepper, milestone progress bar, real Execution Evidence counters, queued task controls, and pending command approval requests.
* **Live Preview Studio**: Integrated isolated browser preview with Back/Forward/Reload, URL input, responsive Desktop/Tablet/Mobile viewport toggles, Isolation Verification, Screenshot Capture, DOM Inspection, and console diagnostics drawer.
* **12-Section Settings Experience**: Unified configuration modal covering AI Providers, Local Models, Model Routing, Agent Autonomy, Permissions & Security, Editor Preferences, Terminal Config, Git Integration, Privacy Modes, Project Memory, Appearance, and System Diagnostics.
* **Interaction Polish**: Drag-to-resize panel splitters, Raycast-style Command Palette (`Ctrl+K`) and Quick File Search (`Ctrl+P`), Focus Mode (`Ctrl+Shift+F`), toast notification stack, confirmation dialogs, explorer context menu, and built-in offline code editor fallback.
* **Playwright QA Suite (`src/tests/apex_ui_verification.test.ts`)**: 19-point visual, functional, accessibility, and multi-viewport verification suite with automated screenshot capture.

### Changed
* **Frontend Architecture**: Modularized monolithic 223 KB `src/ui/index.html` into `src/ui/index.html`, `src/ui/styles/design-system.css`, `src/ui/js/api.js`, and `src/ui/js/views.js` with zero Tailwind CDN runtime dependency.
* **Command Center & Settings Hydration**: Switched to progressive instant hydration so local telemetry and cached providers render in <20ms while live provider probes refresh asynchronously.
* **Light Theme Contrast & Mobile Responsiveness**: Increased active navigation contrast in Light mode (`#5B21B6`) and refined `<720px` mobile header/hero/statusbar layout for zero horizontal overflow at `390x844`.

### Fixed
* **Dynamic Preview Verification Host (`src/server/routes.ts`)**: Replaced hardcoded `127.0.0.1:3456` in `POST /api/preview/verify` with dynamic `req.get('host')` resolution so isolation checks succeed on any server port.
* **API Key Masking (`src/server/routes.ts`)**: Ensured `POST /api/providers` masks stored API keys in its JSON response identically to `GET /api/providers`.
