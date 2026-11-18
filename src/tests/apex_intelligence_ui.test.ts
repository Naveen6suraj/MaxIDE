declare const window: any;
declare const document: any;

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

async function main() {
  const baseUrl = process.env.MAXIDE_URL || 'http://127.0.0.1:3456';
  const shotDir = path.resolve(process.cwd(), 'docs', 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  // 1. Verify live REST API endpoints
  const dashRes = await fetch(`${baseUrl}/api/intelligence-center/dashboard`);
  assert.strictEqual(dashRes.status, 200, 'Dashboard API must return 200');
  const dashJson: any = await dashRes.json();
  assert.ok(dashJson.governance?.coreSystemPromptLocked === true, 'Immutable prompt lock must be true');
  assert.ok(dashJson.governance?.securityBoundariesLocked === true, 'Immutable security lock must be true');

  // 2. Launch headless Chromium and test live UI
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(800);

  // Switch to Intelligence view (APEX Intelligence Center)
  await page.click('#nav-view-intelligence');
  await page.waitForTimeout(700);

  // Verify all 10 section headings are visible
  const bodyText = (await page.evaluate(() => document.body.innerText)).toUpperCase();
  const requiredHeadings = [
    '1. Reasoning Strategy',
    '2. Experience Memory',
    '3. Learning History',
    '4. Model Performance',
    '5. Tool Performance',
    '6. Strategy Performance',
    '7. Trusted Self-Evaluation Results',
    '8. Policy Versions',
    '9. RL Policy & Reward Preferences',
    '10. Privacy, Security & Learning Controls',
  ];
  for (const h of requiredHeadings) {
    assert.ok(bodyText.includes(h.toUpperCase()), `Missing APEX Intelligence Center section: ${h}`);
  }

  // Test interactive Reasoning Plan simulator for Native Windows Desktop task
  await page.fill('#ic-plan-preview-input', 'Build a native Windows desktop inventory management app (.exe)');
  await page.click('button:has-text("Simulate Plan")');
  await page.waitForTimeout(600);

  const reasoningText = await page.textContent('#ic-reasoning-body');
  assert.ok(reasoningText && reasoningText.includes('native-winforms-csc'), 'UI must show native-winforms-csc selected for Native Windows prompt');
  assert.ok(reasoningText && reasoningText.includes('NATIVE_WINDOWS'), 'UI must show NATIVE_WINDOWS target platform badge');

  // Test interactive Offline Eval & Promote button
  await page.click('button:has-text("Run Offline Eval & Promote")');
  await page.waitForTimeout(700);
  const evalText = await page.textContent('#ic-offline-eval-result');
  assert.ok(evalText && evalText.includes('Offline Benchmark'), 'UI must display real offline evaluation banner');

  // Check horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 2, `Horizontal overflow detected: ${overflow}px`);

  // Capture screenshot
  const shotPath = path.join(shotDir, 'apex_intelligence_center_1600x900.png');
  await page.screenshot({ path: shotPath, fullPage: false });

  // Switch to Codebase Index subtab and verify it still works cleanly
  await page.click('#intel-subtab-codebase');
  await page.waitForTimeout(500);
  const codeVisible = await page.isVisible('#intel-pane-codebase');
  assert.strictEqual(codeVisible, true, 'Codebase Index subtab must open cleanly');

  await browser.close();

  assert.strictEqual(consoleErrors.length, 0, `Console errors found: ${consoleErrors.join('; ')}`);
  assert.strictEqual(pageErrors.length, 0, `Page errors found: ${pageErrors.join('; ')}`);

  console.log('✅ APEX INTELLIGENCE CENTER LIVE UI VERIFIED:');
  console.log(`   - All 10 sections rendered cleanly`);
  console.log(`   - Interactive Native Windows Reasoning Plan selected: native-winforms-csc`);
  console.log(`   - Interactive Offline Eval & Promote executed cleanly`);
  console.log(`   - Console errors: 0 | Page errors: 0 | Horizontal overflow: ${overflow}px`);
  console.log(`   - Screenshot saved: ${shotPath}`);
}

main().catch((err) => {
  console.error('❌ Playwright APEX Intelligence Center verification failed:', err);
  process.exit(1);
});
