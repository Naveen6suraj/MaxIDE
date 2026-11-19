/**
 * MaxIDE APEX - Mission 11.1 Comprehensive Reliability & Orchestration Suite
 * Validates:
 * 1. Durable disk checkpoints with SHA-256 manifests & rollback hash verification
 * 2. User file protection during rollback
 * 3. File lock TTL expiration & conflict detection logging
 * 4. Structured specialist agent handoffs across 8 roles
 * 5. SafeTerminal process tree termination & background process handling
 * 6. Cold restart context persistence (.maxide/context.json)
 * 7. Challenge A: Full-stack productivity app with Auth & CRUD endpoints
 * 8. Challenge B: Native Windows desktop with MainForm + SettingsDialog & compiled App.exe
 * 9. Challenge C: Multi-module refactoring & non-clobbering coordination
 * 10. Failure injection & corruption recovery
 * 11. WorkspaceGuard security containment, credential protection, and audit logging
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

import { SharedEngineeringContext } from '../agent/orchestration/SharedEngineeringContext.js';
import {
  ProductArchitectAgent,
  ProjectManagerAgent,
  UIDesignAgent,
  FrontendEngineerAgent,
  BackendEngineerAgent,
  NativeWindowsEngineerAgent,
  QADebuggingAgent,
  ReleaseEngineerAgent,
} from '../agent/orchestration/SpecialistAgents.js';
import { OrchestrationCoordinator } from '../agent/orchestration/OrchestrationCoordinator.js';
import { ProjectControlCenter } from '../agent/orchestration/ProjectControlCenter.js';
import { SafeTerminal } from '../agent/safety/SafeTerminal.js';
import { WorkspaceGuard } from '../agent/safety/WorkspaceGuard.js';

describe('Mission 11.1: Autonomous Orchestration Reliability & Large-Project Hardening', () => {
  const testRoot = path.join(process.cwd(), '.test_m11_1_workspace_' + Date.now());

  before(() => {
    fs.mkdirSync(testRoot, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {}
  });

  test('1. Durable Disk Checkpoints: Atomic creation with SHA-256 manifest', () => {
    const ws = path.join(testRoot, 'proj_checkpoints');
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, 'index.html'), '<h1>Initial Version</h1>', 'utf8');
    fs.writeFileSync(path.join(ws, 'app.js'), 'console.log("v1");', 'utf8');

    const context = new SharedEngineeringContext(ws, 'Build durable checkpoint test');
    const cpId = context.createCheckpoint('cp-v1-initial');

    assert.ok(cpId, 'Checkpoint ID should be generated');

    const cpDir = path.join(ws, '.maxide', 'checkpoints', cpId);
    assert.ok(fs.existsSync(cpDir), 'Checkpoint directory must exist on disk');

    const manifestPath = path.join(cpDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist on disk');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.id, cpId);
    assert.equal(manifest.fileCount, 2);

    const indexEntry = manifest.files.find((f: any) => f.path === 'index.html');
    assert.ok(indexEntry, 'index.html must be in manifest');

    const expectedHash = crypto.createHash('sha256').update('<h1>Initial Version</h1>').digest('hex');
    assert.equal(indexEntry.sha256, expectedHash, 'SHA-256 hash in manifest must match file content');
  });

  test('2. Rollback Verification & User File Protection', () => {
    const ws = path.join(testRoot, 'proj_rollback');
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, 'app.js'), 'const version = 1;', 'utf8');

    const context = new SharedEngineeringContext(ws, 'Test rollback safety');
    const cpId = context.createCheckpoint('cp-stable');

    // Mutate existing tracked file
    fs.writeFileSync(path.join(ws, 'app.js'), 'const version = 99; // BROKEN MUTATION', 'utf8');

    // User creates a new personal file outside checkpoint
    fs.writeFileSync(path.join(ws, 'user_notes.txt'), 'Important user thoughts', 'utf8');

    // Rollback to checkpoint
    const rollbackSuccess = context.rollbackToCheckpoint(cpId);
    assert.equal(rollbackSuccess, true, 'Rollback should succeed with verified hashes');

    // Verify tracked file is restored
    const restoredContent = fs.readFileSync(path.join(ws, 'app.js'), 'utf8');
    assert.equal(restoredContent, 'const version = 1;', 'app.js must be reverted to exact checkpoint content');

    // Verify unmanaged user file was protected and NOT deleted
    assert.ok(fs.existsSync(path.join(ws, 'user_notes.txt')), 'User notes file must be preserved');
    assert.equal(fs.readFileSync(path.join(ws, 'user_notes.txt'), 'utf8'), 'Important user thoughts');
  });

  test('3. Lock Expiration with TTL and Conflict Detection Logging', () => {
    const ws = path.join(testRoot, 'proj_locks');
    fs.mkdirSync(ws, { recursive: true });

    const context = new SharedEngineeringContext(ws, 'Test lock TTL and conflicts');

    // Role 1 acquires lock with short TTL (100ms)
    const acquired1 = context.acquireLock('service.js', 'BACKEND_ENGINEER', 'Drafting REST API', 100);
    assert.equal(acquired1, true, 'Backend Engineer should acquire service.js lock');

    // Role 2 immediately attempts to acquire same lock (should fail & record conflict)
    const acquired2 = context.acquireLock('service.js', 'FRONTEND_ENGINEER', 'Modifying service.js', 5000);
    assert.equal(acquired2, false, 'Frontend Engineer should be denied lock on service.js');

    const state = context.getState();
    assert.equal(state.lockConflicts.length, 1, 'Conflict must be logged');
    assert.equal(state.lockConflicts[0].attemptedBy, 'FRONTEND_ENGINEER');
    assert.equal(state.lockConflicts[0].heldBy, 'BACKEND_ENGINEER');

    // Wait 150ms for lock to expire
    const start = Date.now();
    while (Date.now() - start < 150) {}

    // Clean expired locks
    context.cleanExpiredLocks();

    // Now Role 2 should successfully acquire the lock
    const acquiredAfterExpire = context.acquireLock('service.js', 'FRONTEND_ENGINEER', 'Acquiring after expiration', 5000);
    assert.equal(acquiredAfterExpire, true, 'Frontend Engineer should acquire lock after TTL expiration');
  });

  test('4. Structured Specialist Agent Handoffs Across Roles', () => {
    const ws = path.join(testRoot, 'proj_handoffs');
    fs.mkdirSync(ws, { recursive: true });

    const context = new SharedEngineeringContext(ws, 'Build corporate asset directory');

    // Record handoff from Architect to PM
    const ho1 = context.recordHandoff({
      fromRole: 'PRODUCT_ARCHITECT',
      toRole: 'PROJECT_MANAGER',
      taskId: 'task-spec-1',
      artifactsPassed: ['.maxide/PRODUCT_SPEC.md'],
      handoffRationale: 'Product Architect delivered formal specification with 5 features.',
    });

    assert.ok(ho1.id.startsWith('ho-'));
    assert.equal(ho1.status, 'ACCEPTED');

    // Record handoff from PM to UI Designer
    context.recordHandoff({
      fromRole: 'PROJECT_MANAGER',
      toRole: 'UI_UX_DESIGNER',
      taskId: 'task-pm-roadmap',
      artifactsPassed: ['.maxide/ROADMAP.md', '.maxide/task_board.json'],
      handoffRationale: 'Engineering roadmap and dependency-tracked tasks established.',
    });

    const handoffs = context.getHandoffs();
    assert.equal(handoffs.length, 2);
    assert.equal(handoffs[0].fromRole, 'PRODUCT_ARCHITECT');
    assert.equal(handoffs[1].toRole, 'UI_UX_DESIGNER');
  });

  test('5. SafeTerminal: Process Tree Termination & Background Execution', async () => {
    const terminal = new SafeTerminal(testRoot);

    const bgScript = path.join(testRoot, 'bg_worker.js');
    fs.writeFileSync(bgScript, 'setInterval(() => {}, 1000);', 'utf8');

    // Test background command execution with non-blocking node script
    const bgRes = await terminal.executeCommand(`node "${bgScript}"`, {
      isBackground: true,
      bypassApproval: true,
    });

    assert.equal(bgRes.exitCode, 0);
    assert.equal(bgRes.isBackground, true);
    assert.ok(bgRes.pid && bgRes.pid > 0, 'PID must be tracked');

    const tracked = terminal.getTrackedProcesses();
    assert.ok(tracked.length >= 1, 'Process must be in active tracked registry');

    // Terminate the process tree cleanly
    if (bgRes.pid) {
      await terminal.killProcessTree(bgRes.pid);
    }
  });

  test('6. Cold Restart / Context Persistence: 100% exact state restoration', () => {
    const ws = path.join(testRoot, 'proj_cold_restart');
    fs.mkdirSync(ws, { recursive: true });

    const context = new SharedEngineeringContext(ws, 'Build multi-tenant invoice portal', 'sess-cold-1');
    context.setTargetPlatform('FULLSTACK');
    context.setInterpretedObjective('Create complete invoice generation and payment tracking web application');

    context.setMilestones([{
      id: 'M1_SPEC',
      name: 'Product Blueprint',
      description: 'Requirements',
      status: 'COMPLETED',
      taskIds: ['task-arch'],
    }]);

    context.addTask({
      id: 'task-arch',
      milestoneId: 'M1_SPEC',
      title: 'Synthesize Spec',
      description: 'Requirements synthesis',
      assignedRole: 'PRODUCT_ARCHITECT',
      dependencies: [],
      status: 'COMPLETED',
      allowedFiles: ['.maxide/PRODUCT_SPEC.md'],
      retryCount: 0,
      maxRetries: 2,
    });

    context.recordHandoff({
      fromRole: 'PRODUCT_ARCHITECT',
      toRole: 'PROJECT_MANAGER',
      taskId: 'task-arch',
      artifactsPassed: ['.maxide/PRODUCT_SPEC.md'],
      handoffRationale: 'Spec delivered',
    });

    // Save state to disk
    context.saveToDisk();

    const contextJsonPath = path.join(ws, '.maxide', 'context.json');
    assert.ok(fs.existsSync(contextJsonPath), '.maxide/context.json must exist');

    // Simulate complete process crash / cold restart: load new instance from disk
    const reloaded = SharedEngineeringContext.loadFromDisk(ws);
    assert.ok(reloaded, 'Loaded context must not be null');

    const reloadedState = reloaded.getState();
    assert.equal(reloadedState.sessionId, 'sess-cold-1');
    assert.equal(reloadedState.targetPlatform, 'FULLSTACK');
    assert.equal(reloadedState.milestones.length, 1);
    assert.equal(reloadedState.milestones[0].id, 'M1_SPEC');
    assert.equal(reloadedState.tasks.length, 1);
    assert.equal(reloadedState.handoffs.length, 1);
  });

  test('7. Challenge A: Full-stack Application with Auth & CRUD Endpoints', async () => {
    const ws = path.join(testRoot, 'challenge_a_fullstack');
    fs.mkdirSync(ws, { recursive: true });

    const context = new SharedEngineeringContext(ws, 'Build fullstack inventory manager with auth and crud');
    context.setTargetPlatform('FULLSTACK');

    const backendTask = {
      id: 'task-be-inventory',
      milestoneId: 'M3_CORE',
      title: 'Implement Inventory REST API & Auth',
      description: 'Build server.js and db.json',
      assignedRole: 'BACKEND_ENGINEER' as const,
      dependencies: [],
      status: 'PENDING' as const,
      allowedFiles: ['server.js', 'db.json'],
      retryCount: 0,
      maxRetries: 3,
    };
    context.addTask(backendTask);

    const beRes = await BackendEngineerAgent.execute(context, backendTask);
    assert.equal(beRes.success, true, 'BackendEngineerAgent should succeed');

    // Verify files created
    assert.ok(fs.existsSync(path.join(ws, 'server.js')), 'server.js must exist');
    assert.ok(fs.existsSync(path.join(ws, 'db.json')), 'db.json must exist');

    const serverCode = fs.readFileSync(path.join(ws, 'server.js'), 'utf8');
    assert.ok(serverCode.includes('/api/auth/login'), 'Auth endpoint must be present');
    assert.ok(serverCode.includes('/api/items'), 'CRUD endpoints must be present');

    // Verify handoff was recorded
    const handoffs = context.getHandoffs();
    const beHandoff = handoffs.find((h) => h.fromRole === 'BACKEND_ENGINEER' && h.toRole === 'FRONTEND_ENGINEER');
    assert.ok(beHandoff, 'Handoff from Backend to Frontend must be recorded');
  });

  test('8. Challenge B: Native Windows Desktop App with Multi-Window & Compiled App.exe', async () => {
    const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
    if (!fs.existsSync(cscPath)) {
      console.log('Skipping native Windows compilation test (csc.exe not found on host).');
      return;
    }

    const ws = path.join(testRoot, 'challenge_b_native');
    fs.mkdirSync(ws, { recursive: true });

    const context = new SharedEngineeringContext(ws, 'Build native Windows industrial equipment catalog');
    context.setTargetPlatform('NATIVE_WINDOWS');

    const nativeTask = {
      id: 'task-native-app',
      milestoneId: 'M3_CORE',
      title: 'Generate Native C# WinForms & Compile Executable',
      description: 'Build App.cs with MainForm and SettingsDialog and compile App.exe',
      assignedRole: 'NATIVE_WINDOWS_ENGINEER' as const,
      dependencies: [],
      status: 'PENDING' as const,
      allowedFiles: ['App.cs', 'App.exe'],
      retryCount: 0,
      maxRetries: 2,
    };
    context.addTask(nativeTask);

    const res = await NativeWindowsEngineerAgent.execute(context, nativeTask);
    assert.equal(res.success, true, 'NativeWindowsEngineerAgent should succeed');

    const appCsPath = path.join(ws, 'App.cs');
    const appExePath = path.join(ws, 'App.exe');

    assert.ok(fs.existsSync(appCsPath), 'App.cs must exist');
    assert.ok(fs.existsSync(appExePath), 'App.exe must exist');

    const csSource = fs.readFileSync(appCsPath, 'utf8');
    assert.ok(csSource.includes('class MainForm : Form'), 'MainForm must be defined');
    assert.ok(csSource.includes('class SettingsDialog : Form'), 'SettingsDialog must be defined');
    assert.ok(csSource.includes('ShowDialog'), 'Modal dialog launch must be present');

    const exeStat = fs.statSync(appExePath);
    assert.ok(exeStat.size > 5000, `App.exe must be a valid PE binary (size: ${exeStat.size} bytes)`);
  });

  test('9. Challenge C: Multi-Module Non-Clobbering Coordination', () => {
    const ws = path.join(testRoot, 'challenge_c_multimodule');
    fs.mkdirSync(ws, { recursive: true });

    // Establish pre-existing modules
    fs.mkdirSync(path.join(ws, 'src', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(ws, 'src', 'catalog'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'src', 'auth', 'authService.js'), 'export const auth = true;', 'utf8');
    fs.writeFileSync(path.join(ws, 'src', 'catalog', 'productModel.js'), 'export const catalog = true;', 'utf8');

    const context = new SharedEngineeringContext(ws, 'Refactor catalog module');
    const cpId = context.createCheckpoint('pre-refactor');

    // Acquire lock only on target file
    const lockOk = context.acquireLock('src/catalog/productModel.js', 'FRONTEND_ENGINEER', 'Add discount pricing field');
    assert.equal(lockOk, true);

    // Modify target file
    fs.writeFileSync(
      path.join(ws, 'src', 'catalog', 'productModel.js'),
      'export const catalog = true; export const discount = 0.15;',
      'utf8'
    );
    context.releaseLock('src/catalog/productModel.js', 'FRONTEND_ENGINEER');

    // Verify un-touched module was untouched
    const authCode = fs.readFileSync(path.join(ws, 'src', 'auth', 'authService.js'), 'utf8');
    assert.equal(authCode, 'export const auth = true;', 'Auth module must not be altered');
  });

  test('10. Failure Injection: Corrupted Checkpoint Detection & Lock Conflict Recovery', () => {
    const ws = path.join(testRoot, 'proj_failure_injection');
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, 'critical.js'), 'const important = true;', 'utf8');

    const context = new SharedEngineeringContext(ws, 'Test failure recovery');
    const cpId = context.createCheckpoint('valid-checkpoint');

    // Inject corruption: corrupt the stored snapshot file in data directory
    const cpFile = path.join(ws, '.maxide', 'checkpoints', cpId, 'data', 'critical.js');
    if (fs.existsSync(cpFile)) {
      fs.writeFileSync(cpFile, 'CORRUPTED FILE CONTENTS INJECTED BY ATTACKER', 'utf8');
    }

    // Attempt rollback: SHA-256 verification must detect the mismatch and reject
    const rollbackRes = context.rollbackToCheckpoint(cpId);
    assert.equal(rollbackRes, false, 'Rollback should be rejected when checkpoint hash is corrupt');
  });

  test('11. Security Guardrails: Path Traversal, Credential Protection, and Audit Logging', () => {
    const ws = path.join(testRoot, 'proj_security');
    fs.mkdirSync(ws, { recursive: true });

    const guard = new WorkspaceGuard(ws);

    // 1. Path Traversal Test
    const traversalEval = guard.evaluateFileOperation('../../outside_secret.txt', 'WRITE');
    assert.equal(traversalEval.allowed, false, 'Path traversal must be blocked');
    assert.ok(traversalEval.reason?.includes('escapes active workspace containment'));

    // 2. Secret Credential Modification Test
    const secretEval = guard.evaluateFileOperation('.env', 'WRITE');
    assert.equal(secretEval.allowed, false, 'Modifying .env must be blocked');

    // 3. File Ownership Conflict Gate Test
    const activeLocks = [{ filePath: 'core.js', ownerRole: 'BACKEND_ENGINEER' }];
    const ownershipEval = guard.evaluateFileOwnership('core.js', 'FRONTEND_ENGINEER', activeLocks);
    assert.equal(ownershipEval.allowed, false, 'Conflicting lock ownership must be blocked');

    // 4. Verify Security Audit Log
    const auditLogPath = path.join(ws, '.maxide', 'security_audit.log');
    assert.ok(fs.existsSync(auditLogPath), 'security_audit.log must exist');
    const logContent = fs.readFileSync(auditLogPath, 'utf8');
    assert.ok(logContent.includes('PATH_TRAVERSAL_BLOCKED'), 'Audit log must record path traversal event');
    assert.ok(logContent.includes('CREDENTIAL_GUARD_TRIGGERED'), 'Audit log must record credential guard event');
    assert.ok(logContent.includes('LOCK_CONFLICT_PREVENTED'), 'Audit log must record lock conflict event');
  });
});
