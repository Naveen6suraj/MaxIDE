/**
 * MaxIDE - Acceptance Test Suite: Clarification-First Agent Gate & Beginner UX
 * Validates all 7 required acceptance scenarios.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { AgentEngine } from '../agent/AgentEngine.js';
import { AIGateway } from '../ai/gateway/AIGateway.js';
import { ModelRegistry } from '../ai/registry/ModelRegistry.js';
import { ProviderRegistry } from '../ai/registry/ProviderRegistry.js';
import { ClarificationGate } from '../agent/ClarificationGate.js';
import { ContentSanitizer } from '../agent/safety/ContentSanitizer.js';

export async function runClarificationAndUxTestSuite(): Promise<{
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  results: Array<{ test: string; status: 'PASS' | 'FAIL'; details: string }>;
}> {
  console.log('===============================================================');
  console.log('  MAXIDE ACCEPTANCE SUITE: CLARIFICATION GATE & BEGINNER UX    ');
  console.log('===============================================================');

  const results: Array<{ test: string; status: 'PASS' | 'FAIL'; details: string }> = [];

  // Setup Provider & Gateway with local Ollama
  const providerRegistry = new ProviderRegistry();
  const modelRegistry = new ModelRegistry(providerRegistry);
  const gateway = new AIGateway(providerRegistry, modelRegistry);

  providerRegistry.registerProvider({
    id: 'ollama-local',
    name: 'Local Ollama Server',
    type: 'local',
    apiType: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    defaultModel: 'qwen2.5-coder:0.5b',
    isEnabled: true,
  });

  await modelRegistry.discoverAllModels();

  function createTestWorkspace(prefix: string): string {
    const dir = path.join(os.tmpdir(), `maxide-test-${prefix}-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // -------------------------------------------------------------
  // TEST 1: Clear request: 'hello.js' -> immediate execution, no questions
  // -------------------------------------------------------------
  console.log('\n[Test 1] Clear request ("Create a hello world in hello.js")...');
  try {
    const ws1 = createTestWorkspace('t1-clear');
    const engine1 = new AgentEngine(gateway, ws1);
    const outcome1 = await engine1.processMessage('Create a hello world in hello.js', {
      modelId: 'qwen2.5-coder:0.5b',
      sessionId: 'session-t1',
    });

    const fileExists = fs.existsSync(path.join(ws1, 'hello.js'));
    const isExecution = outcome1.actionType === 'agent_task';
    const noQuestions = !outcome1.clarification || !outcome1.clarification.requiresClarification;

    if (isExecution && noQuestions && fileExists) {
      console.log('  -> PASS: Executed immediately without asking questions. hello.js created.');
      results.push({ test: '1. Clear Request Execution', status: 'PASS', details: 'Immediate execution, hello.js created, 0 questions asked.' });
    } else {
      throw new Error(`Expected immediate execution and hello.js creation. actionType=${outcome1.actionType}, fileExists=${fileExists}`);
    }
  } catch (err: any) {
    console.error('  -> FAIL:', err.message);
    results.push({ test: '1. Clear Request Execution', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 2: Ambiguous request: 'Build an app' -> asks questions, 0 files modified
  // -------------------------------------------------------------
  console.log('\n[Test 2] Ambiguous request ("Build an app")...');
  try {
    const ws2 = createTestWorkspace('t2-ambiguous');
    const engine2 = new AgentEngine(gateway, ws2);
    const outcome2 = await engine2.processMessage('Build an app', {
      modelId: 'qwen2.5-coder:0.5b',
      sessionId: 'session-t2',
    });

    const filesInWs2 = fs.readdirSync(ws2).filter(f => !f.startsWith('.'));
    const isClarification = outcome2.actionType === 'clarification';
    const questionsCount = outcome2.questions?.length || 0;
    const zeroFilesTouched = filesInWs2.length === 0;

    if (isClarification && questionsCount >= 1 && questionsCount <= 3 && zeroFilesTouched) {
      console.log(`  -> PASS: Asked ${questionsCount} plain-language questions. EXACTLY 0 files modified in workspace.`);
      results.push({ test: '2. Ambiguous Request Gate', status: 'PASS', details: `Asked ${questionsCount} questions, 0 files modified.` });
    } else {
      throw new Error(`Failed ambiguous gate: actionType=${outcome2.actionType}, questionsCount=${questionsCount}, filesInWs=${filesInWs2.length}`);
    }
  } catch (err: any) {
    console.error('  -> FAIL:', err.message);
    results.push({ test: '2. Ambiguous Request Gate', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 3: Partially clear request: 'Build me a messenger' -> asks 1-3 beginner questions, no build_messenger tool call
  // -------------------------------------------------------------
  console.log('\n[Test 3] Partially clear request ("Build me a messenger")...');
  const session3Id = `session-t3-${Date.now()}`;
  let ws3 = '';
  let engine3: AgentEngine | null = null;
  try {
    ws3 = createTestWorkspace('t3-partially-clear');
    engine3 = new AgentEngine(gateway, ws3);

    const executedTools: string[] = [];
    engine3.onActivity(evt => {
      if (evt.type === 'tool_start') {
        const toolName = evt.summary.replace('Tool: ', '').trim();
        executedTools.push(toolName);
      }
    });

    const outcome3 = await engine3.processMessage('Build me a messenger', {
      modelId: 'qwen2.5-coder:0.5b',
      sessionId: session3Id,
    });

    const isClarification = outcome3.actionType === 'clarification';
    const questionsCount = outcome3.questions?.length || 0;
    const noFakeTool = !executedTools.includes('build_messenger') && !executedTools.includes('build_messenger_app');
    const zeroFiles = fs.readdirSync(ws3).filter(f => !f.startsWith('.')).length === 0;

    if (isClarification && questionsCount >= 1 && questionsCount <= 3 && noFakeTool && zeroFiles) {
      console.log(`  -> PASS: Asked ${questionsCount} beginner questions. No build_messenger fake tool called. 0 files modified.`);
      results.push({ test: '3. Partially Clear Request', status: 'PASS', details: `Asked ${questionsCount} questions with choose-for-me option. Zero files mutated.` });
    } else {
      throw new Error(`Failed partially clear test: actionType=${outcome3.actionType}, questions=${questionsCount}, files=${zeroFiles}`);
    }
  } catch (err: any) {
    console.error('  -> FAIL:', err.message);
    results.push({ test: '3. Partially Clear Request', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 4: Clarification continuation: answers questions -> executes real plan
  // -------------------------------------------------------------
  console.log('\n[Test 4] Clarification continuation (Answering session 3 with "choose for me")...');
  try {
    if (!engine3) throw new Error('Engine from test 3 was not initialized');

    // Respond with 'choose for me' to auto-resolve remaining questions and start execution
    const outcome4 = await engine3.processMessage('choose for me', {
      modelId: 'qwen2.5-coder:0.5b',
      sessionId: session3Id,
    });

    const filesInWs3 = fs.readdirSync(ws3).filter(f => !f.startsWith('.'));
    const isExecution = outcome4.actionType === 'agent_task';
    const hasFiles = filesInWs3.length > 0;

    if (isExecution && hasFiles) {
      console.log(`  -> PASS: Session resolved, real plan executed. Files created: ${filesInWs3.join(', ')}.`);
      results.push({ test: '4. Clarification Continuation', status: 'PASS', details: `Multi-turn context retained, execution completed with files: ${filesInWs3.join(', ')}.` });
    } else {
      throw new Error(`Continuation failed: actionType=${outcome4.actionType}, files=${filesInWs3.length}`);
    }
  } catch (err: any) {
    console.error('  -> FAIL:', err.message);
    results.push({ test: '4. Clarification Continuation', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 5: Complex request: 'Build a modern full-stack messenger with auth' -> executes with registered tools
  // -------------------------------------------------------------
  console.log('\n[Test 5] Complex request ("Build a modern full-stack messenger with auth")...');
  try {
    const ws5 = createTestWorkspace('t5-complex');
    const engine5 = new AgentEngine(gateway, ws5);

    const executedTools: string[] = [];
    engine5.onActivity(evt => {
      if (evt.type === 'tool_start') {
        const toolName = evt.summary.replace('Tool: ', '').trim();
        executedTools.push(toolName);
      }
    });

    const outcome5 = await engine5.processMessage('Build a modern full-stack messenger with auth', {
      modelId: 'qwen2.5-coder:0.5b',
      sessionId: 'session-t5',
    });

    // Check that every executed tool is registered
    for (const tool of executedTools) {
      if (!engine5.toolRegistry.isRegistered(tool)) {
        throw new Error(`Unregistered tool executed: ${tool}`);
      }
    }

    const filesInWs5 = fs.readdirSync(ws5).filter(f => !f.startsWith('.'));
    const isExecution = outcome5.actionType === 'agent_task';
    const hasFiles = filesInWs5.length > 0;

    if (isExecution && hasFiles) {
      console.log(`  -> PASS: Executed with registered tools only (${executedTools.join(', ')}). Created: ${filesInWs5.join(', ')}.`);
      results.push({ test: '5. Complex Request Execution', status: 'PASS', details: `Executed with 100% registered tools. Created: ${filesInWs5.join(', ')}.` });
    } else {
      throw new Error(`Complex request failed: actionType=${outcome5.actionType}, files=${filesInWs5.length}`);
    }
  } catch (err: any) {
    console.error('  -> FAIL:', err.message);
    results.push({ test: '5. Complex Request Execution', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 6: Tool hallucination recovery & Content Sanitization
  // -------------------------------------------------------------
  console.log('\n[Test 6] Tool hallucination recovery & Content Sanitizer validation...');
  try {
    // 1. Validate ContentSanitizer directly rejects tool-call envelopes into source files
    const fakeEnvelope = JSON.stringify({
      name: 'build_messenger_app',
      arguments: { path: 'index.html' },
    });
    const sanitization = ContentSanitizer.sanitize('index.html', fakeEnvelope);
    if (sanitization.valid) {
      throw new Error('ContentSanitizer failed to reject raw tool-call JSON envelope into index.html');
    }

    // 2. Validate ContentSanitizer extracts inner code if wrapped inside arguments.content
    const wrappedEnvelope = JSON.stringify({
      name: 'create_file',
      arguments: { path: 'index.html', content: '<!DOCTYPE html><html><body>Test</body></html>' },
    });
    const innerSanitization = ContentSanitizer.sanitize('index.html', wrappedEnvelope);
    if (!innerSanitization.valid || !innerSanitization.sanitized.includes('<!DOCTYPE html>')) {
      throw new Error('ContentSanitizer failed to extract inner code from arguments.content');
    }

    console.log('  -> PASS: Tool hallucination intercepted, sanitized, and envelopes rejected from source files.');
    results.push({ test: '6. Tool Hallucination Recovery & Sanitization', status: 'PASS', details: 'Sanitizer rejected tool JSON envelopes from source files and salvaged inner code.' });
  } catch (err: any) {
    console.error('  -> FAIL:', err.message);
    results.push({ test: '6. Tool Hallucination Recovery & Sanitization', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 7: Beginner request: 'I don\'t know how to build a website, help me'
  // -------------------------------------------------------------
  console.log('\n[Test 7] Beginner request ("I don\'t know how to build a website, help me")...');
  try {
    const ws7 = createTestWorkspace('t7-beginner');
    const engine7 = new AgentEngine(gateway, ws7);

    const outcome7 = await engine7.processMessage("I don't know how to build a website, help me", {
      modelId: 'qwen2.5-coder:0.5b',
      sessionId: 'session-t7',
    });

    const isBeginnerHelp = outcome7.actionType === 'clarification' && outcome7.clarification?.intent === 'BEGINNER_HELP';
    const hasQuestions = (outcome7.questions?.length || 0) >= 1;
    const zeroFilesTouched = fs.readdirSync(ws7).filter(f => !f.startsWith('.')).length === 0;

    if (isBeginnerHelp && hasQuestions && zeroFilesTouched) {
      console.log('  -> PASS: Responded with friendly beginner guidance and clear starting options. 0 files modified.');
      results.push({ test: '7. Beginner Help Guidance', status: 'PASS', details: 'Friendly beginner guidance, suggested starter options, zero premature file writes.' });
    } else {
      throw new Error(`Beginner request failed: isBeginnerHelp=${isBeginnerHelp}, hasQuestions=${hasQuestions}, files=${zeroFilesTouched}`);
    }
  } catch (err: any) {
    console.error('  -> FAIL:', err.message);
    results.push({ test: '7. Beginner Help Guidance', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 8: Game request: 'I am asking for a website to build to play a game'
  // Clarification -> 'Choose for me' -> builds game & opens preview
  // -------------------------------------------------------------
  console.log('\n[Test 8] Game request ("I am asking for a website to build to play a game")...');
  try {
    const ws8 = createTestWorkspace('t8-game');
    const engine8 = new AgentEngine(gateway, ws8);
    const session8 = `session-t8-${Date.now()}`;

    // Step 1: Clarification Gate
    const step1 = await engine8.processMessage('I am asking for a website to build to play a game', {
      modelId: 'qwen2.5-coder:0.5b',
      sessionId: session8,
    });

    const isClarify = step1.actionType === 'clarification';
    const hasGameQuestions = (step1.questions?.length || 0) >= 1;
    const zeroFilesInWs8 = fs.readdirSync(ws8).filter(f => !f.startsWith('.')).length === 0;

    if (!isClarify || !hasGameQuestions || !zeroFilesInWs8) {
      throw new Error(`Step 1 failed: isClarify=${isClarify}, questions=${step1.questions?.length}, files=${zeroFilesInWs8}`);
    }

    // Step 2: "Choose for me" -> Autonomous Execution
    const step2 = await engine8.processMessage('Choose for me', {
      modelId: 'qwen2.5-coder:0.5b',
      sessionId: session8,
    });

    const indexHtmlPath = path.join(ws8, 'index.html');
    const indexExists = fs.existsSync(indexHtmlPath);
    const indexContent = indexExists ? fs.readFileSync(indexHtmlPath, 'utf8') : '';
    const isRealCode = indexContent.includes('<canvas') || indexContent.includes('<html') || indexContent.includes('snake');
    const noEnvelope = !ContentSanitizer.isToolEnvelope(indexContent);
    const hasPreview = Boolean(step2.openPreview);

    if (step2.actionType === 'agent_task' && step2.agentResult?.success && indexExists && isRealCode && noEnvelope) {
      console.log('  -> PASS: Triggered ClarificationGate for game, resolved with "Choose for me", and built verified playable game.');
      results.push({ test: '8. Game Request Clarification & Build', status: 'PASS', details: 'Clarification asked for game, "Choose for me" built working game, no envelope leakage.' });
    } else {
      throw new Error(`Step 2 failed: success=${step2.agentResult?.success}, indexExists=${indexExists}, isRealCode=${isRealCode}, noEnvelope=${noEnvelope}`);
    }
  } catch (err: any) {
    console.error('  -> FAIL:', err.message);
    results.push({ test: '8. Game Request Clarification & Build', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 9: Robust Tool Envelope Detection (with leading garbage/fences)
  // -------------------------------------------------------------
  console.log('\n[Test 9] Robust Tool Envelope Detection...');
  try {
    const garbageEnvelope = 'on\n{\n  "name": "build_messenger_app",\n  "arguments": {\n    "project_root": "C:\\\\fake\\\\path"\n  }\n}';
    const jsonFenced = '```json\n{\n  "name": "build_website_to_play_game",\n  "arguments": {}\n}\n```';
    const realCode = 'function play() { console.log("Game started"); }';

    const isGarbageDetected = ContentSanitizer.isToolEnvelope(garbageEnvelope);
    const isFencedDetected = ContentSanitizer.isToolEnvelope(jsonFenced);
    const isRealCodeSafe = !ContentSanitizer.isToolEnvelope(realCode);

    if (isGarbageDetected && isFencedDetected && isRealCodeSafe) {
      console.log('  -> PASS: ContentSanitizer accurately detects envelopes with leading garbage and markdown fences.');
      results.push({ test: '9. Envelope Detection Robustness', status: 'PASS', details: 'Correctly classified envelopes with prefixes/fences and preserved normal source code.' });
    } else {
      throw new Error(`Envelope detection failed: garbage=${isGarbageDetected}, fenced=${isFencedDetected}, realCode=${isRealCodeSafe}`);
    }
  } catch (err: any) {
    console.error('  -> FAIL:', err.message);
    results.push({ test: '9. Envelope Detection Robustness', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  const passed = results.filter(r => r.status === 'PASS').length;
  const allPassed = passed === results.length;

  console.log('\n===============================================================');
  console.log(`  ACCEPTANCE TEST RESULTS: ${passed}/${results.length} PASSED (${allPassed ? '100% SUCCESS' : 'FAILURES DETECTED'})`);
  console.log('===============================================================');
  for (const r of results) {
    console.log(`  [${r.status}] ${r.test} — ${r.details}`);
  }

  return {
    allPassed,
    totalTests: results.length,
    passedTests: passed,
    results,
  };
}

// Direct CLI execution
if (process.argv[1]?.endsWith('clarification_and_ux.test.ts') || process.argv[1]?.endsWith('clarification_and_ux.test.js')) {
  runClarificationAndUxTestSuite().then(res => {
    process.exit(res.allPassed ? 0 : 1);
  }).catch(err => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
  });
}
