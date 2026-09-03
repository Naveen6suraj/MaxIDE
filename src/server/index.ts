/**
 * MaxIDE - Unlimited AI Provider Platform
 * Main Server Entrypoint
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ProviderRegistry } from '../ai/registry/ProviderRegistry.js';
import { ModelRegistry } from '../ai/registry/ModelRegistry.js';
import { AIGateway } from '../ai/gateway/AIGateway.js';
import { AgentEngine } from '../agent/AgentEngine.js';
import { MissionControl } from '../agent/mission/MissionControl.js';
import { createApiRouter } from './routes.js';
import { PathManager } from '../config/PathManager.js';
import { ProjectManager } from '../projects/ProjectManager.js';
import { ConversationStore } from '../agent/conversation/ConversationStore.js';
import { PermissionManager } from '../agent/safety/PermissionManager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Workspace setup: Default to clean dedicated workspace directory
const workspaceDir = process.env.WORKSPACE_DIR || path.resolve(__dirname, '../../workspace');
if (!fs.existsSync(workspaceDir)) {
  fs.mkdirSync(workspaceDir, { recursive: true });
}

// Seed starter project if workspace is empty
try {
  const existing = fs.readdirSync(workspaceDir).filter(f => !f.startsWith('.'));
  if (existing.length === 0) {
    const starterHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MaxIDE App</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-6">
  <div class="max-w-lg w-full bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-2xl text-center">
    <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-400 mx-auto mb-6 flex items-center justify-center shadow-lg">
      <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
    </div>
    <h1 class="text-3xl font-extrabold tracking-tight mb-2">Welcome to MaxIDE</h1>
    <p class="text-slate-400 text-sm mb-6">Your AI-native development environment is ready. Ask the agent in the right panel to build features, inspect code, run terminal commands, or deploy applications.</p>
    <div class="flex items-center justify-center gap-3">
      <button onclick="pingApp()" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-md">Click Me</button>
      <span id="app-status" class="text-xs text-slate-400 font-mono">Status: Ready</span>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>`;

    const starterCss = `/* Max App Styles */\nbody { font-family: system-ui, sans-serif; }`;

    const starterJs = `// Max App Logic
function pingApp() {
  const statusEl = document.getElementById('app-status');
  if (statusEl) {
    statusEl.textContent = 'Status: Active at ' + new Date().toLocaleTimeString();
    statusEl.className = 'text-xs text-cyan-400 font-mono font-bold';
  }
}
console.log('Max App initialized successfully.');`;

    const starterPkg = JSON.stringify({
      name: "my-max-app",
      version: "1.0.0",
      description: "Built with MaxIDE",
      main: "app.js",
      scripts: {
        start: "node app.js",
        build: "node -e \"console.log('Build complete.')\"",
        test: "node -e \"console.log('All tests passed.')\""
      }
    }, null, 2);

    const starterReadme = `# My MaxIDE Project

This project is running in **MaxIDE** — an AI-native development environment.

## Getting Started
- \`index.html\`: The main web application layout.
- \`app.js\`: Core application logic.
- \`style.css\`: Application styles.

Use the **MaxIDE Agent** in the right panel to implement new features, build backend APIs, analyze data, or run terminal commands.
`;

    fs.writeFileSync(path.join(workspaceDir, 'index.html'), starterHtml, 'utf8');
    fs.writeFileSync(path.join(workspaceDir, 'style.css'), starterCss, 'utf8');
    fs.writeFileSync(path.join(workspaceDir, 'app.js'), starterJs, 'utf8');
    fs.writeFileSync(path.join(workspaceDir, 'package.json'), starterPkg, 'utf8');
    fs.writeFileSync(path.join(workspaceDir, 'README.md'), starterReadme, 'utf8');
  }
} catch {}

// Storage & Persistent Managers setup
const pathManager = PathManager.getInstance();
const projectManager = new ProjectManager(pathManager.getProjectsFile());
const conversationStore = new ConversationStore(pathManager.getConversationsDir());
const permissionManager = new PermissionManager(pathManager.getPermissionsFile());

const storageFile = pathManager.getProvidersFile();
const providerRegistry = new ProviderRegistry(storageFile);
const modelRegistry = new ModelRegistry(providerRegistry);
const gateway = new AIGateway(providerRegistry, modelRegistry, 'cloud');

// Determine initial workspace from active project
const activeProject = projectManager.getActiveProject();
const effectiveWorkspace = activeProject?.activeWorkspace || workspaceDir;
const agentEngine = new AgentEngine(gateway, effectiveWorkspace);
const missionControl = new MissionControl();

// Seed initial default provider templates if empty
if (providerRegistry.getAllProviders().length === 0) {
  providerRegistry.registerProvider({
    id: 'ollama-local',
    name: 'Ollama Local Engine',
    type: 'local',
    apiType: 'ollama',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3',
    isEnabled: true,
  });

  providerRegistry.registerProvider({
    id: 'gemini-cloud',
    name: 'Google Gemini',
    type: 'cloud',
    apiType: 'gemini',
    apiKey: process.env.GEMINI_API_KEY || '',
    defaultModel: 'gemini-2.5-flash',
    isEnabled: true,
  });

  providerRegistry.registerProvider({
    id: 'groq-lpu',
    name: 'Groq Cloud LPU',
    type: 'cloud',
    apiType: 'groq',
    apiKey: process.env.GROQ_API_KEY || '',
    defaultModel: 'llama-3.3-70b-versatile',
    isEnabled: true,
  });

  providerRegistry.registerProvider({
    id: 'custom-openai',
    name: 'Custom OpenAI-Compatible (LM Studio/vLLM/NIM)',
    type: 'local',
    apiType: 'openai_compatible',
    baseUrl: 'http://localhost:1234/v1',
    apiKey: '',
    defaultModel: 'nemotron',
    isEnabled: false,
  });
}

// Initial model discovery
modelRegistry.discoverAllModels().then(() => {
  // Register Nemotron Free Local/Ollama Preset Model
  modelRegistry.registerModel({
    id: 'nemotron-70b',
    name: 'nemotron-70b',
    providerId: 'ollama-local',
    contextWindow: 32768,
    capabilities: {
      chat: true,
      streaming: true,
      toolCalling: true,
      vision: false,
      codeGeneration: true,
      reasoning: true,
    },
    local: true,
    description: 'NVIDIA Nemotron 70B (Free Local / Ollama)',
  });

  const allModels = modelRegistry.getAllModels();
  const gemmaModel = allModels.find(m => m.id === 'gemma4:31b-cloud');
  const workingModel = gemmaModel || allModels.find(m => {
    const prov = providerRegistry.getProvider(m.providerId);
    return prov && prov.isEnabled && (prov.type === 'local' || Boolean(prov.config.apiKey));
  });
  if (workingModel) {
    gateway.setActiveModel(workingModel.id);
    console.log(`[MaxIDE] Set default active model to "${workingModel.name}" (${workingModel.id})`);
  }
}).catch(() => {});

// Mount API routes
app.use('/api', createApiRouter(
  providerRegistry,
  modelRegistry,
  gateway,
  agentEngine,
  missionControl,
  projectManager,
  conversationStore,
  permissionManager
));

// API Error handling middleware (catches body-parser errors, 413s, etc.)
app.use((err: any, req: any, res: any, next: any) => {
  if (err) {
    console.error(`[Server API Error] ${err.message}`);
    return res.status(err.status || 500).json({
      error: err.message || 'Server error processing request',
      code: err.type || 'ERROR',
    });
  }
  next();
});

// Serve Live Preview of Generated Websites & Portfolio
const portfolioDir = path.resolve(__dirname, '../../portfolio');
if (!fs.existsSync(portfolioDir)) fs.mkdirSync(portfolioDir, { recursive: true });
app.use('/workspace-preview', (req, res, next) => {
  const currentRoot = agentEngine.workspaceManager.getRootPath();
  express.static(currentRoot)(req, res, next);
});

// Serve UI static files
const uiDir = path.resolve(__dirname, '../ui');
app.use(express.static(uiDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(uiDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`  🚀 MAXIDE - UNLIMITED AI PROVIDER PLATFORM ACTIVE           `);
  console.log(`  📍 Gateway Server: http://localhost:${PORT}                   `);
  console.log(`  🎨 UI Studio:      http://localhost:${PORT}                   `);
  console.log(`  🛡️ Privacy Mode:   ${gateway.getAIMode().toUpperCase()}     `);
  console.log(`=============================================================\n`);
});

export { app, providerRegistry, modelRegistry, gateway, agentEngine };
