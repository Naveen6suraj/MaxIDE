import { chromium } from 'playwright';

async function main() {
  console.log('1. Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  console.log('2. Navigating to http://localhost:3456...');
  await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await page.selectOption('#header-model-select', 'gemma4:31b-cloud');
  await page.waitForTimeout(500);
  const modelVal = await page.inputValue('#header-model-select');
  console.log(`   Active Model selected in UI: "${modelVal}"`);

  console.log('3. Submitting prompt: "hi can you build a project for me"...');
  await page.fill('#agent-prompt-input', 'hi can you build a project for me');
  await page.click('#btn-agent-send');

  console.log('4. Waiting for agent processing...');
  // Wait up to 15 seconds for card to appear
  await page.waitForTimeout(8000);

  const chatText = await page.innerText('#agent-chat-messages');
  console.log('\n--- CHAT FEED ---');
  console.log(chatText);
  console.log('-----------------\n');

  await page.screenshot({ path: 'test_agent_chat_result.png' });
  console.log('Screenshot saved to test_agent_chat_result.png');

  await browser.close();
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
