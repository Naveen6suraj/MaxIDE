# MAXIDE APEX — MISSION 10
# PRODUCT SPECIFICATION ENGINE SPECIFICATION
## Architecture, Domain Contracts, and Structured Intent Decomposition

**Document ID:** `MAXIDE_MISSION10_PRODUCT_SPEC_ENGINE.md`  
**Milestone:** Mission 10 — Outcome-Driven Autonomous Software Engineering  
**Implementation File:** `src/intelligence/ProductSpecEngine.ts`  
**Repository:** `https://github.com/Naveen6suraj/MaxIDE`  
**Author:** Principal AI Systems & Autonomous Agent Researcher  

---

## 1. Executive Summary & Objective

In previous iterations (Missions 7, 8, and 9), MaxIDE could plan high-level execution stages and select reinforcement learning strategies via Contextual Bandits. However, when paired with local 3-billion-parameter coding models (such as `qwen2.5-coder:3b`), the system suffered from a critical failure mode: **Shallow Stub Generation**. 

Models would emit minimal skeleton templates (e.g., `<h1>Student Attendance Analyzer</h1><div id="app"></div>` or comments like `<!-- Menu items dynamically loaded here -->`), missing data models, navigation tabs, functional forms, and real styling.

The **Product Specification Engine (`ProductSpecEngine.ts`)** resolves this defect at the root. Before any code generation commences:
1. The user's natural language request is converted into an explicit **Task Contract** via `IntentClassifier.createContract()`.
2. The `ProductSpecEngine` expands the contract into a comprehensive, domain-grounded **Product Specification (`ProductSpec`)**.
3. The specification supplies complete data models, page layout containers, mandatory interactive features, validation rules, state invariants, and responsive criteria directly into the agent's progressive prompt decomposition.

---

## 2. Product Specification Data Architecture

The engine generates strongly typed specifications following the `ProductSpec` interface:

```typescript
export interface ProductSpec {
  id: string;
  name: string;
  domain: string;
  targetPlatform: 'WEB_APP' | 'NATIVE_WINDOWS' | 'FULLSTACK_WEB' | 'BACKEND_SERVICE' | 'CLI_UTILITY';
  architectureDescription: string;
  pages: ProductPageSpec[];
  dataModels: ProductDataModelSpec[];
  interactiveFeatures: ProductFeatureSpec[];
  validationRules: ProductValidationRule[];
  stateModel: {
    stateVariables: Array<{ name: string; type: string; initialValue: any; description: string }>;
    persistenceMechanism: 'LOCAL_STORAGE' | 'IN_MEMORY' | 'SQLITE_FILE' | 'SESSION_STORAGE';
  };
  responsiveBreakpoints: {
    mobileMaxWidth: number;   // 640px
    tabletMaxWidth: number;   // 992px
    desktopMinWidth: number;  // 1200px
  };
  requiredDeliverables: string[];
  acceptanceCriteria: ProductTestCriterion[];
  existingProjectAnalysis?: ExistingProjectAnalysis;
  generatedAt: string;
}
```

---

## 3. Supported Specialized Domains

The engine contains rich architectural templates and dynamic generators across four core software engineering domains:

### 3.1 Artisanal Cafe & Restaurant Menu Ordering (`CAFE_ORDERING`)
- **Pages / Views:** Hero Brand Header, Real-time Search Bar, Category Pill Navigation (`all`, `coffee`, `tea`, `pastries`, `lunch`), Catalog Grid, Sticky Order Sidebar with itemized cart rows, Tip Selector (`0%`, `10%`, `15%`, `20%`), Checkout Form, and Confirmation Receipt Modal.
- **Data Models:** `MenuItem` with 16 realistic items (Espresso Roast, Madagascar Vanilla Latte, Nitro Cold Brew, Ceramic Matcha, Croissant, Avocado Sourdough, etc.) including id, name, category, price, calories, tags, and icon emoji.
- **Calculations & Validation:** Subtotal ($\sum price \times qty$), Kitchen Tax ($8\%$), Staff Tip, Total. Validation blocks order placement when customer name is empty.
- **Deliverables:** `index.html`, `styles.css`, `app.js`.

### 3.2 Student Attendance Analyzer & Academic Dashboard (`STUDENT_ATTENDANCE`)
- **Pages / Views:** Header KPI Summary Cards (Total Students, Overall Attendance Rate %, Below 75% Risk Alert count), Search Roster Bar, Course/Grade Filter Dropdown, Interactive Roster Table with quick Attendance Toggles (`P`, `A`, `L`), Add Student Modal, and localStorage persistence.
- **Data Models:** `StudentRecord` with id, name, rollNumber, course, totalClasses, presentClasses, absentClasses, lateClasses, attendanceRate, and status (`GOOD`, `WARNING`, `CRITICAL`).
- **Calculations:** Overall attendance rate $= \frac{\sum \text{present}}{\sum \text{totalClasses}} \times 100\%$.
- **Deliverables:** `index.html`, `styles.css`, `app.js`.

### 3.3 Native Windows Desktop Application (`NATIVE_WINDOWS`)
- **Architecture:** Windows Forms / C# compiled with host `csc.exe` (`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`).
- **UI Components:** Centered Form (`1024x720`), TableLayoutPanel, StatusStrip, MenuStrip, DataGridView, Action Buttons, and MessageBox dialogs.
- **Invariants:** Zero HTML/browser substitution when Native Windows is requested; honest compiler detection with `winget` installation instructions if toolchains are absent.
- **Deliverables:** `App.cs`, `build.bat`, `App.exe`.

### 3.4 General Full-Stack & Utility Web Apps (`GENERAL_WEB_APP`)
- Inferred dynamic specification with header, semantic navigation, interactive container, state persistence, forms, and responsive grid layout.

---

## 4. Existing Project Analysis & Non-Destructive Refactoring

When MaxIDE executes inside an existing workspace containing prior code:
1. `ProductSpecEngine.analyzeExistingProject(workspacePath)` inspects existing files, scripts, and stylesheets.
2. Identifies implemented vs missing features.
3. Formulates an `ExistingProjectAnalysis` record that instructs the model to preserve working functions, fix DOM identifier mismatches, and extend rather than overwrite with destructive stubs.

---

## 5. Verification & Test Criteria

Every generated `ProductSpec` includes deterministic acceptance criteria categorized into:
- `FUNCTIONAL`: Interactive buttons, form inputs, dynamic DOM updates, calculation arithmetic.
- `VISUAL`: Color contrast, element layout, heading typography, zero broken images.
- `RUNTIME`: 0 unhandled fatal console exceptions (`TypeError`, `ReferenceError`).
- `RESPONSIVE`: Zero horizontal overflow on mobile viewports (`390x844`).

This specification directly drives `OutcomeDrivenPlanner.ts`, `VisualQualityEngine.ts`, `FunctionalQualityEngine.ts`, and `OutcomeAcceptanceEngine.ts`.
