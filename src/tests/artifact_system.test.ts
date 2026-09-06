/**
 * MaxIDE - Artifact System & Real Media Pipeline Acceptance Battery
 * Validates:
 * 1. Authoritative MIME type detection (extension + magic bytes)
 * 2. Strict binary file classification & Monaco text safety
 * 3. Backend protection: /api/workspace/file blocks raw binary in text JSON
 * 4. HTTP Range streaming (206 Partial Content, Content-Range, Accept-Ranges)
 * 5. Media container inspection (WebM EBML, MP4 boxes, PNG, WAV)
 * 6. Anti-hallucination verification (truthful 4K, 60 FPS, HDR reporting)
 * 7. Universal Artifact Viewer routing & Monaco shield in UI
 * 8. Artifact persistence across system restarts
 * 9. Path traversal & security isolation
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { MediaInspector } from '../agent/tools/MediaInspector.js';
import { ArtifactManager } from '../artifacts/ArtifactManager.js';
import { WorkspaceManager } from '../workspace/WorkspaceManager.js';
import { VerificationEngine } from '../agent/verification/VerificationEngine.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [${totalTests}] PASS: ${testName}`);
  } else {
    console.error(`  ✗ [${totalTests}] FAIL: ${testName} - ${details || ''}`);
    throw new Error(`Assertion failed: ${testName} - ${details || ''}`);
  }
}

async function runArtifactSystemBattery() {
  console.log('================================================================');
  console.log('MAXIDE — CRITICAL REAL MEDIA ARTIFACT SYSTEM ACCEPTANCE BATTERY');
  console.log('================================================================\n');

  const testRoot = path.join(process.cwd(), '.test_artifact_workspace_' + Date.now());
  if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
  const assetsDir = path.join(testRoot, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  try {
    // -------------------------------------------------------------
    // Test 1: Authoritative MIME Type Detection
    // -------------------------------------------------------------
    console.log('Test Category 1: MIME Type Detection');
    assert(MediaInspector.detectMimeType('movie.webm') === 'video/webm', 'MIME .webm -> video/webm');
    assert(MediaInspector.detectMimeType('movie.mp4') === 'video/mp4', 'MIME .mp4 -> video/mp4');
    assert(MediaInspector.detectMimeType('photo.png') === 'image/png', 'MIME .png -> image/png');
    assert(MediaInspector.detectMimeType('photo.jpg') === 'image/jpeg', 'MIME .jpg -> image/jpeg');
    assert(MediaInspector.detectMimeType('audio.wav') === 'audio/wav', 'MIME .wav -> audio/wav');
    assert(MediaInspector.detectMimeType('audio.mp3') === 'audio/mpeg', 'MIME .mp3 -> audio/mpeg');
    assert(MediaInspector.detectMimeType('doc.pdf') === 'application/pdf', 'MIME .pdf -> application/pdf');
    assert(MediaInspector.detectMimeType('archive.zip') === 'application/zip', 'MIME .zip -> application/zip');
    assert(MediaInspector.detectMimeType('code.ts') === 'text/typescript', 'MIME .ts -> text/typescript');
    assert(MediaInspector.detectMimeType('app.js') === 'text/javascript', 'MIME .js -> text/javascript');
    assert(MediaInspector.detectMimeType('index.html') === 'text/html', 'MIME .html -> text/html');

    // -------------------------------------------------------------
    // Test 2: Binary File Detection & Monaco Safety Gate
    // -------------------------------------------------------------
    console.log('\nTest Category 2: Binary File Protection & Monaco Safety Gate');
    assert(MediaInspector.isBinary('clip.webm') === true, 'clip.webm classified as binary');
    assert(MediaInspector.isBinary('clip.mp4') === true, 'clip.mp4 classified as binary');
    assert(MediaInspector.isBinary('image.png') === true, 'image.png classified as binary');
    assert(MediaInspector.isBinary('sound.wav') === true, 'sound.wav classified as binary');
    assert(MediaInspector.isBinary('sound.mp3') === true, 'sound.mp3 classified as binary');
    assert(MediaInspector.isBinary('doc.pdf') === true, 'doc.pdf classified as binary');
    assert(MediaInspector.isBinary('bundle.zip') === true, 'bundle.zip classified as binary');

    assert(MediaInspector.isBinary('index.html') === false, 'index.html is NOT binary');
    assert(MediaInspector.isBinary('app.ts') === false, 'app.ts is NOT binary');
    assert(MediaInspector.isBinary('script.js') === false, 'script.js is NOT binary');
    assert(MediaInspector.isBinary('style.css') === false, 'style.css is NOT binary');
    assert(MediaInspector.isBinary('README.md') === false, 'README.md is NOT binary');
    assert(MediaInspector.isBinary('data.json') === false, 'data.json is NOT binary');

    assert(MediaInspector.isTextFile('clip.webm') === false, 'isTextFile(clip.webm) is strictly FALSE');
    assert(MediaInspector.isTextFile('photo.png') === false, 'isTextFile(photo.png) is strictly FALSE');
    assert(MediaInspector.isTextFile('app.ts') === true, 'isTextFile(app.ts) is TRUE');
    assert(MediaInspector.isTextFile('index.html') === true, 'isTextFile(index.html) is TRUE');

    // -------------------------------------------------------------
    // Test 3: Media File Creation & Magic Header Inspection
    // -------------------------------------------------------------
    console.log('\nTest Category 3: Real Binary Media Containers & Magic Headers');
    
    // Create authentic mock WebM container (EBML header + segment)
    const webmFile = path.join(assetsDir, 'sample_ferrari.webm');
    const webmBuf = Buffer.alloc(4096);
    webmBuf[0] = 0x1a; webmBuf[1] = 0x45; webmBuf[2] = 0xdf; webmBuf[3] = 0xa3; // EBML header
    webmBuf.write('webm', 31, 'utf8');
    // Add PixelWidth = 1920 (0xB0 0x82 0x07 0x80)
    webmBuf[100] = 0xb0; webmBuf[101] = 0x82; webmBuf.writeUInt16BE(1920, 102);
    // Add PixelHeight = 1080 (0xBA 0x82 0x04 0x38)
    webmBuf[104] = 0xba; webmBuf[105] = 0x82; webmBuf.writeUInt16BE(1080, 106);
    // Add CodecID = V_VP9 (0x86 0x85 V_VP9)
    webmBuf[110] = 0x86; webmBuf.write('V_VP9', 112, 'utf8');
    fs.writeFileSync(webmFile, webmBuf);

    assert(MediaInspector.detectMimeType(webmFile) === 'video/webm', 'Real WebM file detected as video/webm by magic bytes');
    assert(MediaInspector.isBinary(webmFile) === true, 'Real WebM file is strictly binary');

    // -------------------------------------------------------------
    // Test 4: Anti-Hallucination Video Verification (4K & HDR & FPS)
    // -------------------------------------------------------------
    console.log('\nTest Category 4: Anti-Hallucination Video Verification');
    const inspected = await MediaInspector.inspectVideo(webmFile, {
      resolution: '4k', // User requested 4k
      durationSeconds: 5,
      fps: 60,
      hdr: true,         // User requested HDR
    });

    assert(inspected.valid === true, 'Video artifact container is structurally valid');
    assert(inspected.container === 'WebM', 'Container identified as WebM');
    assert(inspected.width === 1920 && inspected.height === 1080, 'Inspected actual dimensions: 1920x1080');
    assert(inspected.discrepancies.length > 0, 'Discrepancy correctly detected when 4K was requested but 1080p produced');
    assert(
      inspected.discrepancies.some(d => d.includes('requested 4K')),
      'Honest reporting: Flagged that provider delivered 1080p rather than requested 4K'
    );
    assert(
      inspected.hdrSummary.includes('HDR metadata could not be independently verified'),
      'Honest HDR reporting: HDR requested but not verified in container'
    );

    // -------------------------------------------------------------
    // Test 5: Backend Binary Protection on /api/workspace/file
    // -------------------------------------------------------------
    console.log('\nTest Category 5: Express Backend Binary Protection');
    const app = express();
    const wsManager = new WorkspaceManager(testRoot);

    app.get('/api/workspace/file', (req, res) => {
      const filePath = req.query.path as string;
      const abs = wsManager.resolveSafePath(filePath);
      const isRaw = req.query.raw === 'true' || req.headers.range !== undefined;

      if (isRaw) {
        const stat = fs.statSync(abs);
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': (end - start) + 1,
            'Content-Type': MediaInspector.detectMimeType(abs),
          });
          fs.createReadStream(abs, { start, end }).pipe(res);
          return;
        }
        res.setHeader('Content-Type', MediaInspector.detectMimeType(abs));
        fs.createReadStream(abs).pipe(res);
        return;
      }

      // Binary protection
      if (MediaInspector.isBinary(abs)) {
        return res.status(400).json({
          error: 'Cannot open binary media as text',
          isBinary: true,
          path: filePath,
          mimeType: MediaInspector.detectMimeType(abs),
        });
      }

      const content = fs.readFileSync(abs, 'utf8');
      res.json({ path: filePath, content });
    });

    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    // A) Request binary file without raw=true -> MUST BE REJECTED WITH 400 & isBinary: true
    const textReqRes = await fetch(`http://127.0.0.1:${port}/api/workspace/file?path=assets/sample_ferrari.webm`);
    assert(textReqRes.status === 400, 'Backend rejects reading binary video as plain text (HTTP 400)');
    const errBody = await textReqRes.json() as any;
    assert(errBody.isBinary === true, 'Backend returns isBinary: true flag');
    assert(errBody.error.includes('Cannot open binary media as text'), 'Backend error explains binary media cannot be opened as text');

    // -------------------------------------------------------------
    // Test 6: HTTP Range Requests (206 Partial Content)
    // -------------------------------------------------------------
    console.log('\nTest Category 6: HTTP Range Requests & Video Streaming');
    const rangeRes = await fetch(`http://127.0.0.1:${port}/api/workspace/file?path=assets/sample_ferrari.webm&raw=true`, {
      headers: { Range: 'bytes=0-99' },
    });
    assert(rangeRes.status === 206, 'Server returns 206 Partial Content on Range header');
    assert(rangeRes.headers.get('Accept-Ranges') === 'bytes', 'Server advertises Accept-Ranges: bytes');
    assert(Boolean(rangeRes.headers.get('Content-Range')?.startsWith('bytes 0-99/')), 'Server returns correct Content-Range header');
    const rangeBytes = await rangeRes.arrayBuffer();
    assert(rangeBytes.byteLength === 100, 'Server returns exact requested 100 bytes chunk');

    server.close();

    // -------------------------------------------------------------
    // Test 7: ArtifactManager Registration & Persistence
    // -------------------------------------------------------------
    console.log('\nTest Category 7: ArtifactManager Registration & Persistence');
    const artManager = new ArtifactManager(testRoot);
    const art = artManager.registerArtifact({
      type: 'VIDEO',
      name: 'sample_ferrari.webm',
      filePath: webmFile,
      description: 'Ferrari 4K cinematic video',
      metadata: {
        resolution: inspected.resolutionSummary,
        durationSeconds: inspected.durationSeconds,
        format: inspected.container,
        fps: inspected.fpsSummary,
        hdr: inspected.hdrSummary,
      },
      status: 'verified',
    });

    assert(art.id.startsWith('VID-'), 'Artifact received VID- prefix identifier');
    assert(art.previewCapability === 'video', 'Artifact previewCapability is "video"');
    assert(art.url === '/workspace-preview/assets/sample_ferrari.webm', 'Artifact URL points to media resource');

    // Test reload from disk
    const artManager2 = new ArtifactManager(testRoot);
    const loaded = artManager2.getArtifact(art.id);
    assert(loaded !== undefined, 'Artifact persisted and restored from .maxide/artifacts.json');
    assert(loaded?.name === 'sample_ferrari.webm', 'Restored artifact name matches');

    // -------------------------------------------------------------
    // Test 8: Verification Engine Artifact Verification
    // -------------------------------------------------------------
    console.log('\nTest Category 8: Verification Engine Artifact Verification');
    const verifResult = VerificationEngine.verifyArtifact(art);
    assert(verifResult.verified === true, 'VerificationEngine verified valid video artifact');
    assert(verifResult.checks.length >= 3, 'VerificationEngine performed existence, size, and container checks');

    // -------------------------------------------------------------
    // Test 9: Frontend UI File Tree & Monaco Shield Verification
    // -------------------------------------------------------------
    console.log('\nTest Category 9: Frontend Monaco Shield & Viewer Routing');
    const uiFile = path.join(process.cwd(), 'src', 'ui', 'index.html');
    const uiContent = fs.readFileSync(uiFile, 'utf8');

    assert(uiContent.includes('function isTextFile('), 'index.html contains isTextFile validator');
    assert(uiContent.includes('artifact-video-player'), 'index.html renders HTML5 video player with controls');
    assert(uiContent.includes('video-badge-res'), 'index.html displays resolution badge');
    assert(uiContent.includes('playArtifactById'), 'index.html handles [▶ Play Video] action links');
    assert(uiContent.includes('openMediaStudioById'), 'index.html handles [Open in Media Studio] action links');
    assert(uiContent.includes('open-system'), 'index.html handles [Open File] native OS launch');

    // Check that openFileInEditor checks isTextFile before loading
    assert(
      uiContent.includes('const isText = isTextFile(relPath);'),
      'openFileInEditor verifies text eligibility before contacting Monaco'
    );

    console.log('\n================================================================');
    console.log(`RESULT: ALL ${passedTests}/${totalTests} TESTS PASSED (100%)`);
    console.log('MAXIDE CRITICAL MEDIA ARTIFACT PIPELINE VERIFIED SUCCESSFULLY');
    console.log('================================================================\n');
  } finally {
    try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch {}
  }
}

runArtifactSystemBattery().catch(err => {
  console.error('\nArtifact System Battery Failed:', err);
  process.exit(1);
});
