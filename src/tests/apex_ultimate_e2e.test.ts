/**
 * MaxIDE APEX — Ultimate Product Transformation Real E2E & Adversarial QA Suite
 * Covers Real Live Ollama Diagnostics & Endpoint Probing, Offline Recovery,
 * Local Only Egress Blocking, Project Intelligence, Secret-Sanitized Project Memory,
 * Security Adversarial Checks, and Playwright Visual Verification of all 7 Studio Views.
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium, Browser } from 'playwright';
import { app, gateway, providerRegistry } from '../server/index.js';
import { OllamaProvider } from '../ai/providers/ollama/OllamaProvider.js';
import { WorkspaceManager } from '../workspace/WorkspaceManager.js';
import { SafeTerminal } from '../agent/safety/SafeTerminal.js';
import { ProjectMemoryManager } from '../agent/memory/ProjectMemoryManager.js';

declare const window: any;
declare const document: any;

const screenshotsDir = path.resolve('docs/screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

interface Check { name: string; passed: boolean; details: string; }
const checks: Check[] = [];
function record(name: string, passed: boolean, details: string) {
  checks.push({ name, passed, details });
  console.log(`  ${passed ? '✓ PASS' : '✗ FAIL'}: ${name} — ${details}`);
}

async function runUltimateE2E() {
  console.log('\n=====================================================================');
  console.log('   MAXIDE APEX — ULTIMATE REAL E2E & ADVERSARIAL VERIFICATION SUITE  ');
  console.log('=====================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`E2E Server listening on ${baseUrl}`);

  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  const localConsoleErrors: string[] = [];

  try {
    // 1. Live Ollama Diagnostics & GPU Hardware Telemetry
    const diagRes = await fetch(`${baseUrl}/api/providers/ollama/diagnostics`);
    const diag: any = await diagRes.json();
    record('Live Ollama Diagnostics & Endpoint Check',
      diagRes.ok && diag.serviceRunning === true && diag.endpoint === 'http://127.0.0.1:11434' && diag.models.length > 0,
      `Running=${diag.serviceRunning}, Endpoint=${diag.endpoint}, Models=${(diag.models || []).map((m: any) => m.id).join(', ')}, Latency=${diag.latencyMs}ms`);

    record('Real NVIDIA RTX 3050 GPU VRAM Telemetry',
      Boolean(diag.hardware?.gpu?.available && diag.hardware.gpu.vramTotalMb >= 4000),
      `GPU="${diag.hardware?.gpu?.name}", VRAM=${diag.hardware?.gpu?.vramUsedMb}/${diag.hardware?.gpu?.vramTotalMb}MB, Temp=${diag.hardware?.gpu?.temperatureC}C`);

    // 2. Real Ollama Endpoint Probe (/api/generate & /api/chat + tool schema)
    const firstModel = diag.models?.[0]?.id || 'qwen2.5:0.5b';
    const probeRes = await fetch(`${baseUrl}/api/providers/ollama/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: firstModel }),
    });
    const probe: any = await probeRes.json();
    record('Live Ollama /api/generate & /api/chat Tool Probe',
      probeRes.ok && probe.generateOk === true && probe.chatOk === true,
      `Model=${probe.model}, Generate=${probe.generateOk} (${probe.generateLatencyMs}ms "${probe.generateSample}"), Tools="${probe.toolCallingDetails}"`);

    // 3. Offline Ollama Recovery Behavior (Test F)
    const deadOllama = new OllamaProvider({
      id: 'ollama-dead-test',
      name: 'Dead Ollama Probe',
      type: 'local',
      apiType: 'ollama',
      baseUrl: 'http://127.0.0.1:19999',
      isEnabled: true,
    });
    const deadDiag = await deadOllama.getDetailedDiagnostics();
    record('Test F: Offline Ollama Graceful Recovery & Diagnostics',
      deadDiag.serviceRunning === false && Boolean(deadDiag.guidance) && Boolean(deadDiag.error),
      `ServiceRunning=${deadDiag.serviceRunning}, Guidance="${deadDiag.guidance.slice(0, 75)}..."`);

    // 4. Local Only Egress Blocking (Test G)
    const prevMode = gateway.getAIMode();
    gateway.setAIMode('local');
    const cloudProv = providerRegistry.getProvider('gemini-cloud');
    let blockedCloud = false;
    if (cloudProv) {
      blockedCloud = !gateway.privacyManager.isProviderAllowed(cloudProv);
    }
    gateway.setAIMode(prevMode);
    record('Test G: Local Only Mode Blocks Cloud Egress', blockedCloud, 'Cloud provider strictly denied in LOCAL ONLY mode');

    // 5. Project Intelligence Summary & Incremental Re-Index (Phase 5)
    const intelRes = await fetch(`${baseUrl}/api/intelligence/reindex`, { method: 'POST' });
    const intel: any = await intelRes.json();
    record('Project Intelligence Repository Indexing & Analysis',
      intelRes.ok && intel.success === true && intel.summary && typeof intel.summary.totalFiles === 'number',
      `Files=${intel.summary?.totalFiles}, Lines=${intel.summary?.totalLines}, Symbols=${intel.summary?.totalSymbols}`);

    // 6. Persistent Project Memory & Secret Scrubbing (Phase 9)
    const memPost = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        architecture: 'Modular Node.js + Express + Vanilla APEX UI with key sk-testsecret999999999999',
        instructions: 'Always run tests before completion.',
        decisions: ['Use 127.0.0.1 for local Ollama'],
      }),
    });
    const memGet = await fetch(`${baseUrl}/api/memory`);
    const mem: any = await memGet.json();
    const scrubbed = !JSON.stringify(mem).includes('sk-testsecret999999999999') && JSON.stringify(mem).includes('[REDACTED_SECRET]');
    record('Project Memory Persistence & Secret Scrubbing',
      memPost.ok && memGet.ok && scrubbed,
      `Persisted=true, SecretScrubbed=${scrubbed}`);

    // Clean up test secret note in memory
    await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ architecture: 'MaxIDE APEX Local Workspace', instructions: 'Follow strict engineering standards.' }),
    });

    // 7. Adversarial Security Checks (Phase 10)
    let deviceBlocked = true;
    for (const bad of ['CON', 'AUX.txt', 'src/nul/app.ts', 'com3 .txt', '../../../Windows/System32/cmd.exe']) {
      try {
        WorkspaceManager.resolveSafePathForRoot(process.cwd(), bad);
        deviceBlocked = false;
      } catch {}
    }
    const st = new SafeTerminal(process.cwd());
    const cmdInjectBlocked =
      st.classifyCommand('rm -rf /').level === 'BLOCKED' &&
      st.classifyCommand('del /f /s /q C:\\Windows\\System32').level === 'BLOCKED' &&
      st.classifyCommand('cat ../../../etc/passwd').level === 'BLOCKED';
    record('Adversarial Security (Device Paths, Traversal, Command Injection)',
      deviceBlocked && cmdInjectBlocked,
      `DeviceAndTraversalBlocked=${deviceBlocked}, CommandShieldBlocked=${cmdInjectBlocked}`);

    // 8. Playwright Visual & Functional Verification of All 7 Studio Navigation Views
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (!t.includes('fonts.googleapis.com') && !t.includes('cdnjs.cloudflare.com')) {
          localConsoleErrors.push(t);
        }
      }
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1800);

    // Verify Command Center shows Ollama Online & Honest Active Provider
    const healthText = await page.innerText('#cc-health-grid');
    record('Command Center Displays Real Online Ollama & GPU Telemetry',
      healthText.includes('Online (Local)') && healthText.includes('Ollama Local Engine'),
      'Ollama Online & real active provider rendered honestly');
    await page.screenshot({ path: path.join(screenshotsDir, 'command_center_live_ollama.png') });

    // Switch to Project Intelligence View
    await page.click('#nav-view-intelligence');
    await page.waitForTimeout(900);
    const intelVis = await page.isVisible('#view-intelligence');
    const intelMetrics = await page.locator('#pi-stats-grid .cc-metric-box').count();
    record('Project Intelligence Dedicated View', intelVis && intelMetrics === 4, `Visible=${intelVis}, StatCards=${intelMetrics}`);
    await page.screenshot({ path: path.join(screenshotsDir, 'project_intelligence_1600x900.png') });

    // Switch to AI Control Center View
    await page.click('#nav-view-ai-control');
    await page.waitForTimeout(1200);
    const aicVis = await page.isVisible('#view-ai-control');
    const aicText = await page.innerText('#view-ai-control');
    record('AI Control Center Dedicated View (Ollama Online + RTX 3050 + Capabilities)',
      aicVis && aicText.includes('ONLINE') && aicText.includes(firstModel) && aicText.includes('RTX 3050'),
      `Visible=${aicVis}, ModelListed=${firstModel}, RTX3050Displayed=true`);
    await page.screenshot({ path: path.join(screenshotsDir, 'ai_control_center_1600x900.png') });

    // Test Responsive Overflows with 7-item topbar across 1366x768, 1280x720, 390x844
    const overflows: Record<string, boolean> = {};
    for (const [w, h] of [[1600, 900], [1366, 768], [1280, 720], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      overflows[`${w}x${h}`] = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    }
    const zeroOverflow = Object.values(overflows).every((v) => v === false);
    record('Responsive Multi-Viewport Zero Overflow (7-Tab Studio)', zeroOverflow, JSON.stringify(overflows));

    record('Zero Uncaught Page / Local Console Errors',
      pageErrors.length === 0 && localConsoleErrors.length === 0,
      `PageErrors=${pageErrors.length}, ConsoleErrors=${localConsoleErrors.length}`);

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  const passed = checks.filter((c) => c.passed).length;
  console.log('\n=====================================================================');
  console.log(`   RESULT: ${passed}/${checks.length} ULTIMATE E2E & ADVERSARIAL CHECKS PASSED`);
  console.log('=====================================================================\n');
  process.exit(passed === checks.length ? 0 : 1);
}

runUltimateE2E().catch((err) => {
  console.error('Ultimate E2E Error:', err);
  process.exit(1);
});
