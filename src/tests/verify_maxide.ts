import { chromium } from 'playwright';

async function verifyMaxIDE() {
  console.log('Launching Playwright Chromium to test MaxIDE...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Send: "open it so that i can see it"
  console.log('Sending prompt: "open it so that i can see it"...');
  await page.fill('#agent-prompt-input', 'open it so that i can see it');
  await page.click('#btn-agent-send');

  // Wait for response and workbench actions to dispatch
  await page.waitForTimeout(3000);

  // Take screenshot showing MaxIDE branding, live app preview in iframe, and model options
  await page.screenshot({ path: 'maxide_live_verified.png' });
  console.log('Successfully captured maxide_live_verified.png');

  await browser.close();
}

verifyMaxIDE().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
