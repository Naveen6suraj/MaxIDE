import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { ClosedLoopTestEngine } from '../agent/verification/ClosedLoopTestEngine.js';
import { SafeTerminal } from '../agent/safety/SafeTerminal.js';
import { CheckpointManager } from '../agent/checkpoint/CheckpointManager.js';

console.log('\n===============================================================');
console.log('  MAXIDE: CLOSED-LOOP TEST & AUTO-REPAIR ENGINE REGRESSION SUITE  ');
console.log('===============================================================\n');

const testRoot = path.resolve('temp_closed_loop_ws');
if (fs.existsSync(testRoot)) {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
fs.mkdirSync(testRoot, { recursive: true });

const st = new SafeTerminal(testRoot);
const cm = new CheckpointManager(testRoot);
const testEngine = new ClosedLoopTestEngine(testRoot, st, cm);

async function runTests() {
  // 1. Test Discovery in empty project
  console.log('1. Testing discovery in empty project...');
  const emptyDisc = testEngine.discoverTests();
  assert.strictEqual(emptyDisc.hasTests, false, 'Empty project should not have tests');
  console.log('   PASSED: Empty project correctly identified as having no tests.');

  // 2. Test Discovery in Node.js project with package.json
  console.log('2. Testing discovery with package.json test script...');
  const pkgJson = {
    name: 'test-app',
    scripts: {
      test: 'node test.js',
      build: 'echo build-ok',
    },
  };
  fs.writeFileSync(path.join(testRoot, 'package.json'), JSON.stringify(pkgJson, null, 2));
  const nodeDisc = testEngine.discoverTests();
  assert.strictEqual(nodeDisc.hasTests, true, 'Node project with test script should have tests');
  assert.strictEqual(nodeDisc.techStack, 'node');
  assert.strictEqual(nodeDisc.testCommand, 'npm test');
  assert.strictEqual(nodeDisc.buildCommand, 'npm run build');
  console.log('   PASSED: Node.js test & build scripts correctly discovered.');

  // 3. Test Execution on passing test script
  console.log('3. Testing execution of passing test...');
  fs.writeFileSync(path.join(testRoot, 'test.js'), 'console.log("ALL TESTS PASS"); process.exit(0);');
  const passResult = await testEngine.runTests('node test.js');
  assert.strictEqual(passResult.passed, true, 'Passing test should report passed: true');
  assert.strictEqual(passResult.exitCode, 0);
  assert.strictEqual(passResult.parsedFailures.length, 0);
  console.log('   PASSED: Passing test executed and verified (exitCode 0).');

  // 4. Test Execution on failing test script with error diagnostics
  console.log('4. Testing execution of failing test with diagnostics...');
  fs.writeFileSync(path.join(testRoot, 'test.js'), 'console.error("AssertionError: Expected 200 OK but got 500 Internal Server Error at test.js:5:10"); process.exit(1);');
  const failResult = await testEngine.runTests('node test.js');
  assert.strictEqual(failResult.passed, false, 'Failing test should report passed: false');
  assert.strictEqual(failResult.exitCode, 1);
  assert(failResult.parsedFailures.length > 0, 'Parsed failures should contain diagnostic lines');
  assert(failResult.parsedFailures.some(f => f.includes('AssertionError')), 'Parsed failures should identify AssertionError');
  console.log('   PASSED: Failing test captured and parsed diagnostic lines:', failResult.parsedFailures);

  // 5. Test Diagnostic Parsing directly
  console.log('5. Testing error diagnostic parsing logic...');
  const stdoutSample = 'TAP version 13\n# not ok 1 - database query returned null';
  const stderrSample = 'TypeError: Cannot read properties of undefined (reading "id")\n    at UserService.getUser (user.js:42:15)';
  const diagnostics = testEngine.parseErrorDiagnostics(stdoutSample, stderrSample);
  assert(diagnostics.length >= 2, 'Should extract both TAP failure and TypeError');
  assert(diagnostics.some(d => d.includes('TypeError')), 'Should parse TypeError');
  assert(diagnostics.some(d => d.includes('not ok 1')), 'Should parse TAP failure');
  console.log('   PASSED: Multi-line runtime diagnostics successfully extracted.');

  // Clean up temp test workspace
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch {}

  console.log('\n===============================================================');
  console.log('  RESULT: ALL CLOSED-LOOP TEST ENGINE TESTS PASSED (100%)       ');
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
