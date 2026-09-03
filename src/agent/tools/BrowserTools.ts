/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Real Playwright Browser Verification Agent & Tools
 * 
 * Uses real Playwright Chromium browser automation to:
 * - Launch headless Chromium
 * - Navigate to application dev servers
 * - Inspect DOM structure and elements
 * - Interact with UI elements (click, fill)
 * - Capture real PNG screenshots
 * - Enforce model vision capability guard
 */

import { chromium, Browser, Page } from 'playwright';
import { ExecutableTool } from '../ToolDefinition.js';
import { AIModel } from '../../ai/core/AIModel.js';

export interface BrowserSession {
  url?: string;
  isOpen: boolean;
  pageTitle?: string;
  status?: number;
  lastScreenshotBase64?: string;
  lastHtml?: string;
}

export class BrowserVerificationAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private session: BrowserSession = { isOpen: false };

  public getSession(): BrowserSession {
    return { ...this.session };
  }

  private async ensurePage(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    if (!this.page) {
      const context = await this.browser.newContext({ viewport: { width: 1280, height: 800 } });
      this.page = await context.newPage();
    }
    return this.page;
  }

  public async navigate(url: string): Promise<{ success: boolean; status: number; title: string }> {
    try {
      const page = await this.ensurePage();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const status = response ? response.status() : 200;
      const title = await page.title();
      const html = await page.content();

      this.session.url = url;
      this.session.isOpen = true;
      this.session.status = status;
      this.session.pageTitle = title;
      this.session.lastHtml = html.slice(0, 5000);

      return { success: status < 400, status, title };
    } catch (err: any) {
      this.session.pageTitle = 'Navigation Error';
      return { success: false, status: 500, title: err.message };
    }
  }

  public async captureDom(selector?: string): Promise<{ title: string; snippet: string; count?: number }> {
    try {
      const page = await this.ensurePage();
      const title = await page.title();

      if (selector) {
        const elements = await page.$$(selector);
        const first = elements.length > 0 ? await elements[0].innerText() : '';
        return {
          title,
          snippet: first ? `[${selector}] ${first}` : `No elements matching "${selector}"`,
          count: elements.length,
        };
      }

      const bodyText = await page.innerText('body');
      return {
        title,
        snippet: bodyText.slice(0, 2000),
      };
    } catch (err: any) {
      return {
        title: this.session.pageTitle || 'Orbit Browser',
        snippet: `DOM error: ${err.message}`,
      };
    }
  }

  public async click(selector: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.ensurePage();
      await page.click(selector, { timeout: 5000 });
      return { success: true, message: `Clicked element "${selector}"` };
    } catch (err: any) {
      return { success: false, message: `Click failed: ${err.message}` };
    }
  }

  public async fill(selector: string, text: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.ensurePage();
      await page.fill(selector, text, { timeout: 5000 });
      return { success: true, message: `Filled text into "${selector}"` };
    } catch (err: any) {
      return { success: false, message: `Fill failed: ${err.message}` };
    }
  }

  public async captureScreenshot(targetModel?: AIModel, bypassVisionCheck: boolean = false): Promise<{ success: boolean; error?: string; screenshotBase64?: string }> {
    // Dynamic Model Vision Capability Enforcement (for agent visual reasoning)
    if (!bypassVisionCheck && targetModel && !targetModel.capabilities.vision) {
      return {
        success: false,
        error: `Vision unavailable for selected model "${targetModel.name}". Selected model does not support visual screenshot inspection.`,
      };
    }

    try {
      const page = await this.ensurePage();
      const pngBuffer = await page.screenshot({ type: 'png' });
      const b64 = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      this.session.lastScreenshotBase64 = b64;
      return {
        success: true,
        screenshotBase64: b64,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Screenshot failed: ${err.message}`,
      };
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
    } catch {}
    this.page = null;
    this.browser = null;
    this.session = { isOpen: false };
  }
}

export function createBrowserTools(browserAgent: BrowserVerificationAgent): ExecutableTool[] {
  return [
    {
      definition: {
        name: 'browser_navigate',
        description: 'Navigate to an active web application URL using real headless Chromium.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to navigate to (e.g. http://localhost:3000)' },
          },
          required: ['url'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { url: string }) => {
        return browserAgent.navigate(args.url);
      },
    },
    {
      definition: {
        name: 'browser_inspect_dom',
        description: 'Inspect DOM text and element contents via real Chromium browser.',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector (optional)' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { selector?: string }) => {
        return browserAgent.captureDom(args.selector);
      },
    },
    {
      definition: {
        name: 'browser_click',
        description: 'Click on an element in the active web page.',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector of the element to click' },
          },
          required: ['selector'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { selector: string }) => {
        return browserAgent.click(args.selector);
      },
    },
    {
      definition: {
        name: 'browser_fill',
        description: 'Type text into an input field on the active web page.',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector of the input element' },
            text: { type: 'string', description: 'Text to input' },
          },
          required: ['selector', 'text'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { selector: string; text: string }) => {
        return browserAgent.fill(args.selector, args.text);
      },
    },
    {
      definition: {
        name: 'browser_screenshot',
        description: 'Capture real PNG screenshot of the web page (requires vision-capable model).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      permissionLevel: 'SAFE',
      execute: async (_args: any, context?: { model?: AIModel }) => {
        return browserAgent.captureScreenshot(context?.model);
      },
    },
  ];
}
