/**
 * MaxIDE - Persistent Desktop Agent & Always-Available Runtime
 * Automated Acceptance Test Suite
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { PathManager } from '../config/PathManager.js';
import { ProjectManager } from '../projects/ProjectManager.js';
import { ConversationStore } from '../agent/conversation/ConversationStore.js';
import { PermissionManager } from '../agent/safety/PermissionManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runDesktopPersistenceTests() {
  console.log('\n======================================================');
  console.log('   MAXIDE PERSISTENT DESKTOP & RUNTIME TEST SUITE');
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
    }
  }

  // Use isolated test directory for storage verification
  const testRoot = path.join(os.tmpdir(), `maxide-test-${Date.now()}`);
  const testUserData = path.join(testRoot, 'UserData');
  const testAgentData = path.join(testRoot, 'AgentData');
  fs.mkdirSync(testUserData, { recursive: true });
  fs.mkdirSync(testAgentData, { recursive: true });

  process.env.MAXIDE_DATA_DIR = testUserData;
  process.env.MAXIDE_AGENT_DIR = testAgentData;

  console.log('[Phase 1: PathManager & Directory Separation]');
  const pathMgr = PathManager.getInstance();
  pathMgr.ensureDirectories();
  assert(fs.existsSync(testUserData), 'User data directory created (%APPDATA%/MaxIDE target)');
  assert(fs.existsSync(testAgentData), 'Agent data directory created (%LOCALAPPDATA%/MaxIDE target)');
  assert(fs.existsSync(pathMgr.getConversationsDir()), 'Conversations directory created');
  assert(fs.existsSync(pathMgr.getCheckpointsDir()), 'Checkpoints directory created');

  console.log('\n[Phase 2: Persistent Project & Multi-Folder System]');
  const testProjectsFile = path.join(testUserData, 'test-projects.json');
  const projMgr1 = new ProjectManager(testProjectsFile);

  const folderA = path.join(testRoot, 'apps', 'frontend');
  const folderB = path.join(testRoot, 'apps', 'backend');
  const outsideFolder = path.join(testRoot, 'unauthorized');
  fs.mkdirSync(folderA, { recursive: true });
  fs.mkdirSync(folderB, { recursive: true });
  fs.mkdirSync(outsideFolder, { recursive: true });

  const project = projMgr1.createProject({
    name: 'Fullstack Microservices',
    folders: [folderA, folderB],
    providerId: 'ollama',
    modelId: 'qwen3.5:397b-cloud',
    autonomyMode: 'AUTONOMOUS',
    gitWorktreeMode: 'LOCAL',
    description: 'Multi-folder fullstack suite',
  });

  assert(project.id.startsWith('proj-'), `Project created with ID: ${project.id}`);
  assert(project.folders.length === 2, 'Project holds 2 authorized folders');

  // Test multi-folder containment check
  assert(projMgr1.isPathAuthorized(path.join(folderA, 'src', 'App.tsx'), project.id), 'Path in folderA is authorized');
  assert(projMgr1.isPathAuthorized(path.join(folderB, 'server.js'), project.id), 'Path in folderB is authorized');
  assert(!projMgr1.isPathAuthorized(path.join(outsideFolder, 'hack.js'), project.id), 'Path outside folders is rejected');

  // Add third folder
  const folderC = path.join(testRoot, 'packages', 'shared');
  projMgr1.addFolder(project.id, folderC);
  assert(projMgr1.isPathAuthorized(path.join(folderC, 'types.ts'), project.id), 'Dynamically added folderC is authorized');

  // Verify persistence across new instance from disk
  const projMgr2 = new ProjectManager(testProjectsFile);
  const loadedProj = projMgr2.getProject(project.id);
  assert(Boolean(loadedProj), 'Project persisted and reloaded from storage file');
  assert(loadedProj?.folders.length === 3, 'All 3 multi-folders persisted across restarts');
  assert(loadedProj?.modelId === 'qwen3.5:397b-cloud', 'Preferred model persisted');

  console.log('\n[Phase 3: Persistent Conversation & Session Resume]');
  const testConvDir = path.join(testUserData, 'test-conversations');
  const convStore1 = new ConversationStore(testConvDir);

  const conv = convStore1.createConversation({
    projectId: project.id,
    taskPrompt: 'Build a high-performance REST API router in TypeScript',
    modelId: 'qwen3.5:397b-cloud',
    autonomyMode: 'AUTONOMOUS',
  });

  assert(conv.id.startsWith('conv-'), `Conversation created with ID: ${conv.id}`);
  assert(conv.taskStatus === 'WORKING', 'Conversation initially in WORKING status');

  // Simulate IDE close while task is running -> Test Crash/Restart Recovery
  const convStore2 = new ConversationStore(testConvDir);
  const interrupted = convStore2.getInterruptedTasks(project.id);
  assert(interrupted.length === 1, 'Interrupted task accurately detected on startup');
  assert(interrupted[0].id === conv.id, 'Detected interrupted task matches conversation ID');

  // Resume task and update status
  const toResume = interrupted[0];
  toResume.taskStatus = 'COMPLETED';
  toResume.messages.push({
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content: 'Completed REST API router implementation.',
    timestamp: new Date().toISOString(),
  });
  convStore2.saveConversation(toResume);

  const resumed = convStore2.getConversation(conv.id);
  assert(resumed?.taskStatus === 'COMPLETED', 'Conversation successfully resumed and marked COMPLETED');
  assert(resumed?.messages.length === 2, 'Message turn persisted in conversation session');

  // Test conversation search
  const searchResults = convStore2.search('REST API');
  assert(searchResults.length >= 1, 'Search query found matching conversation history');

  console.log('\n[Phase 4: 3-Tier Persistent Permission System]');
  const testPermFile = path.join(testUserData, 'test-permissions.json');
  const permMgr1 = new PermissionManager(testPermFile);

  assert(permMgr1.checkPermission({ projectId: project.id, category: 'filesystem', action: 'read' }), 'Default: FS read is authorized');
  assert(permMgr1.checkPermission({ projectId: project.id, category: 'filesystem', action: 'write' }), 'Default: FS write is authorized');
  assert(!permMgr1.checkPermission({ projectId: project.id, category: 'filesystem', action: 'delete' }), 'Default: FS delete requires explicit grant');

  // Update permissions
  permMgr1.updateProjectPermissions(project.id, {
    filesystem: { read: true, write: true, delete: true },
    git: { status: true, diff: true, commit: true, push: false },
  });

  // Verify persistence across restart
  const permMgr2 = new PermissionManager(testPermFile);
  assert(permMgr2.checkPermission({ projectId: project.id, category: 'filesystem', action: 'delete' }), 'Persisted: FS delete grant retained across restart');
  assert(permMgr2.checkPermission({ projectId: project.id, category: 'git', action: 'commit' }), 'Persisted: Git commit grant retained across restart');
  assert(!permMgr2.checkPermission({ projectId: project.id, category: 'git', action: 'push' }), 'Unapproved: Git push remains safely denied');

  console.log('\n[Phase 5: Desktop Executable & CLI Packaging]');
  const rootDir = path.resolve(__dirname, '../../');
  const exePath = path.join(rootDir, 'MaxIDE.exe');
  const distExePath = path.join(rootDir, 'dist', 'MaxIDE.exe');
  const cliPath = path.join(rootDir, 'bin', 'maxide.js');
  const cmdPath = path.join(rootDir, 'bin', 'maxide.cmd');

  assert(fs.existsSync(exePath), `Root standalone executable exists: ${exePath}`);
  assert(fs.existsSync(distExePath), `Dist packaged executable exists: ${distExePath}`);
  assert(fs.existsSync(cliPath), `CLI node script exists: ${cliPath}`);
  assert(fs.existsSync(cmdPath), `Windows batch command exists: ${cmdPath}`);

  // Clean up test sandbox
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch {}

  console.log('\n======================================================');
  console.log(`  RESULT: ${passed}/${total} TESTS PASSED (${((passed/total)*100).toFixed(1)}%)`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runDesktopPersistenceTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
