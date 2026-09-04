/**
 * MaxIDE - Production Persistence, Recovery & Multi-Day Continuity Test Suite
 * 
 * Validates:
 * - Test B: Close and reopen state preservation
 * - Test C: Three-day simulation & "Continue where we left off"
 * - Test D: External user file modifications detected & preserved
 * - Test E: Clarification persistence across restarts
 * - Test F: Model unavailable handling & safe prompt selection
 * - Test G: Data location isolation (%APPDATA% & %LOCALAPPDATA%)
 * - Atomic storage corruption resilience & quarantine
 * - Named manual snapshots creation & safe restore
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { AtomicStorage } from '../storage/AtomicStorage.js';
import { ProjectManager } from '../projects/ProjectManager.js';
import { ConversationStore } from '../agent/conversation/ConversationStore.js';
import { CheckpointManager } from '../agent/checkpoint/CheckpointManager.js';
import { ClarificationGate } from '../agent/ClarificationGate.js';
import { RecoveryManager } from '../agent/recovery/RecoveryManager.js';
import { AgentEngine } from '../agent/AgentEngine.js';
import { AIGateway } from '../ai/gateway/AIGateway.js';
import { ProviderRegistry } from '../ai/registry/ProviderRegistry.js';
import { ModelRegistry } from '../ai/registry/ModelRegistry.js';
import { PathManager } from '../config/PathManager.js';

async function runPersistenceRecoveryTests() {
  console.log('\n======================================================');
  console.log('   MAXIDE PERSISTENCE & RECOVERY ACCEPTANCE SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✕ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Isolated Test Environment
  const testRoot = path.join(os.tmpdir(), `maxide-persist-audit-${Date.now()}`);
  const testUserData = path.join(testRoot, 'Roaming', 'MaxIDE');
  const testAgentData = path.join(testRoot, 'Local', 'MaxIDE');
  const testWorkspace = path.join(testRoot, 'Workspace', 'WeatherApp');

  fs.mkdirSync(testUserData, { recursive: true });
  fs.mkdirSync(testAgentData, { recursive: true });
  fs.mkdirSync(testWorkspace, { recursive: true });

  process.env.MAXIDE_DATA_DIR = testUserData;
  process.env.MAXIDE_AGENT_DIR = testAgentData;

  // ----------------------------------------------------
  // TEST G: Data Location Isolation
  // ----------------------------------------------------
  console.log('[TEST G: Data Location Isolation]');
  const pathMgr = PathManager.getInstance();
  pathMgr.ensureDirectories();

  assert(pathMgr.userDataDir.includes(testUserData), 'User persistent state mapped to isolated %APPDATA%/MaxIDE target');
  assert(pathMgr.agentDataDir.includes(testAgentData), 'Runtime checkpoints mapped to isolated %LOCALAPPDATA%/MaxIDE target');
  assert(!pathMgr.userDataDir.includes('scratch'), 'User data is NOT inside Antigravity scratch directory');
  assert(!pathMgr.userDataDir.includes('release'), 'User data is NOT inside installation directory');

  // ----------------------------------------------------
  // Atomic Storage & Corruption Quarantine Test
  // ----------------------------------------------------
  console.log('\n[Atomic Storage & Corruption Quarantine]');
  const sampleFile = path.join(testUserData, 'test-atomic.json');
  AtomicStorage.atomicWriteJsonSync(sampleFile, { key: 'value', apiKey: 'secret-123456789' }, { sanitize: true });

  const readBack = AtomicStorage.safeReadJsonSync<any>(sampleFile, {});
  assert(readBack.key === 'value', 'Atomic storage wrote and read valid JSON');
  assert(readBack.apiKey.includes('[REDACTED]'), 'Sensitive apiKey token sanitized before persistence');
  assert(readBack._schemaVersion === 1, 'Schema version 1 embedded automatically');

  // Corrupt file intentionally
  fs.writeFileSync(sampleFile, 'INVALID_JSON_CORRUPTED_{{{', 'utf8');
  const fallbackRead = AtomicStorage.safeReadJsonSync(sampleFile, { fallback: true });
  assert(fallbackRead.fallback === true, 'Corrupted file safely returned fallback without crashing');
  const corruptedFiles = fs.readdirSync(testUserData).filter(f => f.includes('.corrupt.'));
  assert(corruptedFiles.length > 0, 'Corrupted file safely quarantined for diagnostics');

  // ----------------------------------------------------
  // TEST B: Close and Reopen State Preservation
  // ----------------------------------------------------
  console.log('\n[TEST B: Close and Reopen State Preservation]');
  const projMgr1 = new ProjectManager(path.join(testUserData, 'projects.json'));
  const convStore1 = new ConversationStore(path.join(testUserData, 'conversations'));

  const proj = projMgr1.createProject({
    name: 'WeatherApp',
    folders: [testWorkspace],
    modelId: 'qwen2.5-coder:0.5b',
    providerId: 'ollama-local',
    autonomyMode: 'AUTONOMOUS',
  });

  const conv = convStore1.createConversation({
    projectId: proj.id,
    taskPrompt: 'Build modern weather dashboard',
    modelId: 'qwen2.5-coder:0.5b',
    providerId: 'ollama-local',
    autonomyMode: 'AUTONOMOUS',
  });

  conv.taskStatus = 'COMPLETED';
  conv.filesChanged = ['index.html', 'app.js', 'style.css'];
  conv.finalSummary = 'Created clean weather dashboard with temperature display and search.';
  convStore1.saveConversation(conv);

  // Reopen simulated MaxIDE instance
  const projMgr2 = new ProjectManager(path.join(testUserData, 'projects.json'));
  const convStore2 = new ConversationStore(path.join(testUserData, 'conversations'));

  const loadedProj = projMgr2.getProject(proj.id);
  assert(Boolean(loadedProj), 'Project persisted and reloaded across restart');
  assert(loadedProj?.name === 'WeatherApp', 'Project name preserved');
  assert(loadedProj?.modelId === 'qwen2.5-coder:0.5b', 'Configured model preserved');
  assert(loadedProj?.providerId === 'ollama-local', 'Configured provider preserved');

  const loadedConv = convStore2.getConversation(conv.id);
  assert(Boolean(loadedConv), 'Conversation persisted and reloaded across restart');
  assert(loadedConv?.taskStatus === 'COMPLETED', 'Task status preserved');
  assert(loadedConv?.filesChanged?.length === 3, 'Files changed history preserved');

  // "What did we do last time?" simulation
  const providerRegistry = new ProviderRegistry();
  const modelRegistry = new ModelRegistry(providerRegistry);
  const gateway = new AIGateway(providerRegistry, modelRegistry);
  const engine = new AgentEngine(gateway, testWorkspace);
  engine.setConversationStore(convStore2);

  const recapOutcome = await engine.processMessage('What did we do last time?');
  assert(recapOutcome.actionType === 'conversation', 'Recognized session inquiry intent');
  assert(recapOutcome.answer.includes('WeatherApp') || recapOutcome.answer.includes('weather'), 'Session recap summarizes previous task');
  assert(recapOutcome.answer.includes('index.html'), 'Session recap references files worked on');

  // ----------------------------------------------------
  // TEST C: Three-Day Simulation
  // ----------------------------------------------------
  console.log('\n[TEST C: Three-Day Simulation & Multi-Day Continuity]');
  // Simulate task created 3 days ago by safely modifying updatedAt timestamp
  const threeDaysAgoMs = Date.now() - (3 * 24 * 60 * 60 * 1000);
  const threeDaysAgoDate = new Date(threeDaysAgoMs).toISOString();

  const oldConv = convStore2.createConversation({
    projectId: proj.id,
    taskPrompt: 'Implement shopping cart module',
    modelId: 'qwen2.5-coder:0.5b',
  });
  oldConv.taskStatus = 'INTERRUPTED';
  oldConv.createdAt = threeDaysAgoDate;
  oldConv.updatedAt = threeDaysAgoDate;
  oldConv.timestamps = {
    created: threeDaysAgoDate,
    lastActivity: threeDaysAgoDate,
  };
  convStore2.saveConversation(oldConv, true, true);

  const grouped = convStore2.getGroupedByDate(proj.id);
  const threeDayGroup = grouped.find(g => g.group === '3 days ago');
  assert(Boolean(threeDayGroup), 'Conversation correctly categorized under "3 days ago" grouping');
  assert(threeDayGroup?.conversations.some(c => c.id === oldConv.id) === true, 'Old conversation appears in historical group');

  // Test "Continue where we left off"
  const checkpointMgr = new CheckpointManager(testWorkspace, path.join(testAgentData, 'checkpoints'));
  const recoveryMgr = new RecoveryManager(convStore2, projMgr2, checkpointMgr, engine);
  engine.setRecoveryManager(recoveryMgr);

  const recoverable = convStore2.getLatestRecoverableTask(proj.id);
  assert(recoverable?.id === oldConv.id, 'Identified correct interrupted task from 3 days ago');

  // ----------------------------------------------------
  // TEST D: User Edits File While MaxIDE is Closed
  // ----------------------------------------------------
  console.log('\n[TEST D: User Edits File While MaxIDE is Closed]');
  // 1. MaxIDE creates baseline file and checkpoint
  const appJsPath = path.join(testWorkspace, 'app.js');
  fs.writeFileSync(appJsPath, 'console.log("Original MaxIDE code");', 'utf8');
  const cp = await checkpointMgr.createCheckpoint('Before Interruption', { projectId: proj.id });
  oldConv.lastCheckpointId = cp.id;
  convStore2.saveConversation(oldConv, true, true);

  // 2. User edits app.js externally while MaxIDE is closed
  // Set mtime to future to simulate newer user edit
  const userModifiedContent = 'console.log("USER MANUAL EDIT - DO NOT OVERWRITE");';
  fs.writeFileSync(appJsPath, userModifiedContent, 'utf8');
  const futureTime = new Date(Date.now() + 5000);
  fs.utimesSync(appJsPath, futureTime, futureTime);

  // 3. Run Recovery Analysis
  const analysis = await recoveryMgr.analyzeInterruptedTask(oldConv.id);
  assert(analysis.userModifiedFiles.length === 1, 'Detected external modification made while MaxIDE was closed');
  assert(analysis.userModifiedFiles[0].path === 'app.js', 'Accurately flagged app.js as user-modified');
  assert(fs.readFileSync(appJsPath, 'utf8') === userModifiedContent, 'User changes strictly preserved on disk');

  // ----------------------------------------------------
  // TEST E: Clarification Persistence Across Restarts
  // ----------------------------------------------------
  console.log('\n[TEST E: Clarification Persistence Across Restarts]');
  const clarifySessionId = 'conv-clarify-restart-test';
  const gateOutcome1 = ClarificationGate.evaluatePrompt('Build me an app', clarifySessionId);
  assert(gateOutcome1.requiresClarification === true, 'Clarification Gate prompted user with questions');
  assert(ClarificationGate.hasPendingSession(clarifySessionId) === true, 'Pending clarification session registered in memory');

  // Verify file was written to disk (%APPDATA%/MaxIDE/clarifications.json)
  const clarFile = path.join(testUserData, 'clarifications.json');
  assert(fs.existsSync(clarFile), 'Clarifications persisted to %APPDATA%/MaxIDE/clarifications.json');

  // Simulate IDE restart by resetting in-memory gate
  (ClarificationGate as any).isLoaded = false;
  (ClarificationGate as any).activeSessions.clear();

  // On new session evaluation, answering should resolve the persisted session!
  const gateOutcome2 = ClarificationGate.evaluatePrompt('A messenger web application', clarifySessionId);
  assert(gateOutcome2.intent === 'CLEAR_EXECUTABLE' || gateOutcome2.intent === 'PARTIALLY_CLEAR', 'Resolved pending clarification session persisted across restart');

  // ----------------------------------------------------
  // TEST F: Model Unavailable Handling
  // ----------------------------------------------------
  console.log('\n[TEST F: Model Unavailable Handling]');
  // Simulate provider offline
  const mockConv = convStore2.createConversation({
    projectId: proj.id,
    taskPrompt: 'Test model recovery',
    modelId: 'non-existent-local-model',
    providerId: 'custom-disabled-provider',
  });

  const modelAnalysis = await recoveryMgr.analyzeInterruptedTask(mockConv.id);
  assert(modelAnalysis.modelStatus.isAvailable === false, 'Correctly detected that target model/provider is unavailable');
  assert(Boolean(modelAnalysis.modelStatus.warning), 'Provided clear diagnostic warning regarding unavailable model');

  // ----------------------------------------------------
  // Named Manual Snapshots & Safe Restore
  // ----------------------------------------------------
  console.log('\n[Named Manual Snapshots & Safe Restore]');
  fs.writeFileSync(path.join(testWorkspace, 'snapshot-test.txt'), 'V1 Snapshot Content', 'utf8');
  const snapshot = await checkpointMgr.createNamedSnapshot('Before risky refactor', 'Manual safety snapshot', proj.id);
  assert(snapshot.isManual === true, 'Snapshot marked as manual');
  assert(snapshot.name === 'Before risky refactor', 'Snapshot named accurately');

  // Mutate file
  fs.writeFileSync(path.join(testWorkspace, 'snapshot-test.txt'), 'V2 Corrupted Content', 'utf8');
  assert(fs.readFileSync(path.join(testWorkspace, 'snapshot-test.txt'), 'utf8') === 'V2 Corrupted Content', 'File mutated');

  // Restore snapshot
  const restoreOutcome = await checkpointMgr.restoreCheckpoint(snapshot.id);
  assert(restoreOutcome.success === true, 'Snapshot restored successfully');
  assert(fs.readFileSync(path.join(testWorkspace, 'snapshot-test.txt'), 'utf8') === 'V1 Snapshot Content', 'Workspace reverted cleanly to exact snapshot content');

  console.log('\n======================================================');
  console.log(`  ALL ${total} PERSISTENCE & RECOVERY TESTS PASSED! (${passed}/${total})`);
  console.log('======================================================\n');
}

runPersistenceRecoveryTests().catch(err => {
  console.error('\nTest suite failed:', err);
  process.exit(1);
});
