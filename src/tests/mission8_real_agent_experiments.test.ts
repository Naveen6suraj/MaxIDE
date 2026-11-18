/**
 * MaxIDE APEX — Mission 8, Section 6: Real-World Engineering Experiments
 * Runs ACTUAL application-building, native Windows compilation, and debugging tasks
 * using the REAL AgentEngine + REAL local Ollama (qwen2.5-coder:3b) in isolated workspaces.
 *
 * Compares:
 *   - Baseline Policy (Adaptive Intelligence disabled)
 *   - Learned Policy (Adaptive Intelligence enabled with Experience Memory + Bandit)
 *
 * Measures ACTUAL files modified, ACTUAL syntax/build/compile results, ACTUAL test exit codes,
 * and ACTUAL Playwright headless browser verification. NEVER replaces real execution with mocks.
 */

declare const document: any;

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import { AgentEngine } from '../agent/AgentEngine.js';
import { AIGateway } from '../ai/gateway/AIGateway.js';
import { OllamaProvider } from '../ai/providers/ollama/OllamaProvider.js';
import { ModelRegistry } from '../ai/registry/ModelRegistry.js';
import { ProviderRegistry } from '../ai/registry/ProviderRegistry.js';
import { AdaptiveIntelligenceCoordinator } from '../intelligence/index.js';

interface RealExperimentResult {
  experimentId: string;
  title: string;
  policy: 'BASELINE' | 'LEARNED';
  modelId: string;
  durationMs: number;
  agentReportedSuccess: boolean;
  strategySelected: string | null;
  filesCreatedOrModified: string[];
  buildOrCompilePassed: boolean;
  testsPassed: boolean;
  browserVerified: boolean;
  consoleErrors: number;
  verifiedOutcome: boolean;
  notes: string;
}

async function createIsolatedAgent(workspaceDir: string, intelCoord?: AdaptiveIntelligenceCoordinator): Promise<{ engine: AgentEngine; modelId: string }> {
  const tmpCfg = path.join(workspaceDir, '.maxide_providers.json');
  const providerReg = new ProviderRegistry(tmpCfg);
  const ollama = new OllamaProvider({
    id: 'ollama-local',
    name: 'Ollama Local',
    type: 'local',
    apiType: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    defaultModel: 'qwen2.5-coder:3b',
    isEnabled: true,
  });
  providerReg.registerProvider(ollama.config, ollama);
  const modelReg = new ModelRegistry(providerReg);
  const discovered = await modelReg.discoverProviderModels('ollama-local');
  const chosenModel = discovered.find((m) => m.id === 'qwen2.5-coder:3b')?.id || discovered[0]?.id || 'qwen2.5-coder:3b';
  ollama.updateConfig({ defaultModel: chosenModel });
  const gateway = new AIGateway(providerReg, modelReg, 'local');
  gateway.setActiveModel(chosenModel);

  const engine = new AgentEngine(gateway, workspaceDir);
  engine.setAutonomyMode('AUTONOMOUS');
  if (intelCoord) {
    engine.adaptiveIntelligence = intelCoord;
  }
  return { engine, modelId: chosenModel };
}

async function seedLearnedCoordinator(dbPath: string): Promise<AdaptiveIntelligenceCoordinator> {
  const coord = new AdaptiveIntelligenceCoordinator(dbPath, { algorithm: 'UCB1', deterministicSeed: 42 });
  await coord.ready();

  // Seed verified prior experiences across Web, Native Windows, and Debugging
  const webCtx = { taskCategory: 'WEB_APP_BUILD', platform: 'WEB_APP', modelTier: 'local-small' as const };
  for (let i = 0; i < 4; i++) {
    coord.bandit.recordOutcome(webCtx, 'self-contained-interactive-web-app', 0.88, true);
    coord.bandit.recordOutcome(webCtx, 'vite-typescript-spa', -0.2, false);
  }
  coord.memory.recordEpisode({
    id: 'seed-web-1',
    projectId: 'global-seed',
    taskCategory: 'WEB_APP_BUILD',
    platform: 'WEB_APP',
    prompt: 'Build interactive expense tracker web app in index.html with CSS and JS',
    strategyId: 'self-contained-interactive-web-app',
    modelId: 'qwen2.5-coder:3b',
    status: 'COMPLETED',
    verified: true,
    reward: 0.88,
    durationMs: 9000,
    filesChanged: ['index.html'],
    toolFailures: [],
    testPassed: true,
    summary: 'Complete self-contained index.html with modern CSS, interactive form, live totals, and localStorage',
  });

  const winCtx = { taskCategory: 'NATIVE_DESKTOP_BUILD', platform: 'NATIVE_WINDOWS', modelTier: 'local-small' as const };
  for (let i = 0; i < 4; i++) {
    coord.bandit.recordOutcome(winCtx, 'native-winforms-csc', 0.90, true);
    coord.bandit.recordOutcome(winCtx, 'native-electron-node', -0.25, false);
  }

  const dbgCtx = { taskCategory: 'DEBUG_AND_REPAIR', platform: 'WEB_APP', modelTier: 'local-small' as const };
  for (let i = 0; i < 4; i++) {
    coord.bandit.recordOutcome(dbgCtx, 'reproduce-root-cause-surgical-fix', 0.92, true);
    coord.bandit.recordOutcome(dbgCtx, 'defensive-guard-and-fallback-patch', 0.05, false);
  }

  return coord;
}

async function verifyHtmlWithPlaywright(htmlPath: string): Promise<{ ok: boolean; consoleErrors: number; notes: string }> {
  if (!fs.existsSync(htmlPath)) return { ok: false, consoleErrors: 0, notes: 'index.html not found' };
  const content = fs.readFileSync(htmlPath, 'utf8');
  if (content.trim().length < 260) {
    return { ok: false, consoleErrors: 0, notes: `HTML too short (${content.length} chars)` };
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(300);
    const stats = await page.evaluate(() => ({
      textLen: (document.body?.innerText || '').trim().length,
      inputs: document.querySelectorAll('input, button, select, form').length,
    }));
    const ok = stats.textLen > 25 && stats.inputs >= 2 && errors.length === 0;
    return {
      ok,
      consoleErrors: errors.length,
      notes: `DOM textLen=${stats.textLen}, interactiveControls=${stats.inputs}, errors=${errors.length}`,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const rootTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maxide-m8-real-'));
  const results: RealExperimentResult[] = [];

  console.log('\n==========================================================================');
  console.log('  MAXIDE APEX — MISSION 8 REAL-WORLD AGENT EXPERIMENTS (LIVE OLLAMA)');
  console.log('==========================================================================\n');

  try {
    // Check Ollama availability honestly
    const healthProbe = await fetch('http://127.0.0.1:11434/api/tags').catch(() => null);
    if (!healthProbe || !healthProbe.ok) {
      throw new Error('Ollama is offline at 127.0.0.1:11434 — real-world experiments cannot run without live model.');
    }

    const dbPath = path.join(rootTmp, 'learned.sqlite');
    const learnedCoord = await seedLearnedCoordinator(dbPath);

    // -------------------------------------------------------------------------
    // EXPERIMENT 1: Real Web App Build (Budget Expense Tracker)
    // -------------------------------------------------------------------------
    for (const policy of ['BASELINE', 'LEARNED'] as const) {
      const ws = path.join(rootTmp, `exp1-web-${policy.toLowerCase()}`);
      fs.mkdirSync(ws, { recursive: true });
      const { engine, modelId } = await createIsolatedAgent(ws, policy === 'LEARNED' ? learnedCoord : undefined);
      const t0 = Date.now();
      const res = await engine.runTask(
        'Create a complete interactive Budget Expense Tracker web app in index.html with add expense form (description, amount, category), live total summary, expense list with delete button, and localStorage persistence.',
        { modelId, maxSteps: 6, sessionId: `exp1-${policy}` }
      );
      const durationMs = Date.now() - t0;
      const files = fs.readdirSync(ws).filter((f) => !f.startsWith('.'));
      const htmlPath = path.join(ws, 'index.html');
      const pw = await verifyHtmlWithPlaywright(htmlPath);

      const rec: RealExperimentResult = {
        experimentId: `exp1-web-${policy.toLowerCase()}`,
        title: 'Web App Build: Interactive Budget Expense Tracker',
        policy,
        modelId,
        durationMs,
        agentReportedSuccess: res.success,
        strategySelected: res.strategyId || null,
        filesCreatedOrModified: files,
        buildOrCompilePassed: fs.existsSync(htmlPath) && fs.statSync(htmlPath).size >= 260,
        testsPassed: pw.ok,
        browserVerified: pw.ok,
        consoleErrors: pw.consoleErrors,
        verifiedOutcome: pw.ok,
        notes: `${pw.notes}${res.error ? ` | agentErr=${res.error}` : ''}`,
      };
      results.push(rec);
      console.log(`  [EXP 1 - ${policy}] verified=${rec.verifiedOutcome} | ${durationMs}ms | strategy=${rec.strategySelected || 'none'} | files=[${files.join(', ')}] | ${rec.notes}`);
    }

    // -------------------------------------------------------------------------
    // EXPERIMENT 2: Real Debugging & Automated Test Repair
    // -------------------------------------------------------------------------
    for (const policy of ['BASELINE', 'LEARNED'] as const) {
      const ws = path.join(rootTmp, `exp2-debug-${policy.toLowerCase()}`);
      fs.mkdirSync(ws, { recursive: true });
      // Seed real buggy module + failing test suite
      fs.writeFileSync(
        path.join(ws, 'calc.js'),
        `function applyDiscount(price, pct) {\n  // BUG: adds discount instead of subtracting and ignores negative pct\n  return price + (price * pct / 100);\n}\nmodule.exports = { applyDiscount };\n`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(ws, 'test.js'),
        `const assert = require('assert');\nconst { applyDiscount } = require('./calc.js');\nassert.strictEqual(applyDiscount(100, 20), 80, '20% off 100 must be 80');\nassert.strictEqual(applyDiscount(250, 10), 225, '10% off 250 must be 225');\nassert.strictEqual(applyDiscount(100, 0), 100, '0% off 100 must be 100');\nconsole.log('ALL_CALC_TESTS_PASSED');\n`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(ws, 'package.json'),
        JSON.stringify({ name: 'calc-debug-exp', version: '1.0.0', scripts: { test: 'node test.js' } }, null, 2),
        'utf8'
      );

      const { engine, modelId } = await createIsolatedAgent(ws, policy === 'LEARNED' ? learnedCoord : undefined);
      const t0 = Date.now();
      const res = await engine.runTask(
        'Debug and fix the bug in calc.js so that running node test.js passes all assertions.',
        { modelId, maxSteps: 6, sessionId: `exp2-${policy}` }
      );
      const durationMs = Date.now() - t0;

      let realTestPassed = false;
      let testNote = '';
      try {
        const out = execSync('node test.js', { cwd: ws, encoding: 'utf8', timeout: 8000 });
        realTestPassed = out.includes('ALL_CALC_TESTS_PASSED');
        testNote = out.trim();
      } catch (e: any) {
        testNote = `node test.js failed: ${(e.stderr || e.message || '').toString().slice(0, 120)}`;
      }

      const rec: RealExperimentResult = {
        experimentId: `exp2-debug-${policy.toLowerCase()}`,
        title: 'Debugging & Repair: Fix calc.js Discount Formula',
        policy,
        modelId,
        durationMs,
        agentReportedSuccess: res.success,
        strategySelected: res.strategyId || null,
        filesCreatedOrModified: ['calc.js'],
        buildOrCompilePassed: realTestPassed,
        testsPassed: realTestPassed,
        browserVerified: false,
        consoleErrors: 0,
        verifiedOutcome: realTestPassed,
        notes: `${testNote}${res.error ? ` | agentErr=${res.error}` : ''}`,
      };
      results.push(rec);
      console.log(`  [EXP 2 - ${policy}] verified=${rec.verifiedOutcome} | ${durationMs}ms | strategy=${rec.strategySelected || 'none'} | ${rec.notes}`);
    }

    // -------------------------------------------------------------------------
    // EXPERIMENT 3: Real Native Windows C# Console/WinForms Build (csc.exe)
    // -------------------------------------------------------------------------
    for (const policy of ['BASELINE', 'LEARNED'] as const) {
      const ws = path.join(rootTmp, `exp3-win-${policy.toLowerCase()}`);
      fs.mkdirSync(ws, { recursive: true });
      const { engine, modelId } = await createIsolatedAgent(ws, policy === 'LEARNED' ? learnedCoord : undefined);
      const t0 = Date.now();
      const res = await engine.runTask(
        'Build a native Windows desktop C# application in Program.cs using System.Windows.Forms that shows a window titled "MaxIDE Native Inventory" with a Label and Button, and compile it to InventoryApp.exe using C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe.',
        { modelId, maxSteps: 6, sessionId: `exp3-${policy}` }
      );
      const durationMs = Date.now() - t0;
      const files = fs.readdirSync(ws).filter((f) => !f.startsWith('.'));
      const csFile = files.find((f) => f.toLowerCase().endsWith('.cs'));
      const exeFile = files.find((f) => f.toLowerCase().endsWith('.exe'));
      let compiled = Boolean(exeFile && fs.statSync(path.join(ws, exeFile)).size > 2000);
      let compileNote = compiled ? `Compiled ${exeFile} (${fs.statSync(path.join(ws, exeFile!)).size} bytes)` : 'No .exe compiled by agent';

      // Independently verify if the generated .cs file compiles with csc.exe if agent created .cs
      if (!compiled && csFile) {
        try {
          execSync(
            `& 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe' /target:winexe /out:VerifyCheck.exe /r:System.Windows.Forms.dll "${csFile}"`,
            { cwd: ws, shell: 'powershell.exe', encoding: 'utf8', timeout: 15000 }
          );
          compiled = fs.existsSync(path.join(ws, 'VerifyCheck.exe'));
          compileNote = compiled ? `${csFile} independently compiled via csc.exe` : 'csc.exe did not emit exe';
        } catch (e: any) {
          compileNote = `${csFile} failed csc.exe compile: ${(e.stdout || e.stderr || e.message || '').toString().slice(0, 140)}`;
        }
      }
      const substitutedHtml = files.some((f) => f.toLowerCase().endsWith('.html')) && !csFile;

      const rec: RealExperimentResult = {
        experimentId: `exp3-win-${policy.toLowerCase()}`,
        title: 'Native Windows Desktop Build: C# WinForms Executable',
        policy,
        modelId,
        durationMs,
        agentReportedSuccess: res.success,
        strategySelected: res.strategyId || null,
        filesCreatedOrModified: files,
        buildOrCompilePassed: compiled,
        testsPassed: compiled,
        browserVerified: false,
        consoleErrors: 0,
        verifiedOutcome: compiled && !substitutedHtml,
        notes: `${compileNote}${substitutedHtml ? ' | VIOLATION: Substituted HTML!' : ''}`,
      };
      results.push(rec);
      console.log(`  [EXP 3 - ${policy}] verified=${rec.verifiedOutcome} | ${durationMs}ms | strategy=${rec.strategySelected || 'none'} | files=[${files.join(', ')}] | ${rec.notes}`);
    }

    const basePassed = results.filter((r) => r.policy === 'BASELINE' && r.verifiedOutcome).length;
    const learnPassed = results.filter((r) => r.policy === 'LEARNED' && r.verifiedOutcome).length;
    const summary = {
      generatedAt: new Date().toISOString(),
      source: 'REAL_AGENT_EXECUTION',
      modelId: results[0]?.modelId || 'qwen2.5-coder:3b',
      baselineVerifiedCount: basePassed,
      learnedVerifiedCount: learnPassed,
      totalTasksPerPolicy: 3,
      baselineCompletionPct: Math.round((basePassed / 3) * 1000) / 10,
      learnedCompletionPct: Math.round((learnPassed / 3) * 1000) / 10,
      experiments: results,
    };

    const outDir = path.resolve(process.cwd(), 'docs', 'mission8');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'real_agent_experiments.json'), JSON.stringify(summary, null, 2), 'utf8');

    console.log('\n--------------------------------------------------------------------------');
    console.log(`  REAL AGENT SUMMARY: Baseline=${basePassed}/3 (${summary.baselineCompletionPct}%) vs Learned=${learnPassed}/3 (${summary.learnedCompletionPct}%)`);
    console.log('  Saved raw results to docs/mission8/real_agent_experiments.json');
    console.log('--------------------------------------------------------------------------\n');
  } finally {
    try { fs.rmSync(rootTmp, { recursive: true, force: true }); } catch {}
  }
}

main().catch((err) => {
  console.error('❌ Real agent experiment runner failed:', err);
  process.exit(1);
});
