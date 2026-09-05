import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IntentClassifier } from '../agent/intent/IntentClassifier.js';
import { MediaTools } from '../agent/tools/MediaTools.js';
import { AgentEngine } from '../agent/AgentEngine.js';
import { WorkspaceManager } from '../workspace/WorkspaceManager.js';
import { SafeTerminal } from '../agent/safety/SafeTerminal.js';
import { ProviderRegistry } from '../ai/registry/ProviderRegistry.js';
import { ModelRegistry } from '../ai/registry/ModelRegistry.js';
import { AIGateway } from '../ai/gateway/AIGateway.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testWorkspace = path.join(__dirname, '../../test_media_workspace');

async function runMediaBattery() {
  console.log('\n===============================================================');
  console.log('   MAXIDE AUTONOMOUS AI MEDIA GENERATION BATTERY');
  console.log('===============================================================\n');

  if (!fs.existsSync(testWorkspace)) fs.mkdirSync(testWorkspace, { recursive: true });

  let passed = 0;
  let failed = 0;

  // Test 1: Intent Classification for Video
  try {
    process.stdout.write('[Test 1] Intent Classifier: "generate a sample 4k video of 5 seconds of super car"... ');
    const res = await IntentClassifier.classify('generate a sample 4k video of 5 seconds of super car');
    if (res.intent === 'MEDIA_GEN' && res.mediaType === 'video' && res.mediaDetails?.durationSeconds === 5 && res.mediaDetails?.resolution === '4k') {
      console.log('PASSED (Classified MEDIA_GEN, video, 5s, 4k)');
      passed++;
    } else {
      throw new Error('Unexpected classification: ' + JSON.stringify(res));
    }
  } catch (err: any) {
    console.log('FAILED: ' + err.message);
    failed++;
  }

  // Test 2: Intent Classification for Image
  try {
    process.stdout.write('[Test 2] Intent Classifier: "create a hyper-realistic photo of a futuristic cyber city"... ');
    const res = await IntentClassifier.classify('create a hyper-realistic photo of a futuristic cyber city');
    if (res.intent === 'MEDIA_GEN' && res.mediaType === 'image') {
      console.log('PASSED (Classified MEDIA_GEN, image)');
      passed++;
    } else {
      throw new Error('Unexpected classification: ' + JSON.stringify(res));
    }
  } catch (err: any) {
    console.log('FAILED: ' + err.message);
    failed++;
  }

  // Test 3: Free Playwright Video Recorder
  try {
    process.stdout.write('[Test 3] MediaTools.generateVideo (Hardware-Accelerated 60fps Recording)... ');
    const vidResult = await MediaTools.generateVideo({
      prompt: 'super car racing on cyber highway',
      durationSeconds: 2,
      resolution: '720p',
      workspaceRoot: testWorkspace,
    });

    if (vidResult.success && fs.existsSync(vidResult.filePath)) {
      const stats = fs.statSync(vidResult.filePath);
      const mp4File = vidResult.filePath.replace(/\.webm$/, '.mp4');
      if (stats.size > 20000 && fs.existsSync(mp4File)) {
        console.log('PASSED (' + stats.size + ' bytes, .webm & .mp4 created in 2s)');
        passed++;
      } else {
        throw new Error('Video file too small or missing companion: ' + stats.size + ' bytes');
      }
    } else {
      throw new Error(vidResult.error || 'Video generation failed');
    }
  } catch (err: any) {
    console.log('FAILED: ' + err.message);
    failed++;
  }

  // Test 4: Free Image Generation
  try {
    process.stdout.write('[Test 4] MediaTools.generateImage (Pollinations / Procedural AI Engine)... ');
    const imgResult = await MediaTools.generateImage({
      prompt: 'sleek supercar hypercar neon dark mode',
      width: 512,
      height: 512,
      workspaceRoot: testWorkspace,
    });

    if (imgResult.success && fs.existsSync(imgResult.filePath)) {
      const stats = fs.statSync(imgResult.filePath);
      if (stats.size > 500) {
        console.log('PASSED (Provider: ' + imgResult.provider + ', ' + stats.size + ' bytes)');
        passed++;
      } else {
        throw new Error('Image file too small: ' + stats.size + ' bytes');
      }
    } else {
      throw new Error('Image generation failed');
    }
  } catch (err: any) {
    console.log('FAILED: ' + err.message);
    failed++;
  }

  // Test 5: Full AgentEngine MEDIA_GEN workflow execution
  try {
    process.stdout.write('[Test 5] AgentEngine.processMessage for "generate a sample 4k video of 5 seconds of super car"... ');
    const providerRegistry = new ProviderRegistry();
    const modelRegistry = new ModelRegistry(providerRegistry);
    const gateway = new AIGateway(providerRegistry, modelRegistry, 'cloud');
    const engine = new AgentEngine(gateway, testWorkspace);

    const outcome = await engine.processMessage('generate a sample 4k video of 5 seconds of super car');
    if (outcome.intent === 'MEDIA_GEN' && outcome.openFile && (outcome.finalAnswer?.includes('<video') || outcome.answer?.includes('<video'))) {
      console.log('PASSED (Generated video asset, returned player markdown & suggested actions)');
      passed++;
    } else {
      throw new Error('Unexpected outcome: ' + JSON.stringify(outcome));
    }
  } catch (err: any) {
    console.log('FAILED: ' + err.message);
    failed++;
  }

  console.log('\n===============================================================');
  console.log('  MEDIA BATTERY RESULTS: ' + passed + '/' + (passed + failed) + ' PASSED (' + Math.round((passed / (passed + failed)) * 100) + '%)');
  console.log('===============================================================\n');

  try { fs.rmSync(testWorkspace, { recursive: true, force: true }); } catch {}

  if (failed > 0) process.exit(1);
}

runMediaBattery().catch(e => {
  console.error(e);
  process.exit(1);
});
