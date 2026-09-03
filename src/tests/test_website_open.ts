import { chromium } from 'playwright';

async function testWebsiteOpen() {
  console.log('Testing Live Website preview buttons in MaxIDE...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Check permanent Live Website link in editor header
  const liveLink = await page.$('a[href="/workspace-preview/index.html"]');
  console.log('Found permanent Live Website link in editor header:', Boolean(liveLink));

  // Type: "can you open the website"
  await page.fill('#agent-prompt-input', 'can you open the website');
  await page.click('#btn-agent-send');

  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: 'maxide_open_website_verified.png' });
  console.log('Saved maxide_open_website_verified.png');

  await browser.close();
}

testWebsiteOpen().catch(err => {
  console.error(err);
  process.exit(1);
});
