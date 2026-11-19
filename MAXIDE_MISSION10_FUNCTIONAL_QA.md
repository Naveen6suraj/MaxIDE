# MAXIDE APEX — MISSION 10
# FUNCTIONAL QUALITY & INTERACTIVE CONTROLS ENGINE
## Automated DOM Interactions, State Mutations, Mathematical Accuracy, and Console Hygiene

**Document ID:** `MAXIDE_MISSION10_FUNCTIONAL_QA.md`  
**Milestone:** Mission 10 — Outcome-Driven Autonomous Software Engineering  
**Implementation File:** `src/intelligence/FunctionalQualityEngine.ts`  
**Repository:** `https://github.com/Naveen6suraj/MaxIDE`  
**Author:** Full-Stack Specialist & Autonomous Agent Researcher  

---

## 1. Executive Summary

A web application that looks attractive but does not function when clicked is not complete software. Models frequently write buttons that lack click listeners, search inputs that do not filter, carts that do not calculate arithmetic correctly, or forms that submit invalid empty data.

The **Functional Quality Engine (`FunctionalQualityEngine.ts`)** drives live Playwright Chromium browser sessions to interact with applications just as a human user would: clicking buttons, entering text into search fields, adding items to cart, adjusting quantities, calculating totals, verifying form validations, and observing browser console hygiene.

---

## 2. Interactive Testing Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant Engine as FunctionalQualityEngine
    participant Browser as Playwright Chromium
    participant DOM as Live Application DOM
    
    Engine->>Browser: Navigate to /workspace-preview/index.html
    Browser->>DOM: Load index.html, styles.css, app.js
    Engine->>DOM: Query product catalog cards (.menu-card)
    Note over Engine,DOM: Verified >= 10 cards rendered with prices
    Engine->>DOM: Type query into search bar (#menuSearchInput)
    Note over Engine,DOM: Verified catalog dynamically filters
    Engine->>DOM: Click clear search button
    Note over Engine,DOM: Verified catalog resets to full list
    Engine->>DOM: Click category pill navigation tab (.cat-pill)
    Note over Engine,DOM: Verified active pill highlighted and cards filtered
    Engine->>DOM: Click "Add to Cart" button (.add-btn)
    Note over Engine,DOM: Verified cart badge increments and cart row created
    Engine->>DOM: Click quantity increment button (+ / .qty-btn)
    Note over Engine,DOM: Verified quantity increases and item line total updates
    Engine->>DOM: Decrement quantity to 0
    Note over Engine,DOM: Verified line item removed & empty state displayed
    Engine->>DOM: Add 2 items; Read Subtotal, Tax, Tip, Total
    Note over Engine,DOM: Verified Subtotal + 8% Tax + 10% Tip = Total (diff <= $0.05)
    Engine->>DOM: Submit order with empty customer name
    Note over Engine,DOM: Verified order blocked and validation toast displayed
    Engine->>DOM: Fill customer name and click place order
    Note over Engine,DOM: Verified confirmation receipt modal opens with order ticket
    Engine->>Browser: Inspect Console Logs
    Note over Engine,Browser: Verified 0 fatal JavaScript exceptions
```

---

## 3. Mathematical Verification of Totals Arithmetic

A hallmark of a production application is exact financial calculations. The functional engine parses the rendered currency strings from the DOM and mathematically verifies the arithmetic invariant:

$$\text{Expected Tax} = \text{round}_2(\text{Subtotal} \times 0.08)$$
$$\text{Expected Tip} = \text{round}_2(\text{Subtotal} \times 0.10)$$
$$\text{Expected Total} = \text{round}_2(\text{Subtotal} + \text{Expected Tax} + \text{Expected Tip})$$

The engine computes:
$$\Delta = |\text{Rendered Total} - \text{Expected Total}|$$
If $\Delta \le 0.05$, the arithmetic test passes. If rounding errors or NaN values occur, the test fails honestly and reports the discrepancy.

---

## 4. Browser Console Hygiene

The functional engine registers event listeners for:
- `page.on('pageerror', ...)`: Unhandled runtime JavaScript exceptions (`TypeError`, `ReferenceError`, `SyntaxError`).
- `page.on('console', msg => msg.type() === 'error')`: Console error logs.

Any unhandled fatal exception immediately drops the `runtimeStability` score and flags an actionable repair directive naming the exact error message and stack trace.
