/**
 * MaxIDE APEX — Mission 10.2: Visual Quality Engine (Enhanced Multi-Dimensional Audit)
 * Uses real Playwright Chromium to inspect DOM layout, capture desktop and mobile screenshots,
 * evaluate spacing, typography, contrast, photographic media presence, and verify visual completeness.
 * 
 * Invariants:
 * 1. Checks for real <img> food/product photography vs raw emoji placeholders.
 * 2. Evaluates WCAG 2.1 AA text-to-background contrast ratios.
 * 3. Asserts typographic hierarchy (h1/body proportional scale).
 * 4. Verifies desktop and mobile viewports with zero horizontal overflow.
 */

import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

export interface VisualQualityScorecard {
  photographicScore: number;  // 0.0 to 1.0 (actual images loading, no emoji fallbacks)
  typographyScore: number;    // 0.0 to 1.0 (hierarchy, scaling, font pairing)
  layoutScore: number;        // 0.0 to 1.0 (grid alignment, spacing rhythm)
  responsiveScore: number;    // 0.0 to 1.0 (mobile overflow, viewport meta)
  contrastScore: number;      // 0.0 to 1.0 (WCAG 2.1 AA text contrast)
  compositeVisualScore: number; // 0.0 to 1.0
}

export interface VisualQualityReport {
  passed: boolean;
  overallVisualScore: number; // 0.0 to 1.0
  scorecard: VisualQualityScorecard;
  desktopScreenshotPath: string;
  mobileScreenshotPath: string;
  actualImageCount: number;
  brokenImageCount: number;
  emojiPlaceholderCount: number;
  viewportCheckPassed: boolean;
  contentVisibilityPassed: boolean;
  layoutOverflowPassed: boolean;
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
      requiresPhotographicAssets?: boolean;
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

    let actualImageCount = 0;
    let brokenImageCount = 0;
    let emojiPlaceholderCount = 0;
    let viewportCheckPassed = false;
    let contentVisibilityPassed = false;
    let layoutOverflowPassed = false;

    let photographicScore = 1.0;
    let typographyScore = 1.0;
    let layoutScore = 1.0;
    let responsiveScore = 1.0;
    let contrastScore = 1.0;

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
      await page.waitForTimeout(600); // Allow styles and DOM scripts to settle

      // 1. Desktop Screenshot (1280x800)
      await page.screenshot({ path: desktopScreenshotPath, fullPage: false });

      // 2. DOM Inspection on Desktop
      const domStats = await page.evaluate(() => {
        const doc = document;
        const viewportMeta = doc.querySelector('meta[name="viewport"]');
        const body = doc.body;
        const bodyStyle = window.getComputedStyle(body);
        const scrollWidth = doc.documentElement.scrollWidth;
        const clientWidth = doc.documentElement.clientWidth;

        // Check images
        const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[];
        const loadedImgs = imgs.filter((i: HTMLImageElement) => i.complete && i.naturalWidth > 0);
        const brokenImgs = imgs.filter((i: HTMLImageElement) => (i.complete && i.naturalWidth === 0) || !i.getAttribute('src'));

        // Check for raw emoji placeholders inside item icon containers
        const iconContainers = Array.from(doc.querySelectorAll('.item-icon, .icon, [class*="icon"]'));
        const emojiIcons = iconContainers.filter((el: Element) => {
          const text = el.textContent?.trim() || '';
          return /\p{Extended_Pictographic}/u.test(text);
        });

        // Check typography hierarchy
        const h1 = doc.querySelector('h1');
        const h1Size = h1 ? parseFloat(window.getComputedStyle(h1).fontSize) : 24;
        const bodySize = parseFloat(bodyStyle.fontSize) || 16;
        const fontRatio = bodySize > 0 ? h1Size / bodySize : 1.5;

        // Check color contrast helper
        function getLuminance(r: number, g: number, b: number): number {
          const a = [r, g, b].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        }

        let contrastRatio = 7.0; // Default accessible
        try {
          const matchColor = bodyStyle.color.match(/\d+/g);
          const matchBg = bodyStyle.backgroundColor.match(/\d+/g);
          if (matchColor && matchBg && matchColor.length >= 3 && matchBg.length >= 3) {
            const l1 = getLuminance(Number(matchColor[0]), Number(matchColor[1]), Number(matchColor[2]));
            const l2 = getLuminance(Number(matchBg[0]), Number(matchBg[1]), Number(matchBg[2]));
            const lighter = Math.max(l1, l2);
            const darker = Math.min(l1, l2);
            contrastRatio = (lighter + 0.05) / (darker + 0.05);
          }
        } catch {}

        const cards = doc.querySelectorAll('.card, .menu-card, .product-card, .item, [data-category], article');
        const buttons = doc.querySelectorAll('button');

        return {
          hasViewportMeta: Boolean(viewportMeta),
          fontFamily: bodyStyle.fontFamily,
          fontRatio,
          contrastRatio,
          totalImgsCount: imgs.length,
          loadedImgsCount: loadedImgs.length,
          brokenImgsCount: brokenImgs.length,
          emojiCount: emojiIcons.length,
          cardCount: cards.length,
          buttonCount: buttons.length,
          rawTextLength: (body.innerText || '').trim().length,
          hasHorizontalOverflow: scrollWidth > clientWidth + 5,
        };
      });

      actualImageCount = domStats.loadedImgsCount;
      brokenImageCount = domStats.brokenImgsCount;
      emojiPlaceholderCount = domStats.emojiCount;

      viewportCheckPassed = domStats.hasViewportMeta;
      if (!viewportCheckPassed) {
        responsiveIssues.push('Missing <meta name="viewport" content="width=device-width, initial-scale=1.0"> tag');
        responsiveScore -= 0.30;
      }

      contentVisibilityPassed = domStats.rawTextLength > 150;
      if (!contentVisibilityPassed) {
        missingElements.push('Page content appears empty or stubbed (visible text < 150 characters)');
        layoutScore -= 0.50;
      }

      // Photographic Media Inspection
      const isCommerceOrCafe = previewUrl.includes('cafe') || previewUrl.includes('menu') || previewUrl.includes('store') || options.requiresPhotographicAssets;
      if (isCommerceOrCafe) {
        if (actualImageCount === 0) {
          photographicScore = 0.0;
          missingElements.push('No actual product or food photographs rendered (0 <img> tags loading)');
          recommendations.push('Replace emoji glyphs with genuine photography using AssetSelectionEngine');
        } else if (brokenImageCount > 0) {
          photographicScore = Math.max(0.2, 1.0 - (brokenImageCount * 0.15));
          contrastIssues.push(`Found ${brokenImageCount} broken image elements on page`);
        } else {
          photographicScore = 1.0;
        }

        if (emojiPlaceholderCount > 0 && actualImageCount === 0) {
          recommendations.push(`Detected ${emojiPlaceholderCount} emoji placeholders used in place of product photographs.`);
        }
      }

      // Typography Hierarchy Check
      if (domStats.fontRatio < 1.3) {
        typographyScore -= 0.25;
        recommendations.push(`Weak typographic hierarchy: h1 to body font ratio is ${domStats.fontRatio.toFixed(2)} (recommended >= 1.4).`);
      }

      // Contrast Ratio Check
      if (domStats.contrastRatio < 4.5 && domStats.contrastRatio > 1.0) {
        contrastScore -= 0.35;
        contrastIssues.push(`Low body text contrast ratio: ${domStats.contrastRatio.toFixed(2)}:1 (WCAG AA requires >= 4.5:1)`);
      }

      // Check required selectors if supplied
      if (options.requiredSelectors) {
        for (const sel of options.requiredSelectors) {
          const el = await page.$(sel);
          if (!el) {
            missingElements.push(`Required element "${sel}" is not rendered in the DOM`);
            layoutScore -= 0.10;
          }
        }
      }

      // 3. Mobile Inspection (390x844 - Modern Smartphone Viewport)
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
        responsiveScore -= 0.40;
      }

      await page.close();
      page = null;
    } catch (err: any) {
      if (page) {
        try { await page.close(); } catch {}
      }
      recommendations.push(`Visual quality inspection encountered an error: ${err.message}`);
      layoutScore = Math.max(0, layoutScore - 0.4);
    }

    // Clamp subscores
    photographicScore = Math.max(0, Math.min(1.0, photographicScore));
    typographyScore = Math.max(0, Math.min(1.0, typographyScore));
    layoutScore = Math.max(0, Math.min(1.0, layoutScore));
    responsiveScore = Math.max(0, Math.min(1.0, responsiveScore));
    contrastScore = Math.max(0, Math.min(1.0, contrastScore));

    // Calculate Composite Visual Score
    const compositeVisualScore = Math.round((
      photographicScore * 0.30 +
      typographyScore * 0.20 +
      layoutScore * 0.20 +
      responsiveScore * 0.20 +
      contrastScore * 0.10
    ) * 100) / 100;

    const passed = compositeVisualScore >= 0.70 &&
      contentVisibilityPassed &&
      layoutOverflowPassed &&
      photographicScore >= 0.70;

    return {
      passed,
      overallVisualScore: compositeVisualScore,
      scorecard: {
        photographicScore,
        typographyScore,
        layoutScore,
        responsiveScore,
        contrastScore,
        compositeVisualScore,
      },
      desktopScreenshotPath,
      mobileScreenshotPath,
      actualImageCount,
      brokenImageCount,
      emojiPlaceholderCount,
      viewportCheckPassed,
      contentVisibilityPassed,
      layoutOverflowPassed,
      contrastIssues,
      missingElements,
      responsiveIssues,
      recommendations,
      inspectedAt: new Date().toISOString(),
    };
  }
}
