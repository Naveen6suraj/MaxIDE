/**
 * MaxIDE - Windows Device Path Security & Canonicalization Regression Test Suite
 * Validates mitigation of MS-DOS reserved device names, case insensitivity,
 * trailing spaces/dots, extensions, nested directories, and legitimate name preservation.
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WorkspaceManager } from '../workspace/WorkspaceManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.resolve(__dirname, '../../data/test_device_paths');

async function runDevicePathSecurityTests() {
  console.log('\n===============================================================');
  console.log('  MAXIDE: WINDOWS DEVICE PATH SECURITY REGRESSION TEST SUITE   ');
  console.log('===============================================================\n');

  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  const wm = new WorkspaceManager(TEST_DIR);

  // 1. Test All Reserved Device Names (Exact Uppercase)
  console.log('1. Testing All Reserved Device Names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)...');
  const reservedStems = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  for (const stem of reservedStems) {
    assert.throws(() => wm.resolveSafePath(stem), (err: any) => err.message.includes('Windows reserved device name'),
      `Expected ${stem} to be rejected`);
  }
  console.log(`   PASSED: All ${reservedStems.length} reserved device names rejected.`);

  // 2. Test Case Insensitivity (con, AuX, nUl, com5, lPt1)
  console.log('\n2. Testing Case Variations...');
  const caseVariants = ['con', 'Con', 'cOn', 'aux', 'AuX', 'aUx', 'nul', 'NuL', 'com1', 'CoM5', 'lpt1', 'LpT9'];
  for (const cv of caseVariants) {
    assert.throws(() => wm.resolveSafePath(cv), (err: any) => err.message.includes('Windows reserved device name'),
      `Expected case variant ${cv} to be rejected`);
  }
  console.log(`   PASSED: All ${caseVariants.length} case variants rejected.`);

  // 3. Test Extensions on Reserved Names (CON.txt, aux.json, nul.log)
  console.log('\n3. Testing Extensions on Reserved Names...');
  const extVariants = ['CON.txt', 'con.tar.gz', 'prn.pdf', 'aux.json', 'NUL.dat', 'com1.log', 'lpt2.config'];
  for (const ev of extVariants) {
    assert.throws(() => wm.resolveSafePath(ev), (err: any) => err.message.includes('Windows reserved device name'),
      `Expected extension variant ${ev} to be rejected`);
  }
  console.log(`   PASSED: All ${extVariants.length} extension variants rejected.`);

  // 4. Test Trailing Spaces and Dots (CON , CON., aux...)
  console.log('\n4. Testing Trailing Spaces and Dots...');
  const trailingVariants = ['CON ', 'con  ', 'AUX.', 'aux...', 'NUL. . .', 'com3 .txt'];
  for (const tv of trailingVariants) {
    assert.throws(() => wm.resolveSafePath(tv), (err: any) => err.message.includes('Windows reserved device name'),
      `Expected trailing variant "${tv}" to be rejected`);
  }
  console.log(`   PASSED: All ${trailingVariants.length} trailing variants rejected.`);

  // 5. Test Nested Directory Components (src/con/app.ts, foo/bar/aux/baz.js)
  console.log('\n5. Testing Nested Directory Components...');
  const nestedVariants = [
    'src/con/app.ts',
    'backend/database/aux/query.sql',
    'app/routes/prn/index.js',
    'components\\com1\\button.tsx',
    'deep\\dir\\structure\\nul\\file.txt'
  ];
  for (const nv of nestedVariants) {
    assert.throws(() => wm.resolveSafePath(nv), (err: any) => err.message.includes('Windows reserved device name'),
      `Expected nested path "${nv}" to be rejected`);
  }
  console.log(`   PASSED: All ${nestedVariants.length} nested paths with reserved directory segments rejected.`);

  // 6. Test Legitimate Filenames (Must NOT be rejected!)
  console.log('\n6. Testing Legitimate Filenames Containing Reserved Substrings...');
  const legitimate = [
    'constant.ts',
    'contact.html',
    'layout.css',
    'component.tsx',
    'container.js',
    'connect.ts',
    'convex.js',
    'nuls.ts',
    'auxiliary.py',
    'printer.go',
    'community.json'
  ];
  for (const leg of legitimate) {
    const resolved = wm.resolveSafePath(leg);
    assert.ok(resolved.endsWith(path.normalize(leg)), `Expected legitimate path ${leg} to resolve cleanly`);
  }
  console.log(`   PASSED: All ${legitimate.length} legitimate filenames resolved without false positive rejection.`);

  // Clean up
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });

  console.log('\n===============================================================');
  console.log('  RESULT: ALL WINDOWS DEVICE PATH SECURITY TESTS PASSED (100%) ');
  console.log('===============================================================\n');
}

runDevicePathSecurityTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
