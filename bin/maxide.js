#!/usr/bin/env node

/**
 * MaxIDE - Persistent CLI Entrypoint
 * Usage:
 *   maxide                     -> Launch desktop app window
 *   maxide --project <path>    -> Open specific project in MaxIDE
 *   maxide <prompt>            -> Execute agent task directly via AgentEngine
 *   maxide --status            -> Print IDE, provider, and agent status
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

async function checkServerAlive() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3456/api/providers', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function printStatus() {
  console.log('\n=========================================');
  console.log('       ⚡ MaxIDE Agent Runtime Status');
  console.log('=========================================');

  const isAlive = await checkServerAlive();
  console.log(`Server Runtime:  ${isAlive ? '● ACTIVE (http://127.0.0.1:3456)' : '○ STOPPED'}`);

  try {
    const { PathManager } = await import('../dist/config/PathManager.js');
    const { ProjectManager } = await import('../dist/projects/ProjectManager.js');
    const { ProviderRegistry } = await import('../dist/ai/registry/ProviderRegistry.js');

    const pathMgr = PathManager.getInstance();
    const projMgr = new ProjectManager(pathMgr.getProjectsFile());
    const activeProj = projMgr.getActiveProject();

    console.log(`Active Project:  ${activeProj ? activeProj.name : 'None'} (${activeProj ? activeProj.activeWorkspace : ''})`);
    console.log(`Authorized Dirs: ${activeProj ? activeProj.folders.length : 0} directories`);
    console.log(`Autonomy Mode:   ${activeProj ? activeProj.autonomyMode : 'AUTONOMOUS'}`);

    const provReg = new ProviderRegistry(pathMgr.getProvidersFile());
    const providers = provReg.getAllProviders();
    console.log(`Providers:       ${providers.length} configured`);
    for (const p of providers) {
      console.log(`  - ${p.name} [${p.apiType}] (${p.isEnabled ? 'ENABLED' : 'DISABLED'})`);
    }

    if (isAlive) {
      const resp = await fetch('http://127.0.0.1:3456/api/missions');
      const missions = await resp.json();
      console.log(`Active Missions:   ${Array.isArray(missions) ? missions.length : 0}`);
    }
  } catch (err) {
    console.log(`Status details: ${err.message}`);
  }
  console.log('=========================================\n');
}

async function runPromptHeadless(prompt) {
  console.log(`\n[MaxIDE CLI] Executing Agent Task: "${prompt}"...`);

  const isAlive = await checkServerAlive();
  if (isAlive) {
    // Execute through running server daemon
    try {
      const resp = await fetch('http://127.0.0.1:3456/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: prompt, modelId: 'auto' }),
      });
      const data = await resp.json();
      console.log('\n--- Agent Response ---');
      console.log(data.finalAnswer || data.summary || data.error);
      if (data.steps && data.steps.length > 0) {
        console.log(`\n✓ Steps executed: ${data.stepsCompleted || data.steps.length}`);
      }
      return;
    } catch (err) {
      console.warn('Could not post to live server, falling back to local engine:', err.message);
    }
  }

  // Fallback to local engine instantiation
  try {
    const { PathManager } = await import('../dist/config/PathManager.js');
    const { ProjectManager } = await import('../dist/projects/ProjectManager.js');
    const { ProviderRegistry } = await import('../dist/ai/registry/ProviderRegistry.js');
    const { ModelRegistry } = await import('../dist/ai/registry/ModelRegistry.js');
    const { AIGateway } = await import('../dist/ai/gateway/AIGateway.js');
    const { AgentEngine } = await import('../dist/agent/AgentEngine.js');

    const pathMgr = PathManager.getInstance();
    const projMgr = new ProjectManager(pathMgr.getProjectsFile());
    const activeProj = projMgr.getActiveProject();

    const provReg = new ProviderRegistry(pathMgr.getProvidersFile());
    const modReg = new ModelRegistry(provReg);
    const gateway = new AIGateway(provReg, modReg, 'cloud');
    const engine = new AgentEngine(gateway, activeProj.activeWorkspace);

    const outcome = await engine.processMessage(prompt, { modelId: 'auto' });
    console.log('\n--- Agent Result ---');
    console.log(outcome.answer);
  } catch (err) {
    console.error('[MaxIDE CLI Error]', err);
  }
}

function launchDesktop(targetProject) {
  console.log('[MaxIDE] Launching desktop application...');
  const exePath = path.join(rootDir, 'MaxIDE.exe');

  if (fs.existsSync(exePath)) {
    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: rootDir,
    });
    child.unref();
  } else {
    // Fallback start npm run dev
    console.log('[MaxIDE] Starting server runtime...');
    const child = spawn('npm.cmd', ['start'], {
      detached: true,
      stdio: 'inherit',
      cwd: rootDir,
    });
    child.unref();
  }
}

async function main() {
  if (args.length === 0) {
    launchDesktop();
    return;
  }

  if (args[0] === '--status') {
    await printStatus();
    return;
  }

  if (args[0] === '--project' && args[1]) {
    const projectFolder = path.resolve(args[1]);
    try {
      const { PathManager } = await import('../dist/config/PathManager.js');
      const { ProjectManager } = await import('../dist/projects/ProjectManager.js');
      const projMgr = new ProjectManager(PathManager.getInstance().getProjectsFile());
      projMgr.createProject({
        name: path.basename(projectFolder),
        folders: [projectFolder],
      });
      console.log(`[MaxIDE] Configured project folder: ${projectFolder}`);
    } catch {}
    launchDesktop(projectFolder);
    return;
  }

  // Otherwise, treat argument as prompt
  const prompt = args.join(' ');
  await runPromptHeadless(prompt);
}

main().catch(console.error);
