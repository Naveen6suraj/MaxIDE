import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { AgentEngine } from '../agent/AgentEngine.js';
import { AIGateway } from '../ai/gateway/AIGateway.js';
import { ProviderRegistry } from '../ai/registry/ProviderRegistry.js';
import { ModelRegistry } from '../ai/registry/ModelRegistry.js';

console.log('\n===============================================================');
console.log('  MAXIDE: FAIL-HONEST AGENT ARCHITECTURE REGRESSION SUITE       ');
console.log('===============================================================\n');

const testRoot = path.resolve('temp_fail_honest_ws');
if (fs.existsSync(testRoot)) {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
fs.mkdirSync(testRoot, { recursive: true });

function getUserProjectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir);
  // Exclude internal IDE dot-directories (.maxide, .orbit, etc.) and providers.json
  return entries.filter(e => !e.startsWith('.') && e !== 'providers.json');
}

// Create a mock failing gateway that produces error events
class FailingGateway extends AIGateway {
  constructor() {
    const pr = new ProviderRegistry(path.join(testRoot, 'providers.json'));
    const mr = new ModelRegistry(pr);
    super(pr, mr);
  }

  override async *generateWithTools(): AsyncGenerator<any, void, unknown> {
    yield {
      type: 'error',
      error: 'HTTP 503: Model service unavailable or overloaded (Ollama connection refused)',
    };
  }

  override getActiveModelId(): string {
    return 'mock-offline-model';
  }
}

// Create a mock gateway that returns thought text with NO tool calls
class NoToolsGateway extends AIGateway {
  constructor() {
    const pr = new ProviderRegistry(path.join(testRoot, 'providers.json'));
    const mr = new ModelRegistry(pr);
    super(pr, mr);
  }

  override async *generateWithTools(): AsyncGenerator<any, void, unknown> {
    yield {
      type: 'token',
      content: 'I will now write your application. But I will not call any tools.',
    };
    yield {
      type: 'finish',
      reason: 'stop',
    };
  }

  override getActiveModelId(): string {
    return 'mock-passive-model';
  }
}

async function runTests() {
  // Test 1: Provider error must fail honest and create ZERO project files
  console.log('1. Testing execution when provider fails with error...');
  const failingGateway = new FailingGateway();
  const agent1 = new AgentEngine(failingGateway, testRoot);

  const beforeUserFiles = getUserProjectFiles(testRoot);
  console.log('   Initial directory entries:', fs.readdirSync(testRoot), 'filtered:', beforeUserFiles);
  assert.strictEqual(beforeUserFiles.length, 0, 'No user project files should exist initially');

  const result1 = await agent1.runTask('Build a complete full-stack task management web application with React and Node', {
    createPreCheckpoint: false,
    maxSteps: 3,
  });

  assert.strictEqual(result1.success, false, 'Agent MUST report success: false when provider fails');
  assert(result1.error?.includes('PROVIDER_UNAVAILABLE') || result1.error?.includes('HTTP 503'), `Error must contain provider diagnostic, got: ${result1.error}`);
  assert.strictEqual(agent1.getLifecycleState(), 'FAILED', 'Lifecycle state must transition to FAILED');

  const afterUserFiles = getUserProjectFiles(testRoot);
  assert.strictEqual(afterUserFiles.length, 0, 'Workspace MUST remain clean without any fake template files generated');
  console.log('   PASSED: Provider failure returned honest failed status with zero fake files.');

  // Test 2: Passive model that executes no tools must fail honest
  console.log('2. Testing execution when model produces no tool calls...');
  const noToolsGateway = new NoToolsGateway();
  const agent2 = new AgentEngine(noToolsGateway, testRoot);

  const result2 = await agent2.runTask('Create a snake arcade game in HTML5 canvas', {
    createPreCheckpoint: false,
    maxSteps: 2,
  });

  assert.strictEqual(result2.success, false, 'Agent MUST NOT report success when zero tools ran');
  assert.strictEqual(agent2.getLifecycleState(), 'FAILED', 'Lifecycle state must transition to FAILED');
  const filesAfterNoTools = getUserProjectFiles(testRoot);
  assert.strictEqual(filesAfterNoTools.length, 0, 'No canned snake game files should be dumped into workspace');
  console.log('   PASSED: Passive model execution failed honest without canned templates.');

  // Clean up temp test workspace
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch {}

  console.log('\n===============================================================');
  console.log('  RESULT: ALL FAIL-HONEST REGRESSION TESTS PASSED (100%)        ');
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
