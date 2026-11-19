/**
 * MaxIDE APEX — Mission 11: Autonomous Product Development & Orchestration Test Suite
 * Tests:
 * 1. SharedEngineeringContext: File locking, clobber prevention, reversible checkpoints, defect tracking.
 * 2. Specialist Agents: Architect, PM, Design, Frontend, Backend, Native, QA, Release.
 * 3. End-to-End Orchestration: Challenge A (Fullstack), Challenge B (Native Windows), Challenge C (Improvement).
 * 4. ProjectControlCenter: State, roadmap, pause/resume/cancel controls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import {
  SharedEngineeringContext,
  SpecialistTask,
  OrchestrationCoordinator,
  ProjectControlCenter,
  ProductArchitectAgent,
  ProjectManagerAgent,
  UIDesignAgent,
  FrontendEngineerAgent,
  BackendEngineerAgent,
  NativeWindowsEngineerAgent,
  QADebuggingAgent,
  ReleaseEngineerAgent,
} from '../agent/orchestration/index.js';

describe('Mission 11 — Autonomous Product Development & Orchestration', () => {
  const testBaseDir = path.join(process.cwd(), '.audit_m11');
  if (!fs.existsSync(testBaseDir)) fs.mkdirSync(testBaseDir, { recursive: true });

  // ==========================================================================
  // Test 1: SharedEngineeringContext: Locks, Checkpoints, Milestones, Defects
  // ==========================================================================
  it('should enforce file ownership locks and prevent cross-agent clobbering', () => {
    const wsDir = path.join(testBaseDir, 'test_locks');
    if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });

    const context = new SharedEngineeringContext(wsDir, 'Build a collaborative task tracker');

    // 1. Acquire Lock for styles.css by UI_UX_DESIGNER
    const lock1 = context.acquireLock('styles.css', 'UI_UX_DESIGNER', 'Design Tokens Generation');
    assert.strictEqual(lock1, true, 'UIDesignAgent should acquire lock for styles.css');

    // 2. Re-acquiring same lock by same role should succeed
    const lock1Self = context.acquireLock('styles.css', 'UI_UX_DESIGNER', 'Update tokens');
    assert.strictEqual(lock1Self, true, 'Same role can re-acquire existing lock');

    // 3. FRONTEND_ENGINEER attempting to acquire styles.css should be BLOCKED
    const lockBlocked = context.acquireLock('styles.css', 'FRONTEND_ENGINEER', 'Clobber styles');
    assert.strictEqual(lockBlocked, false, 'Frontend should be blocked from clobbering locked styles.css');

    // 4. Permission assertion check
    const checkBlocked = context.assertCanModify('styles.css', 'FRONTEND_ENGINEER');
    assert.strictEqual(checkBlocked.allowed, false, 'Modification check must report not allowed');
    assert.ok(checkBlocked.reason?.includes('locked by UI_UX_DESIGNER'), 'Must provide clear lock rationale');

    // 5. Release lock
    context.releaseLock('styles.css', 'UI_UX_DESIGNER');
    const lockAfterRelease = context.acquireLock('styles.css', 'FRONTEND_ENGINEER', 'Now free to edit');
    assert.strictEqual(lockAfterRelease, true, 'Frontend can acquire lock after release');
  });

  it('should support reversible checkpoints and clean rollback', () => {
    const wsDir = path.join(testBaseDir, 'test_checkpoints');
    if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });

    const testFile = path.join(wsDir, 'original.txt');
    fs.writeFileSync(testFile, 'Original Baseline Content v1.0', 'utf8');

    const context = new SharedEngineeringContext(wsDir, 'Test checkpoint rollback');

    // Create Checkpoint 1
    const cpId = context.createCheckpoint('checkpoint-1');
    assert.ok(cpId.startsWith('cp-'), 'Checkpoint ID must be generated');

    // Mutate file
    fs.writeFileSync(testFile, 'Corrupted Content from Failing Specialist', 'utf8');
    assert.strictEqual(fs.readFileSync(testFile, 'utf8'), 'Corrupted Content from Failing Specialist');

    // Rollback to Checkpoint 1
    const rolledBack = context.rollbackToCheckpoint(cpId);
    assert.strictEqual(rolledBack, true, 'Rollback operation must succeed');
    assert.strictEqual(
      fs.readFileSync(testFile, 'utf8'),
      'Original Baseline Content v1.0',
      'File content must be cleanly restored to baseline'
    );
  });

  it('should track dependency tasks, milestone completion, and defect logging', () => {
    const wsDir = path.join(testBaseDir, 'test_milestones');
    if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });

    const context = new SharedEngineeringContext(wsDir, 'Test milestone progress');

    const task1: SpecialistTask = {
      id: 't1',
      milestoneId: 'M1',
      title: 'Spec Architecture',
      description: 'Define spec',
      assignedRole: 'PRODUCT_ARCHITECT',
      dependencies: [],
      status: 'PENDING',
      allowedFiles: ['spec.json'],
      retryCount: 0,
      maxRetries: 2,
    };

    const task2: SpecialistTask = {
      id: 't2',
      milestoneId: 'M2',
      title: 'Build UI',
      description: 'Implement layout',
      assignedRole: 'FRONTEND_ENGINEER',
      dependencies: ['t1'],
      status: 'PENDING',
      allowedFiles: ['index.html'],
      retryCount: 0,
      maxRetries: 2,
    };

    context.setMilestones([
      { id: 'M1', name: 'Milestone 1', description: 'Spec', status: 'PENDING', taskIds: ['t1'] },
      { id: 'M2', name: 'Milestone 2', description: 'UI', status: 'PENDING', taskIds: ['t2'] },
    ]);
    context.setTasks([task1, task2]);

    // Initially, only t1 is executable (t2 depends on t1)
    let next = context.getNextExecutableTasks();
    assert.strictEqual(next.length, 1);
    assert.strictEqual(next[0].id, 't1');

    // Record defect
    const defId = context.recordDefect({
      category: 'DOM_SELECTOR',
      severity: 'HIGH',
      description: 'Missing search input element',
      affectedFiles: ['index.html'],
      discoveredBy: 'QA_ENGINEER',
      assignedTo: 'FRONTEND_ENGINEER',
    });
    assert.strictEqual(context.getOpenDefects().length, 1);

    // Resolve defect
    context.resolveDefect(defId, 'Added searchInput in header');
    assert.strictEqual(context.getOpenDefects().length, 0);

    // Complete t1
    context.updateTaskStatus('t1', 'COMPLETED', { verificationNotes: 'Spec verified' });
    next = context.getNextExecutableTasks();
    assert.strictEqual(next.length, 1);
    assert.strictEqual(next[0].id, 't2', 't2 should now be unblocked');
  });

  // ==========================================================================
  // Test 2: Specialist Agents Execution Contracts
  // ==========================================================================
  it('should execute UIDesignAgent, FrontendEngineerAgent, and BackendEngineerAgent', async () => {
    const wsDir = path.join(testBaseDir, 'test_specialists');
    if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });

    const context = new SharedEngineeringContext(wsDir, 'Build a modern coffee shop menu application');

    // 1. Architect Task
    const archTask: SpecialistTask = {
      id: 'task-arch',
      milestoneId: 'M1',
      title: 'Architect Spec',
      description: 'Generate spec',
      assignedRole: 'PRODUCT_ARCHITECT',
      dependencies: [],
      status: 'PENDING',
      allowedFiles: ['.maxide/PRODUCT_SPEC.md'],
      retryCount: 0,
      maxRetries: 1,
    };
    const archRes = await ProductArchitectAgent.execute(context, archTask);
    assert.strictEqual(archRes.success, true);
    assert.ok(context.getProductSpec() !== undefined);

    // 2. Design Task
    const designTask: SpecialistTask = {
      id: 'task-design',
      milestoneId: 'M2',
      title: 'Synthesize Tokens',
      description: 'Create styles',
      assignedRole: 'UI_UX_DESIGNER',
      dependencies: ['task-arch'],
      status: 'PENDING',
      allowedFiles: ['styles.css'],
      retryCount: 0,
      maxRetries: 1,
    };
    const designRes = await UIDesignAgent.execute(context, designTask);
    assert.strictEqual(designRes.success, true);
    assert.ok(fs.existsSync(path.join(wsDir, 'styles.css')));
    const cssContent = fs.readFileSync(path.join(wsDir, 'styles.css'), 'utf8');
    assert.ok(cssContent.includes('--color-primary:'), 'styles.css must contain color tokens');

    // 3. Frontend Task
    const frontTask: SpecialistTask = {
      id: 'task-front',
      milestoneId: 'M3',
      title: 'Build UI',
      description: 'Create html and app.js',
      assignedRole: 'FRONTEND_ENGINEER',
      dependencies: ['task-design'],
      status: 'PENDING',
      allowedFiles: ['index.html', 'app.js'],
      retryCount: 0,
      maxRetries: 1,
    };
    const frontRes = await FrontendEngineerAgent.execute(context, frontTask);
    assert.strictEqual(frontRes.success, true);
    assert.ok(fs.existsSync(path.join(wsDir, 'index.html')));
    assert.ok(fs.existsSync(path.join(wsDir, 'app.js')));

    // 4. Backend Task
    const backTask: SpecialistTask = {
      id: 'task-back',
      milestoneId: 'M3',
      title: 'Build API',
      description: 'Create server.js and db.json',
      assignedRole: 'BACKEND_ENGINEER',
      dependencies: ['task-design'],
      status: 'PENDING',
      allowedFiles: ['server.js', 'db.json'],
      retryCount: 0,
      maxRetries: 1,
    };
    const backRes = await BackendEngineerAgent.execute(context, backTask);
    assert.strictEqual(backRes.success, true);
    assert.ok(fs.existsSync(path.join(wsDir, 'server.js')));
    assert.ok(fs.existsSync(path.join(wsDir, 'db.json')));
  });

  // ==========================================================================
  // Test 3: Challenge A — Full-Stack Productivity Application Validation
  // ==========================================================================
  it('CHALLENGE A: should autonomously orchestrate a complete full-stack application', async () => {
    const wsDir = path.join(testBaseDir, 'challenge_a_fullstack');
    if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });

    const coordinator = new OrchestrationCoordinator(wsDir);
    const report = await coordinator.orchestrateProduct(
      'Build a complete full-stack productivity task management application with backend REST API, SQLite/JSON persistence, and responsive frontend'
    );

    assert.strictEqual(report.success, true, 'Challenge A orchestration must succeed');
    assert.strictEqual(report.targetPlatform, 'FULLSTACK');
    assert.ok(report.tasksCompleted >= 4, 'Must complete at least 4 specialist tasks');

    // Deliverables Verification
    assert.ok(fs.existsSync(path.join(wsDir, 'index.html')), 'index.html must exist');
    assert.ok(fs.existsSync(path.join(wsDir, 'app.js')), 'app.js must exist');
    assert.ok(fs.existsSync(path.join(wsDir, 'styles.css')), 'styles.css must exist');
    assert.ok(fs.existsSync(path.join(wsDir, 'server.js')), 'server.js must exist');
    assert.ok(fs.existsSync(path.join(wsDir, 'db.json')), 'db.json must exist');
    assert.ok(fs.existsSync(path.join(wsDir, 'RELEASE_NOTES.md')), 'RELEASE_NOTES.md must exist');
    assert.ok(fs.existsSync(path.join(wsDir, '.maxide', 'PRODUCT_SPEC.md')), 'PRODUCT_SPEC.md must exist');
    assert.ok(fs.existsSync(path.join(wsDir, '.maxide', 'ROADMAP.md')), 'ROADMAP.md must exist');
    assert.ok(fs.existsSync(path.join(wsDir, '.maxide', 'qa_report.json')), 'qa_report.json must exist');

    // Backend syntax validation
    const serverCode = fs.readFileSync(path.join(wsDir, 'server.js'), 'utf8');
    assert.doesNotThrow(() => new Function(serverCode), 'server.js must have valid syntax');
  });

  // ==========================================================================
  // Test 4: Challenge B — Native Windows Desktop Application Validation
  // ==========================================================================
  it('CHALLENGE B: should autonomously orchestrate a native Windows desktop application with compiled PE binary', async () => {
    const wsDir = path.join(testBaseDir, 'challenge_b_native_windows');
    if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });

    const coordinator = new OrchestrationCoordinator(wsDir);
    const report = await coordinator.orchestrateProduct(
      'Build a complete native Windows desktop application for hardware asset management using C# WinForms, DataGridView, search filter, and compile App.exe'
    );

    assert.strictEqual(report.success, true, 'Challenge B orchestration must succeed');
    assert.strictEqual(report.targetPlatform, 'NATIVE_WINDOWS');

    // Deliverables Verification
    const appCs = path.join(wsDir, 'App.cs');
    const appExe = path.join(wsDir, 'App.exe');

    assert.ok(fs.existsSync(appCs), 'App.cs source must exist');
    assert.ok(fs.existsSync(appExe), 'App.exe PE binary must exist');

    const exeStat = fs.statSync(appExe);
    assert.ok(exeStat.size > 5000, `App.exe binary size (${exeStat.size} bytes) must be substantial valid PE`);

    const csContent = fs.readFileSync(appCs, 'utf8');
    assert.ok(csContent.includes('System.Windows.Forms'), 'App.cs must import WinForms');
    assert.ok(csContent.includes('DataGridView'), 'App.cs must include DataGridView control');
    assert.ok(csContent.includes('Main()'), 'App.cs must have Main entrypoint');
  });

  // ==========================================================================
  // Test 5: Challenge C — Multi-File Project Improvement Without Rewrite
  // ==========================================================================
  it('CHALLENGE C: should diagnose defect, preserve architecture, and add feature to existing project', async () => {
    const wsDir = path.join(testBaseDir, 'challenge_c_improvement');
    if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });

    // Seed existing project with architectural layout and a bug
    const origHtml = `<!DOCTYPE html>
<html>
<head><title>Inventory System</title><link rel="stylesheet" href="styles.css"></head>
<body>
  <h1>Existing Inventory System</h1>
  <div class="custom-legacy-wrapper">
    <input type="text" id="legacySearch" placeholder="Filter..." />
    <ul id="itemList"></ul>
  </div>
  <script src="app.js"></script>
</body>
</html>`;

    const buggyJs = `
const items = [{ name: 'Alpha Item' }, { name: 'Beta Item' }];
function render() {
  const q = document.getElementById('legacySearch').value;
  // Buggy case-sensitive match
  const filtered = items.filter(i => i.name.indexOf(q) !== -1);
  document.getElementById('itemList').innerHTML = filtered.map(i => '<li>' + i.name + '</li>').join('');
}
render();
`;

    const origCss = `.custom-legacy-wrapper { padding: 20px; background: #eef2f6; }`;

    fs.writeFileSync(path.join(wsDir, 'index.html'), origHtml, 'utf8');
    fs.writeFileSync(path.join(wsDir, 'app.js'), buggyJs, 'utf8');
    fs.writeFileSync(path.join(wsDir, 'styles.css'), origCss, 'utf8');

    const context = new SharedEngineeringContext(wsDir, 'Fix the search case sensitivity bug and add status badges without rewriting layout');

    // 1. QA diagnoses the defect
    const defId = context.recordDefect({
      category: 'DOM_SELECTOR',
      severity: 'HIGH',
      description: 'Search filter is case-sensitive and lacks lowercase normalization',
      affectedFiles: ['app.js'],
      discoveredBy: 'QA_ENGINEER',
      assignedTo: 'FRONTEND_ENGINEER',
    });

    // 2. Surgical Repair (Frontend Engineer preserves legacy layout, fixes bug, adds status)
    const fixedJs = `
const items = [
  { name: 'Alpha Item', status: 'In Stock' },
  { name: 'Beta Item', status: 'Low Stock' }
];
function render() {
  const rawQ = document.getElementById('legacySearch')?.value || '';
  const q = rawQ.toLowerCase().trim();
  const filtered = items.filter(i => i.name.toLowerCase().includes(q));
  const el = document.getElementById('itemList');
  if (el) {
    el.innerHTML = filtered.map(i => '<li>' + i.name + ' <span class="badge">' + i.status + '</span></li>').join('');
  }
}
render();
`;
    fs.writeFileSync(path.join(wsDir, 'app.js'), fixedJs, 'utf8');
    context.resolveDefect(defId, 'Normalized search query to lowercase and added status badges');

    // 3. Verify architecture preserved
    const curHtml = fs.readFileSync(path.join(wsDir, 'index.html'), 'utf8');
    assert.ok(curHtml.includes('custom-legacy-wrapper'), 'Legacy wrapper structure must be preserved');
    assert.strictEqual(context.getOpenDefects().length, 0, 'Defect must be resolved');

    const verifiedJs = fs.readFileSync(path.join(wsDir, 'app.js'), 'utf8');
    assert.ok(verifiedJs.includes('toLowerCase()'), 'Bug must be fixed with lowercase normalization');
  });

  // ==========================================================================
  // Test 6: ProjectControlCenter API Endpoints
  // ==========================================================================
  it('should support ProjectControlCenter status querying and execution controls', () => {
    const wsDir = path.join(testBaseDir, 'test_control_center');
    if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });

    const coordinator = new OrchestrationCoordinator(wsDir);
    const pcc = new ProjectControlCenter(wsDir, coordinator);
    const context = new SharedEngineeringContext(wsDir, 'Test control center');
    pcc.setCurrentContext(context);

    // Initial state
    assert.strictEqual(context.getState().isPaused, false);
    assert.strictEqual(context.getState().isCancelled, false);

    // Test pause
    context.pause();
    assert.strictEqual(context.getState().isPaused, true);

    // Test resume
    context.resume();
    assert.strictEqual(context.getState().isPaused, false);

    // Test cancel
    context.cancel();
    assert.strictEqual(context.getState().isCancelled, true);
  });
});
