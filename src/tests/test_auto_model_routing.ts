/**
 * Test Intelligent Dynamic Free Model Auto-Selection
 */

import { ProviderRegistry } from '../ai/registry/ProviderRegistry.js';
import { ModelRegistry } from '../ai/registry/ModelRegistry.js';
import { AIGateway } from '../ai/gateway/AIGateway.js';
import { AgentEngine } from '../agent/AgentEngine.js';
import path from 'path';
import fs from 'fs';

async function runAutoModelRoutingTest() {
  console.log('\n===============================================================');
  console.log('       TEST: INTELLIGENT FREE MODEL AUTO-ROUTING               ');
  console.log('===============================================================\n');

  const storageFile = path.resolve(process.cwd(), 'data/providers.json');
  const providerRegistry = new ProviderRegistry(storageFile);
  const modelRegistry = new ModelRegistry(providerRegistry);
  const gateway = new AIGateway(providerRegistry, modelRegistry, 'local');
  const agentEngine = new AgentEngine(gateway, path.resolve(process.cwd(), 'workspace'));

  await modelRegistry.discoverAllModels();

  // Test 1: Full-stack Coding prompt
  const codingPrompt = "Build a modern responsive Node.js web application with a calculator and clean styles";
  const codeChoice = agentEngine.selectBestFreeModelForPrompt(codingPrompt);
  console.log('Test 1 (Coding Task):');
  console.log(`   Prompt: "${codingPrompt}"`);
  console.log(`   Auto-Selected Model: ${codeChoice.modelId} (${codeChoice.modelName})`);
  console.log(`   Category: ${codeChoice.category}`);
  console.log(`   Rationale: ${codeChoice.rationale}`);
  if (codeChoice.category !== 'Code & Agentic Tasks') {
    throw new Error(`Test 1 Failed: Expected "Code & Agentic Tasks", got "${codeChoice.category}"`);
  }
  console.log('   ✓ PASSED: Correctly categorized and routed to coding model.\n');

  // Test 2: Deep Reasoning & Logic prompt
  const reasoningPrompt = "Diagnose the root cause of this algorithm failure and calculate the big-O time complexity";
  const reasoningChoice = agentEngine.selectBestFreeModelForPrompt(reasoningPrompt);
  console.log('Test 2 (Reasoning Task):');
  console.log(`   Prompt: "${reasoningPrompt}"`);
  console.log(`   Auto-Selected Model: ${reasoningChoice.modelId} (${reasoningChoice.modelName})`);
  console.log(`   Category: ${reasoningChoice.category}`);
  console.log(`   Rationale: ${reasoningChoice.rationale}`);
  if (reasoningChoice.category !== 'Reasoning & Logic') {
    throw new Error(`Test 2 Failed: Expected "Reasoning & Logic", got "${reasoningChoice.category}"`);
  }
  console.log('   ✓ PASSED: Correctly categorized and routed to reasoning model.\n');

  // Test 3: Fast Conceptual Explanation prompt
  const chatPrompt = "Explain how React virtual DOM works conceptually";
  const chatChoice = agentEngine.selectBestFreeModelForPrompt(chatPrompt);
  console.log('Test 3 (Explanation & Conversation):');
  console.log(`   Prompt: "${chatPrompt}"`);
  console.log(`   Auto-Selected Model: ${chatChoice.modelId} (${chatChoice.modelName})`);
  console.log(`   Category: ${chatChoice.category}`);
  console.log(`   Rationale: ${chatChoice.rationale}`);
  if (chatChoice.category !== 'Explanation & Conversation') {
    throw new Error(`Test 3 Failed: Expected "Explanation & Conversation", got "${chatChoice.category}"`);
  }
  console.log('   ✓ PASSED: Correctly categorized and routed to conversational model.\n');

  console.log('===============================================================');
  console.log('       ALL AUTO MODEL ROUTING TESTS PASSED (100%)              ');
  console.log('===============================================================\n');
}

runAutoModelRoutingTest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
