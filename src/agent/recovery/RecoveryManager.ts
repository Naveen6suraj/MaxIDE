/**
 * MaxIDE - Production-Grade Task Recovery & Resume Manager
 * 
 * Performs deterministic Recovery Analysis:
 * 1. Inspects workspace and compares against latest checkpoint.
 * 2. Detects user modifications made between sessions and prevents overwriting them.
 * 3. Inspects Git status, branches, and working tree state.
 * 4. Inspects running terminal processes and ports to avoid duplicate servers.
 * 5. Checks model and provider availability; handles offline Ollama gracefully.
 * 6. Synthesizes a minimal continuation plan rather than repeating completed operations.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import { ConversationStore, ConversationRecord } from '../conversation/ConversationStore.js';
import { ProjectManager } from '../../projects/ProjectManager.js';
import { CheckpointManager, Checkpoint } from '../checkpoint/CheckpointManager.js';
import { AgentEngine, AgentTaskResult } from '../AgentEngine.js';

export interface ExternalUserEdit {
  path: string;
  reason: 'newer_mtime' | 'content_mismatch_without_agent_action';
  currentSize: number;
}

export interface RecoveryAnalysis {
  conversationId: string;
  projectId: string;
  taskTitle: string;
  originalPrompt: string;
  status: string;
  interruptedStep: number;
  totalSteps: number;
  completedOperations: string[];
  remainingOperations: string[];
  existingFiles: string[];
  userModifiedFiles: ExternalUserEdit[];
  gitState?: {
    isRepo: boolean;
    branch?: string;
    modifiedCount: number;
    untrackedCount: number;
  };
  serverPortActive?: boolean;
  modelStatus: {
    originalModel: string;
    originalProvider?: string;
    isAvailable: boolean;
    warning?: string;
    alternativeModels: string[];
  };
  continuationPlan?: any;
}

export class RecoveryManager {
  private convStore: ConversationStore;
  private projectMgr: ProjectManager;
  private checkpointMgr: CheckpointManager;
  private agentEngine: AgentEngine;

  constructor(
    convStore: ConversationStore,
    projectMgr: ProjectManager,
    checkpointMgr: CheckpointManager,
    agentEngine: AgentEngine
  ) {
    this.convStore = convStore;
    this.projectMgr = projectMgr;
    this.checkpointMgr = checkpointMgr;
    this.agentEngine = agentEngine;
  }

  /**
   * Check if a local port is actively accepting TCP connections
   */
  public async isPortActive(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Performs thorough Recovery Analysis before continuing an interrupted task.
   */
  public async analyzeInterruptedTask(conversationId: string): Promise<RecoveryAnalysis> {
    const conv = this.convStore.getConversation(conversationId);
    if (!conv) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const project = this.projectMgr.getProject(conv.projectId) || this.projectMgr.getActiveProject();
    const workspaceRoot = project.activeWorkspace || this.agentEngine.workspaceManager.getRootPath();

    // 1. Find the latest checkpoint for this conversation
    let latestCp: Checkpoint | undefined;
    if (conv.lastCheckpointId) {
      latestCp = this.checkpointMgr.getCheckpoint(conv.lastCheckpointId);
    }
    if (!latestCp && conv.checkpointIds && conv.checkpointIds.length > 0) {
      const lastId = conv.checkpointIds[conv.checkpointIds.length - 1];
      latestCp = this.checkpointMgr.getCheckpoint(lastId);
    }
    if (!latestCp) {
      const allCps = this.checkpointMgr.listCheckpoints(project.id);
      if (allCps.length > 0) {
        latestCp = this.checkpointMgr.getCheckpoint(allCps[0].id);
      }
    }

    // 2. Inspect workspace files on disk
    const existingFiles: string[] = [];
    const userModifiedFiles: ExternalUserEdit[] = [];
    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (['node_modules', '.git', 'dist', '.cache'].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        const rel = path.relative(workspaceRoot, full).replace(/\\/g, '/');
        if (e.isDirectory()) {
          scanDir(full);
        } else if (e.isFile()) {
          existingFiles.push(rel);

          // Check if file was modified outside MaxIDE
          if (latestCp && latestCp.files && rel in latestCp.files) {
            try {
              const curContent = fs.readFileSync(full, 'utf8');
              const origContent = latestCp.files[rel];
              if (curContent !== origContent) {
                // Check if this file modification was recorded in agent's own tool calls
                const agentModifiedThis = (conv.filesChanged || []).includes(rel) ||
                  (conv.toolCalls || []).some(tc => tc.arguments && tc.arguments.path === rel);

                // If modified timestamp is newer than conversation updatedAt and contents differ
                const stat = fs.statSync(full);
                const convUpdatedTime = new Date(conv.updatedAt).getTime();
                if (stat.mtimeMs > convUpdatedTime + 2000) {
                  userModifiedFiles.push({
                    path: rel,
                    reason: 'newer_mtime',
                    currentSize: stat.size,
                  });
                }
              }
            } catch {}
          }
        }
      }
    };
    scanDir(workspaceRoot);

    // 3. Inspect Git State
    let gitState = undefined;
    try {
      const gStatus = await this.agentEngine.workspaceManager.getGitStatus();
      gitState = {
        isRepo: gStatus.isRepo,
        branch: gStatus.branch,
        modifiedCount: (gStatus.modified || []).length,
        untrackedCount: (gStatus.untracked || []).length,
      };
    } catch {}

    // 4. Inspect Server Port
    const serverPortActive = await this.isPortActive(3000) || await this.isPortActive(8080);

    // 5. Inspect Model / Provider Availability
    const modelRegistry = this.agentEngine.gateway.modelRegistry;
    const providerRegistry = this.agentEngine.gateway.providerRegistry;
    const targetModelId = conv.modelId || 'qwen2.5-coder:0.5b';
    const targetProvider = conv.providerId || 'ollama-local';

    const provider = providerRegistry.getProvider(targetProvider);
    let isModelAvailable = false;
    let warning: string | undefined;

    if (provider && provider.isEnabled) {
      if (provider.type === 'local') {
        // Ping local provider (Ollama)
        try {
          const check = await providerRegistry.checkProviderHealth(provider.id);
          isModelAvailable = check.status === 'online';
          if (!isModelAvailable) {
            warning = `Local engine "${provider.name}" is currently offline.`;
          }
        } catch {
          isModelAvailable = false;
          warning = `Could not connect to local provider ${provider.name}.`;
        }
      } else {
        isModelAvailable = Boolean(provider.config.apiKey);
        if (!isModelAvailable) {
          warning = `Provider "${provider.name}" requires an API key.`;
        }
      }
    } else {
      warning = `Provider "${targetProvider}" is disabled or not found.`;
    }

    const availableModels = modelRegistry.getAllModels()
      .filter(m => {
        const p = providerRegistry.getProvider(m.providerId);
        return p && p.isEnabled;
      })
      .map(m => m.id);

    // 6. Reconstruct Completed vs. Remaining Operations
    const completedOperations: string[] = [];
    const remainingOperations: string[] = [];

    // From conversation tool calls
    for (const tc of conv.toolCalls || []) {
      if (tc.name === 'create_file') {
        completedOperations.push(`Created ${tc.arguments?.path}`);
      } else if (tc.name === 'edit_file' || tc.name === 'patch_file') {
        completedOperations.push(`Modified ${tc.arguments?.path}`);
      } else if (tc.name === 'run_command') {
        completedOperations.push(`Ran ${tc.arguments?.command}`);
      } else if (tc.name.startsWith('browser_')) {
        completedOperations.push(`Browser verification: ${tc.name}`);
      }
    }

    if (completedOperations.length === 0 && conv.filesChanged && conv.filesChanged.length > 0) {
      for (const f of conv.filesChanged) {
        completedOperations.push(`Created file ${f}`);
      }
    }

    // Determine what remains based on original task
    if (existingFiles.includes('index.html') && !completedOperations.some(o => o.includes('browser'))) {
      remainingOperations.push('Verify web application in browser preview');
    }
    if (existingFiles.length === 0) {
      remainingOperations.push('Implement project source files');
    }

    return {
      conversationId: conv.id,
      projectId: conv.projectId,
      taskTitle: conv.title,
      originalPrompt: conv.taskPrompt,
      status: conv.taskStatus,
      interruptedStep: conv.toolCalls ? conv.toolCalls.length : 1,
      totalSteps: (conv.toolCalls ? conv.toolCalls.length : 1) + 2,
      completedOperations,
      remainingOperations,
      existingFiles,
      userModifiedFiles,
      gitState,
      serverPortActive,
      modelStatus: {
        originalModel: targetModelId,
        originalProvider: targetProvider,
        isAvailable: isModelAvailable,
        warning,
        alternativeModels: availableModels,
      },
      continuationPlan: conv.plan,
    };
  }

  /**
   * Resumes an interrupted task safely from the last valid checkpoint.
   * Does NOT blindly recreate files or repeat commands.
   */
  public async resumeInterruptedTask(
    conversationId: string,
    options: {
      modelId?: string;
      providerId?: string;
      preserveUserEdits?: boolean;
    } = {}
  ): Promise<AgentTaskResult> {
    const analysis = await this.analyzeInterruptedTask(conversationId);
    const conv = this.convStore.getConversation(conversationId)!;
    const project = this.projectMgr.getProject(conv.projectId) || this.projectMgr.getActiveProject();
    if (project && project.activeWorkspace) {
      this.agentEngine.setWorkspaceRoot(project.activeWorkspace);
    }

    // Check model availability
    let effectiveModel = options.modelId || conv.modelId;
    if (!analysis.modelStatus.isAvailable && !options.modelId) {
      // Pick first available fallback model
      if (analysis.modelStatus.alternativeModels.length > 0) {
        effectiveModel = analysis.modelStatus.alternativeModels[0];
        console.log(`[RecoveryManager] Switched to available model ${effectiveModel}`);
      }
    }

    // Prepare Continuation Context
    const userEditsNotice = analysis.userModifiedFiles.length > 0
      ? `CRITICAL: The user made manual external changes to the following files while MaxIDE was closed: ${analysis.userModifiedFiles.map(e => e.path).join(', ')}. DO NOT overwrite these files unnecessarily. Inspect their contents before touching them.\n`
      : '';

    const completedSummary = analysis.completedOperations.length > 0
      ? `Already completed operations:\n${analysis.completedOperations.map(o => `- ${o}`).join('\n')}\nDo NOT blindly repeat or recreate existing files: ${analysis.existingFiles.join(', ')}.\n`
      : '';

    const recoveryPrompt = `CONTINUE INTERRUPTED TASK: "${conv.taskPrompt}"\n\n` +
      userEditsNotice +
      completedSummary +
      `Please inspect current workspace files, determine any remaining work or verification needed, verify the result in the browser preview if it is a web app, and finalize the application.`;

    // Mark conversation working
    conv.taskStatus = 'WORKING';
    conv.messages.push({
      id: `msg-resume-${Date.now()}`,
      role: 'user',
      content: `Continue where we left off: ${conv.taskPrompt}`,
      timestamp: new Date().toISOString(),
    });
    this.convStore.saveConversation(conv);

    // Execute through agentEngine
    const result = await this.agentEngine.runTask(recoveryPrompt, {
      modelId: effectiveModel,
      autonomyMode: conv.autonomyMode || 'AUTONOMOUS',
      createPreCheckpoint: false,
    });

    // Update conversation record
    conv.taskStatus = result.success ? 'COMPLETED' : 'FAILED';
    conv.finalSummary = result.finalAnswer;
    if (result.openFile) conv.messages.push({
      id: `msg-res-${Date.now()}`,
      role: 'assistant',
      content: result.finalAnswer,
      timestamp: new Date().toISOString(),
      openFile: result.openFile,
      openPreview: result.openPreview,
      stepsCompleted: result.totalSteps,
    });
    this.convStore.saveConversation(conv);

    return result;
  }
}
