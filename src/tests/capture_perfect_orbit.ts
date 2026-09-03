import { chromium } from 'playwright';

async function capture() {
  console.log('Launching browser to capture perfected Orbit IDE...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Take screenshot of the main IDE
  await page.screenshot({ path: 'orbit_ide_perfected.png' });
  console.log('Saved orbit_ide_perfected.png');

  // Open the project switcher modal to verify it
  await page.click('#header-project-name');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'orbit_ide_project_switcher.png' });
  console.log('Saved orbit_ide_project_switcher.png');

  await browser.close();
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
