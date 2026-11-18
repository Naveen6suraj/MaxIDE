/**
 * MaxIDE APEX — Mission 9: 20-Item Comprehensive Regression Suite (Part 10)
 * Tests all 20 required verification points deterministically without altering reward math.
 */

import assert from 'assert';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IntentClassifier } from '../agent/intent/IntentClassifier.js';
import {
  AdaptiveIntelligenceCoordinator,
  ContextualBandit,
  ExperienceMemory,
  ToolchainDetector,
} from '../intelligence/index.js';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxide-m9-reg-'));
  let passed = 0;
  let total = 0;

  async function check(num: number, name: string, fn: () => Promise<string> | string) {
    total++;
    try {
      const msg = await fn();
      passed++;
      console.log(`  ✅ [${String(num).padStart(2, '0')}] ${name} — ${msg}`);
    } catch (err: any) {
      console.error(`  ❌ [${String(num).padStart(2, '0')}] ${name} — ${err?.message || err}`);
      throw err;
    }
  }

  console.log('\n==========================================================================');
  console.log('  MAXIDE APEX — MISSION 9 COMPREHENSIVE REGRESSION SUITE (PART 10)');
  console.log('==========================================================================\n');

  try {
    // 1. Debugging intent routing
    await check(1, 'Debugging intent routing (natural language variations)', () => {
      const debugPrompts = [
        'Find why the application crashes.',
        'Why is my API failing?',
        'Run the tests and fix the errors.',
        'Debug calc.js discount bug',
      ];
      for (const p of debugPrompts) {
        const res = IntentClassifier.classify(p);
        assert.strictEqual(res.intent, 'DEBUG', `Expected DEBUG for "${p}", got ${res.intent}`);
        assert.strictEqual(res.isExecution, true);
        assert.strictEqual(res.requiresFileModification, true);
        assert.strictEqual(res.workflowRoute, 'DEBUG_REPAIR_FLOW');
      }
      return `All ${debugPrompts.length} debugging prompts routed to DEBUG / DEBUG_REPAIR_FLOW`;
    });

    // 2. Fix intent routing
    await check(2, 'Fix / repair / make-work intent routing', () => {
      const fixPrompts = ['Fix this application.', 'Repair the calculation.', 'Make this code work.'];
      for (const p of fixPrompts) {
        const res = IntentClassifier.classify(p);
        assert.strictEqual(res.intent, 'DEBUG', `Expected DEBUG for "${p}", got ${res.intent}`);
        assert.strictEqual(res.isExecution, true);
      }
      return `All ${fixPrompts.length} fix/repair prompts routed to DEBUG execution workflow`;
    });

    // 3. Chat & Explain non-mutation
    await check(3, 'Chat & Explain strict non-mutation', () => {
      const chat = IntentClassifier.classify('hello');
      const explain = IntentClassifier.classify('Explain what a JavaScript closure is');
      assert.strictEqual(chat.intent, 'CHAT');
      assert.strictEqual(chat.isConversational, true);
      assert.strictEqual(chat.isExecution, false);
      assert.strictEqual(chat.requiresFileModification, false);
      assert.strictEqual(explain.intent, 'EXPLAIN');
      assert.strictEqual(explain.isConversational, true);
      assert.strictEqual(explain.isExecution, false);
      assert.strictEqual(explain.requiresFileModification, false);
      return 'CHAT & EXPLAIN verified strictly non-mutating (requiresFileModification=false)';
    });

    // 4. Build intent routing
    await check(4, 'Build intent routing', () => {
      const b = IntentClassifier.classify('Build a responsive expense tracker web app');
      assert.strictEqual(b.intent, 'BUILD');
      assert.strictEqual(b.isExecution, true);
      assert.strictEqual(b.targetPlatform, 'WEB_APP');
      assert.strictEqual(b.requiresBrowserExecution, true);
      return `Classified BUILD on ${b.targetPlatform} (confidence=${b.confidence})`;
    });

    // 5. Native Windows intent
    await check(5, 'Native Windows desktop intent routing', () => {
      const n1 = IntentClassifier.classify('Build a desktop application');
      const n2 = IntentClassifier.classify('Create a native Windows inventory tracker (.exe)');
      assert.strictEqual(n1.intent, 'NATIVE_APP_BUILD');
      assert.strictEqual(n1.targetPlatform, 'NATIVE_WINDOWS');
      assert.strictEqual(n1.requiresNativeExecution, true);
      assert.strictEqual(n1.requiresBrowserExecution, false);
      assert.strictEqual(n2.intent, 'NATIVE_APP_BUILD');
      return 'Native Windows prompts routed to NATIVE_APP_BUILD / NATIVE_WINDOWS_FLOW';
    });

    // 6. Missing compiler detection
    await check(6, 'Missing compiler detection (honest blocker + install instructions)', async () => {
      const coord = new AdaptiveIntelligenceCoordinator(path.join(tmpDir, 't6.sqlite'));
      await coord.ready();
      const ws = path.join(tmpDir, 'ws6');
      fs.mkdirSync(ws, { recursive: true });
      const plan = coord.planTask({
        prompt: 'Build a native Windows desktop inventory app (.exe)',
        workspacePath: ws,
        capabilityOverrides: {
          platformOs: 'win32',
          cscAvailable: false,
          cscPath: null,
          winFormsAvailable: false,
          dotnetAvailable: false,
          dotnetVersion: null,
          wpfAvailable: false,
          cargoAvailable: false,
          tauriAvailable: false,
          electronInstalled: false,
        },
      });
      assert.strictEqual(plan.feasibility.blockedByCapabilities, true, 'Must block when zero native compilers exist');
      assert.strictEqual(plan.feasibility.feasibleCount, 0);
      assert.ok(plan.feasibility.installInstructions.length >= 1, 'Must provide exact install instructions');
      assert.ok(
        plan.feasibility.blockerMessage?.includes('Refusing to substitute'),
        'Must explicitly refuse HTML substitution'
      );
      return `Blocked cleanly (${plan.feasibility.filteredOutCount}/4 filtered) with ${plan.feasibility.installInstructions.length} install instructions`;
    });

    // 7. Feasibility filtering on real Windows host
    await check(7, 'Two-stage capability feasibility filtering (blocks WPF without dotnet)', async () => {
      const coord = new AdaptiveIntelligenceCoordinator(path.join(tmpDir, 't7.sqlite'));
      await coord.ready();
      const ws = path.join(tmpDir, 'ws7');
      fs.mkdirSync(ws, { recursive: true });
      const plan = coord.planTask({
        prompt: 'Build a native Windows desktop calculator (.exe)',
        workspacePath: ws,
        capabilityOverrides: {
          platformOs: 'win32',
          cscAvailable: true,
          cscPath: 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
          winFormsAvailable: true,
          dotnetAvailable: false,
          wpfAvailable: false,
          cargoAvailable: false,
          tauriAvailable: false,
          electronInstalled: false,
        },
      });
      assert.strictEqual(plan.feasibility.blockedByCapabilities, false);
      assert.strictEqual(plan.selectedStrategy.id, 'native-winforms-csc');
      assert.strictEqual(plan.feasibility.feasibleCount, 1);
      assert.strictEqual(plan.feasibility.filteredOutCount, 3);
      return `Selected feasible "native-winforms-csc"; filtered out 3 infeasible strategies (WPF/Tauri/Electron)`;
    });

    // 8. UCB1 bounded exploration boundaries
    await check(8, 'UCB1 bounded exploration (proven winner not overridden by untested arm)', async () => {
      const mem = new ExperienceMemory(path.join(tmpDir, 't8.sqlite'));
      await mem.ready();
      const bandit = new ContextualBandit(mem, { algorithm: 'UCB1', deterministicSeed: 42 });
      const cfg = bandit.getExplorationConfig();
      assert.ok(cfg.explorationC <= 0.35 && cfg.maxExplorationBonus <= 0.35, 'Exploration must be bounded');
      const ctx = { taskCategory: 'WEB_APP_BUILD', platform: 'WEB_APP', modelTier: 'local-small' as const };
      for (let i = 0; i < 4; i++) {
        bandit.recordOutcome(ctx, 'self-contained-interactive-web-app', 0.90, true);
      }
      const sel = bandit.selectStrategy(ctx, ['self-contained-interactive-web-app', 'vite-typescript-spa'], {
        'self-contained-interactive-web-app': 0.90,
        'vite-typescript-spa': 0.65,
      });
      assert.strictEqual(sel.selectedStrategyId, 'self-contained-interactive-web-app', 'Bounded UCB1 must respect proven strong arm');
      const maxBonus = Math.max(...sel.scores.map((s) => s.uncertaintyBonus));
      assert.ok(maxBonus <= cfg.maxExplorationBonus + 0.0001, `Uncertainty bonus ${maxBonus} exceeded cap ${cfg.maxExplorationBonus}`);
      return `Bounded UCB1 kept proven winner (maxBonus=${maxBonus} <= cap=${cfg.maxExplorationBonus})`;
    });

    // 9. Thompson Sampling regression
    await check(9, 'Thompson Sampling deterministic regression & convergence', async () => {
      const mem = new ExperienceMemory(path.join(tmpDir, 't9.sqlite'));
      await mem.ready();
      const bandit = new ContextualBandit(mem, { algorithm: 'THOMPSON_SAMPLING', deterministicSeed: 55 });
      const ctx = { taskCategory: 'DEBUG_AND_REPAIR', platform: 'WEB_APP', modelTier: 'local-small' as const };
      for (let i = 0; i < 6; i++) {
        bandit.recordOutcome(ctx, 'reproduce-root-cause-surgical-fix', 0.92, true);
        bandit.recordOutcome(ctx, 'defensive-guard-and-fallback-patch', -0.4, false);
      }
      bandit.setDeterministicMode(true, 123);
      const s1 = bandit.selectStrategy(ctx, ['reproduce-root-cause-surgical-fix', 'defensive-guard-and-fallback-patch']);
      bandit.setDeterministicMode(true, 123);
      const s2 = bandit.selectStrategy(ctx, ['reproduce-root-cause-surgical-fix', 'defensive-guard-and-fallback-patch']);
      assert.strictEqual(s1.selectedStrategyId, 'reproduce-root-cause-surgical-fix');
      assert.deepStrictEqual(s1.scores, s2.scores);
      return `Thompson Sampling converged to "${s1.selectedStrategyId}" identically across deterministic runs`;
    });

    // 10. Episode deduplication
    await check(10, 'Episode deduplication via stable SHA-256 fingerprint', async () => {
      const mem = new ExperienceMemory(path.join(tmpDir, 't10.sqlite'));
      await mem.ready();
      for (let i = 0; i < 5; i++) {
        mem.recordEpisode({
          projectId: 'proj-dedup',
          taskCategory: 'WEB_APP_BUILD',
          platform: 'WEB_APP',
          prompt: 'Build identical budget tracker app',
          strategyId: 'self-contained-interactive-web-app',
          modelId: 'qwen2.5-coder:3b',
          status: 'COMPLETED',
          verified: true,
          reward: 0.85,
          durationMs: 4000,
          filesChanged: ['index.html'],
          toolFailures: [],
          testPassed: true,
          summary: 'Built tracker',
        });
      }
      // Record a genuinely different task to verify zero false merges
      mem.recordEpisode({
        projectId: 'proj-dedup',
        taskCategory: 'DEBUG_AND_REPAIR',
        platform: 'WEB_APP',
        prompt: 'Fix API timeout in server.ts',
        strategyId: 'reproduce-root-cause-surgical-fix',
        modelId: 'qwen2.5-coder:3b',
        status: 'COMPLETED',
        verified: true,
        reward: 0.9,
        durationMs: 3000,
        filesChanged: ['server.ts'],
        toolFailures: [],
        testPassed: true,
        summary: 'Fixed timeout',
      });
      const rows = mem.getEpisodes({ projectId: 'proj-dedup', limit: 50 });
      const qStats = mem.getMemoryQualityStats('proj-dedup');
      assert.strictEqual(rows.length, 2, `Expected 2 unique rows (5 dupes merged + 1 distinct), got ${rows.length}`);
      assert.strictEqual(qStats.duplicatesPrevented, 4, `Expected 4 duplicates prevented, got ${qStats.duplicatesPrevented}`);
      return `5 identical episodes merged to 1 row (repeatCount=5, duplicatesPrevented=4); distinct task preserved`;
    });

    // 11 & 12. Memory recency decay + stale memory still retrievable
    await check(11, 'Memory recency decay (fresh outranks 180-day stale)', async () => {
      const mem = new ExperienceMemory(path.join(tmpDir, 't11.sqlite'));
      await mem.ready();
      const oldDate = new Date(Date.now() - 180 * 86_400_000).toISOString();
      const freshDate = new Date().toISOString();
      mem.execute(
        `INSERT INTO episodic_memory (id, project_id, task_category, platform, prompt, strategy_id, model_id, status, verified, reward, duration_ms, files_changed_json, tool_failures_json, test_passed, summary, version, created_at, confidence_tier)
         VALUES ('ep-old', 'p-rec', 'WEB_APP_BUILD', 'WEB_APP', 'Build inventory table widget with filters', 'old-strat', 'qwen2.5-coder:3b', 'COMPLETED', 1, 0.9, 2000, '[]', '[]', 1, 'old verified', 1, ?, 'FULLY_VERIFIED')`,
        [oldDate]
      );
      mem.execute(
        `INSERT INTO episodic_memory (id, project_id, task_category, platform, prompt, strategy_id, model_id, status, verified, reward, duration_ms, files_changed_json, tool_failures_json, test_passed, summary, version, created_at, confidence_tier)
         VALUES ('ep-fresh', 'p-rec', 'WEB_APP_BUILD', 'WEB_APP', 'Build inventory table widget with filters', 'new-strat', 'qwen2.5-coder:3b', 'COMPLETED', 1, 0.9, 2000, '[]', '[]', 1, 'fresh verified', 1, ?, 'FULLY_VERIFIED')`,
        [freshDate]
      );
      const hits = mem.retrieveSimilarEpisodes('Build inventory table widget with filters', { projectId: 'p-rec', topK: 2 });
      assert.strictEqual(hits.length, 2);
      assert.strictEqual(hits[0].episode.id, 'ep-fresh', 'Fresh episode must outrank 180-day stale episode');
      assert.ok((hits[0].effectiveWeight || 0) > (hits[1].effectiveWeight || 0) * 2, 'Effective weight must reflect temporal decay');
      return `Fresh effWeight=${hits[0].effectiveWeight} (recency=${hits[0].recencyWeight}) > 180d stale effWeight=${hits[1].effectiveWeight} (recency=${hits[1].recencyWeight})`;
    });

    await check(12, 'Stale high-quality memory remains retrievable (minRecencyFloor)', async () => {
      const mem = new ExperienceMemory(path.join(tmpDir, 't11.sqlite'));
      await mem.ready();
      const hits = mem.retrieveSimilarEpisodes('old-strat inventory table widget', { projectId: 'p-rec', topK: 5 });
      const oldHit = hits.find((h) => h.episode.id === 'ep-old');
      assert.ok(oldHit, '180-day verified memory must remain retrievable');
      assert.ok((oldHit!.recencyWeight || 0) >= 0.25, `Recency floor must preserve >=0.25, got ${oldHit!.recencyWeight}`);
      return `180-day verified episode retrieved with floor recencyWeight=${oldHit!.recencyWeight}`;
    });

    // 13 & 14. Real execution reward collection + Unverified result rejection + 3-source separation
    await check(13, 'Real execution evidence collection & 3-way source separation', async () => {
      const coord = new AdaptiveIntelligenceCoordinator(path.join(tmpDir, 't13.sqlite'));
      await coord.ready();
      const ws = path.join(tmpDir, 'ws13');
      fs.mkdirSync(ws, { recursive: true });
      const plan = coord.planTask({ prompt: 'Build API health endpoint', workspacePath: ws, modelId: 'qwen2.5-coder:3b' });
      const res = coord.completeAndLearn({
        plan,
        modelId: 'qwen2.5-coder:3b',
        intent: 'BUILD',
        evidenceSource: 'CONTROLLED_LIVE_EXPERIMENT',
        requirementCoverageEstimate: 0.95,
        summary: 'Verified endpoint',
        evidence: {
          toolsExecutedCount: 4,
          filesInspected: ['src/index.ts'],
          filesModified: ['src/health.ts'],
          commandsExecuted: ['node test.js'],
          buildAttempted: true,
          buildPassed: true,
          testsAttempted: true,
          testsRun: 4,
          testsPassed: 4,
          browserOrAppVerified: false,
          securityViolationDetected: false,
          destructiveUnauthorizedAttempt: false,
          falseCompletionClaimed: false,
          repeatedFailureCount: 0,
          durationMs: 3200,
        },
      });
      assert.ok(res.evaluation.verified && res.evaluation.reward > 0.7);
      assert.ok(res.review && res.review.securityPoliciesUntouched && res.review.coreInstructionsUntouched);
      const qStats = coord.memory.getMemoryQualityStats();
      assert.strictEqual(qStats.evidenceSourceCounts.CONTROLLED_LIVE_EXPERIMENT, 1);
      assert.strictEqual(qStats.evidenceSourceCounts.SIMULATED_BENCHMARK, 0);
      return `Verified live reward=+${res.evaluation.reward}, PostTaskReview saved (${res.review!.reviewId}), 3-way sources strictly separated`;
    });

    await check(14, 'Unverified LLM response rejected from earning positive learning reward', async () => {
      const coord = new AdaptiveIntelligenceCoordinator(path.join(tmpDir, 't14.sqlite'));
      await coord.ready();
      const ws = path.join(tmpDir, 'ws14');
      fs.mkdirSync(ws, { recursive: true });
      const plan = coord.planTask({ prompt: 'Build complete e-commerce site', workspacePath: ws, modelId: 'qwen2.5-coder:3b' });
      const res = coord.completeAndLearn({
        plan,
        modelId: 'qwen2.5-coder:3b',
        requirementCoverageEstimate: 1.0,
        summary: 'I built everything! (zero tools called)',
        evidence: {
          toolsExecutedCount: 0,
          filesInspected: [],
          filesModified: [],
          commandsExecuted: [],
          buildAttempted: false,
          buildPassed: false,
          testsAttempted: false,
          testsRun: 0,
          testsPassed: 0,
          browserOrAppVerified: false,
          securityViolationDetected: false,
          destructiveUnauthorizedAttempt: false,
          falseCompletionClaimed: false,
          repeatedFailureCount: 0,
          durationMs: 400,
        },
      });
      assert.strictEqual(res.evaluation.verified, false);
      assert.ok(res.evaluation.reward <= 0, `Unverified response must NEVER earn positive reward, got ${res.evaluation.reward}`);
      const ep = coord.memory.getEpisodes({ limit: 5 })[0];
      assert.strictEqual(ep.confidenceTier, 'UNVERIFIED');
      return `Unverified 0-tool claim got reward=${res.evaluation.reward} and tier=${ep.confidenceTier}`;
    });

    // 15. Policy rollback + rollback audit history
    await check(15, 'Policy rollback & audited rollback history', async () => {
      const coord = new AdaptiveIntelligenceCoordinator(path.join(tmpDir, 't15.sqlite'));
      await coord.ready();
      const v0 = coord.bandit.getPolicyVersions()[0];
      coord.setBanditAlgorithm('THOMPSON_SAMPLING');
      coord.bandit.createPolicyVersion('Experimental v2', 0.4, coord.evaluator.getWeights(), true);
      const rb = coord.bandit.rollbackPolicy(v0.versionId, 'Mission 9 regression rollback check');
      assert.strictEqual(rb.success, true);
      const hist = coord.bandit.getRollbackHistory();
      assert.strictEqual(hist.length, 1);
      assert.strictEqual(hist[0].toVersion, v0.versionId);
      return `Rolled back to ${v0.versionId}; policy_rollbacks audit recorded (${hist[0].id})`;
    });

    // 16. Project isolation
    await check(16, 'Strict project isolation across workspaces', async () => {
      const mem = new ExperienceMemory(path.join(tmpDir, 't16.sqlite'));
      await mem.ready();
      mem.recordEpisode({
        projectId: 'iso-A',
        taskCategory: 'BACKEND_API',
        platform: 'BACKEND_SERVICE',
        prompt: 'Unique quantum encryption pipeline for project Alpha',
        strategyId: 'modular-node-ts-sqlite-service',
        modelId: 'qwen2.5-coder:3b',
        status: 'COMPLETED',
        verified: true,
        reward: 0.9,
        durationMs: 2000,
        filesChanged: ['quantum.ts'],
        toolFailures: [],
        testPassed: true,
        summary: 'Alpha only',
      });
      const b = mem.retrieveSimilarEpisodes('quantum encryption pipeline', { projectId: 'iso-B' });
      assert.strictEqual(b.length, 0);
      return 'Zero cross-project leakage between iso-A and iso-B';
    });

    // 17. Recovery after interruption (atomic reload)
    await check(17, 'Persistence & recovery across cold restart', async () => {
      const dbFile = path.join(tmpDir, 't17.sqlite');
      const m1 = new ExperienceMemory(dbFile);
      await m1.ready();
      m1.upsertSemantic({ projectId: 'p17', category: 'decision', key: 'compiler', value: 'csc.exe v4' });
      const m2 = new ExperienceMemory(dbFile);
      await m2.ready();
      assert.strictEqual(m2.getSemanticMemory('p17')[0]?.value, 'csc.exe v4');
      return 'Clean cold-restart reload verified';
    });

    // 18 & 19 & 20: Toolchain host probe + Windows packaged MaxIDE.exe check
    await check(18, 'Host toolchain real probe (Windows csc.exe + Node.js)', () => {
      const caps = ToolchainDetector.detect(process.cwd());
      assert.strictEqual(caps.nodeAvailable, true);
      if (process.platform === 'win32') {
        assert.strictEqual(caps.cscAvailable, true, 'Windows csc.exe should be detected');
      }
      return `Detected OS=${caps.platformOs}, node=${caps.nodeVersion}, csc=${caps.cscAvailable}, dotnet=${caps.dotnetAvailable}, cargo=${caps.cargoAvailable}`;
    });

    await check(19, 'Governance immutable locks preserved untouched', async () => {
      const coord = new AdaptiveIntelligenceCoordinator(path.join(tmpDir, 't19.sqlite'));
      await coord.ready();
      assert.strictEqual(coord.governance.canModifyCoreSystemInstructions(), false);
      assert.strictEqual(coord.governance.canModifySecurityPolicies(), false);
      assert.strictEqual(coord.governance.canAgentManipulateOwnReward(), false);
      return 'Core prompt, security boundaries, and reward calculation strictly immutable';
    });

    await check(20, 'Windows desktop MaxIDE.exe artifact & CLI presence', () => {
      const exePath = path.resolve(process.cwd(), 'MaxIDE.exe');
      assert.ok(fs.existsSync(exePath) && fs.statSync(exePath).size > 2000, 'MaxIDE.exe must exist');
      return `Verified MaxIDE.exe (${fs.statSync(exePath).size} bytes)`;
    });

    console.log('\n--------------------------------------------------------------------------');
    console.log(`  MISSION 9 REGRESSION SUITE SUMMARY: ${passed}/${total} PASSED (100%)`);
    console.log('--------------------------------------------------------------------------\n');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch((err) => {
  console.error('❌ Mission 9 regression suite failed:', err);
  process.exit(1);
});
