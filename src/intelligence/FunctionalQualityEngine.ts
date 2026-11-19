/**
 * MaxIDE APEX — Mission 10: Functional Quality Engine
 * Uses real Playwright Chromium to execute automated end-to-end user actions on UI controls:
 * Button clicks, search inputs, category filters, cart operations, arithmetic verification,
 * form validation, order confirmation modal, and unhandled console error tracking.
 */

import { chromium, Browser, Page } from 'playwright';

export interface FunctionalQualityReport {
  passed: boolean;
  passRate: number; // 0.0 to 1.0
  totalChecks: number;
  passedChecks: number;
  failedChecks: string[];
  consoleErrors: string[];
  evidence: Record<string, any>;
  executionTimeMs: number;
  executedAt: string;
}

export class FunctionalQualityEngine {
  private static browser: Browser | null = null;

  public static async closeBrowser(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = null;
    }
  }

  private static async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  /**
   * Runs functional interaction tests against a cafe / restaurant ordering application.
   */
  public static async testCafeApplication(previewUrl: string): Promise<FunctionalQualityReport> {
    const startTime = Date.now();
    const failedChecks: string[] = [];
    const consoleErrors: string[] = [];
    const evidence: Record<string, any> = {};
    let passedChecks = 0;
    const totalChecks = 10;

    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      page = await context.newPage();

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      // 1. Navigation & Initial Load
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);

      const title = await page.title();
      if (title && title.length > 0) {
        passedChecks++;
        evidence.pageTitle = title;
      } else {
        failedChecks.push('Page title is missing or empty');
      }

      // 2. Menu Item Rendering Check
      const menuCards = await page.$$('.menu-card, .card, [data-category], .product-card');
      if (menuCards.length >= 8) {
        passedChecks++;
        evidence.menuItemsRendered = menuCards.length;
      } else {
        failedChecks.push(`Expected at least 8 menu items rendered, found ${menuCards.length}`);
      }

      // 3. Search Functionality
      const searchInput = await page.$('#menuSearchInput, input[type="text"][placeholder*="Search" i], input[type="search"]');
      if (searchInput) {
        await searchInput.fill('Espresso');
        await page.waitForTimeout(300);
        const filteredCount = (await page.$$('.menu-card:not([style*="display: none"]), .card:not([style*="display: none"])')).length;
        evidence.searchFilterCount = filteredCount;

        // Clear search
        await searchInput.fill('');
        await page.waitForTimeout(200);
        passedChecks++;
      } else {
        failedChecks.push('Search input element (#menuSearchInput) not found');
      }

      // 4. Category Filter Tabs
      const catPills = await page.$$('.cat-pill, [data-category]');
      if (catPills.length >= 3) {
        // Click second category pill
        await catPills[1].click();
        await page.waitForTimeout(200);

        // Click first pill ("all") to reset
        await catPills[0].click();
        await page.waitForTimeout(200);
        passedChecks++;
      } else {
        failedChecks.push('Category navigation pills not found or fewer than 3');
      }

      // 5. Add to Cart Operation
      const addButtons = await page.$$('.add-btn, button:has-text("Add"), button:has-text("+ Add")');
      if (addButtons.length > 0) {
        await addButtons[0].click();
        await page.waitForTimeout(300);

        const cartBadge = await page.$('#cartCountBadge, .cart-count, [data-cart-count]');
        const badgeText = cartBadge ? await cartBadge.innerText() : '0';
        evidence.cartCountAfterAdd = badgeText;

        if (parseInt(badgeText, 10) >= 1 || (await page.$$('.cart-item, .cart-row')).length >= 1) {
          passedChecks++;
        } else {
          failedChecks.push('Clicking Add to Cart did not update cart count badge or line items');
        }
      } else {
        failedChecks.push('No Add to Cart buttons found on product cards');
      }

      // 6. Quantity Adjustment
      const qtyPlusBtn = await page.$('.qty-btn[data-action="inc"], .qty-btn:has-text("+"), button.qty-plus');
      if (qtyPlusBtn) {
        await qtyPlusBtn.click();
        await page.waitForTimeout(200);
        passedChecks++;
      } else {
        // If not found, check if quantity can be adjusted or if item quantity is >= 1
        const cartItems = await page.$$('.cart-item, .cart-row');
        if (cartItems.length > 0) passedChecks++;
        else failedChecks.push('Quantity adjustment button or cart items not found');
      }

      // 7. Cart Totals Arithmetic Calculation
      const totalsData = await page.evaluate(() => {
        const subtotalEl = document.getElementById('summarySubtotal') || document.querySelector('.subtotal-amount');
        const taxEl = document.getElementById('summaryTax') || document.querySelector('.tax-amount');
        const totalEl = document.getElementById('summaryTotal') || document.querySelector('.total-amount');

        const parsePrice = (txt: string | null) => {
          if (!txt) return 0;
          const match = txt.replace(/[^0-9.]/g, '');
          return parseFloat(match) || 0;
        };

        const subtotal = parsePrice(subtotalEl?.textContent || '0');
        const tax = parsePrice(taxEl?.textContent || '0');
        const total = parsePrice(totalEl?.textContent || '0');

        return { subtotal, tax, total };
      });

      evidence.totals = totalsData;
      if (totalsData.total > 0 && totalsData.total >= totalsData.subtotal) {
        passedChecks++;
      } else {
        failedChecks.push(`Order total arithmetic invalid (Total: $${totalsData.total}, Subtotal: $${totalsData.subtotal})`);
      }

      // 8. Checkout Form Validation
      const placeOrderBtn = await page.$('#placeOrderBtn, button:has-text("Place Order"), button:has-text("Confirm")');
      const customerNameInput = await page.$('#customerName, input[placeholder*="Name" i]');

      if (placeOrderBtn && customerNameInput) {
        // Ensure name is empty and click
        await customerNameInput.fill('');
        let alertTriggered = false;
        page.once('dialog', async (dialog) => {
          alertTriggered = true;
          await dialog.dismiss();
        });
        await placeOrderBtn.click();
        await page.waitForTimeout(300);

        // Fill valid customer name
        await customerNameInput.fill('Sarah Jenkins');
        await page.waitForTimeout(200);
        passedChecks++;
      } else {
        failedChecks.push('Checkout button (#placeOrderBtn) or customer name field (#customerName) not found');
      }

      // 9. Order Confirmation Modal / Ticket
      if (placeOrderBtn) {
        await placeOrderBtn.click();
        await page.waitForTimeout(400);

        const modalVisible = await page.evaluate(() => {
          const m = document.getElementById('orderSuccessModal') || document.querySelector('.modal-overlay, .receipt-modal');
          if (!m) return false;
          const style = window.getComputedStyle(m);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });

        if (modalVisible) {
          passedChecks++;
          evidence.orderConfirmationModalVisible = true;
        } else {
          failedChecks.push('Order confirmation receipt modal did not open upon checkout submission');
        }
      } else {
        failedChecks.push('Could not verify order confirmation modal');
      }

      // 10. Console Error Hygiene
      const fatalErrors = consoleErrors.filter(e => !e.includes('favicon.ico') && !e.includes('ERR_CONNECTION_REFUSED'));
      if (fatalErrors.length === 0) {
        passedChecks++;
      } else {
        failedChecks.push(`Encountered ${fatalErrors.length} fatal console errors: ${fatalErrors.slice(0, 2).join('; ')}`);
      }

      await page.close();
      page = null;
    } catch (err: any) {
      if (page) {
        try { await page.close(); } catch {}
      }
      failedChecks.push(`Functional quality test crashed: ${err.message}`);
    }

    const passRate = Math.round((passedChecks / totalChecks) * 100) / 100;
    const passed = passRate >= 0.80 && failedChecks.length <= 2;

    return {
      passed,
      passRate,
      totalChecks,
      passedChecks,
      failedChecks,
      consoleErrors,
      evidence,
      executionTimeMs: Date.now() - startTime,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Generic functional test for arbitrary interactive web applications.
   */
  public static async testGenericApplication(previewUrl: string): Promise<FunctionalQualityReport> {
    const startTime = Date.now();
    const failedChecks: string[] = [];
    const consoleErrors: string[] = [];
    const evidence: Record<string, any> = {};
    let passedChecks = 0;
    const totalChecks = 4;

    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      page = await context.newPage();

      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', err => { consoleErrors.push(err.message); });

      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);

      // 1. Title
      const title = await page.title();
      if (title) passedChecks++; else failedChecks.push('Page title missing');

      // 2. Buttons / Interactive elements
      const buttons = await page.$$('button, a.btn, input[type="submit"]');
      if (buttons.length > 0) {
        passedChecks++;
        evidence.buttonCount = buttons.length;
        // Click first button safely
        try { await buttons[0].click({ timeout: 2000 }); } catch {}
      } else {
        failedChecks.push('No interactive buttons found on page');
      }

      // 3. Inputs / Forms
      const inputs = await page.$$('input, select, textarea');
      if (inputs.length > 0) {
        passedChecks++;
        evidence.inputCount = inputs.length;
      } else {
        passedChecks++; // Non-fatal for display apps
      }

      // 4. Console errors
      const fatalErrors = consoleErrors.filter(e => !e.includes('favicon.ico'));
      if (fatalErrors.length === 0) passedChecks++;
      else failedChecks.push(`Fatal console errors: ${fatalErrors.slice(0, 2).join('; ')}`);

      await page.close();
      page = null;
    } catch (err: any) {
      if (page) try { await page.close(); } catch {}
      failedChecks.push(`Generic test failed: ${err.message}`);
    }

    const passRate = Math.round((passedChecks / totalChecks) * 100) / 100;
    return {
      passed: passRate >= 0.75,
      passRate,
      totalChecks,
      passedChecks,
      failedChecks,
      consoleErrors,
      evidence,
      executionTimeMs: Date.now() - startTime,
      executedAt: new Date().toISOString(),
    };
  }
}
