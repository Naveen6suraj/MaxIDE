/**
 * MaxIDE - Preview Routing & Application Isolation Acceptance Test Suite
 * 
 * Tests:
 * 1. Static HTML preview resolution
 * 2. CSS, JS, JSON, and Image asset delivery with accurate MIME types
 * 3. Subdirectory entry point detection (dist/, public/, modern-web-app/)
 * 4. Dynamic project name and subdirectory routing (/modern-web-app/index.html)
 * 5. SPA fallback isolation (unmatched preview paths return 404, never MaxIDE UI)
 * 6. Path traversal and security sandboxing (../, encoded traversal, absolute drives)
 * 7. Multi-project isolation (/project-preview/:id/* and project switching)
 * 8. Running dev-server preview (dynamic port detection)
 * 9. BrowserTools verification and identity check
 * 10. Requirement 20: C:\\Temp\\MaxIDEPreviewTest acceptance verification
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import express from 'express';
import { WorkspaceManager } from '../workspace/WorkspaceManager.js';
import { ProjectManager } from '../projects/ProjectManager.js';
import { DevServerManager } from '../agent/tools/WorkspaceTools.js';
import { PreviewManager } from '../server/preview/PreviewManager.js';
import { BrowserVerificationAgent } from '../agent/tools/BrowserTools.js';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

export async function runPreviewTestSuite(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  console.log('\n===============================================================');
  console.log('   MAXIDE PREVIEW ROUTING & APPLICATION ISOLATION TEST SUITE   ');
  console.log('===============================================================\n');

  // Setup temporary test directories
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'maxide-preview-test-'));
  const projectADir = path.join(tempBase, 'project-a');
  const projectBDir = path.join(tempBase, 'project-b');
  const subAppDir = path.join(tempBase, 'modern-web-app-project');

  fs.mkdirSync(projectADir, { recursive: true });
  fs.mkdirSync(projectBDir, { recursive: true });
  fs.mkdirSync(subAppDir, { recursive: true });

  // Project A files
  fs.writeFileSync(path.join(projectADir, 'index.html'), '<!DOCTYPE html><html><head><title>Project Alpha</title></head><body><h1>Project Alpha User App</h1></body></html>', 'utf8');
  fs.writeFileSync(path.join(projectADir, 'style.css'), 'body { background: #000; color: #fff; }', 'utf8');
  fs.writeFileSync(path.join(projectADir, 'app.js'), 'console.log("Alpha JS loaded");', 'utf8');
  fs.writeFileSync(path.join(projectADir, 'data.json'), '{"name":"Alpha","status":"ready"}', 'utf8');
  // 1x1 transparent PNG buffer
  const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(projectADir, 'logo.png'), samplePng);

  // Project B files
  fs.writeFileSync(path.join(projectBDir, 'index.html'), '<!DOCTYPE html><html><head><title>Project Beta</title></head><body><h1>Project Beta User App</h1></body></html>', 'utf8');

  // Subdirectory App files (modern-web-app subfolder)
  const nestedDir = path.join(subAppDir, 'modern-web-app');
  fs.mkdirSync(nestedDir, { recursive: true });
  fs.writeFileSync(path.join(nestedDir, 'index.html'), '<!DOCTYPE html><html><head><title>Modern Web App</title></head><body><h1>Playable Tic-Tac-Toe Game</h1></body></html>', 'utf8');

  // Setup Workspace & Project Managers
  const wsMgr = new WorkspaceManager(projectADir);
  const projectsFile = path.join(tempBase, 'projects.json');
  const projMgr = new ProjectManager(projectsFile);

  const projA = projMgr.createProject({ name: 'ProjectAlpha', folders: [projectADir] });
  const projB = projMgr.createProject({ name: 'ProjectBeta', folders: [projectBDir] });
  const projSub = projMgr.createProject({ name: 'modern-web-app', folders: [subAppDir] });

  projMgr.setActiveProject(projA.id);

  const devServerMgr = new DevServerManager();
  const testPort = 34560 + Math.floor(Math.random() * 500);
  const previewMgr = new PreviewManager(wsMgr, projMgr, devServerMgr, testPort);

  // Setup Test Express Server with identical routing pipeline
  const app = express();
  app.use('/workspace-preview', (req, res) => {
    previewMgr.handleWorkspacePreview(req, res);
  });
  app.use('/project-preview/:projectIdOrName', (req, res) => {
    previewMgr.handleProjectPreview(req, res);
  });
  app.use((req, res, next) => {
    previewMgr.handleDynamicProjectOrFolder(req, res, next);
  });

  // Simulated MaxIDE UI static and SPA fallback
  const mockUiDir = path.join(tempBase, 'mock-ui');
  fs.mkdirSync(mockUiDir, { recursive: true });
  fs.writeFileSync(path.join(mockUiDir, 'index.html'), '<!DOCTYPE html><html><head><title>MaxIDE — AI Software Engineering Studio</title></head><body><div id="monaco-container"></div></body></html>', 'utf8');
  app.use(express.static(mockUiDir));

  app.get('*', (req, res) => {
    if (
      req.path.startsWith('/workspace-preview') ||
      req.path.startsWith('/project-preview') ||
      req.path.startsWith('/api')
    ) {
      return res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send('<h2>Preview Resource Not Found</h2>');
    }
    if (path.extname(req.path)) {
      return res.status(404).setHeader('Content-Type', 'text/plain').send(`File Not Found: ${req.path}`);
    }
    res.sendFile(path.join(mockUiDir, 'index.html'));
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(testPort, resolve));

  const fetchUrl = async (pathUrl: string) => {
    const res = await fetch(`http://127.0.0.1:${testPort}${pathUrl}`);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    return { status: res.status, contentType, text };
  };

  try {
    // TEST 1: Static HTML Application Preview
    console.log('[Test 1] Static HTML Application Preview...');
    const t1 = await fetchUrl('/workspace-preview/index.html');
    assert(t1.status === 200, `Status 200 OK, got ${t1.status}`);
    assert(t1.contentType.includes('text/html'), `Content-Type text/html, got ${t1.contentType}`);
    assert(t1.text.includes('Project Alpha User App'), 'Body contains user application title');
    const check1 = PreviewManager.verifyPreviewNotMaxIDE(t1.text);
    assert(!check1.isMaxIDE, 'No MaxIDE UI markers present');
    results.push({ name: '1. Static HTML Application Preview', passed: true, details: 'Correctly served user HTML with zero MaxIDE UI leakage' });
    console.log('  -> PASS');

    // TEST 2: Asset Delivery (CSS, JS, JSON, Images)
    console.log('\n[Test 2] Asset Delivery (CSS, JS, JSON, PNG)...');
    const t2Css = await fetchUrl('/workspace-preview/style.css');
    assert(t2Css.status === 200 && t2Css.contentType.includes('text/css'), 'CSS served with text/css');
    assert(t2Css.text.includes('background: #000'), 'CSS content verified');

    const t2Js = await fetchUrl('/workspace-preview/app.js');
    assert(t2Js.status === 200 && t2Js.contentType.includes('application/javascript'), 'JS served with application/javascript');

    const t2Json = await fetchUrl('/workspace-preview/data.json');
    assert(t2Json.status === 200 && t2Json.contentType.includes('application/json'), 'JSON served with application/json');

    const t2Png = await fetchUrl('/workspace-preview/logo.png');
    assert(t2Png.status === 200 && t2Png.contentType === 'image/png', 'PNG served with image/png');
    results.push({ name: '2. Asset Delivery (MIME Types)', passed: true, details: 'CSS, JS, JSON, PNG served with accurate MIME types' });
    console.log('  -> PASS');

    // TEST 3: Subdirectory Entry Point Detection
    console.log('\n[Test 3] Subdirectory Entry Point Detection...');
    const detected = previewMgr.detectEntryPoint(subAppDir);
    assert(detected.relativePath === 'modern-web-app/index.html', `Detected subfolder entry: ${detected.relativePath}`);
    results.push({ name: '3. Subdirectory Entry Point Detection', passed: true, details: `Auto-detected ${detected.relativePath}` });
    console.log('  -> PASS');

    // TEST 4: Dynamic Project Name / Subdirectory Routing (/modern-web-app/index.html)
    console.log('\n[Test 4] Dynamic Project Name Interception (/modern-web-app/index.html)...');
    const t4 = await fetchUrl('/modern-web-app/index.html');
    assert(t4.status === 200, `Status 200, got ${t4.status}`);
    assert(t4.text.includes('Playable Tic-Tac-Toe Game'), 'Body contains user game, NOT MaxIDE');
    const check4 = PreviewManager.verifyPreviewNotMaxIDE(t4.text);
    assert(!check4.isMaxIDE, 'No MaxIDE UI markers present');
    results.push({ name: '4. Dynamic Project Routing (/modern-web-app/index.html)', passed: true, details: 'Correctly served user project without falling into MaxIDE SPA' });
    console.log('  -> PASS');

    // TEST 5: SPA Fallback Isolation
    console.log('\n[Test 5] SPA Fallback Isolation (Missing Assets Return 404, Not MaxIDE)...');
    const t5MissingHtml = await fetchUrl('/workspace-preview/nonexistent.html');
    assert(t5MissingHtml.status === 404, `Missing preview HTML returns 404, got ${t5MissingHtml.status}`);
    assert(!t5MissingHtml.text.includes('monaco-container'), 'Does NOT return MaxIDE UI');

    const t5MissingCss = await fetchUrl('/workspace-preview/missing.css');
    assert(t5MissingCss.status === 404, 'Missing preview CSS returns 404');
    assert(!t5MissingCss.text.includes('monaco-container'), 'Missing CSS does NOT return MaxIDE UI');

    const t5AssetExt = await fetchUrl('/nonexistent-script.js');
    assert(t5AssetExt.status === 404, 'Direct missing asset returns 404, not SPA index.html');

    const t5RootSpa = await fetchUrl('/');
    assert(t5RootSpa.status === 200 && t5RootSpa.text.includes('monaco-container'), 'Root path / serves MaxIDE UI');
    results.push({ name: '5. SPA Fallback Isolation', passed: true, details: 'Preview routes and asset requests strictly 404 without falling into SPA' });
    console.log('  -> PASS');

    // TEST 6: Path Traversal & Security Sandboxing
    console.log('\n[Test 6] Path Traversal & Security Sandboxing...');
    const t6Traversal1 = await fetchUrl('/workspace-preview/../projects.json');
    assert(t6Traversal1.status === 403 || t6Traversal1.status === 404, `Directory traversal rejected with 403/404, got ${t6Traversal1.status}`);
    assert(!t6Traversal1.text.includes('ProjectAlpha'), 'Cannot read outside files');

    const t6Traversal2 = await fetchUrl('/workspace-preview/%2e%2e/projects.json');
    assert(t6Traversal2.status === 403 || t6Traversal2.status === 404, 'Encoded traversal rejected');
    results.push({ name: '6. Path Traversal & Sandboxing', passed: true, details: 'Relative, encoded, and boundary-escaping paths strictly blocked' });
    console.log('  -> PASS');

    // TEST 7: Multi-Project Isolation
    console.log('\n[Test 7] Multi-Project Isolation...');
    const t7ProjA = await fetchUrl(`/project-preview/${projA.id}/index.html`);
    assert(t7ProjA.status === 200 && t7ProjA.text.includes('Project Alpha'), 'Project A preview serves Project Alpha');
    assert(!t7ProjA.text.includes('Project Beta'), 'Project A preview does not leak Project Beta');

    const t7ProjB = await fetchUrl(`/project-preview/${projB.id}/index.html`);
    assert(t7ProjB.status === 200 && t7ProjB.text.includes('Project Beta'), 'Project B preview serves Project Beta');
    assert(!t7ProjB.text.includes('Project Alpha'), 'Project B preview does not leak Project Alpha');

    // Switch active project to Project B
    projMgr.setActiveProject(projB.id);
    wsMgr.setRootPath(projectBDir);
    const t7Switched = await fetchUrl('/workspace-preview/index.html');
    assert(t7Switched.text.includes('Project Beta'), 'Workspace preview updates to Project Beta upon switching');
    results.push({ name: '7. Multi-Project Isolation', passed: true, details: 'Isolated project routes and active project switching verified' });
    console.log('  -> PASS');

    // TEST 8: Running Dev Server Dynamic Port Detection
    console.log('\n[Test 8] Running Dev Server Dynamic Port Detection...');
    const devPort = testPort + 2;
    const mockDevServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Running Vite React Dev Server</h1>');
    });
    await new Promise<void>((res) => mockDevServer.listen(devPort, res));

    // Register active dev server
    (devServerMgr as any).activeServers.set('react-app', {
      command: `npm run dev -- --port ${devPort}`,
      port: devPort,
      process: { kill: () => {} },
    });

    const devInfo = previewMgr.getPreviewInfo(projA.id);
    assert(devInfo.type === 'dev_server', `Dev server detected, got ${devInfo.type}`);
    assert(devInfo.port === devPort, `Dev port ${devPort} matched`);
    assert(devInfo.previewUrl === `http://127.0.0.1:${devPort}`, 'Dev server URL formatted correctly');

    // Clean up dev server
    devServerMgr.stopServer('react-app');
    await new Promise<void>((res) => mockDevServer.close(() => res()));
    results.push({ name: '8. Running Dev Server Dynamic Detection', passed: true, details: `Detected active dev server on port ${devPort}` });
    console.log('  -> PASS');

    // TEST 9: BrowserTools Verification & Identity Check
    console.log('\n[Test 9] BrowserTools Verification & Identity Check...');
    const browserAgent = new BrowserVerificationAgent();
    try {
      const navResult = await browserAgent.navigate(`http://127.0.0.1:${testPort}/workspace-preview/index.html`);
      assert(navResult.success === true, 'Browser navigated to preview URL successfully');
      assert(navResult.title === 'Project Beta', `Page title matches user application: "${navResult.title}"`);

      const verifyApp = await browserAgent.verifyApplicationLoaded({ expectedKeyword: 'Project Beta User App' });
      assert(verifyApp.verified === true, 'Identity check confirmed genuine user application');

      // Test interception detection: mock page with MaxIDE marker
      fs.writeFileSync(path.join(projectBDir, 'broken.html'), '<div id="monaco-container">MaxIDE UI</div>', 'utf8');
      const badNav = await browserAgent.navigate(`http://127.0.0.1:${testPort}/workspace-preview/broken.html`);
      assert(badNav.success === false, 'BrowserTools detected MaxIDE UI interception');
      assert(Boolean(badNav.errors?.[0]?.includes('Preview routing returned MaxIDE')), 'Correct diagnostic error reported');
      results.push({ name: '9. BrowserTools Identity Check', passed: true, details: 'Confirmed user application DOM and intercepted bogus routing' });
      console.log('  -> PASS');
    } finally {
      await browserAgent.close();
    }

    // TEST 10: Requirement 20: C:\Temp\MaxIDEPreviewTest Real Test Project
    console.log('\n[Test 10] Requirement 20: C:\\Temp\\MaxIDEPreviewTest Acceptance Verification...');
    const req20Dir = 'C:\\Temp\\MaxIDEPreviewTest';
    if (!fs.existsSync(req20Dir)) fs.mkdirSync(req20Dir, { recursive: true });
    fs.writeFileSync(
      path.join(req20Dir, 'index.html'),
      '<!DOCTYPE html><html><head><title>User Test App</title></head><body><h1>THIS IS THE USER APPLICATION</h1></body></html>',
      'utf8'
    );

    wsMgr.setRootPath(req20Dir);
    const t10 = await fetchUrl('/workspace-preview/index.html');
    assert(t10.status === 200, 'C:\\Temp\\MaxIDEPreviewTest index.html served');
    assert(t10.text.includes('THIS IS THE USER APPLICATION'), 'Body strictly contains "THIS IS THE USER APPLICATION"');
    assert(!t10.text.includes('MaxIDE — AI Software Engineering Studio'), 'Does NOT contain MaxIDE Studio text');
    results.push({ name: '10. Requirement 20 Acceptance Test', passed: true, details: 'C:\\Temp\\MaxIDEPreviewTest displayed user application cleanly' });
    console.log('  -> PASS');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {}
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n===============================================================');
  console.log(`  PREVIEW SUITE RESULTS: ${passed}/${results.length} PASSED (${Math.round((passed / results.length) * 100)}%)  `);
  console.log('===============================================================\n');

  for (const r of results) {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}: ${r.details || ''}`);
  }

  return { passed, failed, results };
}

if (process.argv[1]?.endsWith('preview_routing.test.ts') || process.argv[1]?.endsWith('preview_routing.test.js')) {
  runPreviewTestSuite().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
