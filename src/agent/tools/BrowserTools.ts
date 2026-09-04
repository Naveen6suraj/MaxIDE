/**
 * MaxIDE - AI-Native Software Engineering Studio
 * Real Playwright Browser Verification Agent & Tools
 * 
 * Uses real Playwright Chromium browser automation to:
 * - Launch headless Chromium
 * - Navigate to application dev servers
 * - Inspect DOM structure and elements
 * - Interact with UI elements (click, fill)
 * - Capture real PNG screenshots
 * - Enforce model vision capability guard
 * - Track console errors, page crashes, and diagnostics
 */

import { chromium, Browser, Page } from 'playwright';
import { ExecutableTool } from '../ToolDefinition.js';
import { AIModel } from '../../ai/core/AIModel.js';

export interface BrowserLog {
  type: 'log' | 'warn' | 'error' | 'pageerror';
  text: string;
  timestamp: string;
}

export interface BrowserSession {
  url?: string;
  isOpen: boolean;
  pageTitle?: string;
  status?: number;
  lastScreenshotBase64?: string;
  lastHtml?: string;
  logs?: BrowserLog[];
}

export class BrowserVerificationAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private logs: BrowserLog[] = [];
  private session: BrowserSession = { isOpen: false };

  public getSession(): BrowserSession {
    return { ...this.session, logs: [...this.logs] };
  }

  public getLogs(): BrowserLog[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  private async ensurePage(): Promise<Page> {
    try {
      if (!this.browser) {
        this.browser = await chromium.launch({ headless: true });
      }
    } catch (err: any) {
      throw new Error(
        `Chromium browser could not be launched. Ensure Playwright Chromium is installed (run: npx playwright install chromium). Detail: ${err.message}`
      );
    }
    if (!this.page) {
      const context = await this.browser.newContext({ viewport: { width: 1280, height: 800 } });
      this.page = await context.newPage();
      this.page.on('console', (msg) => {
        const type = msg.type() === 'error' ? 'error' : msg.type() === 'warning' ? 'warn' : 'log';
        this.logs.push({ type, text: msg.text(), timestamp: new Date().toISOString() });
      });
      this.page.on('pageerror', (err) => {
        this.logs.push({ type: 'pageerror', text: err.message, timestamp: new Date().toISOString() });
      });
    }
    return this.page;
  }

  public async navigate(url: string): Promise<{ success: boolean; status: number; title: string; errors?: string[] }> {
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

      // Preview Identity Check (Requirements 18 & 19): Verify loaded page is not MaxIDE UI
      const isMaxIDE = html.includes('id="monaco-container"') || 
                       html.includes('MaxIDE — AI Software Engineering Studio') || 
                       html.includes('MaxIDE Verification Battery');

      const isPreviewAttempt = url.includes('/workspace-preview') || 
                               url.includes('/project-preview') || 
                               (!url.endsWith(':3456') && !url.endsWith(':3456/'));

      if (isMaxIDE && isPreviewAttempt) {
        const errMsg = 'Preview routing returned MaxIDE instead of the user application. Target preview URL was intercepted by MaxIDE SPA fallback handler.';
        this.logs.push({ type: 'error', text: errMsg, timestamp: new Date().toISOString() });
        return {
          success: false,
          status: 500,
          title: 'Preview Routing Error (MaxIDE Interception)',
          errors: [errMsg],
        };
      }

      const recentErrors = this.logs.filter(l => l.type === 'error' || l.type === 'pageerror').map(l => l.text);

      return {
        success: status < 400,
        status,
        title,
        errors: recentErrors.length > 0 ? recentErrors : undefined,
      };
    } catch (err: any) {
      this.session.pageTitle = 'Navigation Error';
      return { success: false, status: 500, title: err.message, errors: [err.message] };
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
        title: this.session.pageTitle || 'MaxIDE Browser',
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

  public async verifyApplicationLoaded(options?: { expectedKeyword?: string }): Promise<{ verified: boolean; reason: string }> {
    try {
      const page = await this.ensurePage();
      const content = await page.content();
      if (content.includes('id="monaco-container"') || content.includes('MaxIDE — AI Software Engineering Studio')) {
        return {
          verified: false,
          reason: 'Preview routing returned MaxIDE instead of the user application.',
        };
      }
      if (options?.expectedKeyword) {
        const found = content.toLowerCase().includes(options.expectedKeyword.toLowerCase());
        if (!found) {
          return {
            verified: false,
            reason: `Expected keyword "${options.expectedKeyword}" not found in application DOM.`,
          };
        }
      }
      return { verified: true, reason: 'Application page verified with zero MaxIDE UI leakage.' };
    } catch (err: any) {
      return { verified: false, reason: err.message };
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
    this.logs = [];
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
            url: { type: 'string', description: 'URL or relative path to navigate to (e.g. "/workspace-preview/index.html" or active dev server URL)' },
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
    {
      definition: {
        name: 'browser_get_logs',
        description: 'Get recent console messages, warnings, and page errors captured from the browser.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      permissionLevel: 'SAFE',
      execute: async () => {
        return { logs: browserAgent.getLogs() };
      },
    },
    {
      definition: {
        name: 'browser_verify_app',
        description: 'Verify that the currently loaded page is the genuine user application and not MaxIDE Studio UI.',
        parameters: {
          type: 'object',
          properties: {
            expectedKeyword: { type: 'string', description: 'Keyword or element text expected in application DOM (e.g. "Tic-Tac-Toe", "Weather")' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { expectedKeyword?: string }) => {
        return browserAgent.verifyApplicationLoaded(args);
      },
    },
  ];
}
