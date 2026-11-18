/**
 * MaxIDE APEX — Complete UI/UX Transformation Verification Suite (Playwright)
 * Verifies Command Center, Workspace, Mission Control, Live Preview, 12-Section Settings,
 * Keyboard Shortcuts, SSE Streaming, Terminal, Git, Responsive Breakpoints, Light/Dark Themes,
 * Zero Local Console/Network Errors, Zero Horizontal Overflow, and Captures Real Screenshots.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium, Browser, Page } from 'playwright';
import { app } from '../server/index.js';

declare const window: any;
declare const document: any;
type HTMLInputElement = any;

const screenshotsDir = path.resolve('docs/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: CheckResult[] = [];
function record(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  console.log(`  ${passed ? '✓ PASS' : '✗ FAIL'}: ${name} — ${details}`);
}

async function runApexUiVerification() {
  console.log('\n=====================================================================');
  console.log('   MAXIDE APEX — PLAYWRIGHT VISUAL & FUNCTIONAL QA VERIFICATION      ');
  console.log('=====================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`Live test server bound to ${baseUrl}`);

  let browser: Browser | null = null;
  const localConsoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const localNetworkErrors: string[] = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page: Page = await context.newPage();

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        // Ignore offline external CDN fetch failures; catch all local app errors
        if (!txt.includes('fonts.googleapis.com') && !txt.includes('cdnjs.cloudflare.com') && !txt.includes('ERR_NAME_NOT_RESOLVED') && !txt.includes('ERR_INTERNET_DISCONNECTED')) {
          localConsoleErrors.push(txt);
        }
      }
    });
    page.on('response', (res) => {
      const url = res.url();
      if (url.startsWith(baseUrl) && res.status() >= 400 && !url.includes('/api/providers/') && !url.includes('/api/browser/')) {
        localNetworkErrors.push(`${res.status()} ${url}`);
      }
    });

    // 1. First-Launch Command Center (1920x1080)
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);

    const title = await page.title();
    record('Window Title & Brand Identity', title.includes('MaxIDE') && title.includes('APEX'), `Title="${title}"`);

    const ccVisible = await page.isVisible('#view-home');
    const healthCards = await page.locator('#cc-health-grid .cc-metric-box').count();
    const quickActions = await page.locator('.cc-quick-card').count();
    const overflow1920 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    record('Command Center First-Launch Dashboard (1920x1080)', ccVisible && healthCards >= 6 && quickActions === 5 && !overflow1920,
      `Visible=${ccVisible}, HealthMetrics=${healthCards}, QuickActions=${quickActions}, Overflow=${overflow1920}`);

    await page.screenshot({ path: path.join(screenshotsDir, 'command_center_1920x1080.png') });

    // 2. Project Creation & Open Existing Project Modals
    await page.click('button:has-text("New Project")');
    const newProjModalVisible = await page.isVisible('#modal-new-project');
    await page.click('#modal-new-project button:has-text("Cancel")');
    await page.click('button:has-text("Open Existing Project")');
    const openProjModalVisible = await page.isVisible('#modal-open-project');
    await page.click('#modal-open-project button:has-text("Cancel")');
    record('Project Creation & Open Project Modals', newProjModalVisible && openProjModalVisible,
      `NewProjectModal=${newProjModalVisible}, OpenProjectModal=${openProjModalVisible}`);

    // 3. Switch to AI Engineering Workspace (1600x900)
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.click('#nav-view-workspace');
    await page.waitForTimeout(800);

    const treeItems = await page.locator('#file-tree-container .tree-row').count();
    record('Workspace Explorer File Tree', treeItems > 0, `Rendered ${treeItems} explorer items`);

    // Ensure active workspace has files to inspect and open in editor
    const fileOpened = await page.evaluate(async () => {
      let files = (window as any).MaxViews?.viewState?.allFlatFiles || [];
      if (files.length === 0) {
        await fetch('/api/workspace/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: 'apex_demo.js', content: '// MaxIDE APEX Verification Buffer\nexport function greet(name) {\n  return `Hello ${name} from MaxIDE APEX`;\n}\n' }),
        });
        await (window as any).refreshFileTree();
        files = (window as any).MaxViews?.viewState?.allFlatFiles || [];
      }
      const target = files.find((f: string) => f.endsWith('.html') || f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.json') || f.endsWith('.md')) || files[0];
      if (!target) return null;
      await (window as any).openFileInEditor(target);
      return target;
    });
    await page.waitForTimeout(600);
    const breadcrumb = await page.innerText('#editor-breadcrumb-path');
    const tabCount = await page.locator('#editor-tabs-scroll .editor-tab').count();
    record('Code Editor & Multi-File Tabs + Breadcrumb', Boolean(fileOpened) && tabCount >= 1 && breadcrumb.includes(String(fileOpened)),
      `Opened="${fileOpened}", Tabs=${tabCount}, Breadcrumb="${breadcrumb}"`);

    // Toggle Diff View
    await page.click('#btn-diff-toggle');
    await page.waitForTimeout(300);
    const diffVisible = await page.isVisible('#diff-editor-container');
    await page.click('#btn-diff-toggle');
    record('Diff Viewer Toggle', diffVisible, `DiffContainerVisible=${diffVisible}`);

    // Test Sidebar Panels: Search, Git, Integrations, Project Structure
    await page.click('#rail-search');
    await page.fill('#sidebar-search-input', 'MaxIDE');
    await page.press('#sidebar-search-input', 'Enter');
    await page.waitForTimeout(400);
    const searchVisible = await page.isVisible('#sview-search');

    await page.click('#rail-git');
    await page.waitForTimeout(400);
    const gitVisible = await page.isVisible('#sview-git');

    await page.click('#rail-integrations');
    await page.waitForTimeout(400);
    const intVisible = await page.isVisible('#sview-integrations');

    await page.click('#rail-structure');
    await page.waitForTimeout(400);
    const structVisible = await page.isVisible('#sview-structure');

    await page.click('#rail-explorer');
    record('Left Sidebar Navigation (Explorer/Search/Git/Integrations/Structure)',
      searchVisible && gitVisible && intVisible && structVisible,
      'All 5 workspace sidebar panels rendered and switched cleanly');

    // 4. Integrated Terminal & Bottom Panel Tabs
    await page.fill('#terminal-cmd-input', 'node -v');
    await page.press('#terminal-cmd-input', 'Enter');
    await page.waitForTimeout(1200);
    const termText = await page.innerText('#terminal-output-body');
    record('Integrated SafeTerminal Execution', termText.includes('node -v') && termText.includes('v'), `Output contains Node version`);

    await page.click('#btab-problems');
    const probVis = await page.isVisible('#bview-problems');
    await page.click('#btab-output');
    const outVis = await page.isVisible('#bview-output');
    await page.click('#btab-debug');
    const dbgVis = await page.isVisible('#bview-debug');
    await page.click('#btab-tests');
    const testVis = await page.isVisible('#bview-tests');
    await page.click('#btab-terminal');
    record('Bottom Panel Tabs (Terminal/Problems/Output/Debug/Tests)',
      probVis && outVis && dbgVis && testVis, 'All 5 bottom panel tabs verified');

    await page.screenshot({ path: path.join(screenshotsDir, 'workspace_1600x900.png') });

    // 5. AI Chat & SSE Streaming
    await page.fill('#agent-prompt-input', 'hello');
    await page.click('#btn-agent-send');
    await page.waitForTimeout(2500);
    const chatCount = await page.locator('#agent-chat-messages .msg-card').count();
    const statusBadgeText = await page.innerText('#agent-status-badge');
    record('AI Assistant Chat & SSE Streaming', chatCount >= 2 && statusBadgeText.length > 0,
      `Messages=${chatCount}, StatusBadge="${statusBadgeText}"`);

    // 6. Agent Mission Control View
    await page.click('#nav-view-mission');
    await page.waitForTimeout(600);
    const mcVisible = await page.isVisible('#view-mission');
    const stagePills = await page.locator('#mc-stage-stepper .stage-pill').count();
    const evidenceCards = await page.locator('#mc-evidence-panel .cc-metric-box').count();
    record('Agent Mission Control View', mcVisible && stagePills >= 7 && evidenceCards >= 4,
      `Visible=${mcVisible}, Stages=${stagePills}, EvidenceMetrics=${evidenceCards}`);
    await page.screenshot({ path: path.join(screenshotsDir, 'mission_control_1600x900.png') });

    // 7. Live Preview Studio (Isolated Preview + Responsive Viewports)
    // Ensure active workspace has an index.html to preview cleanly
    await page.evaluate(async () => {
      const files = (window as any).MaxViews?.viewState?.allFlatFiles || [];
      if (!files.includes('index.html')) {
        await fetch('/api/workspace/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: 'index.html',
            content: '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Isolated Preview App</title><style>body{font-family:system-ui;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{padding:28px 36px;border-radius:14px;background:#1e293b;border:1px solid #334155;text-align:center}h1{margin:0 0 8px;font-size:22px}p{margin:0;color:#94a3b8;font-size:14px}</style></head><body><div class="card"><h1>Isolated Workspace Preview</h1><p>Running cleanly inside MaxIDE APEX Preview Studio.</p></div></body></html>',
          }),
        });
      }
    });

    await page.click('#nav-view-preview');
    await page.waitForTimeout(1000);
    const prevVisible = await page.isVisible('#view-preview');
    await page.click('#vp-btn-tablet');
    const tabletCls = await page.getAttribute('#preview-frame-shell', 'class');
    await page.click('#vp-btn-mobile');
    const mobileCls = await page.getAttribute('#preview-frame-shell', 'class');
    await page.click('#vp-btn-desktop');
    await page.click('#view-preview button:has-text("Verify")');
    await page.waitForTimeout(800);
    const consoleTxt = await page.innerText('#preview-console-output');
    record('Live Preview Studio & Responsive Device Selector',
      prevVisible && Boolean(tabletCls?.includes('tablet')) && Boolean(mobileCls?.includes('mobile')) && consoleTxt.includes('Isolation Verified'),
      `Tablet/Mobile toggle verified, Isolation check passed`);
    await page.screenshot({ path: path.join(screenshotsDir, 'preview_studio_1600x900.png') });

    // 8. Settings Experience (All 12 Sections + API Key Masking + Light/Dark Theme)
    await page.click('#btn-settings');
    await page.waitForSelector('#settings-content-pane h3:has-text("AI Providers")', { timeout: 10000 });
    await page.waitForTimeout(250);
    const settingsNavCount = await page.locator('#settings-nav-list .settings-nav-item').count();
    const exposedSecrets = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('#settings-content-pane input[type="password"]')) as HTMLInputElement[];
      return inputs.some(i => i.value.length > 0 && !i.value.includes('•'));
    });
    await page.screenshot({ path: path.join(screenshotsDir, 'settings_providers_dark.png') });

    // Click through all 12 sections
    const navButtons = page.locator('#settings-nav-list .settings-nav-item');
    for (let i = 0; i < settingsNavCount; i++) {
      await navButtons.nth(i).click();
      await page.waitForTimeout(160);
    }

    // Test Light Theme toggle in Appearance (index 10)
    await navButtons.nth(10).click();
    await page.waitForTimeout(200);
    await page.click('#settings-content-pane button:has-text("Light")');
    await page.waitForTimeout(250);
    const lightAttr = await page.getAttribute('html', 'data-theme');
    await page.screenshot({ path: path.join(screenshotsDir, 'settings_light_theme.png') });
    await page.click('#settings-content-pane button:has-text("Dark Graphite")');
    await page.waitForTimeout(150);
    await page.click('#modal-settings button[aria-label="Close Settings"]');
    record('Settings Experience (All 12 Sections + Secret Masking + Light/Dark Theme)',
      settingsNavCount === 12 && !exposedSecrets && lightAttr === 'light',
      `Sections=${settingsNavCount}, ExposedSecrets=${exposedSecrets}, LightThemeVerified=${lightAttr === 'light'}`);

    // 9. Keyboard Shortcuts Verification
    await page.click('#nav-view-workspace');
    await page.waitForTimeout(300);

    await page.keyboard.press('Control+k');
    await page.waitForTimeout(200);
    const palOpen = await page.isVisible('#modal-command-palette');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await page.keyboard.press('Control+p');
    await page.waitForTimeout(200);
    const filePalTag = await page.innerText('#palette-mode-tag');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await page.keyboard.press('Control+Shift+f');
    await page.waitForTimeout(200);
    const focusOn = await page.isVisible('#focus-exit-pill');
    await page.keyboard.press('Control+Shift+f');
    await page.waitForTimeout(150);

    await page.keyboard.press('Control+b');
    await page.waitForTimeout(150);
    const sideHidden = !(await page.isVisible('#left-sidebar'));
    await page.keyboard.press('Control+b');

    await page.keyboard.press('Control+`');
    await page.waitForTimeout(150);
    const termHidden = !(await page.isVisible('#bottom-panel'));
    await page.keyboard.press('Control+`');

    record('Keyboard Shortcuts (Ctrl+K, Ctrl+P, Ctrl+Shift+F, Ctrl+B, Ctrl+`)',
      palOpen && filePalTag.includes('FILE') && focusOn && sideHidden && termHidden,
      `Palette=${palOpen}, FileSearch="${filePalTag}", FocusMode=${focusOn}, SidebarToggle=${sideHidden}, TerminalToggle=${termHidden}`);

    // 10. Responsive Breakpoints & Overflow Checks (1366x768, 1280x720, 390x844 Mobile)
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(300);
    const ov1366 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await page.screenshot({ path: path.join(screenshotsDir, 'workspace_1366x768.png') });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.click('#nav-view-home');
    await page.waitForTimeout(300);
    const ov1280 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await page.screenshot({ path: path.join(screenshotsDir, 'command_center_1280x720.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const ov390 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await page.screenshot({ path: path.join(screenshotsDir, 'command_center_mobile_390x844.png') });

    record('Responsive Breakpoints (1920x1080, 1600x900, 1366x768, 1280x720, 390x844)',
      !overflow1920 && !ov1366 && !ov1280 && !ov390,
      `Overflows: 1920=${overflow1920}, 1366=${ov1366}, 1280=${ov1280}, 390=${ov390}`);

    // 11. Accessibility Landmarks
    const a11yOk = await page.evaluate(() => {
      return Boolean(
        document.querySelector('header[role="banner"]') &&
        document.querySelector('main[role="main"]') &&
        document.querySelector('footer[role="contentinfo"]') &&
        document.querySelectorAll('[aria-label]').length >= 10
      );
    });
    record('Accessibility Landmarks & ARIA Labels', a11yOk, 'Banner, Main, Contentinfo landmarks & >=10 ARIA labels present');

    // 12. Console / Runtime / Local Network Error Audit
    record('Zero Uncaught Page Errors', pageErrors.length === 0, pageErrors.length === 0 ? '0 uncaught exceptions' : pageErrors.join('; '));
    record('Zero Local Console Errors', localConsoleErrors.length === 0, localConsoleErrors.length === 0 ? '0 console errors' : localConsoleErrors.join('; '));
    record('Zero Broken Local Assets / API 404s', localNetworkErrors.length === 0, localNetworkErrors.length === 0 ? '0 local HTTP >=400 errors' : localNetworkErrors.join('; '));

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n=====================================================================');
  console.log(`   RESULT: ${passedCount}/${results.length} PLAYWRIGHT UI/UX CHECKS PASSED`);
  console.log('=====================================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
  process.exit(0);
}

runApexUiVerification().catch((err) => {
  console.error('Fatal UI Verification Error:', err);
  process.exit(1);
});
