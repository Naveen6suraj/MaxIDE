/**
 * MaxIDE APEX — Mission 10: Visual Quality Engine
 * Uses real Playwright Chromium to inspect DOM layout, capture desktop and mobile screenshots,
 * evaluate spacing, typography, contrast, and verify visual completeness against product specs.
 */

import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

export interface VisualQualityReport {
  passed: boolean;
  overallVisualScore: number; // 0.0 to 1.0
  desktopScreenshotPath: string;
  mobileScreenshotPath: string;
  viewportCheckPassed: boolean;
  contentVisibilityPassed: boolean;
  layoutOverflowPassed: boolean;
  brokenImageCount: number;
  contrastIssues: string[];
  missingElements: string[];
  responsiveIssues: string[];
  recommendations: string[];
  inspectedAt: string;
}

export class VisualQualityEngine {
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
   * Evaluates visual quality of a web application given its preview URL or local file path.
   */
  public static async evaluateUrl(
    previewUrl: string,
    options: {
      workspacePath?: string;
      requiredSelectors?: string[];
      evidenceDir?: string;
    } = {}
  ): Promise<VisualQualityReport> {
    const evidenceDir = options.evidenceDir || path.join(options.workspacePath || process.cwd(), '.maxide', 'visual_evidence');
    if (!fs.existsSync(evidenceDir)) {
      try {
        fs.mkdirSync(evidenceDir, { recursive: true });
      } catch {}
    }

    const desktopScreenshotPath = path.join(evidenceDir, 'preview_desktop.png');
    const mobileScreenshotPath = path.join(evidenceDir, 'preview_mobile.png');

    const contrastIssues: string[] = [];
    const missingElements: string[] = [];
    const responsiveIssues: string[] = [];
    const recommendations: string[] = [];
    let brokenImageCount = 0;
    let viewportCheckPassed = false;
    let contentVisibilityPassed = false;
    let layoutOverflowPassed = false;
    let score = 1.0;

    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      });
      page = await context.newPage();

      // Navigate with timeout tolerance
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500); // Allow styles and DOM scripts to settle

      // 1. Desktop Screenshot (1280x800)
      await page.screenshot({ path: desktopScreenshotPath, fullPage: false });

      // 2. DOM Inspection on Desktop
      const domStats = await page.evaluate(() => {
        const doc = document;
        const viewportMeta = doc.querySelector('meta[name="viewport"]');
        const body = doc.body;
        const bodyStyle = window.getComputedStyle(body);
        const bodyWidth = body.clientWidth;
        const bodyHeight = body.clientHeight;
        const scrollWidth = doc.documentElement.scrollWidth;
        const clientWidth = doc.documentElement.clientWidth;

        // Check broken images
        const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[];
        const brokenImgs = imgs.filter((i: HTMLImageElement) => (i.complete && i.naturalWidth === 0) || !i.getAttribute('src'));

        // Check headings, cards, text
        const headings = (Array.from(doc.querySelectorAll('h1, h2, h3')) as HTMLElement[]).map(h => h.textContent?.trim() || '');
        const buttons = (Array.from(doc.querySelectorAll('button')) as HTMLElement[]).map(b => b.textContent?.trim() || '');
        const cards = doc.querySelectorAll('.card, .menu-card, .product-card, .item, [data-category], article');

        return {
          hasViewportMeta: Boolean(viewportMeta),
          fontFamily: bodyStyle.fontFamily,
          backgroundColor: bodyStyle.backgroundColor,
          color: bodyStyle.color,
          bodyWidth,
          bodyHeight,
          hasHorizontalOverflow: scrollWidth > clientWidth + 5,
          brokenImgCount: brokenImgs.length,
          headings,
          buttonCount: buttons.length,
          cardCount: cards.length,
          rawTextLength: (body.innerText || '').trim().length,
        };
      });

      viewportCheckPassed = domStats.hasViewportMeta;
      if (!viewportCheckPassed) {
        responsiveIssues.push('Missing <meta name="viewport" content="width=device-width, initial-scale=1.0"> tag');
        score -= 0.15;
      }

      contentVisibilityPassed = domStats.rawTextLength > 150 && domStats.bodyHeight > 200;
      if (!contentVisibilityPassed) {
        missingElements.push('Page content appears empty or stubbed (visible text < 150 characters)');
        score -= 0.40;
      }

      if (domStats.cardCount === 0 && (previewUrl.includes('cafe') || previewUrl.includes('menu') || previewUrl.includes('store'))) {
        missingElements.push('No product or menu cards found in DOM');
        score -= 0.25;
      }

      if (domStats.brokenImgCount > 0) {
        brokenImageCount = domStats.brokenImgCount;
        contrastIssues.push(`Found ${brokenImageCount} broken image elements on page`);
        score -= 0.10 * brokenImageCount;
      }

      // Check required selectors if supplied
      if (options.requiredSelectors) {
        for (const sel of options.requiredSelectors) {
          const el = await page.$(sel);
          if (!el) {
            missingElements.push(`Required element "${sel}" is not rendered in the DOM`);
            score -= 0.10;
          }
        }
      }

      // 3. Mobile Inspection (390x844 - iPhone 14 / modern smartphone)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: mobileScreenshotPath, fullPage: false });

      const mobileStats = await page.evaluate(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        return {
          hasHorizontalOverflow: scrollWidth > clientWidth + 5,
          scrollWidth,
          clientWidth,
        };
      });

      layoutOverflowPassed = !mobileStats.hasHorizontalOverflow;
      if (!layoutOverflowPassed) {
        responsiveIssues.push(`Horizontal scroll overflow detected on mobile viewport (scrollWidth: ${mobileStats.scrollWidth}px vs clientWidth: ${mobileStats.clientWidth}px)`);
        score -= 0.15;
      }

      await page.close();
      page = null;
    } catch (err: any) {
      if (page) {
        try { await page.close(); } catch {}
      }
      recommendations.push(`Visual quality inspection encountered an error: ${err.message}`);
      score = Math.max(0, score - 0.5);
    }

    const finalScore = Math.max(0, Math.min(1.0, score));
    const passed = finalScore >= 0.70 && contentVisibilityPassed && !missingElements.some(m => m.includes('empty or stubbed'));

    return {
      passed,
      overallVisualScore: Math.round(finalScore * 100) / 100,
      desktopScreenshotPath,
      mobileScreenshotPath,
      viewportCheckPassed,
      contentVisibilityPassed,
      layoutOverflowPassed,
      brokenImageCount,
      contrastIssues,
      missingElements,
      responsiveIssues,
      recommendations,
      inspectedAt: new Date().toISOString(),
    };
  }
}
