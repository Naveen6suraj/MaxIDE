/**
 * MaxIDE APEX — Mission 7: Comprehensive Adaptive Intelligence & RL Verification Suite
 * Explicitly tests all 14 required verification items (A through N):
 *   A. SQLite Memory Persistence & Reload
 *   B. Similarity-Based Experience Retrieval
 *   C. Contextual Bandit Decisions (UCB1 & Thompson Sampling)
 *   D. Trusted Reward Calculation & Immutable Safety Locks
 *   E. Learning from Successful Verified Tasks
 *   F. Learning from Failed Tasks (Consecutive-Failure Damping & Strategy Shift)
 *   G. User Feedback Handling
 *   H. Strategy / Policy Versioning Snapshots
 *   I. Policy Rollback Restores Exact Prior State
 *   J. Reproducible Offline Evaluation (Proves Strategy Shift Improves Unseen Tasks)
 *   K. Project-Specific Memory Isolation
 *   L. Privacy & Secret Protection (Zero Secrets in SQLite or Exports)
 *   M. Native Windows Desktop Task Planning (Never Substitutes Browser HTML)
 *   N. Self-Directed Application Improvement Planning
 */

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  AdaptiveIntelligenceCoordinator,
  ContextualBandit,
  ExperienceMemory,
  OfflineBenchmarkScenario,
  PolicyGovernance,
  ReasoningDecisionEngine,
  SelfEvaluationEngine,
} from '../intelligence/index.js';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

async function runMission7Tests(): Promise<void> {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maxide-mission7-'));
  const results: TestResult[] = [];

  async function runCase(id: string, name: string, fn: () => Promise<string> | string): Promise<void> {
    const t0 = Date.now();
    try {
      const details = await fn();
      results.push({ id, name, passed: true, details, durationMs: Date.now() - t0 });
      console.log(`  ✅ [${id}] ${name} — ${details}`);
    } catch (err: any) {
      results.push({ id, name, passed: false, details: err.message || String(err), durationMs: Date.now() - t0 });
      console.error(`  ❌ [${id}] ${name} — ${err.message || err}`);
    }
  }

  console.log('\n======================================================================');
  console.log('  MAXIDE APEX — MISSION 7 ADAPTIVE INTELLIGENCE VERIFICATION (A–N)');
  console.log('======================================================================\n');

  // TEST A: Memory persistence & reload across fresh SQLite instances
  await runCase('A', 'SQLite Memory Persistence & Reload', async () => {
    const dbPath = path.join(tmpRoot, 'testA.sqlite');
    const mem1 = new ExperienceMemory(dbPath);
    await mem1.ready();
    mem1.recordEpisode({
      id: 'ep-persist-1',
      projectId: 'proj-alpha',
      taskCategory: 'WEB_APP_BUILD',
      platform: 'WEB_APP',
      prompt: 'Build interactive attendance tracker web app',
      strategyId: 'self-contained-interactive-web-app',
      modelId: 'qwen2.5-coder:3b',
      status: 'COMPLETED',
      verified: true,
      reward: 0.84,
      durationMs: 4200,
      filesChanged: ['index.html'],
      toolFailures: [],
      testPassed: true,
      summary: 'Built verified attendance tracker',
    });
    mem1.upsertSemantic({
      projectId: 'proj-alpha',
      category: 'architecture',
      key: 'frontend_pattern',
      value: 'Single-file HTML5/CSS3/JS with localStorage persistence',
    });
    mem1.recordProcedureOutcome({
      projectId: 'proj-alpha',
      taskCategory: 'WEB_APP_BUILD',
      strategyId: 'self-contained-interactive-web-app',
      procedureName: 'Self-Contained Interactive Web App',
      steps: ['Inspect', 'Build', 'Verify'],
      modelId: 'qwen2.5-coder:3b',
      succeeded: true,
      reward: 0.84,
    });
    mem1.setSetting('learning_enabled', 'true');

    // Open brand-new SQLite instance from disk
    const mem2 = new ExperienceMemory(dbPath);
    await mem2.ready();
    const eps = mem2.getEpisodes({ projectId: 'proj-alpha' });
    const sems = mem2.getSemanticMemory('proj-alpha');
    const procs = mem2.getProcedures('proj-alpha');
    assert.strictEqual(eps.length, 1);
    assert.strictEqual(eps[0].id, 'ep-persist-1');
    assert.strictEqual(eps[0].reward, 0.84);
    assert.strictEqual(sems.length, 1);
    assert.strictEqual(sems[0].key, 'frontend_pattern');
    assert.strictEqual(procs.length, 1);
    assert.strictEqual(procs[0].successCount, 1);
    assert.strictEqual(mem2.getSetting('learning_enabled'), 'true');
    assert.ok(fs.statSync(dbPath).size > 4096, 'SQLite file must be written to disk');
    return `Persisted & reloaded SQLite DB (${fs.statSync(dbPath).size} bytes): 1 episode, 1 semantic, 1 procedural`;
  });

  // TEST B: Similarity-based experience retrieval
  await runCase('B', 'Similarity-Based Experience Retrieval', async () => {
    const dbPath = path.join(tmpRoot, 'testB.sqlite');
    const mem = new ExperienceMemory(dbPath);
    await mem.ready();
    mem.recordEpisode({
      id: 'ep-sim-1',
      projectId: 'proj-sim',
      taskCategory: 'DEBUG_AND_REPAIR',
      platform: 'WEB_APP',
      prompt: 'Fix Express CORS header and SQLite lock error in REST API',
      strategyId: 'reproduce-root-cause-surgical-fix',
      modelId: 'qwen2.5-coder:3b',
      status: 'COMPLETED',
      verified: true,
      reward: 0.9,
      durationMs: 3100,
      filesChanged: ['src/server/index.ts'],
      toolFailures: [],
      testPassed: true,
      summary: 'Fixed CORS and SQLite atomic flush',
    });
    mem.recordEpisode({
      id: 'ep-sim-2',
      projectId: 'proj-sim',
      taskCategory: 'WEB_APP_BUILD',
      platform: 'WEB_APP',
      prompt: 'Build retro neon space shooter canvas arcade game',
      strategyId: 'self-contained-interactive-web-app',
      modelId: 'qwen2.5-coder:3b',
      status: 'COMPLETED',
      verified: true,
      reward: 0.82,
      durationMs: 5000,
      filesChanged: ['game.html'],
      toolFailures: [],
      testPassed: true,
      summary: 'Built neon space shooter game',
    });

    const matches = mem.retrieveSimilarEpisodes('Debug Express REST API SQLite lock bug', {
      projectId: 'proj-sim',
      topK: 2,
    });
    assert.ok(matches.length >= 1, 'Expected at least 1 similar match');
    assert.strictEqual(matches[0].episode.id, 'ep-sim-1', 'SQLite/Express API episode must rank #1');
    assert.ok(matches[0].similarity > 0.25, `Expected strong cosine similarity, got ${matches[0].similarity}`);
    return `Top match "${matches[0].episode.id}" ranked #1 with similarity=${matches[0].similarity}`;
  });

  // TEST C: Contextual Bandit Decisions (UCB1 & Thompson Sampling)
  await runCase('C', 'Contextual Bandit Decisions (UCB1 & Thompson Sampling)', async () => {
    const dbPath = path.join(tmpRoot, 'testC.sqlite');
    const mem = new ExperienceMemory(dbPath);
    await mem.ready();
    const bandit = new ContextualBandit(mem, { algorithm: 'UCB1', deterministicSeed: 77 });
    const ctx = { taskCategory: 'WEB_APP_BUILD', platform: 'WEB_APP', modelTier: 'local-small' as const };
    const candidates = ['strat-weak', 'strat-strong'];

    // Train arms: strat-strong succeeds consistently, strat-weak fails consistently
    for (let i = 0; i < 6; i++) {
      bandit.recordOutcome(ctx, 'strat-strong', 0.88, true);
      bandit.recordOutcome(ctx, 'strat-weak', -0.45, false);
    }

    const ucbPick = bandit.selectStrategy(ctx, candidates);
    assert.strictEqual(ucbPick.selectedStrategyId, 'strat-strong', 'UCB1 must select strat-strong');

    bandit.setAlgorithm('THOMPSON_SAMPLING');
    bandit.setDeterministicMode(true, 99);
    const tsPick1 = bandit.selectStrategy(ctx, candidates);
    bandit.setDeterministicMode(true, 99);
    const tsPick2 = bandit.selectStrategy(ctx, candidates);
    assert.strictEqual(tsPick1.selectedStrategyId, 'strat-strong', 'Thompson Sampling must select strat-strong');
    assert.deepStrictEqual(tsPick1.scores, tsPick2.scores, 'Deterministic seeded mode must reproduce identical scores');
    return `UCB1 picked ${ucbPick.selectedStrategyId} (${ucbPick.scores[0].score}); Thompson Sampling deterministic & picked ${tsPick1.selectedStrategyId}`;
  });

  // TEST D: Trusted Reward Calculation & Immutable Safety Locks
  await runCase('D', 'Trusted Reward Calculation & Immutable Safety Locks', async () => {
    const dbPath = path.join(tmpRoot, 'testD.sqlite');
    const mem = new ExperienceMemory(dbPath);
    await mem.ready();
    const evaluator = new SelfEvaluationEngine(mem);
    const gov = new PolicyGovernance();

    // Immutable safety checks
    assert.strictEqual(gov.canModifyCoreSystemInstructions(), false);
    assert.strictEqual(gov.canModifySecurityPolicies(), false);
    assert.strictEqual(gov.canAgentManipulateOwnReward(), false);

    // 1. Speed alone with ZERO evidence must NEVER be rewarded positively
    const fastFake = evaluator.evaluate({
      episodeId: 'ep-fast-fake',
      projectId: 'p1',
      requirementCoverageEstimate: 0.9,
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
        falseCompletionClaimed: true,
        repeatedFailureCount: 0,
        durationMs: 250, // Ultra fast!
      },
    });
    assert.strictEqual(fastFake.status, 'FAILED');
    assert.ok(fastFake.reward < 0, `Speed-only false completion must have negative reward, got ${fastFake.reward}`);

    // 2. Security violation heavily penalized
    const secFail = evaluator.evaluate({
      episodeId: 'ep-sec-fail',
      projectId: 'p1',
      requirementCoverageEstimate: 1.0,
      evidence: {
        toolsExecutedCount: 3,
        filesInspected: ['a.ts'],
        filesModified: ['a.ts'],
        commandsExecuted: ['npm test'],
        buildAttempted: true,
        buildPassed: true,
        testsAttempted: true,
        testsRun: 5,
        testsPassed: 5,
        browserOrAppVerified: true,
        securityViolationDetected: true,
        destructiveUnauthorizedAttempt: false,
        falseCompletionClaimed: false,
        repeatedFailureCount: 0,
        durationMs: 2000,
      },
    });
    assert.strictEqual(secFail.status, 'FAILED');
    assert.ok(secFail.reward <= -0.8, `Security violation must be heavily penalized, got ${secFail.reward}`);

    // 3. Verified build + passing tests + coverage earns high positive reward
    const verifiedOk = evaluator.evaluate({
      episodeId: 'ep-ok',
      projectId: 'p1',
      requirementCoverageEstimate: 0.95,
      evidence: {
        toolsExecutedCount: 5,
        filesInspected: ['src/app.ts'],
        filesModified: ['src/app.ts'],
        commandsExecuted: ['npm run build', 'npm test'],
        buildAttempted: true,
        buildPassed: true,
        testsAttempted: true,
        testsRun: 12,
        testsPassed: 12,
        browserOrAppVerified: true,
        securityViolationDetected: false,
        destructiveUnauthorizedAttempt: false,
        falseCompletionClaimed: false,
        repeatedFailureCount: 0,
        durationMs: 9000,
      },
    });
    assert.strictEqual(verifiedOk.status, 'COMPLETED');
    assert.strictEqual(verifiedOk.verified, true);
    assert.ok(verifiedOk.reward >= 0.75, `Verified success should earn >=0.75 reward, got ${verifiedOk.reward}`);
    return `fastFake=${fastFake.reward}, securityViolation=${secFail.reward}, verifiedSuccess=+${verifiedOk.reward}`;
  });

  // TEST E: Learning from Successful Verified Tasks
  await runCase('E', 'Learning from Successful Verified Tasks', async () => {
    const dbPath = path.join(tmpRoot, 'testE.sqlite');
    const ws = path.join(tmpRoot, 'wsE');
    fs.mkdirSync(ws, { recursive: true });
    const coord = new AdaptiveIntelligenceCoordinator(dbPath);
    await coord.ready();

    const plan = coord.planTask({
      prompt: 'Build an interactive expense tracker web application',
      workspacePath: ws,
      modelId: 'qwen2.5-coder:3b',
    });
    const res = coord.completeAndLearn({
      plan,
      modelId: 'qwen2.5-coder:3b',
      requirementCoverageEstimate: 0.95,
      summary: 'Created interactive expense tracker with chart and localStorage',
      evidence: {
        toolsExecutedCount: 4,
        filesInspected: [],
        filesModified: ['index.html'],
        commandsExecuted: ['node -c app.js'],
        buildAttempted: false,
        buildPassed: false,
        testsAttempted: true,
        testsRun: 3,
        testsPassed: 3,
        browserOrAppVerified: true,
        securityViolationDetected: false,
        destructiveUnauthorizedAttempt: false,
        falseCompletionClaimed: false,
        repeatedFailureCount: 0,
        durationMs: 6500,
      },
    });
    assert.strictEqual(res.learningRecorded, true);
    assert.strictEqual(res.evaluation.status, 'COMPLETED');
    const arm = coord.bandit.getArm(res.contextKey, res.strategyId);
    assert.strictEqual(arm.pulls, 1);
    assert.strictEqual(arm.successes, 1);
    assert.ok(arm.meanReward > 0.6);
    return `Recorded verified episode ${res.episodeId}, strategy=${res.strategyId}, arm pulls=${arm.pulls}, meanReward=+${arm.meanReward}`;
  });

  // TEST F: Learning from Failed Tasks (Consecutive-Failure Damping & Strategy Shift)
  await runCase('F', 'Learning from Failed Tasks (Strategy Shift Away from Failure)', async () => {
    const dbPath = path.join(tmpRoot, 'testF.sqlite');
    const ws = path.join(tmpRoot, 'wsF');
    fs.mkdirSync(ws, { recursive: true });
    const coord = new AdaptiveIntelligenceCoordinator(dbPath, { algorithm: 'UCB1', deterministicSeed: 12 });
    await coord.ready();

    const firstPlan = coord.planTask({
      prompt: 'Build a responsive portfolio web app with project gallery',
      workspacePath: ws,
      modelId: 'qwen2.5-coder:3b',
    });
    const initialStrategy = firstPlan.selectedStrategy.id;

    // Simulate 3 consecutive verified failures on initialStrategy
    for (let i = 0; i < 3; i++) {
      coord.completeAndLearn({
        plan: firstPlan,
        modelId: 'qwen2.5-coder:3b',
        requirementCoverageEstimate: 0.0,
        summary: 'Failed build and tests',
        evidence: {
          toolsExecutedCount: 2,
          filesInspected: [],
          filesModified: ['index.html'],
          commandsExecuted: ['npm test'],
          buildAttempted: true,
          buildPassed: false,
          testsAttempted: true,
          testsRun: 4,
          testsPassed: 0,
          browserOrAppVerified: false,
          securityViolationDetected: false,
          destructiveUnauthorizedAttempt: false,
          falseCompletionClaimed: false,
          repeatedFailureCount: 2,
          durationMs: 4000,
        },
      });
    }

    const nextPlan = coord.planTask({
      prompt: 'Build a responsive portfolio web app with project gallery',
      workspacePath: ws,
      modelId: 'qwen2.5-coder:3b',
    });
    assert.notStrictEqual(
      nextPlan.selectedStrategy.id,
      initialStrategy,
      `After 3 consecutive failures on ${initialStrategy}, bandit must shift to an alternative strategy`
    );
    return `Shifted strategy from failing "${initialStrategy}" -> "${nextPlan.selectedStrategy.id}"`;
  });

  // TEST G: User Feedback Handling
  await runCase('G', 'User Feedback Handling Updates Episode & Bandit', async () => {
    const dbPath = path.join(tmpRoot, 'testG.sqlite');
    const ws = path.join(tmpRoot, 'wsG');
    fs.mkdirSync(ws, { recursive: true });
    const coord = new AdaptiveIntelligenceCoordinator(dbPath);
    await coord.ready();

    const plan = coord.planTask({ prompt: 'Build markdown notes web app', workspacePath: ws, modelId: 'qwen2.5-coder:3b' });
    const res = coord.completeAndLearn({
      plan,
      modelId: 'qwen2.5-coder:3b',
      requirementCoverageEstimate: 0.85,
      summary: 'Built markdown notes app',
      evidence: {
        toolsExecutedCount: 3,
        filesInspected: [],
        filesModified: ['index.html'],
        commandsExecuted: [],
        buildAttempted: false,
        buildPassed: false,
        testsAttempted: false,
        testsRun: 0,
        testsPassed: 0,
        browserOrAppVerified: true,
        securityViolationDetected: false,
        destructiveUnauthorizedAttempt: false,
        falseCompletionClaimed: false,
        repeatedFailureCount: 0,
        durationMs: 3000,
      },
    });
    const beforeReward = res.evaluation.reward;
    const fb = coord.recordUserFeedback(res.episodeId, plan.projectId, -1, 'Layout overlapped on mobile');
    assert.ok(fb.updatedReward !== undefined && fb.updatedReward < beforeReward, 'Negative feedback must decrease episode reward');
    const arm = coord.bandit.getArm(res.contextKey, res.strategyId);
    assert.strictEqual(arm.pulls, 2, 'Bandit arm must reflect explicit feedback update');
    return `Episode reward adjusted ${beforeReward.toFixed(2)} -> ${fb.updatedReward!.toFixed(2)}, arm pulls=${arm.pulls}`;
  });

  // TEST H & I: Policy Versioning Snapshots & Exact Rollback
  await runCase('H', 'Policy Versioning Snapshots', async () => {
    const dbPath = path.join(tmpRoot, 'testHI.sqlite');
    const coord = new AdaptiveIntelligenceCoordinator(dbPath);
    await coord.ready();
    const ctx = { taskCategory: 'DEBUG_AND_REPAIR', platform: 'WEB_APP', modelTier: 'local-small' as const };
    coord.bandit.recordOutcome(ctx, 'reproduce-root-cause-surgical-fix', 0.9, true);
    const v1 = coord.bandit.createPolicyVersion('Good v1 snapshot', 0.9, coord.evaluator.getWeights(), true);
    const versions = coord.bandit.getPolicyVersions();
    assert.ok(versions.some((v) => v.versionId === v1.versionId && v.isActive), 'v1 must be saved and active');
    return `Created versioned policy snapshot ${v1.versionId} (total versions=${versions.length})`;
  });

  await runCase('I', 'Policy Rollback Restores Exact Prior State', async () => {
    const dbPath = path.join(tmpRoot, 'testHI.sqlite');
    const coord = new AdaptiveIntelligenceCoordinator(dbPath);
    await coord.ready();
    const ctx = { taskCategory: 'DEBUG_AND_REPAIR', platform: 'WEB_APP', modelTier: 'local-small' as const };
    const ctxKey = ContextualBandit.buildContextKey(ctx);
    const vGood = coord.bandit.getPolicyVersions().find((v) => v.notes === 'Good v1 snapshot');
    assert.ok(vGood, 'Expected Good v1 snapshot');

    // Mutate policy badly and switch algorithm
    coord.setBanditAlgorithm('THOMPSON_SAMPLING');
    coord.bandit.recordOutcome(ctx, 'defensive-guard-and-fallback-patch', -0.9, false);
    coord.bandit.createPolicyVersion('Bad v2 snapshot', -0.5, coord.evaluator.getWeights(), true);
    assert.strictEqual(coord.bandit.getArm(ctxKey, 'defensive-guard-and-fallback-patch').pulls, 1);

    // Rollback to vGood
    const rb = coord.bandit.rollbackPolicy(vGood!.versionId);
    assert.strictEqual(rb.success, true);
    assert.strictEqual(coord.bandit.getAlgorithm(), 'UCB1', 'Rollback must restore prior algorithm');
    assert.strictEqual(coord.bandit.getArm(ctxKey, 'defensive-guard-and-fallback-patch').pulls, 0, 'Rollback must clear post-snapshot arm pulls');
    assert.strictEqual(coord.bandit.getArm(ctxKey, 'reproduce-root-cause-surgical-fix').pulls, 1, 'Rollback must restore prior arm pulls');
    return `Rolled back cleanly to ${vGood!.versionId}: restored algorithm=UCB1 and exact arm state`;
  });

  // TEST J: Reproducible Offline Evaluation Proving Strategy Shifts Improve Unseen Tasks
  await runCase('J', 'Reproducible Offline Evaluation (Proves Measurable Improvement)', async () => {
    const dbPath = path.join(tmpRoot, 'testJ.sqlite');
    const coord = new AdaptiveIntelligenceCoordinator(dbPath, { algorithm: 'UCB1', deterministicSeed: 1337 });
    await coord.ready();

    // Training experiences across 4 distinct engineering contexts (real observed outcomes)
    const trainOutcomes: Array<{ ctx: any; strat: string; reward: number; ok: boolean }> = [
      // Web local-small: self-contained beats heavy vite scaffold
      { ctx: { taskCategory: 'WEB_APP_BUILD', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'vite-typescript-spa', reward: -0.20, ok: false },
      { ctx: { taskCategory: 'WEB_APP_BUILD', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'vite-typescript-spa', reward: -0.15, ok: false },
      { ctx: { taskCategory: 'WEB_APP_BUILD', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'self-contained-interactive-web-app', reward: 0.86, ok: true },
      { ctx: { taskCategory: 'WEB_APP_BUILD', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'self-contained-interactive-web-app', reward: 0.88, ok: true },
      { ctx: { taskCategory: 'WEB_APP_BUILD', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'modular-multi-file-web-app', reward: 0.62, ok: true },
      // Native Windows: csc WinForms beats Electron overhead
      { ctx: { taskCategory: 'NATIVE_DESKTOP_BUILD', platform: 'NATIVE_WINDOWS', modelTier: 'local-small' }, strat: 'native-electron-node', reward: -0.15, ok: false },
      { ctx: { taskCategory: 'NATIVE_DESKTOP_BUILD', platform: 'NATIVE_WINDOWS', modelTier: 'local-small' }, strat: 'native-electron-node', reward: -0.10, ok: false },
      { ctx: { taskCategory: 'NATIVE_DESKTOP_BUILD', platform: 'NATIVE_WINDOWS', modelTier: 'local-small' }, strat: 'native-winforms-csc', reward: 0.90, ok: true },
      { ctx: { taskCategory: 'NATIVE_DESKTOP_BUILD', platform: 'NATIVE_WINDOWS', modelTier: 'local-small' }, strat: 'native-winforms-csc', reward: 0.86, ok: true },
      { ctx: { taskCategory: 'NATIVE_DESKTOP_BUILD', platform: 'NATIVE_WINDOWS', modelTier: 'local-small' }, strat: 'native-wpf-dotnet', reward: 0.50, ok: true },
      // Debug repair: root-cause beats defensive band-aid
      { ctx: { taskCategory: 'DEBUG_AND_REPAIR', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'defensive-guard-and-fallback-patch', reward: 0.05, ok: false },
      { ctx: { taskCategory: 'DEBUG_AND_REPAIR', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'defensive-guard-and-fallback-patch', reward: 0.10, ok: false },
      { ctx: { taskCategory: 'DEBUG_AND_REPAIR', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'reproduce-root-cause-surgical-fix', reward: 0.92, ok: true },
      { ctx: { taskCategory: 'DEBUG_AND_REPAIR', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'reproduce-root-cause-surgical-fix', reward: 0.89, ok: true },
      // Self-directed improvement: quality loop beats shallow polish
      { ctx: { taskCategory: 'SELF_DIRECTED_IMPROVEMENT', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'incremental-ux-polish-pass', reward: 0.25, ok: false },
      { ctx: { taskCategory: 'SELF_DIRECTED_IMPROVEMENT', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'incremental-ux-polish-pass', reward: 0.30, ok: false },
      { ctx: { taskCategory: 'SELF_DIRECTED_IMPROVEMENT', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'self-directed-quality-loop', reward: 0.87, ok: true },
      { ctx: { taskCategory: 'SELF_DIRECTED_IMPROVEMENT', platform: 'WEB_APP', modelTier: 'local-small' }, strat: 'self-directed-quality-loop', reward: 0.85, ok: true },
    ];
    for (const t of trainOutcomes) {
      coord.bandit.recordOutcome(t.ctx, t.strat, t.reward, t.ok);
    }

    const unseenBench: OfflineBenchmarkScenario[] = coord.improver.buildDefaultOfflineScenarios();
    const eval1 = coord.improver.runOfflineEvaluation(unseenBench, { seed: 2026, promoteIfApproved: true });
    const eval2 = coord.improver.runOfflineEvaluation(unseenBench, { seed: 2026, promoteIfApproved: false });

    assert.strictEqual(eval1.approved, true, `Expected governance approval, got: ${eval1.reason}`);
    assert.ok(eval1.strategyShiftCount >= 3, `Expected strategy shifts based on evidence, got ${eval1.strategyShiftCount}`);
    assert.ok(eval1.candidateMeanReward > eval1.baselineMeanReward, 'Learned policy MUST achieve higher mean reward than baseline');
    assert.ok(eval1.candidateCompletionRate > eval1.baselineCompletionRate, 'Learned policy MUST achieve higher verified completion rate than baseline');
    assert.strictEqual(eval1.candidateMeanReward, eval2.candidateMeanReward, 'Deterministic offline eval must be 100% reproducible');

    // Verify governance blocks regressive policy candidates
    const rejectRegress = coord.governance.approvePolicyUpdate({
      baselineScore: 0.8,
      candidateScore: 0.5,
      evaluatedTasks: 10,
    });
    assert.strictEqual(rejectRegress.approved, false, 'Governance MUST reject regressive candidate');

    return `Baseline reward=${eval1.baselineMeanReward} (${eval1.baselineCompletionRate}% ok) -> Learned=${eval1.candidateMeanReward} (${eval1.candidateCompletionRate}% ok), shifts=${eval1.strategyShiftCount}/${eval1.sampleSize}, Δ=+${eval1.rewardDelta}`;
  });

  // TEST K: Project-Specific Memory Isolation
  await runCase('K', 'Project-Specific Memory Isolation', async () => {
    const dbPath = path.join(tmpRoot, 'testK.sqlite');
    const mem = new ExperienceMemory(dbPath);
    await mem.ready();
    mem.recordEpisode({
      id: 'ep-projA',
      projectId: 'project-alpha',
      taskCategory: 'BACKEND_API',
      platform: 'BACKEND_SERVICE',
      prompt: 'Configure Stripe webhook endpoint in Project Alpha',
      strategyId: 'modular-node-ts-sqlite-service',
      modelId: 'qwen2.5-coder:3b',
      status: 'COMPLETED',
      verified: true,
      reward: 0.85,
      durationMs: 3000,
      filesChanged: ['alpha.ts'],
      toolFailures: [],
      testPassed: true,
      summary: 'Alpha webhook config',
    });
    mem.upsertSemantic({
      projectId: 'project-alpha',
      category: 'decision',
      key: 'db_engine',
      value: 'Project Alpha uses PostgreSQL',
    });

    const bEpisodes = mem.retrieveSimilarEpisodes('Configure Stripe webhook endpoint', { projectId: 'project-beta' });
    const bSemantic = mem.getSemanticMemory('project-beta');
    assert.strictEqual(bEpisodes.length, 0, 'Project Alpha episodes must NEVER leak into Project Beta isolated queries');
    assert.strictEqual(bSemantic.length, 0, 'Project Alpha semantic memory must NEVER leak into Project Beta');
    return 'Zero cross-project leakage across isolated episodic & semantic queries';
  });

  // TEST L: Privacy & Secret Protection
  await runCase('L', 'Privacy & Secret Protection (SQLite + Export Scrubbing)', async () => {
    const dbPath = path.join(tmpRoot, 'testL.sqlite');
    const mem = new ExperienceMemory(dbPath);
    await mem.ready();

    const leakedSecrets = [
      'sk-proj-99887766554433221100AABBCC',
      'AIzaSyDummySecretKey1234567890ABCDEF',
      'ghp_SuperSecretGitHubToken1234567890',
      'SuperSecretPass123!',
    ];

    mem.recordEpisode({
      id: 'ep-secret',
      projectId: 'proj-sec',
      taskCategory: 'BACKEND_API',
      platform: 'BACKEND_SERVICE',
      prompt: `Deploy API with api_key=${leakedSecrets[0]} and password=${leakedSecrets[3]} and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig`,
      strategyId: 'modular-node-ts-sqlite-service',
      modelId: 'qwen2.5-coder:3b',
      status: 'COMPLETED',
      verified: true,
      reward: 0.8,
      durationMs: 2500,
      filesChanged: ['server.ts'],
      toolFailures: [],
      testPassed: true,
      summary: `Used ${leakedSecrets[1]} and ${leakedSecrets[2]}`,
    });

    const exportedJson = JSON.stringify(mem.exportBackup());
    const rawDiskBuf = fs.readFileSync(dbPath).toString('utf8');
    for (const secret of leakedSecrets) {
      assert.strictEqual(exportedJson.includes(secret), false, `Export leaked secret: ${secret}`);
      assert.strictEqual(rawDiskBuf.includes(secret), false, `SQLite disk file leaked secret: ${secret}`);
    }
    assert.ok(exportedJson.includes('[REDACTED_'), 'Sanitized placeholder markers must be present');
    return 'All 4 credential types + Bearer JWT scrubbed before SQLite write and export';
  });

  // TEST M: Native Windows Desktop Task Planning
  await runCase('M', 'Native Windows Desktop Task Planning (Zero Browser HTML Substitution)', async () => {
    const dbPath = path.join(tmpRoot, 'testM.sqlite');
    const ws = path.join(tmpRoot, 'wsM');
    fs.mkdirSync(ws, { recursive: true });
    const coord = new AdaptiveIntelligenceCoordinator(dbPath);
    await coord.ready();

    const plan = coord.planTask({
      prompt: 'Build a native Windows desktop inventory management application (.exe) with local storage',
      workspacePath: ws,
      modelId: 'qwen2.5-coder:3b',
    });

    assert.strictEqual(plan.analysis.targetPlatform, 'NATIVE_WINDOWS');
    assert.strictEqual(plan.analysis.taskCategory, 'NATIVE_DESKTOP_BUILD');
    assert.strictEqual(plan.selectedStrategy.targetPlatform, 'NATIVE_WINDOWS');
    assert.ok(
      ['native-winforms-csc', 'native-wpf-dotnet'].includes(plan.selectedStrategy.id),
      `Expected native Windows strategy, got ${plan.selectedStrategy.id}`
    );
    assert.ok(plan.candidates.length >= 3, 'Must compare multiple native desktop architectures');
    assert.ok(
      plan.promptGuidance.includes('Do NOT substitute a browser-only HTML file'),
      'Prompt guidance must explicitly prohibit browser HTML substitution'
    );
    return `Classified ${plan.analysis.targetPlatform}, compared ${plan.candidates.length} native desktop options, selected "${plan.selectedStrategy.id}"`;
  });

  // TEST N: Self-Directed Application Improvement Planning
  await runCase('N', 'Self-Directed Application Improvement Planning', async () => {
    const dbPath = path.join(tmpRoot, 'testN.sqlite');
    const ws = path.join(tmpRoot, 'wsN');
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, 'index.html'), '<!doctype html><html><body><h1>Existing App</h1></body></html>', 'utf8');
    const coord = new AdaptiveIntelligenceCoordinator(dbPath);
    await coord.ready();

    const plan = coord.planTask({
      prompt: 'Improve this application until it meets quality standards',
      workspacePath: ws,
      modelId: 'qwen2.5-coder:3b',
    });

    assert.strictEqual(plan.analysis.taskCategory, 'SELF_DIRECTED_IMPROVEMENT');
    assert.strictEqual(plan.selectedStrategy.id, 'self-directed-quality-loop');
    assert.ok(plan.orderedStages.length >= 6, 'Self-directed quality loop must include inspect -> launch -> audit -> prioritize -> patch -> regress -> re-inspect');
    assert.ok(
      plan.orderedStages.some((s) => /inspect/i.test(s)) &&
      plan.orderedStages.some((s) => /audit/i.test(s)) &&
      plan.orderedStages.some((s) => /prioritize/i.test(s)) &&
      plan.orderedStages.some((s) => /regression|regress/i.test(s)),
      'Missing required self-directed engineering loop stages'
    );
    assert.ok(plan.promptGuidance.includes('preserve the application'), 'Must preserve existing app identity');
    return `Selected "${plan.selectedStrategy.id}" with ${plan.orderedStages.length} ordered self-directed stages`;
  });

  // Cleanup temp dir
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}

  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n----------------------------------------------------------------------');
  console.log(`  MISSION 7 SUMMARY: ${passedCount}/${results.length} PASSED`);
  console.log('----------------------------------------------------------------------\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runMission7Tests().catch((err) => {
  console.error('Fatal Mission 7 test runner error:', err);
  process.exit(1);
});
