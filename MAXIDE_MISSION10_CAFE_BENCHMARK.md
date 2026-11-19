# MAXIDE APEX — MISSION 10
# PERMANENT 12-CRITERIA CAFE MENU REGRESSION BENCHMARK
## Specification, Real-World Execution Results, and Permanent Verification Suite

**Document ID:** `MAXIDE_MISSION10_CAFE_BENCHMARK.md`  
**Milestone:** Mission 10 — Outcome-Driven Autonomous Software Engineering  
**Benchmark Suite:** `src/tests/mission10_cafe_benchmark.test.ts`  
**Target Application:** Aroma & Oak Artisanal Cafe & Kitchen  
**Hardware Platform:** AMD Ryzen 5 5600H, 16 GB RAM, RTX 3050 Laptop GPU, Windows 11 x64  
**Runtime Mode:** Local MaxIDE Gateway on port 3456 with Playwright Chromium  

---

## 1. Executive Summary

To permanently eliminate regression and guarantee that MaxIDE will never again deliver a blank page or a broken ordering prototype, Mission 10 established a **12-Criteria Acceptance Benchmark**.

This benchmark does not rely on unit test mocks or simulated DOMs. It runs in a real Chromium browser against live files on disk and live HTTP endpoints served by the MaxIDE gateway.

---

## 2. The 12 Acceptance Criteria

| # | Criterion | Verification Target | Expected Behavior |
| :---: | :--- | :--- | :--- |
| **1** | **Application Load** | `GET /workspace-preview/index.html` | Status HTTP 200, `<title>` contains brand name |
| **2** | **Catalog Rendering** | `#menuGrid .menu-card` | Renders $\ge 16$ product cards with name, description, price, icon |
| **3** | **Real-Time Search** | `#menuSearchInput` | Typing query filters cards; clear button restores 16 cards |
| **4** | **Category Navigation** | `.cat-pill[data-category]` | Clicking category pills filters catalog; active pill highlighted |
| **5** | **Add to Cart** | `.add-btn` & `#cartCountBadge` | Increments cart badge count; renders `.cart-row` in sidebar |
| **6** | **Quantity Increment** | `.qty-btn[aria-label="Increase quantity"]` | Clicking `+` increments count badge and item line subtotal |
| **7** | **Remove from Cart** | `.qty-btn[aria-label="Decrease quantity"]` | Decrementing to 0 removes line item; displays `.empty-cart-state` |
| **8** | **Totals Arithmetic** | `#summarySubtotal, #summaryTax, #summaryTotal` | $\text{Subtotal} + 8\% \text{ Tax} + 10\% \text{ Tip} = \text{Total}$ (diff $\le \$0.05$) |
| **9** | **Form Validation** | `#placeOrderBtn` with empty `#customerName` | Blocks order placement; displays validation toast |
| **10** | **Receipt Modal** | `#placeOrderBtn` with name & non-empty cart | Opens `#orderSuccessModal` with order number ticket & total |
| **11** | **Mobile Responsiveness**| Viewport `390x844` | Zero horizontal scroll overflow ($\text{scrollWidth} \le \text{clientWidth}$) |
| **12** | **Console Hygiene** | Browser error listener | 0 fatal unhandled JavaScript runtime exceptions |

---

## 3. Empirical Verification Results

```
======================================================
  MISSION 10: CAFE MENU REGRESSION BENCHMARK
  Score: 12 / 12 Passed (100% PASS)
  Duration: 6746 ms
======================================================

  [PASS] Application loads at /workspace-preview/index.html
         Status: 200, Title: "Aroma & Oak — Artisanal Cafe & Kitchen"
  [PASS] Menu renders product cards with prices, descriptions, and icons
         Found 16 product cards in #menuGrid
  [PASS] Search query filters items in real time and clear button resets
         Query "Vanilla" matched 2 item(s); clear button restored 16 items
  [PASS] Category navigation tabs filter catalog accurately
         Category "tea" displayed 3 items; "all" restored 16 items
  [PASS] Add to Cart increments header count badge and creates cart row
         Cart count badge updated to 1, cart rows rendered: 1
  [PASS] Quantity increment updates item count and total
         Clicked + button; cart count badge incremented to 2
  [PASS] Decreasing item quantity to 0 removes line item and shows empty state
         Decremented to 0; empty cart state rendered with badge count 0
  [PASS] Subtotal, Kitchen Tax (8%), 10% Tip, and Total calculate accurately
         Subtotal: $12.00, Tax: $0.96, Total: $14.16 (Diff: $0.00)
  [PASS] Order form validation prevents order placement with empty customer name
         Empty name blocked order submission; customer name field accepts input
  [PASS] Order placement displays confirmation receipt modal with ticket and total
         Receipt modal displayed: true, includes Ticket: true, Total: true
  [PASS] Mobile layout (390x844) renders without horizontal scroll overflow
         scrollWidth: 390px, clientWidth: 390px, overflow: false
  [PASS] Browser console is clean with zero unhandled fatal JavaScript errors
         0 fatal console errors
```

- **Pass Rate:** **$100\%$ ($12/12$)**
- **Execution Time:** **$6.74\text{ seconds}$**
- **Evidence Screenshots Generated:**
  - `cafe_benchmark_desktop.png` ($1280 \times 800$)
  - `cafe_benchmark_mobile.png` ($390 \times 844$)

This benchmark is permanently integrated into the test runner and accessible on demand via the **APEX Intelligence Center Section 13** in the UI.
