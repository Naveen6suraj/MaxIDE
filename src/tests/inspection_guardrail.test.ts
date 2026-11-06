import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { InspectionTracker } from '../agent/safety/InspectionTracker.js';
import { WorkspaceManager } from '../workspace/WorkspaceManager.js';
import { createWorkspaceTools } from '../agent/tools/WorkspaceTools.js';
import { SafeTerminal } from '../agent/safety/SafeTerminal.js';
import { PatchManager } from '../agent/patch/PatchManager.js';
import { CodebaseIntelligence } from '../agent/intelligence/CodebaseIntelligence.js';
import { DevServerManager } from '../agent/tools/WorkspaceTools.js';

console.log('\n===============================================================');
console.log('  MAXIDE: MANDATORY PRE-EDIT INSPECTION GUARDRAIL TEST SUITE  ');
console.log('===============================================================\n');

const testRoot = path.resolve('temp_inspection_test_ws');
if (fs.existsSync(testRoot)) {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
fs.mkdirSync(testRoot, { recursive: true });

const wm = new WorkspaceManager(testRoot);
const st = new SafeTerminal(testRoot);
const pm = new PatchManager(testRoot);
const intel = new CodebaseIntelligence(testRoot);
const dsm = new DevServerManager();
const tracker = InspectionTracker.getInstance();

const tools = createWorkspaceTools(wm, st, pm, intel, dsm);
const readFileTool = tools.find(t => t.definition.name === 'read_file')!;
const createFileTool = tools.find(t => t.definition.name === 'create_file')!;
const editFileTool = tools.find(t => t.definition.name === 'edit_file')!;

assert(readFileTool, 'read_file tool must exist');
assert(createFileTool, 'create_file tool must exist');
assert(editFileTool, 'edit_file tool must exist');

async function runTests() {
  const sessionId = 'test-session-1';
  tracker.resetSession(sessionId);

  // 1. Create a genuinely new file - should succeed without prior inspection
  console.log('1. Testing creation of a new file...');
  const newFilePath = 'src/app.js';
  const newContent = 'console.log("initial app");';
  const createRes = await createFileTool.execute({ path: newFilePath, content: newContent });
  assert.strictEqual(createRes.success, true, 'Creating new file should succeed');
  assert(fs.existsSync(path.join(testRoot, newFilePath)), 'New file should exist on disk');
  console.log('   PASSED: Creating new file allowed without prior inspection.');

  // 2. Pre-existing file created outside agent session
  const preExistingPath = 'config.json';
  fs.writeFileSync(path.join(testRoot, preExistingPath), '{"version": 1}', 'utf8');

  // Attempting to edit preExistingPath without reading first should fail
  console.log('2. Testing edit on uninspected pre-existing file...');
  tracker.resetSession('global-default-session');
  let threwPreEditError = false;
  try {
    await editFileTool.execute({ path: preExistingPath, content: '{"version": 2}' });
  } catch (err: any) {
    threwPreEditError = true;
    assert(err.message.includes('Pre-Edit Inspection Required') || err.message.includes('must be read'), `Expected pre-edit inspection message, got: ${err.message}`);
  }
  assert.strictEqual(threwPreEditError, true, 'Editing uninspected file must throw pre-edit inspection error');
  console.log('   PASSED: Editing uninspected file strictly blocked.');

  // Attempting to overwrite preExistingPath via create_file without reading should also fail
  console.log('3. Testing overwrite on uninspected pre-existing file via create_file...');
  let threwOverwriteError = false;
  try {
    await createFileTool.execute({ path: preExistingPath, content: '{"version": 3}' });
  } catch (err: any) {
    threwOverwriteError = true;
    assert(err.message.includes('Pre-Edit Inspection Required') || err.message.includes('must be read'), `Expected pre-edit error, got: ${err.message}`);
  }
  assert.strictEqual(threwOverwriteError, true, 'Overwriting uninspected file must throw pre-edit error');
  console.log('   PASSED: Overwriting uninspected file strictly blocked.');

  // 4. Reading the file should record inspection and allow subsequent edit
  console.log('4. Testing read_file then edit_file sequence...');
  const readRes = await readFileTool.execute({ path: preExistingPath });
  assert.strictEqual(readRes.content, '{"version": 1}', 'read_file should return correct content');
  
  const editRes = await editFileTool.execute({ path: preExistingPath, content: '{"version": 2}' });
  assert.strictEqual(editRes.success, true, 'Editing after inspection should succeed');
  const updatedContent = fs.readFileSync(path.join(testRoot, preExistingPath), 'utf8');
  assert.strictEqual(updatedContent, '{"version": 2}', 'File on disk should be updated');
  console.log('   PASSED: Edit succeeded after mandatory inspection.');

  // 5. Test stale inspection detection
  console.log('5. Testing stale inspection detection when file changes externally...');
  // Modify file externally on disk with forward mtime
  const futureTime = new Date(Date.now() + 5000);
  fs.writeFileSync(path.join(testRoot, preExistingPath), '{"version": "modified_externally"}', 'utf8');
  fs.utimesSync(path.join(testRoot, preExistingPath), futureTime, futureTime);

  let threwStaleError = false;
  try {
    await editFileTool.execute({ path: preExistingPath, content: '{"version": "agent_stale_edit"}' });
  } catch (err: any) {
    threwStaleError = true;
    assert(err.message.includes('Pre-Edit Inspection Stale') || err.message.includes('modified on disk after inspection'), `Expected stale message, got: ${err.message}`);
  }
  assert.strictEqual(threwStaleError, true, 'Editing after external modification must be blocked as stale');
  console.log('   PASSED: Stale inspection detected and blocked.');

  // 6. Re-reading stale file allows subsequent edit
  console.log('6. Testing recovery: re-read file then edit...');
  const reReadRes = await readFileTool.execute({ path: preExistingPath });
  assert.strictEqual(reReadRes.content, '{"version": "modified_externally"}');
  const recoverEditRes = await editFileTool.execute({ path: preExistingPath, content: '{"version": "fresh_edit"}' });
  assert.strictEqual(recoverEditRes.success, true, 'Editing after re-reading stale file should succeed');
  assert.strictEqual(fs.readFileSync(path.join(testRoot, preExistingPath), 'utf8'), '{"version": "fresh_edit"}');
  console.log('   PASSED: Recovery re-read and subsequent edit verified.');

  // Clean up temp test workspace
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch {}

  console.log('\n===============================================================');
  console.log('  RESULT: ALL PRE-EDIT INSPECTION GUARDRAIL TESTS PASSED (100%) ');
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
