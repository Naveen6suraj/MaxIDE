/**
 * MaxIDE - Universal Format Ingestion & Execution Test Suite
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { app } from '../server/index.js';

const WS = path.resolve(process.cwd(), 'test-agentic-ws');
let serverInstance: http.Server | null = null;
let baseUrl = 'http://127.0.0.1:3456';

async function ensureServerRunning(): Promise<string> {
  try {
    const res = await fetch('http://127.0.0.1:3456/api/health', { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      return 'http://127.0.0.1:3456';
    }
  } catch {}

  const s = http.createServer(app);
  await new Promise<void>((resolve) => {
    s.listen(0, '127.0.0.1', () => {
      serverInstance = s;
      const addr = s.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
  return baseUrl;
}

async function runUniversalFormatsTest() {
  console.log('\n===============================================================');
  console.log('  MAXIDE: UNIVERSAL MULTI-FORMAT INGESTION TEST SUITE          ');
  console.log('===============================================================\n');

  const activeUrl = await ensureServerRunning();
  console.log(`Connected to MaxIDE test backend at: ${activeUrl}`);

  if (!fs.existsSync(WS)) fs.mkdirSync(WS, { recursive: true });

  try {
    // 1. Test CSV Ingestion
    console.log('1. Testing Tabular Data (.csv)...');
    const csvContent = 'id,name,role,experience_years\n1,Alice,ML Engineer,4\n2,Bob,FullStack Developer,5\n3,Charlie,DevOps,3';
    const csvRes = await fetch(`${activeUrl}/api/workspace/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{
          name: 'team_roster.csv',
          contentBase64: Buffer.from(csvContent).toString('base64'),
          type: 'text/csv'
        }]
      })
    });
    const csvData: any = await csvRes.json();
    if (!csvData.success || !csvData.results[0].textContent.includes('Alice')) {
      throw new Error('CSV ingestion failed: ' + JSON.stringify(csvData));
    }
    console.log('   PASSED: CSV parsed into tabular dataset context.\n');

    // 2. Test JSON & Markdown Ingestion
    console.log('2. Testing Structured JSON & Markdown Ingestion...');
    const jsonContent = JSON.stringify({ project: 'MaxIDE', version: '1.0.0', features: ['AI Gateway', 'Agent Engine'] });
    const mdContent = '# MaxIDE Architecture\n\nAI-Native Studio with multi-model capability.';
    const multiRes = await fetch(`${activeUrl}/api/workspace/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [
          { name: 'spec.json', contentBase64: Buffer.from(jsonContent).toString('base64'), type: 'application/json' },
          { name: 'README.md', contentBase64: Buffer.from(mdContent).toString('base64'), type: 'text/markdown' },
        ]
      })
    });
    const multiData: any = await multiRes.json();
    if (!multiData.success || multiData.count !== 2) {
      throw new Error('Multi-format JSON/MD ingestion failed: ' + JSON.stringify(multiData));
    }
    console.log('   PASSED: JSON and Markdown files parsed and ingested into agent context.\n');

    // 3. Test Raw File Serving Endpoint
    console.log('3. Testing Raw File Serving (/api/workspace/file?raw=true)...');
    const rawContent = 'MaxIDE Raw File Verification Content - ' + Date.now();
    await fetch(`${activeUrl}/api/workspace/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'raw-test.txt', content: rawContent }),
    });

    const rawRes = await fetch(`${activeUrl}/api/workspace/file?path=raw-test.txt&raw=true`);
    const rawFetched = await rawRes.text();
    if (rawFetched !== rawContent) {
      throw new Error(`Raw file serving failed. Expected "${rawContent}", got "${rawFetched}"`);
    }
    console.log('   PASSED: Raw static asset serving matches disk byte-for-byte.\n');

    console.log('===============================================================');
    console.log('  RESULT: ALL UNIVERSAL FORMAT INGESTION TESTS PASSED (100%)    ');
    console.log('===============================================================\n');
  } finally {
    if (serverInstance) {
      serverInstance.close();
      serverInstance.unref();
    }
  }
}

runUniversalFormatsTest().catch((err) => {
  console.error('\n❌ FATAL TEST ERROR:', err);
  if (serverInstance) serverInstance.close();
  process.exit(1);
});
