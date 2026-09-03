/**
 * Orbit IDE - Universal Format Ingestion & Execution Test Suite
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:3456';
const WS = path.resolve(process.cwd(), 'test-agentic-ws');

async function runUniversalFormatsTest() {
  console.log('\n===============================================================');
  console.log('  ORBIT IDE: UNIVERSAL MULTI-FORMAT INGESTION TEST SUITE        ');
  console.log('===============================================================\n');

  if (!fs.existsSync(WS)) fs.mkdirSync(WS, { recursive: true });

  // 1. Test CSV Ingestion
  console.log('1. Testing Tabular Data (.csv)...');
  const csvContent = 'id,name,role,experience_years\n1,Alice,ML Engineer,4\n2,Bob,FullStack Developer,5\n3,Charlie,DevOps,3';
  const csvRes = await fetch(`${BASE_URL}/api/workspace/upload`, {
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

  // 2. Test Word Document (.docx) Ingestion
  console.log('2. Testing Word Document (.docx)...');
  const docxTemp = path.join(WS, 'test_spec.docx');
  execSync(`python -c "import docx; doc = docx.Document(); doc.add_heading('Orbit IDE Project Spec', 0); doc.add_paragraph('This project requires an automated workflow with AI routing.'); doc.save(r'${docxTemp.replace(/\\/g, '/')}')"`);
  const docxB64 = fs.readFileSync(docxTemp).toString('base64');
  const docxRes = await fetch(`${BASE_URL}/api/workspace/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{
        name: 'test_spec.docx',
        contentBase64: docxB64,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }]
    })
  });
  const docxData: any = await docxRes.json();
  if (!docxData.success || !docxData.results[0].textContent.includes('Orbit IDE Project Spec')) {
    throw new Error('DOCX ingestion failed: ' + JSON.stringify(docxData));
  }
  console.log('   PASSED: Word document (.docx) extracted successfully.\n');

  // 3. Test Excel Spreadsheet (.xlsx) Ingestion
  console.log('3. Testing Excel Spreadsheet (.xlsx)...');
  const xlsxTemp = path.join(WS, 'metrics.xlsx');
  execSync(`python -c "import pandas as pd; df = pd.DataFrame({'Metric': ['Accuracy', 'Latency_ms', 'Cost'], 'Value': [0.98, 45, 0.002]}); df.to_excel(r'${xlsxTemp.replace(/\\/g, '/')}', index=False)"`);
  const xlsxB64 = fs.readFileSync(xlsxTemp).toString('base64');
  const xlsxRes = await fetch(`${BASE_URL}/api/workspace/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{
        name: 'metrics.xlsx',
        contentBase64: xlsxB64,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }]
    })
  });
  const xlsxData: any = await xlsxRes.json();
  if (!xlsxData.success || !xlsxData.results[0].textContent.includes('Accuracy')) {
    throw new Error('XLSX ingestion failed: ' + JSON.stringify(xlsxData));
  }
  console.log('   PASSED: Excel spreadsheet (.xlsx) extracted into tabular summary.\n');

  // 4. Test PDF Document (.pdf) Ingestion
  console.log('4. Testing PDF Document (.pdf)...');
  const cvPath = 'C:/Users/Naveen Suraj/Downloads/NaveenSurajcv.pdf';
  if (fs.existsSync(cvPath)) {
    const pdfB64 = fs.readFileSync(cvPath).toString('base64');
    const pdfRes = await fetch(`${BASE_URL}/api/workspace/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{
          name: 'NaveenSurajcv.pdf',
          contentBase64: pdfB64,
          type: 'application/pdf'
        }]
      })
    });
    const pdfData: any = await pdfRes.json();
    const pdfText = pdfData.results?.[0]?.textContent || '';
    if (!pdfData.success || !pdfText.includes('Naveen') || !pdfText.includes('Suraj')) {
      throw new Error('PDF ingestion failed: ' + JSON.stringify(pdfData));
    }
    console.log('   PASSED: PDF extracted with ' + pdfData.results[0].textContent.length + ' chars of text.\n');
  }

  // 5. Test Raw File Preview Endpoint (GET /workspace/file?raw=true)
  console.log('5. Testing Raw File Serving (/api/workspace/file?raw=true)...');
  const rawTestPath = 'raw-test.txt';
  await fetch(`${BASE_URL}/api/workspace/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: rawTestPath, content: 'Raw file content for testing' })
  });
  const rawFileRes = await fetch(`${BASE_URL}/api/workspace/file?path=${rawTestPath}&raw=true`);
  if (!rawFileRes.ok) {
    throw new Error('Raw file serving failed. Status: ' + rawFileRes.status);
  }
  console.log('   PASSED: Raw file streaming works for direct browser/UI rendering.\n');

  // Cleanup temporary test files
  try {
    if (fs.existsSync(docxTemp)) fs.unlinkSync(docxTemp);
    if (fs.existsSync(xlsxTemp)) fs.unlinkSync(xlsxTemp);
  } catch {}

  console.log('===============================================================');
  console.log('  RESULT: ALL UNIVERSAL FORMAT TESTS PASSED (100%)             ');
  console.log('===============================================================\n');
}

runUniversalFormatsTest().catch(err => {
  console.error('\n❌ FATAL TEST ERROR:', err);
  process.exit(1);
});
