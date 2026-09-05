import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMaxIDELiveTest() {
  console.log('================================================================');
  console.log('🤖 STARTING MAXIDE LIVE AGENTIC USER EXPERIENCE ACCEPTANCE TEST');
  console.log('================================================================');

  const screenshotDir = path.resolve(__dirname, '..', '..', 'dist', 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.log('[BROWSER UNCAUGHT ERROR]:', err.message));

  const logStep = (msg) => console.log(`\n📌 [STEP] ${msg}`);

  try {
    // 1. Load MaxIDE Studio
    logStep('1. Navigating to MaxIDE at http://localhost:3456 ...');
    await page.goto('http://localhost:3456', { waitUntil: 'networkidle', timeout: 20000 });
    const pageTitle = await page.title();
    console.log(`Page title: "${pageTitle}"`);

    await page.waitForSelector('#agent-prompt-input', { timeout: 10000 });
    await page.waitForSelector('#sidebar-left', { timeout: 10000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(screenshotDir, 'ux_01_workbench_overview.png') });
    console.log('📸 Saved screenshot: ux_01_workbench_overview.png');

    // 2. Test Casual Conversational Intent
    logStep('2. Testing Casual Chat Intent ("Hello MaxIDE! Who are you?")...');
    await page.fill('#agent-prompt-input', 'Hello MaxIDE! Who are you and what are your capabilities as an autonomous coding agent?');
    await page.click('#btn-agent-send');

    console.log('Waiting for conversational response in chat...');
    await page.waitForFunction(() => {
      const btn = document.getElementById('btn-agent-send');
      return btn && !btn.disabled;
    }, { timeout: 25000 });

    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotDir, 'ux_02_conversational_chat.png') });
    console.log('📸 Saved screenshot: ux_02_conversational_chat.png');

    const chatCards = await page.$$eval('#agent-chat-messages > div', cards => cards.map(c => c.innerText));
    console.log('Latest chat response snippet:\n', chatCards[chatCards.length - 1]?.slice(0, 180).replace(/\n/g, ' '));

    // 3. Test Educational / Code Inquiry Intent
    logStep('3. Testing Technical Inquiry Intent ("Explain async/await in JavaScript")...');
    await page.fill('#agent-prompt-input', 'Explain async/await vs Promises in JavaScript with a clean code example.');
    await page.click('#btn-agent-send');

    console.log('Waiting for technical explanation response...');
    await page.waitForFunction(() => {
      const btn = document.getElementById('btn-agent-send');
      return btn && !btn.disabled;
    }, { timeout: 25000 });

    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotDir, 'ux_03_technical_inquiry.png') });
    console.log('📸 Saved screenshot: ux_03_technical_inquiry.png');

    // 4. Test Brave Autonomous Build
    logStep('4. Testing Autonomous Software Engineering Task: "Build a sleek Weather App"...');
    await page.fill('#agent-prompt-input', 'Build a modern interactive Weather App with index.html, style.css, and app.js with live city search and forecast cards.');
    await page.click('#btn-agent-send');

    console.log('Waiting for autonomous agent execution (Observe -> Plan -> Act -> Verify)...');
    await page.waitForFunction(() => {
      const btn = document.getElementById('btn-agent-send');
      const text = document.getElementById('agent-chat-messages')?.innerText || '';
      return (btn && !btn.disabled) && (text.includes('Completed') || text.includes('Files Created') || text.includes('Weather') || text.includes('Live Preview'));
    }, { timeout: 50000 });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotDir, 'ux_04_weather_build_complete.png') });
    console.log('📸 Saved screenshot: ux_04_weather_build_complete.png');

    // 5. Test Live App Preview Routing Verification
    logStep('5. Testing Live Interactive App Preview...');
    await page.click('#btab-browser');
    await page.waitForTimeout(1200);

    const previewIframe = await page.waitForSelector('#browser-preview-iframe', { timeout: 5000 });
    const iframeSrc = await previewIframe.getAttribute('src');
    console.log(`Live preview iframe source URL: ${iframeSrc}`);

    const frameHandle = await previewIframe.contentFrame();
    if (frameHandle) {
      await frameHandle.waitForLoadState('domcontentloaded');
      const frameContent = await frameHandle.content();
      const frameTitle = await frameHandle.title();
      console.log(`Live preview frame title: "${frameTitle}"`);
      
      const isMaxIDEItself = frameContent.includes('MaxIDE Agent Studio') || frameContent.includes('file-tree-container');
      console.log(`ASSERTION: Is preview iframe rendering MaxIDE instead of the app? ${isMaxIDEItself}`);
      if (isMaxIDEItself) {
        throw new Error('CRITICAL FAILURE: Preview iframe is showing MaxIDE UI instead of the user project!');
      } else {
        console.log('✅ PASS: Preview iframe renders the real user application!');
      }
    }

    await page.screenshot({ path: path.join(screenshotDir, 'ux_05_live_preview_drawer.png') });
    console.log('📸 Saved screenshot: ux_05_live_preview_drawer.png');

    // 6. Test Safe Terminal Drawer
    logStep('6. Testing Safe Terminal Drawer & Command Execution...');
    await page.click('#btab-terminal');
    await page.waitForTimeout(500);

    await page.fill('#terminal-input', 'git status');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(1500);
    const terminalOutput = await page.$eval('#terminal-output', el => el.innerText);
    console.log('Terminal Output Snippet:\n', terminalOutput.slice(-300).replace(/\n/g, ' '));

    await page.screenshot({ path: path.join(screenshotDir, 'ux_06_safe_terminal.png') });
    console.log('📸 Saved screenshot: ux_06_safe_terminal.png');

    // 7. Test Settings Modal & All 5 Tabs
    logStep('7. Testing Settings Modal (All 5 Configuration Tabs)...');
    await page.click('button[title="AI Providers & Settings"]');
    await page.waitForSelector('#modal-settings:not(.hidden)', { timeout: 3000 });
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(screenshotDir, 'ux_07_settings_providers.png') });
    console.log('📸 Saved screenshot: ux_07_settings_providers.png (Tab 1: AI Providers)');

    await page.click('#set-tab-agent');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotDir, 'ux_08_settings_agent.png') });
    console.log('📸 Saved screenshot: ux_08_settings_agent.png (Tab 2: Agent & Autonomy)');

    await page.click('#set-tab-editor');
    await page.waitForTimeout(400);

    await page.click('#set-tab-git');
    await page.waitForTimeout(400);

    await page.click('#set-tab-security');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotDir, 'ux_09_settings_security.png') });
    console.log('📸 Saved screenshot: ux_09_settings_security.png (Tab 5: Privacy & Safety)');

    await page.click('#modal-settings button[onclick*="closeSettingsModal"]');
    await page.waitForTimeout(500);

    // 8. Test Focus Mode Toggle
    logStep('8. Testing Focus Mode Toggle (Full-Screen Distraction Free)...');
    await page.click('#btn-toggle-focus');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotDir, 'ux_10_focus_mode_active.png') });
    console.log('📸 Saved screenshot: ux_10_focus_mode_active.png');

    await page.click('#btn-toggle-focus');
    await page.waitForTimeout(400);

    console.log('\n================================================================');
    console.log('🎉 ALL LIVE USER EXPERIENCE & AGENTIC ACCEPTANCE CHECKS PASSED!');
    console.log('================================================================');

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    await page.screenshot({ path: path.join(screenshotDir, 'ux_error.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runMaxIDELiveTest();
