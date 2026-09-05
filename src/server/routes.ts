import { RecoveryManager } from '../agent/recovery/RecoveryManager.js';
/**
 * MaxIDE - Unlimited AI Provider Platform
 * REST API Routes for Workspace, Providers, Models, Terminal, Checkpoints, and Agent Engine
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { ProviderRegistry } from '../ai/registry/ProviderRegistry.js';
import { ModelRegistry } from '../ai/registry/ModelRegistry.js';
import { AIGateway } from '../ai/gateway/AIGateway.js';
import { AgentEngine, AutonomyMode } from '../agent/AgentEngine.js';
import { MissionControl } from '../agent/mission/MissionControl.js';
import { AIProviderConfig } from '../ai/core/AIProvider.js';
import { AIMode } from '../ai/core/types.js';
import { runAcceptanceTests } from '../tests/acceptance.test.js';
import { runIdeE2ETests } from '../tests/ide_e2e.test.js';
import { runFinalRealVerification } from '../tests/final_real_verification.js';
import { ProjectManager } from '../projects/ProjectManager.js';
import { ConversationStore } from '../agent/conversation/ConversationStore.js';
import { PermissionManager } from '../agent/safety/PermissionManager.js';
import { PathManager } from '../config/PathManager.js';
import { PreviewManager } from './preview/PreviewManager.js';
import { VerificationEngine } from '../agent/verification/VerificationEngine.js';

export function createApiRouter(
  providerRegistry: ProviderRegistry,
  modelRegistry: ModelRegistry,
  gateway: AIGateway,
  agentEngine: AgentEngine,
  missionControl: MissionControl,
  projectManager: ProjectManager = new ProjectManager(),
  conversationStore: ConversationStore = new ConversationStore(),
  permissionManager: PermissionManager = new PermissionManager(),
  recoveryManager?: RecoveryManager,
  previewManager?: PreviewManager
): Router {
  const router = Router();

  // --- 0. Production Health & System Readiness ---
  router.get('/health', (req, res) => {
    try {
      const activeProject = projectManager.getActiveProject();
      res.json({
        status: 'healthy',
        app: 'MaxIDE',
        version: '1.0.0',
        pid: process.pid,
        uptime: process.uptime(),
        workspace: agentEngine.workspaceManager.getRootPath(),
        activeProject: activeProject?.name || 'None',
        providersCount: providerRegistry.getAllProviders().length,
        modelsCount: modelRegistry.getAllModels().length,
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });

  // --- 0.1 Dedicated Preview API ---
  router.get('/preview/info', (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      if (previewManager) {
        return res.json(previewManager.getPreviewInfo(projectId));
      }
      const activeProject = projectManager.getActiveProject();
      const rootDir = activeProject?.activeWorkspace || agentEngine.workspaceManager.getRootPath();
      res.json({
        type: 'static',
        previewUrl: '/workspace-preview/index.html',
        fullUrl: 'http://127.0.0.1:3456/workspace-preview/index.html',
        entryFile: 'index.html',
        projectPath: rootDir,
        projectName: activeProject?.name || 'Default Project',
        projectId: activeProject?.id || 'default',
        port: 3456,
        serverRunning: false,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/preview/verify', async (req, res) => {
    try {
      const { url } = req.body;
      const targetUrl = url || (previewManager ? previewManager.getPreviewInfo().previewUrl : '/workspace-preview/index.html');
      const fullUrl = targetUrl.startsWith('http') ? targetUrl : `http://127.0.0.1:3456${targetUrl}`;
      const response = await fetch(fullUrl);
      const resText = await response.text();
      const check = PreviewManager.verifyPreviewNotMaxIDE(resText);
      res.json({
        url: fullUrl,
        status: response.status,
        contentType: response.headers.get('content-type'),
        isMaxIDE: check.isMaxIDE,
        marker: check.marker,
        verified: !check.isMaxIDE && response.status < 400,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, verified: false });
    }
  });

  router.get('/workspace/default-path', (req, res) => {
    try {
      const pathMgr = PathManager.getInstance();
      res.json({
        defaultWorkspace: pathMgr.getDefaultWorkspaceDir(),
        userDataDir: pathMgr.userDataDir,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 1. Workspace & Filesystem ---
  router.get('/workspace/tree', (req, res) => {
    try {
      const tree = agentEngine.workspaceManager.getFileTree();
      res.json({ rootPath: agentEngine.workspaceManager.getRootPath(), tree });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/workspace/file', (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'Path parameter required' });
      const isRaw = req.query.raw === 'true';
      if (isRaw) {
        const abs = agentEngine.workspaceManager.resolveSafePath(filePath);
        if (!fs.existsSync(abs)) {
          return res.status(404).json({ error: `File "${filePath}" not found` });
        }
        return res.sendFile(abs);
      }
      const content = agentEngine.workspaceManager.readFile(filePath);
      res.json({ path: filePath, content });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  router.post('/workspace/file', (req, res) => {
    try {
      const { path: filePath, content } = req.body;
      if (!filePath || content === undefined) return res.status(400).json({ error: 'Path and content required' });
      agentEngine.workspaceManager.writeFile(filePath, content);
      res.json({ success: true, path: filePath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/workspace/file', (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'Path parameter required' });
      const deleted = agentEngine.workspaceManager.deleteItem(filePath);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/workspace/folder', (req, res) => {
    try {
      const { path: folderPath } = req.body;
      if (!folderPath) return res.status(400).json({ error: 'Path required' });
      agentEngine.workspaceManager.createFolder(folderPath);
      res.json({ success: true, path: folderPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/workspace/rename', (req, res) => {
    try {
      const { oldPath, newPath } = req.body;
      const ok = agentEngine.workspaceManager.renameItem(oldPath, newPath);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/workspace/upload', async (req, res) => {
    try {
      const { files, targetDir } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      const results = [];
      for (const file of files) {
        const processed = await agentEngine.uploadManager.processUpload(file, targetDir);
        results.push(processed);
      }

      const contextText = agentEngine.uploadManager.buildContextString(results);
      res.json({
        success: true,
        count: results.length,
        results,
        contextText,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/workspace/duplicate', (req, res) => {
    try {
      const { path: targetPath } = req.body;
      const copyPath = agentEngine.workspaceManager.duplicateItem(targetPath);
      res.json({ success: true, newPath: copyPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(['/workspace/switch', '/workspace/project'], (req, res) => {
    try {
      const newRoot = req.body.path || req.body.directory;
      if (!newRoot) return res.status(400).json({ error: 'Path or directory required' });
      agentEngine.setWorkspaceRoot(newRoot);
      res.json({ success: true, currentRoot: agentEngine.workspaceManager.getRootPath() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/workspace/recent', (req, res) => {
    res.json(agentEngine.workspaceManager.getRecentProjects());
  });

  router.post('/workspace/create-project', (req, res) => {
    try {
      const { path: targetPath, template } = req.body;
      agentEngine.workspaceManager.createProject(targetPath, template || 'node-ts');
      agentEngine.setWorkspaceRoot(targetPath);
      res.json({ success: true, currentRoot: agentEngine.workspaceManager.getRootPath() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Git Integration ---
  router.get('/workspace/git/status', async (req, res) => {
    const status = await agentEngine.workspaceManager.getGitStatus();
    res.json(status);
  });

  router.get('/workspace/git/diff', async (req, res) => {
    const filePath = req.query.path as string;
    const diff = await agentEngine.workspaceManager.getGitDiff(filePath);
    res.json({ diff });
  });

  router.get('/workspace/git/log', async (req, res) => {
    const count = req.query.count ? parseInt(req.query.count as string, 10) : 8;
    const commits = await agentEngine.workspaceManager.getGitLog(count);
    res.json({ commits });
  });

  router.post('/workspace/git/commit', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Commit message required' });
    const result = await agentEngine.workspaceManager.gitCommit(message);
    res.json(result);
  });

  // --- 2. Checkpoints & Rollback ---
  router.get('/checkpoints', (req, res) => {
    res.json(agentEngine.checkpointManager.listCheckpoints());
  });

  router.post('/checkpoints', async (req, res) => {
    try {
      const { name } = req.body;
      const cp = await agentEngine.checkpointManager.createCheckpoint(name);
      res.json({ success: true, checkpoint: cp });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/checkpoints/:id/restore', async (req, res) => {
    try {
      const outcome = await agentEngine.checkpointManager.restoreCheckpoint(req.params.id);
      res.json(outcome);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/checkpoints/:id/compare', async (req, res) => {
    try {
      const deltas = await agentEngine.checkpointManager.compareChanges(req.params.id);
      res.json(deltas);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 3. Patches & Diffs ---
  router.get('/patches', (req, res) => {
    res.json(agentEngine.patchManager.getAllPatches());
  });

  router.post('/patches/:id/apply', async (req, res) => {
    try {
      const outcome = await agentEngine.patchManager.applyPatchSet(req.params.id);
      res.json(outcome);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/patches/:id/reject', (req, res) => {
    const ok = agentEngine.patchManager.rejectPatchSet(req.params.id);
    res.json({ success: ok });
  });

  router.post('/patches/:id/revert', async (req, res) => {
    try {
      const ok = await agentEngine.patchManager.revertPatchSet(req.params.id);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 4. Safe Terminal & Approvals ---
  router.get('/terminal/approvals', (req, res) => {
    res.json(agentEngine.safeTerminal.getPendingApprovals());
  });

  router.post('/terminal/approvals/:id', (req, res) => {
    const { decision } = req.body;
    const ok = agentEngine.safeTerminal.resolveApproval(req.params.id, decision || 'allow_once');
    res.json({ success: ok });
  });

  router.post('/terminal/run', async (req, res) => {
    try {
      const { command, reason } = req.body;
      const result = await agentEngine.safeTerminal.executeCommand(command, { reason });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 5. Codebase Intelligence ---
  router.get('/intelligence/search', (req, res) => {
    const query = req.query.q as string;
    if (!query) return res.json([]);
    const matches = agentEngine.intelligence.searchCode(query);
    res.json(matches);
  });

  router.get('/intelligence/symbols', (req, res) => {
    const name = req.query.name as string;
    if (!name) return res.json([]);
    const syms = agentEngine.intelligence.findSymbols(name);
    res.json(syms);
  });

  router.get('/intelligence/dependents', (req, res) => {
    const file = req.query.file as string;
    if (!file) return res.json([]);
    const dependents = agentEngine.intelligence.getDependents(file);
    res.json({ file, dependents });
  });

  // --- 6. Multi-Agent Mission Control ---
  router.get('/missions', (req, res) => {
    res.json(missionControl.getAllMissions());
  });

  router.post('/missions', (req, res) => {
    const { objective, modelId, providerId } = req.body;
    const mission = missionControl.createMission(objective, modelId, providerId);
    res.json(mission);
  });

  // --- 7. Agent Engine & Autonomy Modes ---
  router.get('/agent/autonomy', (req, res) => {
    res.json({ mode: agentEngine.getAutonomyMode() });
  });

  router.post('/agent/autonomy', (req, res) => {
    const { mode } = req.body;
    if (mode) agentEngine.setAutonomyMode(mode as AutonomyMode);
    res.json({ mode: agentEngine.getAutonomyMode() });
  });

  router.get('/agent/plan', (req, res) => {
    res.json(agentEngine.getCurrentPlan() || null);
  });

  let activeAbortController: AbortController | null = null;

  router.post('/agent/stop', (req, res) => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
      agentEngine.logActivity('error', 'Agent task execution was stopped by user request.');
      return res.json({ success: true, message: 'Agent execution stopped.' });
    }
    res.json({ success: true, message: 'No running agent task.' });
  });

  router.post('/agent/stream', async (req, res) => {
    const { task, modelId, maxSteps, contextMentions, attachments, directory, conversationId } = req.body;
    if (!task) return res.status(400).json({ error: 'Task is required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    activeAbortController = new AbortController();

    req.on('close', () => {
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
    });

    const sendEvent = (eventData: any) => {
      if (!res.writableEnded) {
        const evType = eventData.type || 'message';
        res.write(`event: ${evType}\ndata: ${JSON.stringify(eventData)}\n\n`);
      }
    };

    const unsubscribeTimeline = agentEngine.addTimelineListener((act) => {
      sendEvent({ type: 'timeline', event: act, activity: act });
    });

    const unsubscribePlan = agentEngine.addPlanListener((plan) => {
      sendEvent({ type: 'plan', plan });
    });

    try {
      if (directory && fs.existsSync(directory)) {
        agentEngine.setWorkspaceRoot(directory);
      }

      sendEvent({ type: 'status', status: 'PLANNING', text: 'Formulating agent execution plan...' });

      const outcome = await agentEngine.processMessage(task, {
        modelId,
        maxSteps: maxSteps ? Number(maxSteps) : 25,
        contextMentions,
        sessionId: conversationId,
      });

      const outcomeData = {
        success: outcome.actionType === 'agent_task' ? (outcome.agentResult?.success ?? true) : true,
        actionType: outcome.actionType,
        intent: outcome.intent,
        answer: outcome.answer,
        finalAnswer: outcome.answer || outcome.finalAnswer,
        openFile: outcome.openFile,
        openPreview: outcome.openPreview,
        openTerminal: outcome.openTerminal,
        previewInfo: (outcome as any).previewInfo,
        mediaInfo: outcome.mediaInfo,
        suggestedActions: outcome.suggestedActions,
        questions: outcome.questions,
        clarification: outcome.clarification,
        conversationId,
        stepsCompleted: outcome.agentResult?.totalSteps || 1,
        autoModel: outcome.autoModel,
      };

      sendEvent({
        type: 'complete',
        outcome: outcomeData,
        result: outcomeData,
      });
      res.end();
    } catch (err: any) {
      sendEvent({ type: 'error', error: err.message || 'Stream processing error' });
      res.end();
    } finally {
      unsubscribeTimeline();
      unsubscribePlan();
      activeAbortController = null;
    }
  });

  router.post('/agent/run', async (req, res) => {
    try {
      const { task, modelId, maxSteps, contextMentions, attachments, autonomyMode, directory } = req.body;
      if (!task) return res.status(400).json({ error: 'Task is required' });

      if (directory && fs.existsSync(directory)) {
        agentEngine.setWorkspaceRoot(directory);
      }

      // Process any uploaded attachments
      let enrichedContext = contextMentions || '';
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        const uploadResults = [];
        for (const att of attachments) {
          uploadResults.push(await agentEngine.uploadManager.processUpload(att));
        }
        const attachStr = agentEngine.uploadManager.buildContextString(uploadResults);
        enrichedContext = enrichedContext ? `${enrichedContext}\n${attachStr}` : attachStr;
      }

      // Create Mission Control entry
      const mission = missionControl.createMission(task, modelId || 'default');
      missionControl.updateMissionStatus(mission.id, 'RUNNING');

      // Persist Conversation Record
      const activeProj = projectManager.getActiveProject();
      const conversationId = req.body.conversationId;
      let convRecord = conversationId ? conversationStore.getConversation(conversationId) : undefined;
      if (!convRecord) {
        convRecord = conversationStore.createConversation({
          projectId: activeProj.id,
          taskPrompt: task,
          modelId: modelId || activeProj.modelId || 'auto',
          providerId: activeProj.providerId,
          autonomyMode: autonomyMode || activeProj.autonomyMode || 'AUTONOMOUS',
        });
      } else {
        convRecord.messages.push({
          id: `msg-${Date.now()}`,
          role: 'user',
          content: task,
          timestamp: new Date().toISOString(),
        });
        convRecord.taskStatus = 'WORKING';
        conversationStore.saveConversation(convRecord);
      }

      const outcome = await agentEngine.processMessage(task, {
        modelId,
        maxSteps: maxSteps ? Number(maxSteps) : 25,
        contextMentions: enrichedContext || undefined,
        sessionId: conversationId || (convRecord ? convRecord.id : undefined),
      });

      if (outcome.actionType === 'clarification') {
        missionControl.updateMissionStatus(mission.id, 'WAITING_APPROVAL');
        convRecord.taskStatus = 'WAITING_APPROVAL';
        convRecord.messages.push({
          id: `msg-clarify-${Date.now()}`,
          role: 'assistant',
          content: outcome.answer,
          timestamp: new Date().toISOString(),
          autoModel: outcome.autoModel,
        });
        conversationStore.saveConversation(convRecord);

        return res.json({
          success: true,
          status: 'clarification_needed',
          actionType: 'clarification',
          summary: outcome.answer,
          finalAnswer: outcome.answer,
          questions: outcome.questions || outcome.clarification?.questions,
          suggestedActions: outcome.suggestedActions,
          conversationId: convRecord.id,
          autoModel: outcome.autoModel,
        });
      }

      const finalAnswer = outcome.answer || (outcome.agentResult?.success ? 'Task completed successfully.' : (outcome.agentResult?.error || 'Task finished.'));
      convRecord.taskStatus = outcome.agentResult?.success === false ? 'FAILED' : 'COMPLETED';
      convRecord.messages.push({
        id: `msg-resp-${Date.now()}`,
        role: 'assistant',
        content: finalAnswer,
        timestamp: new Date().toISOString(),
        autoModel: outcome.autoModel,
        stepsCompleted: outcome.agentResult?.totalSteps || 1,
        openFile: outcome.openFile,
        openPreview: outcome.openPreview,
      });
      if (outcome.agentResult?.activityTimeline) {
        convRecord.toolEvents = outcome.agentResult.activityTimeline;
      }
      conversationStore.saveConversation(convRecord);

      if (outcome.actionType === 'agent_task' && outcome.agentResult) {
        if (outcome.agentResult.success) {
          missionControl.updateMissionStatus(mission.id, 'COMPLETED');
        } else {
          missionControl.updateMissionStatus(mission.id, 'FAILED', outcome.agentResult.error);
        }
        res.json({
          success: outcome.agentResult.success,
          actionType: outcome.actionType,
          intent: outcome.intent,
          mediaInfo: outcome.mediaInfo,
          summary: finalAnswer,
          finalAnswer: finalAnswer,
          stepsCompleted: outcome.agentResult.totalSteps,
          steps: outcome.agentResult.steps,
          error: outcome.agentResult.error,
          openFile: outcome.openFile,
          openPreview: outcome.openPreview,
          previewInfo: previewManager ? previewManager.getPreviewInfo(convRecord.projectId) : undefined,
          suggestedActions: outcome.suggestedActions,
          autoModel: outcome.autoModel,
          conversationId: convRecord.id,
        });
      } else {
        missionControl.updateMissionStatus(mission.id, 'COMPLETED');
        res.json({
          success: true,
          actionType: outcome.actionType,
          intent: outcome.intent,
          mediaInfo: outcome.mediaInfo,
          summary: finalAnswer,
          finalAnswer: finalAnswer,
          stepsCompleted: 1,
          openFile: outcome.openFile,
          openPreview: outcome.openPreview,
          previewInfo: previewManager ? previewManager.getPreviewInfo(convRecord.projectId) : undefined,
          openTerminal: outcome.openTerminal,
          suggestedActions: outcome.suggestedActions,
          autoModel: outcome.autoModel,
          conversationId: convRecord.id,
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 8. AI Providers, Models, Fallback & Mode ---
  router.get('/providers', async (req, res) => {
    const providers = providerRegistry.getAllProviders();
    const healthList = await Promise.all(providers.map((p) => providerRegistry.checkProviderHealth(p.id)));
    const models = modelRegistry.getAllModels();

    const data = providers.map((p) => {
      const health = healthList.find((h) => h.providerId === p.id);
      const provModels = models.filter((m) => m.providerId === p.id);
      return {
        ...p.config,
        apiKey: p.config.apiKey ? '••••••••••••••••' : undefined,
        health,
        modelCount: provModels.length,
      };
    });
    res.json(data);
  });

  router.post('/providers', async (req, res) => {
    try {
      const config: AIProviderConfig = req.body;
      if (!config.id || !config.name) {
        return res.status(400).json({ error: 'Provider id and name are required' });
      }
      const existing = providerRegistry.getProvider(config.id);
      if (existing && (!config.apiKey || config.apiKey.includes('•••'))) {
        config.apiKey = existing.config.apiKey;
      }
      const provider = providerRegistry.registerProvider(config);
      await modelRegistry.discoverProviderModels(provider.id);
      const health = await providerRegistry.checkProviderHealth(provider.id);
      res.json({ success: true, provider: provider.config, health });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/providers/:id', (req, res) => {
    const deleted = providerRegistry.removeProvider(req.params.id);
    res.json({ success: deleted });
  });

  router.all(['/providers/:id/test', '/providers/:id/health'], async (req, res) => {
    try {
      const health = await providerRegistry.checkProviderHealth(req.params.id);
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/models', (req, res) => {
    const { query, providerId, localOnly, cloudOnly, toolCalling, vision, reasoning, favoriteOnly } = req.query;
    const models = modelRegistry.searchModels({
      query: query ? String(query) : undefined,
      providerId: providerId ? String(providerId) : undefined,
      localOnly: localOnly === 'true',
      cloudOnly: cloudOnly === 'true',
      favoriteOnly: favoriteOnly === 'true',
      capabilities: {
        toolCalling: toolCalling === 'true' ? true : undefined,
        vision: vision === 'true' ? true : undefined,
        reasoning: reasoning === 'true' ? true : undefined,
      },
    });
    res.json(models);
  });

  router.post('/models/discover', async (req, res) => {
    try {
      const { providerId } = req.body;
      let discovered;
      if (providerId) {
        discovered = await modelRegistry.discoverProviderModels(providerId);
      } else {
        discovered = await modelRegistry.discoverAllModels();
      }
      res.json({ success: true, count: discovered.length, models: discovered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/models/custom', (req, res) => {
    try {
      const model = modelRegistry.addCustomModel(req.body);
      res.json({ success: true, model });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/mode', (req, res) => {
    res.json({
      mode: gateway.getAIMode(),
      activeModelId: gateway.getActiveModelId(),
    });
  });

  router.post('/mode', (req, res) => {
    const { mode, activeModelId } = req.body;
    if (mode) gateway.setAIMode(mode as AIMode);
    if (activeModelId) gateway.setActiveModel(activeModelId);
    res.json({
      success: true,
      mode: gateway.getAIMode(),
      activeModelId: gateway.getActiveModelId(),
    });
  });

  router.get('/fallback', (req, res) => {
    res.json(gateway.fallbackManager.getFallbackChain());
  });

  router.post('/fallback', (req, res) => {
    const { chain } = req.body;
    if (Array.isArray(chain)) gateway.setFallbackChain(chain);
    res.json({ success: true, chain: gateway.fallbackManager.getFallbackChain() });
  });

  router.get('/metrics', (req, res) => {
    res.json(gateway.getMetrics());
  });

  // --- 9. Acceptance Tests Suite ---
  router.post('/tests/run', async (req, res) => {
    try {
      const outcome = await runAcceptanceTests();
      res.json(outcome);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/tests/e2e', async (req, res) => {
    try {
      const outcome = await runIdeE2ETests();
      res.json(outcome);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/tests/final', async (req, res) => {
    try {
      const outcome = await runFinalRealVerification();
      res.json(outcome);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 10. Browser Verification Endpoints ---
  router.post('/browser/navigate', async (req, res) => {
    try {
      const { url } = req.body;
      const result = await agentEngine.browserAgent.navigate(url || 'http://localhost:3000');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/browser/dom', async (req, res) => {
    try {
      const selector = req.query.selector as string;
      const dom = await agentEngine.browserAgent.captureDom(selector);
      res.json(dom);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/browser/screenshot', async (req, res) => {
    try {
      const activeModelId = gateway.getActiveModelId();
      const model = activeModelId ? modelRegistry.getModel(activeModelId) : undefined;
      const shot = await agentEngine.browserAgent.captureScreenshot(model, true);
      res.json(shot);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/browser/click', async (req, res) => {
    try {
      const { selector } = req.body;
      const result = await agentEngine.browserAgent.click(selector);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/browser/fill', async (req, res) => {
    try {
      const { selector, text } = req.body;
      const result = await agentEngine.browserAgent.fill(selector, text);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 11. Persistent Projects & Multi-Folder Manager ---
  router.get('/projects', (req, res) => {
    try {
      const projects = projectManager.listProjects();
      const activeProject = projectManager.getActiveProject();
      res.json({ projects, activeProject, activeProjectId: activeProject.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/projects', (req, res) => {
    try {
      const { name, folders, providerId, modelId, autonomyMode, gitWorktreeMode, description } = req.body;
      if (!name) return res.status(400).json({ error: 'Project name is required' });
      const proj = projectManager.createProject({
        name,
        folders: folders && folders.length > 0 ? folders : [agentEngine.workspaceManager.getRootPath()],
        providerId,
        modelId,
        autonomyMode,
        gitWorktreeMode,
        description,
      });
      agentEngine.setWorkspaceRoot(proj.activeWorkspace);
      res.json(proj);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/projects/:id', (req, res) => {
    try {
      const proj = projectManager.updateProject(req.params.id, req.body);
      res.json(proj);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/projects/:id', (req, res) => {
    try {
      const deleted = projectManager.deleteProject(req.params.id);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/projects/:id/switch', (req, res) => {
    try {
      const proj = projectManager.setActiveProject(req.params.id);
      agentEngine.setWorkspaceRoot(proj.activeWorkspace);
      res.json({ success: true, project: proj });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/projects/:id/folders', (req, res) => {
    try {
      const { folderPath } = req.body;
      if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });
      const proj = projectManager.addFolder(req.params.id, folderPath);
      res.json(proj);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/projects/:id/folders', (req, res) => {
    try {
      const { folderPath } = req.body;
      if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });
      const proj = projectManager.removeFolder(req.params.id, folderPath);
      res.json(proj);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 12. Persistent Conversations & History Search ---
  router.get('/conversations', (req, res) => {
    try {
      const projectId = req.query.projectId as string;
      const list = projectId ? conversationStore.listByProject(projectId) : conversationStore.listAll();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/conversations/search', (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const results = conversationStore.search(q);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/conversations/:id', (req, res) => {
    try {
      const conv = conversationStore.getConversation(req.params.id);
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });
      res.json(conv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/conversations/:id', (req, res) => {
    try {
      const deleted = conversationStore.deleteConversation(req.params.id);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 13. Persistent Permissions ---
  router.get('/permissions/:projectId', (req, res) => {
    try {
      const grants = permissionManager.getProjectPermissions(req.params.projectId);
      res.json(grants);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/permissions/:projectId', (req, res) => {
    try {
      const updated = permissionManager.updateProjectPermissions(req.params.projectId, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 14. Interrupted Task Recovery ---
  router.get('/system/recovery', (req, res) => {
    try {
      const tasks = conversationStore.getInterruptedTasks();
      res.json({ interruptedTasks: tasks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/system/recovery/:id/analyze', async (req, res) => {
    try {
      if (!recoveryManager) return res.status(500).json({ error: 'RecoveryManager not initialized' });
      const analysis = await recoveryManager.analyzeInterruptedTask(req.params.id);
      res.json(analysis);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/system/recovery/:id/continue', async (req, res) => {
    try {
      if (!recoveryManager) return res.status(500).json({ error: 'RecoveryManager not initialized' });
      const result = await recoveryManager.resumeInterruptedTask(req.params.id, req.body || {});
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/system/recovery/:id/discard', (req, res) => {
    try {
      const conv = conversationStore.getConversation(req.params.id);
      if (conv) {
        conv.taskStatus = 'CANCELLED';
        conversationStore.saveConversation(conv);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Project Snapshots & Multi-Day History
  router.get('/projects/:id/snapshots', (req, res) => {
    try {
      const snaps = agentEngine.checkpointManager.listSnapshots(req.params.id);
      res.json(snaps);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/projects/:id/snapshots', async (req, res) => {
    try {
      const { name, description } = req.body;
      const snap = await agentEngine.checkpointManager.createNamedSnapshot(
        name || 'Snapshot',
        description,
        req.params.id
      );
      res.json(snap);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/projects/:id/snapshots/:snapshotId/restore', async (req, res) => {
    try {
      const outcome = await agentEngine.checkpointManager.restoreCheckpoint(req.params.snapshotId);
      res.json(outcome);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/projects/:id/history', (req, res) => {
    try {
      const grouped = conversationStore.getGroupedByDate(req.params.id);
      res.json(grouped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/projects/:id/diff-since-last', async (req, res) => {
    try {
      const checkpoints = agentEngine.checkpointManager.listCheckpoints(req.params.id);
      if (checkpoints.length > 0) {
        const deltas = await agentEngine.checkpointManager.compareChanges(checkpoints[0].id);
        res.json({ checkpoint: checkpoints[0], deltas });
      } else {
        res.json({ deltas: [] });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/projects/:id/last-session-summary', (req, res) => {
    try {
      const list = conversationStore.listByProject(req.params.id);
      res.json({ lastSession: list[0] || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- 11. Universal Artifact System Endpoints ---
  router.get('/artifacts', (req, res) => {
    try {
      agentEngine.artifactManager.scanWorkspace();
      const type = req.query.type as any;
      const search = req.query.search as string | undefined;
      const list = agentEngine.artifactManager.listArtifacts({ type, search });
      res.json({ success: true, count: list.length, artifacts: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/artifacts/:id', (req, res) => {
    try {
      const art = agentEngine.artifactManager.getArtifact(req.params.id);
      if (!art) return res.status(404).json({ error: 'Artifact not found' });
      res.json(art);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/artifacts/download/:id', (req, res) => {
    try {
      const art = agentEngine.artifactManager.getArtifact(req.params.id);
      if (!art || !fs.existsSync(art.filePath)) {
        return res.status(404).json({ error: 'Artifact file not found on disk' });
      }
      res.download(art.filePath, art.name);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/artifacts/verify/:id', (req, res) => {
    try {
      const art = agentEngine.artifactManager.getArtifact(req.params.id);
      if (!art) return res.status(404).json({ error: 'Artifact not found' });
      const verif = VerificationEngine.verifyArtifact(art);
      res.json(verif);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
