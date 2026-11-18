# MAXIDE APEX — DESIGN SYSTEM SPECIFICATION
## Centralized Visual Identity, Tokens, Typography & Component Architecture

### 1. Design Philosophy
MaxIDE APEX combines the technical rigor of professional developer tools with the restraint and craft of modern native software. The visual identity is built on deep graphite surfaces, disciplined violet and indigo primary accents, subtle cyan telemetry highlights, strict 4px spacing geometry, and zero visual clutter or glassmorphic gimmickry.

All design tokens live in a single zero-CDN stylesheet: [`src/ui/styles/design-system.css`](file:///C:/Users/navee/.gemini/antigravity/scratch/MaxIDE/src/ui/styles/design-system.css).

---

### 2. Color Palette & Semantic Tokens

| Token | Dark Graphite (Default) | Light Theme | Role |
|---|---|---|---|
| `--bg-app` | `#0B0D12` | `#F6F7FA` | Root application canvas & editor background |
| `--bg-primary` | `#11141C` | `#FFFFFF` | Primary panels, topbar, sidebars, cards |
| `--bg-secondary` | `#171B25` | `#F0F2F7` | Nested surfaces, metric boxes, active rail items |
| `--bg-elevated` | `#1D2230` | `#E6E9F2` | Popovers, toasts, context menus, hover surfaces |
| `--accent-primary` | `#8B5CF6` | `#8B5CF6` | Primary CTAs, active tabs, focus rings |
| `--accent-secondary` | `#6366F1` | `#6366F1` | Secondary accents & brand emblem gradient |
| `--accent-cyan` | `#22D3EE` | `#0E7490` | Restrained telemetry, git branch, active agent states |
| `--text-primary` | `#F4F5F9` | `#11141C` | Headings, code, primary labels |
| `--text-secondary` | `#9299AA` | `#4B5565` | Descriptions, inactive navigation, body metadata |
| `--text-muted` | `#626B7D` | `#6E7787` | Placeholders, timestamps, line numbers |
| `--status-success` | `#22C55E` | `#15803D` | Passed tests, online providers, applied patches |
| `--status-warning` | `#F59E0B` | `#F59E0B` | Dirty buffers, approval banners, offline local runtimes |
| `--status-error` | `#EF4444` | `#EF4444` | Failed tests, provider errors, destructive actions |
| `--border-subtle` | `rgba(255,255,255,0.07)` | `rgba(15,23,42,0.09)` | Hairline structural dividers |

---

### 3. Typography & Spacing Scale

* **UI Sans Stack**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
* **Code & Telemetry Mono Stack**: `'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace`
* **Type Scale**: `10px` (micro badges), `11px` (dense metadata), `12px` (sidebar/panel controls), `13px` (base UI & editor), `14px` (headers), `16px` (view headings), `26px` (Command Center greeting).
* **4px Spatial Grid**: `--sp-1: 4px`, `--sp-2: 8px`, `--sp-3: 12px`, `--sp-4: 16px`, `--sp-5: 20px`, `--sp-6: 24px`, `--sp-8: 32px`.
* **Radii**: `4px` (`--radius-xs`), `6px` (`--radius-sm`), `8px` (`--radius-md`), `10px` (`--radius-lg`), `12px` (`--radius-xl`).

---

### 4. Core Component Primitives
* **Buttons**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-success`, `.btn-icon`, with `.btn-xs` / `.btn-sm` / `.btn-lg` heights.
* **Status Indicators**: `.badge` variants (`badge-accent`, `badge-cyan`, `badge-success`, `badge-warning`, `badge-error`) and `.status-dot` (`online`, `working`, `warning`, `error`).
* **Feedback & Overlays**: `.toast-stack` notifications, `.modal-dialog` confirmation & settings dialogs, `.palette-box` Raycast-style command/file launcher, `.context-menu` right-click actions, `.skeleton` loading placeholders.
* **Accessibility & Motion**:
  - WCAG AA contrast across Dark Graphite and Light themes.
  - Crisp `2px solid var(--accent-primary)` `:focus-visible` outlines.
  - Semantic landmarks (`header[role="banner"]`, `main[role="main"]`, `footer[role="contentinfo"]`) and ARIA labels.
  - Full `@media (prefers-reduced-motion: reduce)` disablement for all animations and transitions.
