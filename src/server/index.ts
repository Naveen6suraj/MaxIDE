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
import { RecoveryManager } from '../agent/recovery/RecoveryManager.js';
import { AIProviderConfig } from '../ai/core/AIProvider.js';
import { PreviewManager } from './preview/PreviewManager.js';

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
const recoveryManager = new RecoveryManager(conversationStore, projectManager, agentEngine.checkpointManager, agentEngine);
agentEngine.setRecoveryManager(recoveryManager);
agentEngine.setConversationStore(conversationStore);
conversationStore.markInterruptedTasks();
const missionControl = new MissionControl();

const previewManager = new PreviewManager(
  agentEngine.workspaceManager,
  projectManager,
  agentEngine.devServerManager,
  PORT
);

// Seed initial default provider templates if empty
// Seed initial default provider templates if not registered
const defaultProviders: AIProviderConfig[] = [
  {
    id: 'gemini-cloud',
    name: 'Google Gemini',
    type: 'cloud' as const,
    apiType: 'gemini',
    apiKey: process.env.GEMINI_API_KEY || '',
    defaultModel: 'gemini-2.5-flash',
    isEnabled: true,
  },
  {
    id: 'openai-cloud',
    name: 'OpenAI',
    type: 'cloud' as const,
    apiType: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    defaultModel: 'gpt-4o',
    isEnabled: true,
  },
  {
    id: 'anthropic-cloud',
    name: 'Anthropic Claude',
    type: 'cloud' as const,
    apiType: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    defaultModel: 'claude-3-5-sonnet-20241022',
    isEnabled: true,
  },
  {
    id: 'groq-lpu',
    name: 'Groq Cloud LPU',
    type: 'cloud' as const,
    apiType: 'groq',
    apiKey: process.env.GROQ_API_KEY || '',
    defaultModel: 'llama-3.3-70b-versatile',
    isEnabled: true,
  },
  {
    id: 'ollama-local',
    name: 'Ollama Local Engine',
    type: 'local' as const,
    apiType: 'ollama',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    defaultModel: 'llama3',
    isEnabled: true,
  },
  {
    id: 'lmstudio-local',
    name: 'LM Studio Local (OpenAI-Compatible)',
    type: 'local' as const,
    apiType: 'openai_compatible',
    baseUrl: 'http://localhost:1234/v1',
    apiKey: '',
    defaultModel: 'local-model',
    isEnabled: false,
  },
  {
    id: 'custom-openai',
    name: 'Custom OpenAI-Compatible (vLLM / Enterprise)',
    type: 'cloud' as const,
    apiType: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    defaultModel: '',
    isEnabled: false,
  },
];

for (const p of defaultProviders) {
  const existing = providerRegistry.getProvider(p.id);
  if (!existing) {
    providerRegistry.registerProvider(p);
  } else {
    // Sync environment variables if stored config key is empty
    if (!existing.config.apiKey && p.apiKey) {
      existing.updateConfig({ apiKey: p.apiKey });
    }
  }
}

// Initial model discovery and registration of robust provider catalogs
modelRegistry.discoverAllModels().then(async () => {
  // Register known catalog models for all providers so offline/unconfigured state is fully handled
  const catalogModels = [
    // Gemini
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      providerId: 'gemini-cloud',
      contextWindow: 1048576,
      capabilities: { chat: true, streaming: true, toolCalling: true, vision: true, codeGeneration: true, reasoning: false },
      pricing: { input: 0.075, output: 0.30 },
      local: false,
      description: 'Google ultra-fast multimodal model',
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      providerId: 'gemini-cloud',
      contextWindow: 2097152,
      capabilities: { chat: true, streaming: true, toolCalling: true, vision: true, codeGeneration: true, reasoning: true },
      pricing: { input: 1.25, output: 5.00 },
      local: false,
      description: 'Google flagship reasoning and multimodal model',
    },
    // OpenAI
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      providerId: 'openai-cloud',
      contextWindow: 128000,
      capabilities: { chat: true, streaming: true, toolCalling: true, vision: true, codeGeneration: true, reasoning: true },
      pricing: { input: 2.50, output: 10.00 },
      local: false,
      description: 'OpenAI flagship multimodal coding model',
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      providerId: 'openai-cloud',
      contextWindow: 128000,
      capabilities: { chat: true, streaming: true, toolCalling: true, vision: true, codeGeneration: true, reasoning: false },
      pricing: { input: 0.15, output: 0.60 },
      local: false,
      description: 'Fast, efficient everyday model',
    },
    {
      id: 'o3-mini',
      name: 'o3-mini',
      providerId: 'openai-cloud',
      contextWindow: 200000,
      capabilities: { chat: true, streaming: true, toolCalling: true, vision: false, codeGeneration: true, reasoning: true },
      pricing: { input: 1.10, output: 4.40 },
      local: false,
      description: 'High-speed reasoning model for coding and logic',
    },
    // Anthropic
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      providerId: 'anthropic-cloud',
      contextWindow: 200000,
      capabilities: { chat: true, streaming: true, toolCalling: true, vision: true, codeGeneration: true, reasoning: true },
      pricing: { input: 3.00, output: 15.00 },
      local: false,
      description: 'Anthropic leading model for coding and agents',
    },
    // Groq
    {
      id: 'llama-3.3-70b-versatile',
      name: 'Llama 3.3 70B (Groq LPU)',
      providerId: 'groq-lpu',
      contextWindow: 128000,
      capabilities: { chat: true, streaming: true, toolCalling: true, vision: false, codeGeneration: true, reasoning: true },
      pricing: { input: 0.59, output: 0.79 },
      local: false,
      description: 'Ultra-fast LPU inference via Groq',
    },
    // Ollama
    {
      id: 'llama3',
      name: 'Llama 3 (Local)',
      providerId: 'ollama-local',
      contextWindow: 32768,
      capabilities: { chat: true, streaming: true, toolCalling: true, vision: false, codeGeneration: true, reasoning: false },
      local: true,
      description: 'Meta Llama 3 running locally on Ollama',
    },
    {
      id: 'qwen2.5-coder:7b',
      name: 'Qwen 2.5 Coder 7B (Local)',
      providerId: 'ollama-local',
      contextWindow: 32768,
      capabilities: { chat: true, streaming: true, toolCalling: true, vision: false, codeGeneration: true, reasoning: false },
      local: true,
      description: 'Specialized local code generation model',
    },
  ];

  for (const m of catalogModels) {
    if (!modelRegistry.getModel(m.id)) {
      modelRegistry.registerModel(m as any);
    }
  }

  // Determine intelligent default active model:
  // Check configured cloud providers first (never default to dead Ollama)
  let initialActiveModel = 'auto';

  const cloudConfigs = [
    { key: process.env.GEMINI_API_KEY || providerRegistry.getProvider('gemini-cloud')?.config.apiKey, modelId: 'gemini-2.5-flash' },
    { key: process.env.OPENAI_API_KEY || providerRegistry.getProvider('openai-cloud')?.config.apiKey, modelId: 'gpt-4o' },
    { key: process.env.ANTHROPIC_API_KEY || providerRegistry.getProvider('anthropic-cloud')?.config.apiKey, modelId: 'claude-3-5-sonnet-20241022' },
    { key: process.env.GROQ_API_KEY || providerRegistry.getProvider('groq-lpu')?.config.apiKey, modelId: 'llama-3.3-70b-versatile' },
  ];

  const configuredCloud = cloudConfigs.find(c => Boolean(c.key));
  if (configuredCloud) {
    initialActiveModel = configuredCloud.modelId;
    gateway.setActiveModel(initialActiveModel);
    console.log(`[MaxIDE] Primary cloud provider configured: activated "${initialActiveModel}"`);
  } else {
    // Probe if Ollama is actively online
    try {
      const ollamaHealth = await providerRegistry.checkProviderHealth('ollama-local');
      if (ollamaHealth.status === 'online') {
        initialActiveModel = 'llama3';
        gateway.setActiveModel('llama3');
        console.log(`[MaxIDE] Ollama is online locally: activated "llama3"`);
      } else {
        console.log(`[MaxIDE] No cloud API keys found and Ollama is offline. Set to AUTO routing mode.`);
      }
    } catch {
      console.log(`[MaxIDE] Set to AUTO routing mode.`);
    }
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
  permissionManager,
  recoveryManager,
  previewManager
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

// 1. Dedicated Generic Workspace Preview (active workspace)
app.use('/workspace-preview', (req, res) => {
  previewManager.handleWorkspacePreview(req, res);
});

// 2. Dedicated Multi-Project Isolated Preview (/project-preview/:projectIdOrName/*)
app.use('/project-preview/:projectIdOrName', (req, res) => {
  previewManager.handleProjectPreview(req, res);
});

// 3. Dynamic Project / Subdirectory Interceptor (e.g. /modern-web-app/index.html)
app.use((req, res, next) => {
  previewManager.handleDynamicProjectOrFolder(req, res, next);
});

// 4. Serve UI static files
const uiDir = path.resolve(__dirname, '../ui');
app.use(express.static(uiDir));

// 5. Protected SPA Fallback Handler: NEVER swallow user preview routes or file assets
app.get('*', (req, res) => {
  if (
    req.path.startsWith('/workspace-preview') ||
    req.path.startsWith('/project-preview') ||
    req.path.startsWith('/api')
  ) {
    return res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(`
      <!DOCTYPE html>
      <html>
      <head><title>404 Not Found - MaxIDE</title></head>
      <body style="font-family:sans-serif;padding:2rem;background:#0f172a;color:#cbd5e1;">
        <h2>Preview Resource Not Found</h2>
        <p>The requested route <code>${req.path}</code> was not found in project workspace.</p>
      </body>
      </html>
    `);
  }

  // If request has a file extension (.html, .css, .js, .png, etc.), it is an asset request, NOT an SPA navigation route!
  if (path.extname(req.path)) {
    return res.status(404).setHeader('Content-Type', 'text/plain').send(`File Not Found: ${req.path}`);
  }

  // Genuine client-side frontend navigation route
  res.sendFile(path.join(uiDir, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`  🚀 MAXIDE - UNLIMITED AI PROVIDER PLATFORM ACTIVE           `);
  console.log(`  📍 Gateway Server: http://localhost:${PORT}                   `);
  console.log(`  🎨 UI Studio:      http://localhost:${PORT}                   `);
  console.log(`  🛡️ Privacy Mode:   ${gateway.getAIMode().toUpperCase()}     `);
  console.log(`=============================================================\n`);

  try {
    const portFile = pathManager.getPortFile();
    const portDir = path.dirname(portFile);
    if (!fs.existsSync(portDir)) {
      fs.mkdirSync(portDir, { recursive: true });
    }
    const portInfo = {
      port: PORT,
      url: `http://127.0.0.1:${PORT}`,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      app: 'MaxIDE',
      version: '1.0.0'
    };
    fs.writeFileSync(portFile, JSON.stringify(portInfo, null, 2), 'utf8');
  } catch (err: any) {
    console.warn('[MaxIDE] Failed to write runtime port file:', err.message);
  }
});

function cleanupAndExit() {
  try {
    const portFile = pathManager.getPortFile();
    if (fs.existsSync(portFile)) {
      fs.unlinkSync(portFile);
    }
  } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

export { app, providerRegistry, modelRegistry, gateway, agentEngine };
