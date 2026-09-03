import { chromium } from 'playwright';

async function testClickAction() {
  console.log('1. Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  console.log('2. Navigating to http://localhost:3456...');
  await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Send prompt: hi can you build a project for me
  await page.fill('#agent-prompt-input', 'hi can you build a project for me');
  await page.click('#btn-agent-send');
  await page.waitForTimeout(6000);

  // Click the first Quick Action: Build Node.js / Express API
  console.log('3. Clicking Quick Action button...');
  const actionBtn = page.locator('#agent-chat-messages >> text="⚡ Build Interactive Web App"').first();
  if (await actionBtn.isVisible()) {
    await actionBtn.click();
    console.log('   Clicked Quick Action successfully!');
    await page.waitForTimeout(8000);
  } else {
    console.log('   Quick Action button not visible');
  }

  await page.screenshot({ path: 'test_action_executed.png' });
  console.log('Screenshot saved to test_action_executed.png');
  await browser.close();
}

testClickAction().catch(err => {
  console.error(err);
  process.exit(1);
});
