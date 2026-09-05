/**
 * MaxIDE - Portfolio Website Generation from Uploaded CV Test
 */

import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';

async function testPortfolioGeneration() {
  console.log('Testing portfolio generation from uploaded CV...');
  const cvPath = 'C:/Users/Naveen Suraj/Downloads/NaveenSurajcv.pdf';
  if (!fs.existsSync(cvPath)) {
    throw new Error('CV not found at ' + cvPath);
  }

  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Set file input with the CV
  const fileInput = await page.$('#agent-file-upload-input');
  if (!fileInput) throw new Error('#agent-file-upload-input not found');
  await fileInput.setInputFiles(cvPath);
  await page.waitForTimeout(1000);

  // Enter prompt
  await page.fill('#agent-prompt-input', 'here is my cv accrodingly make this as website portfolio');
  await page.click('#btn-agent-send');

  console.log('Prompt dispatched with CV attachment. Waiting for Agent Engine...');
  // Wait for agent execution
  await page.waitForTimeout(25000);

  const messages = await page.innerText('#agent-chat-messages');
  console.log('Agent Chat Output:\n', messages.slice(-500));

  await page.screenshot({ path: 'portfolio_created_verified.png' });
  console.log('Screenshot saved to portfolio_created_verified.png');
  await browser.close();
}

testPortfolioGeneration().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
