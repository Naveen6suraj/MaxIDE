import { chromium } from 'playwright';

async function testAntigravityBehavior() {
  console.log('Launching browser to test Antigravity behavior in MaxIDE...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Type: "open the porfolio then"
  console.log('Entering prompt: "open the porfolio then"');
  await page.fill('#agent-prompt-input', 'open the porfolio then');
  await page.click('#btn-agent-send');

  // Wait for the response and workbench action to execute
  await page.waitForTimeout(3000);

  // Take screenshot showing Monaco switched to index.html and Browser preview active!
  await page.screenshot({ path: 'orbit_antigravity_verified.png' });
  console.log('Saved orbit_antigravity_verified.png');

  await browser.close();
}

testAntigravityBehavior().catch(err => {
  console.error(err);
  process.exit(1);
});
