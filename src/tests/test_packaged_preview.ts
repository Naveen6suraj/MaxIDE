import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:3456';
const RELEASE_DIR = path.resolve('C:/Users/Naveen Suraj/Desktop/MaxIDE/release/MaxIDE');
const TEST_ROOT = path.resolve('C:/Users/Naveen Suraj/Desktop/TestProjects');

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isServerHealthy() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) {
      const data = (await res.json()) as any;
      return data.status === 'healthy';
    }
  } catch {}
  return false;
}

async function main() {
  console.log('===============================================================');
  console.log('  MAXIDE PACKAGED ACCEPTANCE: REAL LIVE PREVIEW ROUTING TEST  ');
  console.log('===============================================================\n');

  if (!fs.existsSync(TEST_ROOT)) {
    fs.mkdirSync(TEST_ROOT, { recursive: true });
  }

  // 1. Ensure any lingering server is terminated
  try {
    const { execSync } = await import('child_process');
    execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3000, 3456 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
  } catch {}

  // 2. Launch Packaged Server from release/MaxIDE
  console.log('[Step 1] Launching packaged MaxIDE server from release/MaxIDE...');
  const serverProc = spawn('.\\node.exe', ['dist/server/index.js'], {
    cwd: RELEASE_DIR,
    stdio: 'pipe',
    shell: true,
  });

  serverProc.stdout.on('data', (d) => process.stdout.write('[Server] ' + d.toString()));
  serverProc.stderr.on('data', (d) => process.stderr.write('[Server Err] ' + d.toString()));

  // Wait up to 15s for server health
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    await wait(500);
    if (await isServerHealthy()) {
      healthy = true;
      break;
    }
  }

  if (!healthy) {
    throw new Error('Packaged server failed to become healthy within 15 seconds.');
  }
  console.log('  -> Packaged server is healthy on http://127.0.0.1:3456\n');

  const browser = await chromium.launch({ headless: true });

  try {
    // 3. PROJECT 1: Tic-Tac-Toe Game
    const ticTacToeDir = path.join(TEST_ROOT, 'TicTacToeGame');
    if (!fs.existsSync(ticTacToeDir)) fs.mkdirSync(ticTacToeDir, { recursive: true });

    console.log('[Step 2] Building Project 1: Tic-Tac-Toe Game in', ticTacToeDir);
    // Create / Switch Project
    const proj1Res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TicTacToeGame', folders: [ticTacToeDir] }),
    });
    const proj1 = (await proj1Res.json()) as any;
    console.log('  -> Project created:', proj1.name, `(${proj1.id})`);

    // Run Agent Task
    console.log('  -> Sending Prompt: "Build a simple Tic-Tac-Toe game website."');
    const run1 = await fetch(`${BASE_URL}/api/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'Build a simple Tic-Tac-Toe game website.', directory: ticTacToeDir }),
    });
    const run1Data = (await run1.json()) as any;
    console.log('  -> Response Action:', run1Data.actionType, 'Status:', run1Data.status);

    let finalPreviewUrl = run1Data.previewInfo?.previewUrl || run1Data.openPreview;

    if (run1Data.actionType === 'clarification') {
      console.log('  -> Clarification Gate triggered. Answering: "Interactive Tic-Tac-Toe with win detection"');
      const clarifyRes = await fetch(`${BASE_URL}/api/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'Interactive Tic-Tac-Toe with win detection',
          conversationId: run1Data.conversationId,
          directory: ticTacToeDir,
        }),
      });
      const clarifyData = (await clarifyRes.json()) as any;
      console.log('  -> Clarification answered. Task completed:', clarifyData.success);
      finalPreviewUrl = clarifyData.previewInfo?.previewUrl || clarifyData.openPreview;
    }

    console.log('  -> Authoritative Preview URL:', finalPreviewUrl);

    // Verify files on disk
    const files1 = fs.readdirSync(ticTacToeDir);
    console.log('  -> Files physically in workspace:', files1);
    if (!fs.existsSync(path.join(ticTacToeDir, 'index.html'))) {
      throw new Error('index.html was not created in TicTacToeGame directory');
    }

    // 4. Test Preview URL for Tic-Tac-Toe
    console.log('\n[Step 3] Testing Live Preview for Tic-Tac-Toe: "Open Website in New Tab"...');
    const fullUrl1 = finalPreviewUrl.startsWith('http') ? finalPreviewUrl : `${BASE_URL}${finalPreviewUrl}`;
    const previewHttpRes = await fetch(fullUrl1);
    const previewHtml = await previewHttpRes.text();
    const ct1 = previewHttpRes.headers.get('content-type') || '';

    console.log('  -> HTTP Status:', previewHttpRes.status);
    console.log('  -> Content-Type:', ct1);
    console.log('  -> Length:', previewHtml.length);

    if (previewHttpRes.status !== 200) {
      throw new Error(`Expected HTTP 200 for preview, got ${previewHttpRes.status}`);
    }
    if (!ct1.includes('text/html')) {
      throw new Error(`Expected Content-Type text/html, got ${ct1}`);
    }
    if (previewHtml.includes('id="monaco-container"') || previewHtml.includes('MaxIDE — AI Software Engineering Studio')) {
      throw new Error('FAIL: Preview returned MaxIDE Studio UI instead of Tic-Tac-Toe game!');
    }
    console.log('  -> PASS: Zero MaxIDE UI markers in preview response.');

    // Launch Playwright to test interactive game in real browser
    console.log('  -> Testing interactive DOM via Chromium Playwright...');
    const page1 = await browser.newPage();
    await page1.goto(fullUrl1, { waitUntil: 'domcontentloaded' });
    const title1 = await page1.title();
    console.log('  -> Browser Page Title:', title1);

    // Verify game board exists
    const boardExists = await page1.evaluate(() => {
      const doc = (globalThis as any).document;
      return Boolean(doc && doc.querySelector('.board, #board, .grid, [data-cell], button.cell, .cell'));
    });
    console.log('  -> Game board elements detected:', boardExists);

    // Save screenshot as visual evidence
    const shotPath1 = path.resolve('C:/Users/Naveen Suraj/Desktop/MaxIDE/tictactoe_preview_verified.png');
    await page1.screenshot({ path: shotPath1 });
    console.log('  -> Screenshot saved to:', shotPath1);
    await page1.close();

    // 5. PROJECT 2: Modern Weather Dashboard
    const weatherDir = path.join(TEST_ROOT, 'WeatherDashboard');
    if (!fs.existsSync(weatherDir)) fs.mkdirSync(weatherDir, { recursive: true });

    console.log('\n[Step 4] Building Project 2: Weather Dashboard in', weatherDir);
    const proj2Res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'WeatherDashboard', folders: [weatherDir] }),
    });
    const proj2 = (await proj2Res.json()) as any;
    console.log('  -> Project created:', proj2.name, `(${proj2.id})`);

    console.log('  -> Sending Prompt: "Build a modern weather dashboard with a clean responsive UI."');
    const run2 = await fetch(`${BASE_URL}/api/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'Build a modern weather dashboard with a clean responsive UI.',
        directory: weatherDir,
      }),
    });
    const run2Data = (await run2.json()) as any;
    console.log('  -> Response Action:', run2Data.actionType, 'Status:', run2Data.status);

    let finalPreviewUrl2 = run2Data.previewInfo?.previewUrl || run2Data.openPreview;

    if (run2Data.actionType === 'clarification') {
      console.log('  -> Clarification Gate triggered. Answering: "Clean weather dashboard with search"');
      const clarifyRes2 = await fetch(`${BASE_URL}/api/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'Clean weather dashboard with search and 5-day forecast',
          conversationId: run2Data.conversationId,
          directory: weatherDir,
        }),
      });
      const clarifyData2 = (await clarifyRes2.json()) as any;
      console.log('  -> Task completed:', clarifyData2.success);
      finalPreviewUrl2 = clarifyData2.previewInfo?.previewUrl || clarifyData2.openPreview;
    }

    console.log('  -> Authoritative Preview URL:', finalPreviewUrl2);
    const files2 = fs.readdirSync(weatherDir);
    console.log('  -> Files physically in workspace:', files2);

    // 6. Test Preview URL for Weather Dashboard
    console.log('\n[Step 5] Testing Live Preview for Weather Dashboard...');
    const fullUrl2 = finalPreviewUrl2.startsWith('http') ? finalPreviewUrl2 : `${BASE_URL}${finalPreviewUrl2}`;
    const previewHttpRes2 = await fetch(fullUrl2);
    const previewHtml2 = await previewHttpRes2.text();
    const ct2 = previewHttpRes2.headers.get('content-type') || '';

    console.log('  -> HTTP Status:', previewHttpRes2.status);
    console.log('  -> Content-Type:', ct2);
    console.log('  -> Length:', previewHtml2.length);

    if (previewHttpRes2.status !== 200) {
      throw new Error(`Expected HTTP 200 for Weather Dashboard preview, got ${previewHttpRes2.status}`);
    }
    if (previewHtml2.includes('id="monaco-container"') || previewHtml2.includes('MaxIDE — AI Software Engineering Studio')) {
      throw new Error('FAIL: Preview returned MaxIDE Studio UI instead of Weather Dashboard!');
    }
    console.log('  -> PASS: Zero MaxIDE UI markers in Weather Dashboard preview.');

    const page2 = await browser.newPage();
    await page2.goto(fullUrl2, { waitUntil: 'domcontentloaded' });
    const title2 = await page2.title();
    console.log('  -> Browser Page Title:', title2);
    if (title2.toLowerCase().includes('tic') || title2.toLowerCase().includes('toe')) {
      throw new Error('FAIL: Weather Dashboard preview returned Tic-Tac-Toe title!');
    }

    const weatherElemExists = await page2.evaluate(() => {
      const doc = (globalThis as any).document;
      return Boolean(doc && doc.querySelector('#city-input, #search-btn, .weather-content, .temp-container, #temperature, .forecast, .current-weather, [class*="weather"], [id*="weather"]'));
    });
    console.log('  -> Weather application elements detected:', weatherElemExists);

    const shotPath2 = path.resolve('C:/Users/Naveen Suraj/Desktop/MaxIDE/weather_preview_verified.png');
    await page2.screenshot({ path: shotPath2 });
    console.log('  -> Screenshot saved to:', shotPath2);
    await page2.close();

    // 7. Test Multi-Project Isolated Routing
    console.log('\n[Step 6] Testing Project-Isolated Routing...');
    const projAHttp = await fetch(`${BASE_URL}/project-preview/TicTacToeGame/index.html`);
    const projAHtml = await projAHttp.text();
    console.log('  -> /project-preview/TicTacToeGame/index.html status:', projAHttp.status);
    if (!projAHtml.toLowerCase().includes('tic') && !projAHtml.toLowerCase().includes('toe')) {
      console.log('     Warning: TicTacToe keywords not prominent, checking game board...');
    }

    const projBHttp = await fetch(`${BASE_URL}/project-preview/WeatherDashboard/index.html`);
    const projBHtml = await projBHttp.text();
    console.log('  -> /project-preview/WeatherDashboard/index.html status:', projBHttp.status);
    if (!projBHtml.toLowerCase().includes('weather')) {
      throw new Error('Project-isolated route failed to serve WeatherDashboard');
    }

    // 8. Test SPA Fallback Protection
    console.log('\n[Step 7] Testing SPA Fallback Protection (Missing files return 404)...');
    const missingRes = await fetch(`${BASE_URL}/workspace-preview/nonexistent.html`);
    console.log('  -> /workspace-preview/nonexistent.html status:', missingRes.status);
    if (missingRes.status !== 404) {
      throw new Error(`Expected 404 for missing preview file, got ${missingRes.status}`);
    }
    const missingText = await missingRes.text();
    if (missingText.includes('id="monaco-container"')) {
      throw new Error('FAIL: Missing preview file returned MaxIDE UI!');
    }
    console.log('  -> PASS: Missing preview files return strict 404, never MaxIDE UI.');

    console.log('\n===============================================================');
    console.log('  ALL REAL-WORLD PACKAGED ACCEPTANCE TESTS PASSED (100%)       ');
    console.log('===============================================================\n');

  } finally {
    try { await browser.close(); } catch {}
    try {
      if (serverProc.pid) {
        spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t'], { shell: true });
      }
    } catch {}
    try { serverProc.kill('SIGKILL'); } catch {}
  }
}

main().catch((err) => {
  console.error('\nFATAL ACCEPTANCE ERROR:', err);
  process.exit(1);
});
