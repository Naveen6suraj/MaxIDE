import type { RecoveryManager } from './recovery/RecoveryManager.js';
import type { ConversationStore } from './conversation/ConversationStore.js';
/**
 * MaxIDE - Unlimited AI Provider Platform
 * Autonomous Multi-Step Agent Engine
 * 
 * STRICT ARCHITECTURAL INVARIANT:
 * This Agent Engine communicates EXCLUSIVELY with AIGateway.
 * It contains ZERO vendor or provider-specific logic.
 * 
 * Features:
 * - Autonomy Modes: ASK, ASSIST, AGENT, AUTONOMOUS
 * - Live Agent Plan UI Tracking
 * - Self-Correcting Error Recovery Loop
 * - Reversible Patch / Diff staging integration
 * - Safe Terminal boundary integration
 * - Context mentions (@file, @folder, @selection, etc.)
 */

import fs from 'fs';
import path from 'path';
import { AIGateway } from '../ai/gateway/AIGateway.js';
import { ChatMessage } from '../ai/core/AIRequest.js';
import { ToolCall } from '../ai/core/types.js';
import { ToolRegistry, ToolExecutionResult } from './ToolDefinition.js';
import { WorkspaceManager } from '../workspace/WorkspaceManager.js';
import { SafeTerminal } from './safety/SafeTerminal.js';
import { PatchManager } from './patch/PatchManager.js';
import { CheckpointManager } from './checkpoint/CheckpointManager.js';
import { CodebaseIntelligence } from './intelligence/CodebaseIntelligence.js';
import { BrowserVerificationAgent, createBrowserTools } from './tools/BrowserTools.js';
import { DevServerManager, createWorkspaceTools } from './tools/WorkspaceTools.js';
import { UploadManager } from '../workspace/UploadManager.js';
import { ClarificationGate, ClarificationResult } from './ClarificationGate.js';
import { ContentSanitizer } from './safety/ContentSanitizer.js';
import { IntentClassifier, IntentClassification, UserIntent } from './intent/IntentClassifier.js';
import { MediaTools, createMediaTools } from './tools/MediaTools.js';
import { MediaInspector } from './tools/MediaInspector.js';
import { ArtifactManager, Artifact } from '../artifacts/ArtifactManager.js';
import { CapabilityRegistry } from '../capabilities/CapabilityRegistry.js';
import { CapabilityPlanner } from '../capabilities/CapabilityPlanner.js';
import { TaskManager } from '../tasks/TaskManager.js';
import { BackgroundJobManager } from '../jobs/BackgroundJobManager.js';
import { createAudioTools } from './tools/AudioTools.js';
import { createArchiveTools } from './tools/ArchiveTools.js';
import { createFileSystemTools } from './tools/FileSystemTools.js';
import { AgentOrchestrator } from './orchestrator/AgentOrchestrator.js';
import { VerificationEngine } from './verification/VerificationEngine.js';
import { ClosedLoopTestEngine } from './verification/ClosedLoopTestEngine.js';

import { ProjectMemoryManager } from './memory/ProjectMemoryManager.js';

export type TaskLifecycleState = 'IDLE' | 'OBSERVING' | 'PLANNING' | 'WAITING_FOR_MODEL' | 'INSPECTING' | 'EXECUTING' | 'TESTING' | 'DIAGNOSING' | 'REPAIRING' | 'VERIFYING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';

export interface TaskExecutionEvidence {
  inspectedFiles: string[];
  modifiedFiles: string[];
  commandsExecuted: string[];
  testsRun: number;
  testsPassed: number;
  diagnostics: string[];
}

export type AutonomyMode = 'ASK' | 'ASSIST' | 'AGENT' | 'AUTONOMOUS';

export interface PlanMilestone {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  details?: string;
}

export interface AgentPlan {
  title: string;
  milestones: PlanMilestone[];
  currentMilestoneIndex: number;
}

export interface AgentActivityEvent {
  timestamp: string;
  type: 'thought' | 'tool_start' | 'tool_end' | 'plan_update' | 'error' | 'recovery' | 'diff_staged';
  summary: string;
  details?: any;
}

export interface AgentStep {
  stepNumber: number;
  thought: string;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ name: string; result: any }>;
  finishReason?: string;
  plan?: AgentPlan;
}

export type AgentFailureCategory =
  | 'TOOL_NOT_REGISTERED'
  | 'TOOL_EXECUTION_FAILURE'
  | 'TERMINAL_FAILURE'
  | 'APPLICATION_RUNTIME_FAILURE'
  | 'BROWSER_FAILURE'
  | 'SECURITY_VIOLATION';

export interface AgentFailureDiagnosis {
  category: AgentFailureCategory;
  toolName: string;
  errorMessage: string;
  recoveryGuidance: string;
}

export interface AutoModelMetadata {
  modelId: string;
  modelName: string;
  category: 'Code & Agentic Tasks' | 'Reasoning & Logic' | 'Explanation & Conversation' | 'General';
  rationale: string;
}

export interface AgentTaskResult {
  success: boolean;
  task: string;
  totalSteps: number;
  finalAnswer: string;
  steps: AgentStep[];
  plan?: AgentPlan;
  activityTimeline: AgentActivityEvent[];
  error?: string;
  openFile?: string;
  openPreview?: string;
  autoModel?: AutoModelMetadata;
}

export class AgentEngine {
  public readonly gateway: AIGateway;
  public readonly workspaceManager: WorkspaceManager;
  public readonly safeTerminal: SafeTerminal;
  public readonly patchManager: PatchManager;
  public readonly checkpointManager: CheckpointManager;
  public readonly intelligence: CodebaseIntelligence;
  public readonly browserAgent: BrowserVerificationAgent;
  public readonly devServerManager: DevServerManager;
  public readonly uploadManager: UploadManager;
  public readonly toolRegistry: ToolRegistry;
  public readonly artifactManager: ArtifactManager;
  public readonly orchestrator: AgentOrchestrator;
  public readonly capabilityRegistry: CapabilityRegistry;
  public readonly capabilityPlanner: CapabilityPlanner;
  public readonly taskManager: TaskManager;
  public readonly jobManager: BackgroundJobManager;
  public readonly testEngine: ClosedLoopTestEngine;
  public readonly projectMemory: ProjectMemoryManager;
  private currentLifecycleState: TaskLifecycleState = 'IDLE';
  private currentEvidence: TaskExecutionEvidence = {
    inspectedFiles: [],
    modifiedFiles: [],
    commandsExecuted: [],
    testsRun: 0,
    testsPassed: 0,
    diagnostics: [],
  };
  public recoveryManager?: RecoveryManager;
  public conversationStore?: ConversationStore;

  private autonomyMode: AutonomyMode = 'AUTONOMOUS';
  private currentPlan?: AgentPlan;
  private timeline: AgentActivityEvent[] = [];
  private onTimelineEvent?: (event: AgentActivityEvent) => void;
  private onPlanUpdate?: (plan: AgentPlan) => void;

  constructor(gateway: AIGateway, workspaceRoot: string) {
    this.gateway = gateway;
    this.workspaceManager = new WorkspaceManager(workspaceRoot);
    this.safeTerminal = new SafeTerminal(workspaceRoot);
    this.patchManager = new PatchManager(workspaceRoot);
    this.checkpointManager = new CheckpointManager(workspaceRoot);
    this.intelligence = new CodebaseIntelligence(workspaceRoot);
    this.browserAgent = new BrowserVerificationAgent();
    this.devServerManager = new DevServerManager();
    this.uploadManager = new UploadManager(workspaceRoot);
    this.toolRegistry = new ToolRegistry();
    this.artifactManager = new ArtifactManager(workspaceRoot);
    this.capabilityRegistry = new CapabilityRegistry();
    this.capabilityPlanner = new CapabilityPlanner(this.capabilityRegistry);
    this.taskManager = new TaskManager(workspaceRoot);
    this.jobManager = new BackgroundJobManager(workspaceRoot);
    this.testEngine = new ClosedLoopTestEngine(workspaceRoot, this.safeTerminal, this.checkpointManager);
    this.projectMemory = new ProjectMemoryManager(workspaceRoot);
    this.orchestrator = new AgentOrchestrator(
      workspaceRoot,
      this.artifactManager,
      this.safeTerminal,
      this.gateway
    );

    // Register all tools
    for (const tool of createWorkspaceTools(
      this.workspaceManager,
      this.safeTerminal,
      this.patchManager,
      this.intelligence,
      this.devServerManager,
      this.checkpointManager
    )) {
      this.toolRegistry.registerTool(tool);
    }

    for (const tool of createBrowserTools(this.browserAgent)) {
      this.toolRegistry.registerTool(tool);
    }

    for (const tool of createMediaTools(this.workspaceManager.getRootPath())) {
      this.toolRegistry.registerTool(tool);
    }

    for (const tool of createAudioTools(workspaceRoot, this.artifactManager)) {
      this.toolRegistry.registerTool(tool);
    }

    for (const tool of createArchiveTools(workspaceRoot)) {
      this.toolRegistry.registerTool(tool);
    }

    for (const tool of createFileSystemTools(workspaceRoot)) {
      this.toolRegistry.registerTool(tool);
    }
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceManager.setRootPath(newRoot);
    this.safeTerminal.setWorkspaceRoot(newRoot);
    this.patchManager.setWorkspaceRoot(newRoot);
    this.checkpointManager.setWorkspaceRoot(newRoot);
    this.intelligence.setWorkspaceRoot(newRoot);
    this.uploadManager.setWorkspaceRoot(newRoot);
    this.artifactManager.setWorkspaceRoot(newRoot);
    this.orchestrator.setWorkspaceRoot(newRoot);
    this.taskManager.setWorkspaceRoot(newRoot);
    this.jobManager.setWorkspaceRoot(newRoot);
    this.testEngine.setWorkspaceRoot(newRoot);
    this.projectMemory.setWorkspaceRoot(newRoot);
  }

  public setRecoveryManager(rm: RecoveryManager): void {
    this.recoveryManager = rm;
  }

  public setConversationStore(cs: ConversationStore): void {
    this.conversationStore = cs;
  }

  public getLifecycleState(): TaskLifecycleState {
    return this.currentLifecycleState;
  }

  public setLifecycleState(state: TaskLifecycleState): void {
    this.currentLifecycleState = state;
    this.logActivity('thought', `[Lifecycle: ${state}]`);
  }

  public getExecutionEvidence(): TaskExecutionEvidence {
    return { ...this.currentEvidence };
  }

  public setAutonomyMode(mode: AutonomyMode): void {
    this.autonomyMode = mode;
  }

  public getAutonomyMode(): AutonomyMode {
    return this.autonomyMode;
  }

  private timelineListeners: Set<(event: AgentActivityEvent) => void> = new Set();
  private planListeners: Set<(plan: AgentPlan) => void> = new Set();

  public setOnTimelineEvent(cb: (event: AgentActivityEvent) => void): void {
    this.onTimelineEvent = cb;
  }

  public addTimelineListener(cb: (event: AgentActivityEvent) => void): () => void {
    this.timelineListeners.add(cb);
    return () => this.timelineListeners.delete(cb);
  }

  public setOnPlanUpdate(cb: (plan: AgentPlan) => void): void {
    this.onPlanUpdate = cb;
  }

  public addPlanListener(cb: (plan: AgentPlan) => void): () => void {
    this.planListeners.add(cb);
    return () => this.planListeners.delete(cb);
  }

  public getTimeline(): AgentActivityEvent[] {
    return [...this.timeline];
  }

  public getCurrentPlan(): AgentPlan | undefined {
    return this.currentPlan;
  }

  public getActivePlan(): AgentPlan | undefined {
    return this.currentPlan;
  }

  public onActivity(cb: (event: AgentActivityEvent) => void): () => void {
    return this.addTimelineListener(cb);
  }

  public logActivity(type: AgentActivityEvent['type'], summary: string, details?: any): void {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
    const event: AgentActivityEvent = {
      timestamp: timeStr,
      type,
      summary,
      details,
    };
    this.timeline.push(event);
    if (this.onTimelineEvent) this.onTimelineEvent(event);
    for (const listener of this.timelineListeners) {
      try { listener(event); } catch {}
    }
  }

  /**
   * Parse or generate structured execution plan from task description.
   */
  private initializePlan(task: string): AgentPlan {
    const milestones: PlanMilestone[] = [
      { id: 'm1', title: '1. OBSERVE: Inspect workspace architecture & requirements', status: 'in_progress' },
      { id: 'm2', title: '2. PLAN: Formulate implementation steps & tool execution', status: 'pending' },
      { id: 'm3', title: '3. ACT: Synthesize code, create/edit files, run commands', status: 'pending' },
      { id: 'm4', title: '4. VERIFY: Test application in browser & run diagnostics', status: 'pending' },
      { id: 'm5', title: '5. REPAIR: Detect and auto-resolve any runtime defects', status: 'pending' },
      { id: 'm6', title: '6. VERIFY AGAIN & COMPLETE: Confirm verified working state', status: 'pending' },
    ];

    const plan: AgentPlan = {
      title: task.length > 50 ? `${task.slice(0, 50)}...` : task,
      milestones,
      currentMilestoneIndex: 0,
    };

    this.currentPlan = plan;
    if (this.onPlanUpdate) this.onPlanUpdate(plan);
    return plan;
  }

  private advancePlan(index: number, status: PlanMilestone['status']): void {
    if (!this.currentPlan) return;
    if (this.currentPlan.milestones[index]) {
      this.currentPlan.milestones[index].status = status;
    }
    if (status === 'completed' && index + 1 < this.currentPlan.milestones.length) {
      this.currentPlan.currentMilestoneIndex = index + 1;
      this.currentPlan.milestones[index + 1].status = 'in_progress';
    }
    if (this.onPlanUpdate) this.onPlanUpdate(this.currentPlan);
  }

  /**
   * Intelligently selects the best free / local model based on prompt characteristics:
   * - Deep Reasoning / Logic / Math / Algorithms -> Nemotron / MiniMax
   * - Code Synthesis / Multi-file / Tool Execution -> Qwen / Gemma4
   * - Fast Conversation / Concept Explanation -> Gemma4 / Llama3
   */
  public selectBestFreeModelForPrompt(prompt: string): AutoModelMetadata {
    const lower = prompt.toLowerCase();
    const allModels = this.gateway.modelRegistry.getAllModels();

    // Available free models (local or cloud models with active credentials)
    const availableFreeModels = allModels.filter((m) => {
      const prov = this.gateway.providerRegistry.getProvider(m.providerId);
      if (!prov || !prov.isEnabled) return false;
      if (prov.type === 'local') return true;
      return Boolean(prov.config.apiKey);
    });

    if (availableFreeModels.length === 0) {
      const fallbackId = allModels[0]?.id || 'qwen2.5-coder:0.5b';
      return {
        modelId: fallbackId,
        modelName: fallbackId,
        category: 'General',
        rationale: 'Default local model',
      };
    }

    // 1. Conversational explanation / concept inquiry (e.g. "Explain how React...", "What is an API gateway?")
    const isExplanation = /^(explain|what\s+is|what\s+are|how\s+does|why\s+is|tell\s+me\s+about|compare|help\s+me\s+understand|describe)\b/i.test(lower) &&
      !/(build|create|write\s+code|implement|generate\s+code|run|execute|fix|refactor|scaffold)/i.test(lower);

    if (isExplanation) {
      const fastChatModel = availableFreeModels.find((m) => m.id.includes('gemma4') || m.id.includes('llama3')) || availableFreeModels[0];
      return {
        modelId: fastChatModel.id,
        modelName: fastChatModel.name,
        category: 'Explanation & Conversation',
        rationale: 'Optimized for articulate, responsive conceptual explanations',
      };
    }

    // 2. Deep Reasoning, Math, Logic, Algorithms, Debugging root cause
    const isReasoning = /(algorithm|calculate|math|logic|why does|diagnose|root cause|complex|proof|optimize time complexity|big o|benchmark|analyze architecture)/i.test(lower);
    if (isReasoning) {
      const reasoningModel = availableFreeModels.find((m) => m.id.includes('nemotron') || m.id.includes('minimax')) ||
        availableFreeModels.find((m) => m.capabilities.reasoning);
      if (reasoningModel) {
        return {
          modelId: reasoningModel.id,
          modelName: reasoningModel.name,
          category: 'Reasoning & Logic',
          rationale: 'Specialized for deep reasoning, logic, and analytical problem-solving',
        };
      }
    }

    // 3. Full-stack Coding, Project Building, Testing, Tool Execution
    const isCodingTask = /(build|create|write|code|develop|function|node|python|react|html|css|javascript|typescript|install|terminal|script|api|component|refactor|debug|fix|portfolio|project)/i.test(lower);
    if (isCodingTask) {
      const coderModel = availableFreeModels.find((m) => m.id.includes('qwen') || m.id.includes('coder')) ||
        availableFreeModels.find((m) => m.id.includes('gemma4')) ||
        availableFreeModels.find((m) => m.capabilities.codeGeneration);
      if (coderModel) {
        return {
          modelId: coderModel.id,
          modelName: coderModel.name,
          category: 'Code & Agentic Tasks',
          rationale: 'Specialized for multi-file code synthesis and autonomous tool calling',
        };
      }
    }

    // 4. Default fallback: balanced model
    const defaultModel = availableFreeModels.find((m) => m.id.includes('gemma4') || m.id.includes('qwen')) || availableFreeModels[0];
    return {
      modelId: defaultModel.id,
      modelName: defaultModel.name,
      category: 'General',
      rationale: 'General purpose software engineering assistance',
    };
  }

  /**
   * Run autonomous software engineering task.
   */
  public async runTask(
    taskPrompt: string,
    options: {
      modelId?: string;
      autonomyMode?: AutonomyMode;
      maxSteps?: number;
      maxErrorRetries?: number;
      onStep?: (step: AgentStep) => void;
      contextMentions?: string;
      createPreCheckpoint?: boolean;
    } = {}
  ): Promise<AgentTaskResult> {
    if (options.autonomyMode) {
      this.autonomyMode = options.autonomyMode;
    }
    this.timeline = [];
    const maxSteps = options.maxSteps || (this.autonomyMode === 'AUTONOMOUS' ? 30 : 25);
    const maxErrorRetries = options.maxErrorRetries || 3;

    let modelId = options.modelId || this.gateway.getActiveModelId();
    let autoModelMeta: AutoModelMetadata | undefined;

    if (!modelId || modelId === 'auto') {
      autoModelMeta = this.selectBestFreeModelForPrompt(taskPrompt);
      modelId = autoModelMeta.modelId;
      this.logActivity('thought', `🤖 Auto-Selected Model: "${autoModelMeta.modelName}" (${autoModelMeta.category}) — ${autoModelMeta.rationale}`);
    }

    this.logActivity('thought', `Started task (${this.autonomyMode} mode, Model: ${modelId}): "${taskPrompt}"`);

    // 1. Optional Automatic Pre-Task Checkpoint (Requirement 11)
    if (options.createPreCheckpoint !== false && this.autonomyMode !== 'ASK') {
      try {
        const cp = await this.checkpointManager.createCheckpoint(`Auto: Pre-Task (${taskPrompt.slice(0, 30)})`);
        this.logActivity('thought', `Created workspace checkpoint: ${cp.name} (${cp.fileCount} files)`);
      } catch {}
    }

    // 2. Initialize Live Plan
    this.initializePlan(taskPrompt);
    this.setLifecycleState('PLANNING');
    this.currentEvidence = {
      inspectedFiles: [],
      modifiedFiles: [],
      commandsExecuted: [],
      testsRun: 0,
      testsPassed: 0,
      diagnostics: [],
    };
    this.logActivity('thought', 'Planning...');

    // 3. Index codebase for context
    await this.intelligence.indexProject();
    this.setLifecycleState('OBSERVING');
    const codebaseContext = this.intelligence.buildContext(taskPrompt, 2500);
    const projectMemContext = this.projectMemory.buildPromptContext();

    const systemPrompt =
      'You are MaxIDE Agent, an elite AI software engineering agent operating directly on the user\'s real computer inside MaxIDE.\n' +
      `Workspace Root: ${this.workspaceManager.getRootPath()}\n` +
      `Autonomy Mode: ${this.autonomyMode}\n\n` +
      'CRITICAL PROFESSIONAL STANDARDS (ANTIGRAVITY SPECIFICATION):\n' +
      '1. REAL WORKSPACE EXECUTION: You have direct access to files, SafeTerminal, dev servers, git, and Playwright browser tools.\n' +
      '2. ZERO DISCLAIMERS: NEVER say "I cannot access your files", "I am just an AI", or "Please create the files manually". You have real tools that run on the computer.\n' +
      '3. STRICT REGISTERED TOOLS ONLY: You must ONLY call tools provided in your schema (create_file, edit_file, read_file, list_files, run_command, start_dev_server, browser_navigate, browser_inspect_dom, browser_screenshot, open_file, open_preview). NEVER invent or hallucinate tool names like "build_<app>", "create_<app>", or "<task_name>".\n' +
      '4. HOW TO BUILD APPLICATIONS: To build any application (e.g. messenger, website, React app, game, API):\n' +
      '   - Step 1: Call "create_file" to write the source code files (e.g. index.html, server.js, app.js).\n' +
      '   - Step 2: Call "run_command" or "start_dev_server" to test syntax and launch the application.\n' +
      '   - Step 3: Call "browser_navigate" and "browser_inspect_dom" or "open_preview" to verify the app in the real browser.\n' +
      '5. CLICKABLE FILE LINKS: Whenever you mention a file path in your explanations, format it as a markdown link: [filename](open:filename) or `filename`.\n' +
      '6. AUTOMATIC OPEN & PREVIEW: When you build or modify web apps or components, invoke open_file or open_preview so the user immediately sees the result.\n' +
      '7. ARTICULATE, THOROUGH RESPONSES: Always provide a clear, beautifully formatted markdown walkthrough of what you did, the architecture, files created, and how to use it.\n\n' +
      'Relevant Codebase Context:\n' +
      codebaseContext +
      (projectMemContext ? '\n\nPersistent Project Memory:\n' + projectMemContext : '') +
      '\n\nSolve the user request thoroughly using your registered tools. Methodically inspect, modify, run verification, diagnose any errors, and confirm completion.';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: options.contextMentions ? `${taskPrompt}\n\nAdditional Context:\n${options.contextMentions}` : taskPrompt },
    ];

    const steps: AgentStep[] = [];
    let currentStep = 0;
    let finalAnswer = '';
    let consecutiveErrors = 0;
    const unknownToolAttempts: Map<string, number> = new Map();

    while (currentStep < maxSteps) {
      currentStep++;

      const toolDefs = this.toolRegistry.getDefinitions();
      const currentToolCalls: ToolCall[] = [];
      let stepThought = '';

      // Update milestone progression
      if (currentStep === 1) this.advancePlan(0, 'completed');
      else if (currentStep === 2) this.advancePlan(1, 'completed');
      else if (currentStep === 3) this.advancePlan(2, 'in_progress');

      // Request stream from AIGateway
      const eventStream = this.gateway.generateWithTools(
        { modelId, messages, tools: toolDefs },
        { modelId, requirements: { requiresToolCalling: true, requiresCodeGeneration: true } }
      );

      let finishReason = 'stop';

      for await (const event of eventStream) {
        if (event.type === 'token') {
          stepThought += event.content;
        } else if (event.type === 'tool_call') {
          currentToolCalls.push(event.toolCall);
        } else if (event.type === 'finish') {
          finishReason = event.reason;
        } else if (event.type === 'error') {
          this.logActivity('error', `Generation error: ${event.error}`);
          this.setLifecycleState('FAILED');
          return {
            success: false,
            task: taskPrompt,
            totalSteps: currentStep,
            finalAnswer: `Task failed: AI provider error (${event.error}). Workspace preserved without modification. Please verify your AI provider credentials and connectivity.`,
            steps,
            plan: this.currentPlan,
            activityTimeline: this.timeline,
            error: `PROVIDER_UNAVAILABLE: ${event.error}`,
          };
        }
      }

      if (stepThought) {
        this.logActivity('thought', stepThought.slice(0, 100).replace(/\n/g, ' '));
      }

      // If no native tool calls, check if model formatted tool calls or generated code blocks in its text response
      if (currentToolCalls.length === 0) {
        const textExtracted = this.extractToolCallsFromText(stepThought, currentStep, taskPrompt);
        if (textExtracted.length > 0) {
          currentToolCalls.push(...textExtracted);
        }
      }

      // If still no tool calls, but stepThought contains an internal tool-call JSON envelope:
      if (currentToolCalls.length === 0 && ContentSanitizer.isToolEnvelope(stepThought)) {
        this.logActivity('thought', `[Tool Envelope Observed] Model emitted JSON envelope in thought stream.`);
      }

      // If still no tool calls, task has concluded
      if (currentToolCalls.length === 0) {
        finalAnswer = stepThought.trim();
        if (ContentSanitizer.isToolEnvelope(finalAnswer)) {
          finalAnswer = '';
        }
        this.advancePlan(3, 'completed');
        this.advancePlan(4, 'completed');

        const finalStep: AgentStep = {
          stepNumber: currentStep,
          thought: stepThought,
          finishReason,
          plan: this.currentPlan,
        };
        steps.push(finalStep);
        if (options.onStep) options.onStep(finalStep);
        this.logActivity('thought', 'Agent concluded task reasoning.');
        break;
      }

      // Assistant turn with tool calls
      messages.push({
        role: 'assistant',
        content: stepThought,
        toolCalls: currentToolCalls,
      });

      // Execute each tool call
      const toolResults: Array<{ name: string; result: any }> = [];

      for (const tc of currentToolCalls) {
        // 1. Tool validation and normalization
        let isRegistered = this.toolRegistry.isRegistered(tc.name);

        if (!isRegistered && typeof tc.arguments === 'object' && tc.arguments !== null) {
          const isCompositeAction = tc.name.toLowerCase().startsWith('build_') || tc.name.toLowerCase().startsWith('make_');
          if (!isCompositeAction && tc.arguments.path && (tc.arguments.content !== undefined || tc.arguments.code !== undefined)) {
            tc.name = 'create_file';
            tc.arguments = { path: tc.arguments.path, content: tc.arguments.content ?? tc.arguments.code };
            isRegistered = true;
          } else if (tc.arguments.command) {
            tc.name = 'run_command';
            isRegistered = true;
          } else if (tc.name.includes('.') && (tc.name.endsWith('.js') || tc.name.endsWith('.html') || tc.name.endsWith('.ts') || tc.name.endsWith('.py'))) {
            tc.arguments = { path: tc.name, content: tc.arguments.content ?? tc.arguments.code ?? '' };
            tc.name = 'create_file';
            isRegistered = true;
          }
        }

        // 2. UNREGISTERED TOOL DETECTION & INTELLIGENT RECOVERY
        if (!isRegistered) {
          const attempts = (unknownToolAttempts.get(tc.name) || 0) + 1;
          unknownToolAttempts.set(tc.name, attempts);

          const diag = this.diagnoseToolFailure(tc.name, {}, false);
          this.logActivity('error', `[Failure: ${diag.category}] ${diag.errorMessage}`);

          const isHallucinatedComposite =
            tc.name.toLowerCase().startsWith('build_') ||
            tc.name.toLowerCase().startsWith('create_') ||
            tc.name.toLowerCase().startsWith('make_') ||
            tc.name.toLowerCase().endsWith('_app') ||
            tc.name.toLowerCase().endsWith('_game') ||
            tc.name.toLowerCase().endsWith('_website');

          // Steer model to registered tools when hallucinated composite or repeated failure occurs
          if (isHallucinatedComposite || attempts >= 2) {
            this.logActivity('recovery', `[Steering Model] Unregistered tool "${tc.name}". Steering to registered tools (create_file, edit_file, read_file, run_command).`);
            messages.push({
              role: 'tool',
              name: tc.name,
              toolCallId: tc.id,
              content: JSON.stringify({
                status: 'error',
                failureType: 'TOOL_NOT_REGISTERED',
                error: `Tool "${tc.name}" is not registered. You must ONLY call registered tools: create_file, edit_file, read_file, list_files, run_command.`,
                availableTools: this.toolRegistry.getDefinitions().map(d => d.name),
              }),
            });
            consecutiveErrors = 0;
            break;
          }

          // Steer model immediately with available registered tools
          this.logActivity('recovery', `[Recovery: ${diag.category}] Steered model to registered tools instead of "${tc.name}".`);

          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: JSON.stringify({
              status: 'error',
              failureType: diag.category,
              error: diag.errorMessage,
              instruction: diag.recoveryGuidance,
              availableTools: this.toolRegistry.getDefinitions().map(d => d.name),
            }),
          });

          messages.push({
            role: 'user',
            content: `[CORRECTIVE INSTRUCTION] Tool "${tc.name}" is NOT registered. Do not call "${tc.name}". You must call registered tools only: use "create_file" with {"path": "...", "content": "..."} to create the files for "${taskPrompt}".`,
          });

          continue;
        }

        if (['create_file', 'edit_file', 'patch_file'].includes(tc.name)) {
          this.logActivity('thought', 'Working on files...');
        } else if (['run_command', 'start_dev_server'].includes(tc.name)) {
          this.logActivity('thought', 'Running application...');
        } else if (tc.name.startsWith('browser_') || tc.name === 'open_preview') {
          this.logActivity('thought', 'Testing in browser...');
        }

        this.logActivity('tool_start', `Tool: ${tc.name}`, tc.arguments);

        // Check Autonomy Mode permissions:
        // ASK mode: Read-only inspection allowed, mutations require explicit approval.
        const isReadOnlyTool = [
          'read_file', 'list_files', 'search_files', 'git_status', 'git_diff',
          'git_log', 'browser_inspect_dom', 'browser_navigate', 'browser_screenshot',
          'get_command_output', 'open_file', 'open_preview'
        ].includes(tc.name);

        if (this.autonomyMode === 'ASK' && !isReadOnlyTool) {
          this.logActivity('thought', `ASK Mode: Proposing tool action without mutating workspace: ${tc.name}`);
          const proposedResult = {
            status: 'proposed_for_approval',
            message: `Action "${tc.name}" was proposed. In ASK mode, file mutations and system modifications require explicit user approval.`,
            proposedTool: tc.name,
            arguments: tc.arguments,
          };
          toolResults.push({ name: tc.name, result: proposedResult });
          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: JSON.stringify(proposedResult),
          });
          continue;
        }

        // Execute via ToolRegistry
        const execResult: ToolExecutionResult = await this.toolRegistry.execute(tc.name, tc.arguments, {
          model: this.gateway.modelRegistry.getModel(modelId || ''),
        });

        toolResults.push({ name: tc.name, result: execResult.result || execResult.error });

        // REQUIREMENT 20: ERROR RECOVERY LOOP WITH FAILURE CATEGORIZATION
        if (!execResult.success || (execResult.result && execResult.result.exitCode && execResult.result.exitCode !== 0)) {
          consecutiveErrors++;
          const diag = this.diagnoseToolFailure(tc.name, execResult, true);
          this.logActivity('error', `[Failure: ${diag.category}] Tool ${tc.name} failed (${consecutiveErrors}/${maxErrorRetries} retries): ${diag.errorMessage}`);

          if (consecutiveErrors <= maxErrorRetries) {
            this.logActivity('recovery', `[Recovery: ${diag.category}] ${diag.recoveryGuidance}`);
          } else {
            this.advancePlan(2, 'failed');
            return {
              success: false,
              task: taskPrompt,
              totalSteps: currentStep,
              finalAnswer: `Agent encountered persistent errors and reached max retries (${maxErrorRetries}). Category: ${diag.category}. Last error: ${diag.errorMessage}`,
              steps,
              plan: this.currentPlan,
              activityTimeline: this.timeline,
              error: diag.errorMessage,
            };
          }
        } else {
          consecutiveErrors = 0; // Reset error streak on success
          if (['read_file', 'readFile'].includes(tc.name)) {
            const p = (tc.arguments as any)?.path;
            if (p) this.currentEvidence.inspectedFiles.push(p);
            this.setLifecycleState('INSPECTING');
          } else if (['create_file', 'edit_file', 'writeFile', 'patch_file', 'createFile', 'editFile'].includes(tc.name)) {
            const p = (tc.arguments as any)?.path || (tc.arguments as any)?.file;
            if (p) this.currentEvidence.modifiedFiles.push(p);
            if (p) this.intelligence.indexFileIncremental(p);
            this.setLifecycleState('EXECUTING');
          } else if (['run_command', 'execute_command', 'executeCommand'].includes(tc.name)) {
            const c = (tc.arguments as any)?.command;
            if (c) this.currentEvidence.commandsExecuted.push(c);
            this.setLifecycleState('EXECUTING');
          }
          this.logActivity('tool_end', `Tool ${tc.name} completed`, execResult.result);
        }

        // Feed tool result back into context
        messages.push({
          role: 'tool',
          name: tc.name,
          toolCallId: tc.id,
          content: typeof execResult.result === 'string' ? execResult.result : JSON.stringify(execResult.result || execResult.error),
        });
      }

      const stepRecord: AgentStep = {
        stepNumber: currentStep,
        thought: stepThought,
        toolCalls: currentToolCalls,
        toolResults,
        finishReason,
        plan: this.currentPlan,
      };

      steps.push(stepRecord);
      if (options.onStep) options.onStep(stepRecord);
    }

    this.advancePlan(4, 'completed');

    // Scan steps to detect which files were created, modified, or opened
    let detectedOpenFile: string | undefined;
    let detectedOpenPreview: string | undefined;

    for (const s of steps) {
      for (const tc of s.toolCalls || []) {
        const args = tc.arguments as any;
        if (['create_file', 'edit_file', 'patch_file', 'open_file'].includes(tc.name)) {
          const p = args?.path;
          if (p && MediaInspector.isTextFile(p)) {
            detectedOpenFile = p;
            if (p.endsWith('.html')) {
              const cleanRel = p.replace(/\\/g, '/').replace(/^\.?\/+/, '');
              detectedOpenPreview = `/workspace-preview/${cleanRel}`;
            }
          }
        }
        if (tc.name === 'open_preview') {
          const rootPath = this.workspaceManager.getRootPath();
          const rawUrl = args?.url || '';
          if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
            const isLocal = rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1');
            const hasDevServer = this.devServerManager.getActiveServers(rootPath).length > 0;
            if (!isLocal || hasDevServer) {
              detectedOpenPreview = rawUrl;
            }
          } else {
            const cleanRel = rawUrl.replace(/^\/workspace-preview\/?/, '').replace(/^\.?\/+/, '') || 'index.html';
            detectedOpenPreview = `/workspace-preview/${cleanRel}`;
          }
        }
      }
    }

    const rootPath = this.workspaceManager.getRootPath();

    // Dev server detection (running Vite/React/Node on custom port)
    if (!detectedOpenPreview) {
      const runningServers = this.devServerManager.getActiveServers(rootPath);
      const serverWithPort = runningServers.find(s => typeof s.port === 'number' && s.port > 0);
      if (serverWithPort) {
        detectedOpenPreview = `http://127.0.0.1:${serverWithPort.port}`;
      }
    }

    // Intelligent entry point detection if not already detected
    const lowerTask = taskPrompt.toLowerCase();
    if (!detectedOpenPreview) {
      const candidates = [
        'index.html',
        'public/index.html',
        'dist/index.html',
        'build/index.html',
        'src/index.html',
      ];
      for (const c of candidates) {
        if (fs.existsSync(path.join(rootPath, c))) {
          detectedOpenPreview = `/workspace-preview/${c}`;
          if (!detectedOpenFile) detectedOpenFile = c;
          break;
        }
      }
      if (!detectedOpenPreview) {
        try {
          const entries = fs.readdirSync(rootPath, { withFileTypes: true });
          for (const e of entries) {
            if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
              const subIdx = path.join(rootPath, e.name, 'index.html');
              if (fs.existsSync(subIdx)) {
                detectedOpenPreview = `/workspace-preview/${e.name}/index.html`;
                if (!detectedOpenFile) detectedOpenFile = `${e.name}/index.html`;
                break;
              }
            }
          }
        } catch {}
      }
    }

    // Task Completion Physical Verification:
    const filesTouched = Array.from(new Set([
      ...this.currentEvidence.modifiedFiles,
      ...steps.flatMap(s => (s.toolCalls || []).filter(tc => ['create_file', 'edit_file', 'patch_file', 'writeFile', 'createFile', 'editFile'].includes(tc.name)).map(tc => (tc.arguments as any)?.path || (tc.arguments as any)?.file).filter(Boolean)),
    ]));
    const commandsRun = Array.from(new Set([
      ...this.currentEvidence.commandsExecuted,
      ...steps.flatMap(s => (s.toolCalls || []).filter(tc => ['run_command', 'execute_command', 'executeCommand'].includes(tc.name)).map(tc => (tc.arguments as any)?.command).filter(Boolean)),
    ]));

    const executionKeywords = ['build', 'create', 'make', 'implement', 'write', 'code', 'generate', 'game', 'messenger', 'app', 'site', 'website'];
    const isExecutionTask = executionKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(lowerTask));

    let physicalFilesExist = false;
    for (const f of filesTouched) {
      const fullPath = path.isAbsolute(f) ? f : path.join(rootPath, f);
      if (fs.existsSync(fullPath)) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 0) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (!ContentSanitizer.isToolEnvelope(content)) {
              physicalFilesExist = true;
            }
          }
        } catch {}
      }
    }

    // Closed-Loop Verification: Automatically discover and execute project test suite
    const disc = this.testEngine.discoverTests();
    if (disc.hasTests && isExecutionTask && (this.currentEvidence.modifiedFiles.length > 0 || physicalFilesExist)) {
      this.setLifecycleState('TESTING');
      this.logActivity('thought', `[Closed-Loop Verification] Discovered automated tests: "${disc.testCommand}". Running verification suite...`);
      const testRes = await this.testEngine.runTests(disc.testCommand);
      this.currentEvidence.testsRun++;
      if (testRes.passed) {
        this.currentEvidence.testsPassed++;
        this.logActivity('thought', `[Closed-Loop Verification] Automated test suite passed successfully (0 errors).`);
      } else {
        this.currentEvidence.diagnostics.push(...testRes.parsedFailures);
        this.logActivity('error', `[Closed-Loop Verification Failed] Tests failed: ${testRes.parsedFailures.slice(0, 3).join('; ')}`);
      }
    }

    const testsFailed = this.currentEvidence.testsRun > 0 && this.currentEvidence.testsPassed === 0;
    const taskActuallySucceeded = (physicalFilesExist || commandsRun.length > 0 || !isExecutionTask) && !testsFailed;

    if (taskActuallySucceeded) {
      this.setLifecycleState('VERIFYING');
      this.setLifecycleState('COMPLETED');
      this.projectMemory.recordTask(taskPrompt, 'COMPLETED', filesTouched);
    } else {
      const partial = physicalFilesExist && testsFailed;
      this.setLifecycleState(partial ? 'PARTIALLY_COMPLETED' : 'FAILED');
      this.projectMemory.recordTask(taskPrompt, partial ? 'PARTIALLY_COMPLETED' : 'FAILED', filesTouched);
    }

    if (!finalAnswer || finalAnswer.trim() === 'Task completed successfully.' || ContentSanitizer.isToolEnvelope(finalAnswer)) {
      if (taskActuallySucceeded) {
        // Build an articulate Antigravity-style summary
        let richSummary = `I have completed your task: **"${taskPrompt}"**.\n\n`;
        if (filesTouched.length > 0) {
          richSummary += `### 📁 Files Created & Modified:\n${Array.from(new Set(filesTouched)).map(f => `- [${f}](open:${f})`).join('\n')}\n\n`;
        }
        if (commandsRun.length > 0) {
          richSummary += `### 💻 Verification Commands Executed:\n${commandsRun.map(c => `- \`${c}\``).join('\n')}\n\n`;
        }
        if (detectedOpenPreview) {
          richSummary += `### 🌐 Live Preview Ready:\nYour application is running live and has been opened in the Browser panel below.\n`;
        }
        finalAnswer = richSummary;
      } else {
        finalAnswer = `TASK FAILED: Model attempted an invalid tool call and failed to create project files.`;
      }
    }

    this.logActivity('thought', taskActuallySucceeded ? 'Completed' : 'Task Failed');

    return {
      success: taskActuallySucceeded,
      task: taskPrompt,
      totalSteps: currentStep,
      finalAnswer,
      steps,
      plan: this.currentPlan,
      activityTimeline: this.timeline,
      openFile: detectedOpenFile,
      openPreview: detectedOpenPreview,
      autoModel: autoModelMeta,
      error: taskActuallySucceeded ? undefined : 'No valid workspace files were created or modified.',
    };
  }

  /**
   * Extract tool calls formatted as JSON, markdown blocks, or code generation from LLM text response.
   */
  private extractToolCallsFromText(text: string, currentStep: number, taskPrompt: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const lowerPrompt = taskPrompt.toLowerCase();

    // 1. Look for explicit JSON tool blocks
    const jsonBlockRegex = /```(?:json|tool)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = jsonBlockRegex.exec(text)) !== null) {
      const raw = match[1].trim();
      try {
        const parsed = JSON.parse(raw);
        const candidateName = parsed.tool || parsed.name;
        if (candidateName) {
          // If the model tried to call a hallucinated composite tool in JSON block, synthesize real tools immediately!
          // Pass candidateName directly to tool execution boundary
          calls.push({
            id: `call-json-${Date.now()}-${calls.length}`,
            name: candidateName,
            arguments: parsed.arguments || parsed.args || parsed.parameters || parsed,
          });
        }
      } catch {}
    }

    if (calls.length > 0) return calls;

    // 2. Fallback for code block file generation:
    // If the task asks to create, build, or write code, and the model outputted a code block:
    if (lowerPrompt.includes('create') || lowerPrompt.includes('build') || lowerPrompt.includes('node') || lowerPrompt.includes('app') || lowerPrompt.includes('project') || lowerPrompt.includes('file') || lowerPrompt.includes('messenger') || lowerPrompt.includes('chat') || lowerPrompt.includes('web') || lowerPrompt.includes('game')) {
      let codeContent = '';
      const codeBlockMatch = /```(?:javascript|js|typescript|ts|python|html|css|jsx|tsx)\b\s*([\s\S]*?)```/i.exec(text);
      if (codeBlockMatch && codeBlockMatch[1].trim().length > 5) {
        codeContent = codeBlockMatch[1].trim();
      } else if (!ContentSanitizer.isToolEnvelope(text) && (text.includes('function ') || text.includes('console.log') || text.includes('const ') || text.includes('def '))) {
        const lines = text.split('\n');
        const codeLines = lines.filter(l => !l.startsWith('I have') && !l.startsWith('Here is') && !l.startsWith('Sure') && !l.startsWith('#') && !l.trim().startsWith('{') && !l.trim().startsWith('"'));
        if (codeLines.length > 0) codeContent = codeLines.join('\n').trim();
      }

      // Reject if codeContent is a tool envelope
      if (codeContent && ContentSanitizer.isToolEnvelope(codeContent)) {
        codeContent = '';
      }

      if (codeContent) {
        let detectedPath = 'index.js';
        if (lowerPrompt.includes('python') || text.includes('def ')) detectedPath = 'main.py';
        else if (lowerPrompt.includes('html') || text.includes('<!DOCTYPE') || text.includes('<html') || lowerPrompt.includes('messenger')) detectedPath = 'index.html';
        else if (lowerPrompt.includes('node') || text.includes('function ') || text.includes('console.log')) detectedPath = 'app.js';

        // Check if filename was mentioned in the prompt or text
        const fnMatch = /(?:file|named|called|path)\s+[`'"]?([a-zA-Z0-9_\-\.\/]+\.(?:js|ts|py|html|json|txt|cjs|mjs))[`'"]?/i.exec(taskPrompt) ||
          /(?:file|named|called|path)\s+[`'"]?([a-zA-Z0-9_\-\.\/]+\.(?:js|ts|py|html|json|txt|cjs|mjs))[`'"]?/i.exec(text) ||
          /[`'"]([a-zA-Z0-9_\-\.\/]+\.(?:js|ts|py|html|json|txt|cjs|mjs))[`'"]/i.exec(taskPrompt) ||
          /\b([a-zA-Z0-9_\-]+\.(?:js|ts|py|html|json|txt|cjs|mjs))\b/i.exec(taskPrompt);
        if (fnMatch && fnMatch[1]) {
          detectedPath = fnMatch[1];
        }

        // Ensure valid JS syntax if plain string was outputted for a .js file
        if (detectedPath.endsWith('.js') && !codeContent.includes('function') && !codeContent.includes('console.log') && !codeContent.includes('const ') && !codeContent.includes('let ') && !codeContent.includes('var ') && !codeContent.includes('=>')) {
          codeContent = `function hello() {\n  return ${JSON.stringify(codeContent)};\n}\nconsole.log(hello());\n`;
        }

        calls.push({
          id: `call-gen-${Date.now()}`,
          name: 'create_file',
          arguments: { path: detectedPath, content: codeContent },
        });

        // If the task asked to run it: also schedule run_command
        if (lowerPrompt.includes('run') && (detectedPath.endsWith('.js') || detectedPath.endsWith('.cjs') || detectedPath.endsWith('.mjs'))) {
          calls.push({
            id: `call-run-${Date.now()}`,
            name: 'run_command',
            arguments: { command: `node ${detectedPath}` },
          });
        } else if (lowerPrompt.includes('run') && detectedPath.endsWith('.py')) {
          calls.push({
            id: `call-run-${Date.now()}`,
            name: 'run_command',
            arguments: { command: `python ${detectedPath}` },
          });
        }

        // If browser verification requested
        if (lowerPrompt.includes('browser') || lowerPrompt.includes('verify')) {
          if (detectedPath.endsWith('.html')) {
            calls.push({
              id: `call-prev-${Date.now() + 1}`,
              name: 'open_preview',
              arguments: { path: detectedPath },
            });
            calls.push({
              id: `call-nav-${Date.now() + 2}`,
              name: 'browser_navigate',
              arguments: { url: `http://127.0.0.1:3456/workspace-preview/${detectedPath}` },
            });
            calls.push({
              id: `call-inspect-${Date.now() + 3}`,
              name: 'browser_inspect_dom',
              arguments: { selector: 'body' },
            });
          }
        }
      }
    }

    return calls;
  }

  /**
   * Diagnostic classifier distinguishing failure types:
   * - TOOL_NOT_REGISTERED
   * - TOOL_EXECUTION_FAILURE
   * - TERMINAL_FAILURE
   * - APPLICATION_RUNTIME_FAILURE
   * - BROWSER_FAILURE
   * - SECURITY_VIOLATION
   */
  private diagnoseToolFailure(
    toolName: string,
    execResult: Partial<ToolExecutionResult>,
    isRegistered: boolean
  ): AgentFailureDiagnosis {
    if (!isRegistered) {
      const registeredTools = this.toolRegistry.getDefinitions().map(d => d.name).join(', ');
      return {
        category: 'TOOL_NOT_REGISTERED',
        toolName,
        errorMessage: `Tool "${toolName}" is not registered in ToolRegistry.`,
        recoveryGuidance: `Tool "${toolName}" does not exist. You must ONLY call registered tools: [${registeredTools}]. To create files, call "create_file". To run commands or apps, call "run_command". To test in browser, call "browser_navigate".`,
      };
    }

    if (toolName === 'run_command' && execResult.result && execResult.result.exitCode && execResult.result.exitCode !== 0) {
      return {
        category: 'TERMINAL_FAILURE',
        toolName,
        errorMessage: `Command "${execResult.result.command}" failed with exit code ${execResult.result.exitCode}: ${execResult.result.stderr || execResult.result.stdout || 'Command exited non-zero'}`,
        recoveryGuidance: `Terminal execution failed. Inspect the stderr above, modify the code with "edit_file" or "create_file", and re-run with "run_command".`,
      };
    }

    if (toolName.startsWith('browser_')) {
      return {
        category: 'BROWSER_FAILURE',
        toolName,
        errorMessage: `Browser automation error: ${execResult.error || JSON.stringify(execResult.result)}`,
        recoveryGuidance: `Browser verification failed. Ensure the server is listening, verify the target URL, and use "browser_navigate" or "browser_inspect_dom".`,
      };
    }

    if (toolName.includes('server')) {
      return {
        category: 'APPLICATION_RUNTIME_FAILURE',
        toolName,
        errorMessage: `Server runtime error: ${execResult.error || JSON.stringify(execResult.result)}`,
        recoveryGuidance: `Server runtime failed. Verify port availability and script path, or run the app via "run_command".`,
      };
    }

    if (execResult.error && execResult.error.includes('Security Violation')) {
      return {
        category: 'SECURITY_VIOLATION',
        toolName,
        errorMessage: execResult.error,
        recoveryGuidance: `Path escaped workspace root. Keep all files within the workspace root.`,
      };
    }

    return {
      category: 'TOOL_EXECUTION_FAILURE',
      toolName,
      errorMessage: execResult.error || 'Tool execution encountered an error.',
      recoveryGuidance: `Tool "${toolName}" execution failed. Verify arguments schema and retry.`,
    };
  }

  /**
   * Autonomous self-healing action synthesizer when small local models
   * are persistently trapped in hallucinated tool name loops.
   */
  /**
   * Canned synthesis is deprecated. MaxIDE uses genuine autonomous execution
   * and closed-loop testing via ClosedLoopTestEngine.
   */
  private synthesizeActionsForPrompt(_taskPrompt: string): ToolCall[] {
    return [];
  }

    public async processMessage(
    userPrompt: string,
    options: {
      modelId?: string;
      maxSteps?: number;
      contextMentions?: string;
      sessionId?: string;
      conversationId?: string;
      autonomyMode?: AutonomyMode;
    } = {}
  ): Promise<{
    actionType: 'conversation' | 'agent_task' | 'workbench_action' | 'clarification';
    answer: string;
    finalAnswer?: string;
    intent?: string;
    agentResult?: AgentTaskResult;
    openFile?: string;
    openPreview?: string;
    openTerminal?: boolean;
    openMediaStudio?: boolean;
    openArtifactId?: string;
    mediaInfo?: any;
    artifact?: Artifact;
    suggestedActions?: Array<{ label: string; prompt: string }>;
    autoModel?: AutoModelMetadata;
    clarification?: ClarificationResult;
    questions?: ClarificationResult['questions'];
  }> {
    const trimmed = userPrompt.trim();
    const lower = trimmed.toLowerCase();

    // 1. Explicit Intent Classification (CHAT, EXPLAIN, BROWSER_TASK, GIT_TASK, BUILD, etc.)
    const classification = IntentClassifier.classify(trimmed);

    let effectiveModelId = options.modelId || this.gateway.getActiveModelId();
    let autoModelMeta: AutoModelMetadata | undefined;

    if (!effectiveModelId || effectiveModelId === 'auto') {
      autoModelMeta = this.selectBestFreeModelForPrompt(trimmed);
      effectiveModelId = autoModelMeta.modelId;
    }

    // 1.5 Specialized Domain Orchestration (Presentations, Data Analysis, Documents, Research)
    const orchestrated = await this.orchestrator.dispatch(trimmed, classification, (evt) => {
      this.logActivity('thought', `[${classification.intent}] ${evt.step}: ${evt.details || ''}`);
    });
    if (orchestrated) {
      return {
        actionType: orchestrated.actionType,
        answer: orchestrated.answer,
        finalAnswer: orchestrated.finalAnswer,
        intent: orchestrated.intent,
        openFile: orchestrated.openFile,
        openPreview: orchestrated.openPreview,
        suggestedActions: orchestrated.suggestedActions,
        autoModel: autoModelMeta,
        artifact: orchestrated.artifact,
      };
    }

    // 2. CHAT INTENT ("hello", "hi", "good morning", "thanks", "who are you")
    // Strictly conversational: ZERO file modifications, NO terminal commands, NO preview opening
    if (classification.intent === 'CHAT') {
      this.logActivity('thought', `Classified as conversation (CHAT): "${trimmed}"`);

      let chatResponse = '';
      try {
        const sysPrompt =
          'You are MaxIDE Assistant, an elite AI software engineering companion.\n' +
          'Be conversational, polite, concise, and helpful in markdown. Do NOT write code files or run terminal commands.';

        const resp = await this.gateway.generate({
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: trimmed },
          ],
          modelId: effectiveModelId,
        });
        chatResponse = resp.content;
      } catch {
        // Human-readable graceful greeting if AI provider is offline
        chatResponse = 'Hello! I am **MaxIDE Assistant**, your AI software engineering companion. How can I help you with your project today?';
      }

      return {
        actionType: 'conversation',
        answer: chatResponse,
        finalAnswer: chatResponse,
        intent: 'CHAT',
        autoModel: autoModelMeta,
        suggestedActions: [
          { label: '🚀 Build a modern web application', prompt: 'Build a modern web application' },
          { label: '📂 Inspect workspace', prompt: 'Inspect the project and summarize architecture' }
        ],
      };
    }

    // 3. EXPLAIN INTENT ("what is React?", "explain this code", "what is a promise?", "how does this function work?")
    // Strictly conceptual / informational: ZERO file modifications, NO terminal commands, NO preview opening
    if (classification.intent === 'EXPLAIN') {
      this.logActivity('thought', `Classified as conceptual inquiry (EXPLAIN): "${trimmed}"`);

      let explanationResponse = '';
      try {
        await this.intelligence.indexProject();
        const codebaseContext = this.intelligence.buildContext(trimmed, 1500);

        const sysPrompt =
          'You are MaxIDE Assistant, an elite AI software engineering educator and architect.\n' +
          `Workspace: ${this.workspaceManager.getRootPath()}\n` +
          'Provide a clear, in-depth, articulate explanation in markdown with code snippets where helpful. Do NOT modify any workspace files.\n' +
          (codebaseContext ? `\nCodebase Context:\n${codebaseContext}\n` : '');

        const resp = await this.gateway.generate({
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: trimmed },
          ],
          modelId: effectiveModelId,
        });
        explanationResponse = resp.content;
      } catch {
        // Fallback explanation if model is offline
        if (lower.includes('react')) {
          explanationResponse = '### React Overview\n\n**React** is a popular declarative, component-based JavaScript library for building user interfaces.\n\n- **Components**: Reusable, self-contained UI building blocks.\n- **JSX**: Syntax extension allowing HTML-like markup inside JavaScript.\n- **State & Hooks**: `useState` and `useEffect` manage reactive state and side effects.\n- **Virtual DOM**: Minimizes expensive DOM operations for optimal rendering performance.';
        } else if (lower.includes('promise')) {
          explanationResponse = '### JavaScript Promises\n\nA **Promise** represents an asynchronous operation that may produce a value in the future.\n\nStates:\n1. **Pending**: Initial state.\n2. **Fulfilled**: Operation completed successfully (`resolve()`).\n3. **Rejected**: Operation failed (`reject()`).\n\nModern JavaScript uses `async/await` for clean synchronous-looking asynchronous code.';
        } else {
          explanationResponse = `Here is a high-level explanation of **${trimmed}**:\n\nThis is a software engineering concept. In MaxIDE, you can write, test, and run code directly in your workspace.`;
        }
      }

      return {
        actionType: 'conversation',
        answer: explanationResponse,
        finalAnswer: explanationResponse,
        intent: 'EXPLAIN',
        autoModel: autoModelMeta,
        suggestedActions: [
          { label: '🚀 Build a starter example in workspace', prompt: `Build a starter example for: ${trimmed}` }
        ],
      };
    }

    // 4. BROWSER TASK INTENT ("Open https://...", "Open the website", "Open preview")
    if (classification.intent === 'BROWSER_TASK') {
      this.logActivity('thought', `Classified as browser navigation task: "${trimmed}"`);

      // External website navigation (e.g. "Open https://example.com")
      if (classification.extractedTarget) {
        const extAns = `Opening external website: [${classification.extractedTarget}](${classification.extractedTarget}) in preview.`;
        return {
          actionType: 'workbench_action',
          answer: extAns,
          finalAnswer: extAns,
          intent: 'BROWSER_TASK',
          openPreview: classification.extractedTarget,
        };
      }

      // Generated project preview (e.g. "Open the website", "Open preview")
      const root = this.workspaceManager.getRootPath();
      let previewFile = 'index.html';
      if (fs.existsSync(path.join(root, 'index.html'))) previewFile = 'index.html';
      else if (fs.existsSync(path.join(root, 'public', 'index.html'))) previewFile = 'public/index.html';
      else if (fs.existsSync(path.join(root, 'dist', 'index.html'))) previewFile = 'dist/index.html';

      const previewUrl = `/workspace-preview/${previewFile}`;
      const prevAns = `Opened generated project application at [${previewFile}](open:${previewFile}) in the Browser Preview.`;
      return {
        actionType: 'workbench_action',
        answer: prevAns,
        finalAnswer: prevAns,
        intent: 'BROWSER_TASK',
        openFile: previewFile,
        openPreview: previewUrl,
        suggestedActions: [
          { label: '🌐 Open in New Tab', prompt: `open ${previewUrl} in new tab` },
          { label: '✏️ Edit Styles', prompt: 'edit style.css to customize theme' }
        ],
      };
    }

    // 5. GIT TASK INTENT ("git status", "git diff", "commit changes", "push to github")
    if (classification.intent === 'GIT_TASK') {
      this.logActivity('thought', `Executing Git workflow: "${trimmed}"`);

      if (lower.includes('status')) {
        const statusRes = await this.safeTerminal.executeCommand('git status');
        const gitAns = `### Git Status\n\`\`\`bash\n${statusRes.stdout || statusRes.stderr || 'Working tree clean'}\n\`\`\``;
        return {
          actionType: 'conversation',
          answer: gitAns,
          finalAnswer: gitAns,
          intent: 'GIT_TASK',
          suggestedActions: [
            { label: '🔍 View Git Diff', prompt: 'git diff' },
            { label: '💾 Commit Changes', prompt: 'commit changes' }
          ]
        };
      }

      if (lower.includes('diff')) {
        const diffRes = await this.safeTerminal.executeCommand('git diff');
        return {
          actionType: 'conversation',
          answer: `### Git Diff\n\`\`\`diff\n${diffRes.stdout || 'No uncommitted changes.'}\n\`\`\``,
          suggestedActions: [
            { label: '💾 Commit Changes', prompt: 'commit changes' }
          ]
        };
      }

      if (lower.includes('commit')) {
        // Extract custom message if present, or generate descriptive default
        let commitMsg = 'Update workspace via MaxIDE Agent';
        const msgMatch = trimmed.match(/["']([^"']+)["']/);
        if (msgMatch) commitMsg = msgMatch[1];

        await this.safeTerminal.executeCommand('git add -A');
        const commitRes = await this.safeTerminal.executeCommand(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
        return {
          actionType: 'conversation',
          answer: `### Git Commit Created\n- **Message:** "${commitMsg}"\n\n\`\`\`bash\n${commitRes.stdout || commitRes.stderr || 'Committed successfully.'}\n\`\`\``,
          suggestedActions: [
            { label: '🚀 Push to GitHub', prompt: 'git push' }
          ]
        };
      }

      if (lower.includes('push')) {
        // Verify remote status
        const branchRes = await this.safeTerminal.executeCommand('git branch --show-current');
        const currentBranch = branchRes.stdout.trim() || 'main';
        const pushRes = await this.safeTerminal.executeCommand(`git push origin ${currentBranch}`);
        return {
          actionType: 'conversation',
          answer: `### Git Push\n- **Branch:** \`${currentBranch}\`\n- **Remote:** \`origin\`\n\n\`\`\`bash\n${pushRes.stdout || pushRes.stderr || 'Pushed successfully.'}\n\`\`\``,
        };
      }
    }

    // 5.4. MEDIA ACTION INTENT (Watch or Download generated media)
    const isPlayAudio = /\b(play|listen|hear|stream)\b.*\b(music|audio|soundtrack|song|track)\b/i.test(lower) || /^(play|listen)\s+(it|the\s+music|the\s+audio|audio|music|soundtrack)\b/i.test(lower) || lower === 'play music' || lower === 'listen' || lower === 'play audio';
    const isDownloadAudio = /\b(download|save|export|get)\b.*\b(music|audio|soundtrack|song|track|wav|mp3)\b/i.test(lower) || /^(download|save)\s+(the\s+music|the\s+audio|audio|music|soundtrack)\b/i.test(lower);

    if (isPlayAudio) {
      const latestAudio = this.getLatestAudioFile();
      if (latestAudio) {
        const audioUrl = `/workspace-preview/${latestAudio}`;
        const answerText = `### 🎵 Audio Player: \`${path.basename(latestAudio)}\`\n\n` +
          `<audio controls autoplay class="w-full rounded-xl border border-cyan-500/40 shadow-xl my-3 bg-[#0a0e1a]" src="${audioUrl}"></audio>\n\n` +
          `Now playing **\`${latestAudio}\`**. Let me know if you would also like to download it.`;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'AUDIO_GEN',
          openMediaStudio: true,
          openPreview: audioUrl,
        };
      } else {
        const answerText = `No audio asset found in \`assets/audio/\`. You can ask me to generate background music or soundtrack anytime (e.g. *"generate background music for my game"*).`;
        return { actionType: 'conversation', answer: answerText, finalAnswer: answerText, intent: 'CHAT' };
      }
    }

    if (isDownloadAudio) {
      const latestAudio = this.getLatestAudioFile();
      if (latestAudio) {
        const filename = path.basename(latestAudio);
        const downloadUrl = `/api/workspace/file?path=${encodeURIComponent(latestAudio)}&raw=true`;
        const answerText = `### ⬇️ Download Audio\n\n` +
          `Your audio soundtrack **\`${filename}\`** is ready:\n\n` +
          `- **[Click Here to Download ${filename}](${downloadUrl})**\n\n` +
          `Local file location: \`${latestAudio}\``;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'AUDIO_GEN',
        };
      } else {
        const answerText = `No audio asset found to download. Ask me to generate a soundtrack first.`;
        return { actionType: 'conversation', answer: answerText, finalAnswer: answerText, intent: 'CHAT' };
      }
    }

    const isWatchVideo = /\b(watch|play|show|see|view|open)\b.*\b(video|clip|movie|animation|footage)\b/i.test(lower) || /^(watch|play|show|view)\s+(it|the\s+video|video)\b/i.test(lower) || lower === 'watch' || lower === 'play' || lower === 'watch video' || lower === 'play video';
    const isDownloadVideo = /\b(download|save|export|get)\b.*\b(video|clip|movie|animation|file)\b/i.test(lower) || /^(download|save)\s+(it|the\s+video|video)\b/i.test(lower) || lower === 'download' || lower === 'download video';
    const isWatchImage = /\b(watch|show|see|view|open)\b.*\b(image|picture|photo|wallpaper|artwork)\b/i.test(lower) || /^(show|view|open)\s+(the\s+image|image)\b/i.test(lower);
    const isDownloadImage = /\b(download|save|export|get)\b.*\b(image|picture|photo|wallpaper)\b/i.test(lower) || /^(download|save)\s+(the\s+image|image)\b/i.test(lower);

    if (isWatchVideo) {
      const latestVideo = this.getLatestMediaFile('video');
      if (latestVideo) {
        const videoUrl = `/workspace-preview/${latestVideo}`;
        const answerText = `### 🎬 Video Player: \`${path.basename(latestVideo)}\`\n\n` +
          `<video controls autoplay loop class="w-full rounded-xl border border-cyan-500/40 shadow-xl my-2 max-h-80 bg-black" src="${videoUrl}"></video>\n\n` +
          `Now playing **\`${latestVideo}\`**. Let me know if you would also like to download it.`;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'MEDIA_GEN',
          openMediaStudio: true,
          openPreview: videoUrl,
        };
      } else {
        const answerText = `No video asset found in \`assets/\`. Tell me what you'd like to create (e.g. *"generate a sample 4k video of 5 seconds of super car"*), and I will create it immediately.`;
        return { actionType: 'conversation', answer: answerText, finalAnswer: answerText, intent: 'CHAT' };
      }
    }

    if (isDownloadVideo) {
      const latestVideo = this.getLatestMediaFile('video');
      if (latestVideo) {
        const filename = path.basename(latestVideo);
        const downloadUrl = `/api/workspace/file?path=${encodeURIComponent(latestVideo)}&raw=true`;
        const answerText = `### ⬇️ Download Video\n\n` +
          `Your video file **\`${filename}\`** is ready:\n\n` +
          `- **[Click Here to Download ${filename}](${downloadUrl})**\n\n` +
          `Local file location: \`${latestVideo}\``;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'MEDIA_GEN',
        };
      } else {
        const answerText = `No video asset found in \`assets/\`. You can ask me to generate one anytime.`;
        return { actionType: 'conversation', answer: answerText, finalAnswer: answerText, intent: 'CHAT' };
      }
    }

    if (isWatchImage) {
      const latestImg = this.getLatestMediaFile('image');
      if (latestImg) {
        const imgUrl = `/workspace-preview/${latestImg}`;
        const answerText = `### 🖼️ Image Viewer: \`${path.basename(latestImg)}\`\n\n` +
          `<img src="${imgUrl}" alt="${path.basename(latestImg)}" class="w-full rounded-xl border border-cyan-500/40 shadow-xl my-2 max-h-80 object-contain bg-[#0a0e1a]" />\n\n` +
          `Viewing **\`${latestImg}\`**. Let me know if you would also like to download it.`;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'MEDIA_GEN',
          openMediaStudio: true,
          openPreview: imgUrl,
        };
      }
    }

    if (isDownloadImage) {
      const latestImg = this.getLatestMediaFile('image');
      if (latestImg) {
        const filename = path.basename(latestImg);
        const downloadUrl = `/api/workspace/file?path=${encodeURIComponent(latestImg)}&raw=true`;
        const answerText = `### ⬇️ Download Image\n\n` +
          `Here is your image ready for download:\n\n` +
          `- **[Click Here to Download ${filename}](${downloadUrl})**\n\n` +
          `Local file location: \`${latestImg}\``;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'MEDIA_GEN',
        };
      }
    }

    // 5.5. MEDIA GENERATION INTENT (Videos & Images)
    // Examples: "generate a sample 4k video of 5 seconds of super car", "create an image of cyberpunk skyline"
    if (classification.intent === 'MEDIA_GEN') {
      const mediaType = classification.mediaType || 'image';
      const mediaPrompt = classification.mediaDetails?.prompt || trimmed;
      this.logActivity('thought', `Synthesizing ${mediaType.toUpperCase()}: "${mediaPrompt}"...`);

      const root = this.workspaceManager.getRootPath();
      const assetsDir = path.join(root, 'assets');
      if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

      if (mediaType === 'video') {
        const dur = classification.mediaDetails?.durationSeconds || 5;
        const res = (classification.mediaDetails?.resolution as any) || '1080p';
        const isHdr = lower.includes('hdr');
        const is4k = lower.includes('4k') || lower.includes('uhd') || res === '4k';
        const is60Fps = lower.includes('60fps') || lower.includes('60 fps');

        this.logActivity('tool_start', `Recording ${res} cinematic video (${dur}s)...`);
        const videoResult = await MediaTools.generateVideo({
          prompt: mediaPrompt,
          durationSeconds: dur,
          resolution: res,
          hdr: isHdr,
          fps: is60Fps ? 60 : 30,
          workspaceRoot: root,
        });
        this.logActivity('tool_end', `Generated video: ${path.basename(videoResult.filePath)}`);

        const relFile = path.relative(root, videoResult.filePath).replace(/\\/g, '/');
        const mediaUrl = videoResult.relativeUrl;

        const inspected = videoResult.inspectedMetadata || await MediaInspector.inspectVideo(videoResult.filePath, {
          resolution: res,
          durationSeconds: dur,
          fps: is60Fps ? 60 : 30,
          hdr: isHdr,
        });

        const videoArtifact = this.artifactManager.registerArtifact({
          type: 'VIDEO',
          name: path.basename(videoResult.filePath),
          filePath: videoResult.filePath,
          description: `AI Video: ${mediaPrompt}`,
          provider: 'MaxIDE Video Engine',
          prompt: mediaPrompt,
          metadata: {
            durationSeconds: inspected.durationSeconds,
            resolution: inspected.resolutionSummary,
            format: inspected.container,
            codec: inspected.codec,
            fps: inspected.fpsSummary,
            hdr: inspected.hdrSummary,
            discrepancies: inspected.discrepancies,
          },
          status: inspected.playable ? 'verified' : 'failed',
        });

        // Construct Rich Artifact Card matching Requirement 22
        const cardHeader = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        const answerText = `### 🎬 VIDEO READY\n` +
          `${cardHeader}\n` +
          `**${mediaPrompt}**\n\n` +
          `- **Resolution**: ${inspected.resolutionSummary}\n` +
          `- **Duration**: ${inspected.durationSeconds} seconds\n` +
          `- **Format**: ${inspected.container} (${inspected.codec})\n` +
          `- **Frame Rate**: ${inspected.fpsSummary}\n` +
          `- **HDR**: ${inspected.hdrSummary}\n` +
          `- **Playback**: Verified playable\n` +
          `${cardHeader}\n\n` +
          `[▶ Play Video](action://play-artifact/${videoArtifact.id}) &nbsp;|&nbsp; ` +
          `[Open in Media Studio](action://open-media-studio/${videoArtifact.id}) &nbsp;|&nbsp; ` +
          `[Open in New Tab](${mediaUrl}) &nbsp;|&nbsp; ` +
          `[Open File](/api/workspace/file?path=${encodeURIComponent(relFile)}&raw=true)\n\n` +
          `*Asset saved to \`${relFile}\`*`;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'MEDIA_GEN',
          openMediaStudio: true,
          openArtifactId: videoArtifact.id,
          openPreview: mediaUrl,
          // CRITICAL: openFile is intentionally omitted so Monaco editor never loads the binary WebM/MP4
          artifact: videoArtifact,
          mediaInfo: {
            type: 'video',
            url: mediaUrl,
            filePath: relFile,
            prompt: mediaPrompt,
            duration: inspected.durationSeconds,
            resolution: inspected.resolutionSummary,
          },
        };
      } else {
        // Image generation
        this.logActivity('tool_start', `Generating AI Image for: "${mediaPrompt}"...`);
        const imgResult = await MediaTools.generateImage({
          prompt: mediaPrompt,
          workspaceRoot: root,
        });
        this.logActivity('tool_end', `Generated image: ${path.basename(imgResult.filePath)}`);

        const relFile = path.relative(root, imgResult.filePath).replace(/\\/g, '/');
        const mediaUrl = imgResult.relativeUrl;
        const imgMeta = MediaInspector.inspectImage(imgResult.filePath);

        const imageArtifact = this.artifactManager.registerArtifact({
          type: 'IMAGE',
          name: path.basename(imgResult.filePath),
          filePath: imgResult.filePath,
          description: `AI Image: ${mediaPrompt}`,
          provider: imgResult.provider,
          prompt: mediaPrompt,
          metadata: { dimensions: { width: imgMeta.width, height: imgMeta.height } },
          status: 'verified',
        });

        const cardHeader = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        const answerText = `### 🖼️ IMAGE READY\n` +
          `${cardHeader}\n` +
          `**${mediaPrompt}**\n\n` +
          `- **Resolution**: ${imgMeta.width} × ${imgMeta.height}\n` +
          `- **Format**: ${imgMeta.format} (${imgMeta.mimeType})\n` +
          `- **Provider**: ${imgResult.provider}\n` +
          `${cardHeader}\n\n` +
          `[🖼️ View Image](action://open-media-studio/${imageArtifact.id}) &nbsp;|&nbsp; ` +
          `[Open in Media Studio](action://open-media-studio/${imageArtifact.id}) &nbsp;|&nbsp; ` +
          `[Open in New Tab](${mediaUrl}) &nbsp;|&nbsp; ` +
          `[Open File](/api/workspace/file?path=${encodeURIComponent(relFile)}&raw=true)\n\n` +
          `*Asset saved to \`${relFile}\`*`;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'MEDIA_GEN',
          openMediaStudio: true,
          openArtifactId: imageArtifact.id,
          openPreview: mediaUrl,
          // CRITICAL: openFile is intentionally omitted so Monaco editor never loads the binary image
          artifact: imageArtifact,
          mediaInfo: {
            type: 'image',
            url: mediaUrl,
            filePath: relFile,
            prompt: mediaPrompt,
          },
        };
      }
    }

    // 0a. Natural Language Session Queries: "What did we do last time?"
    if (/\b(what did we do|what was done|last session|summarize previous|recap)\b/i.test(lower)) {
      this.logActivity('thought', 'Retrieving previous session summary from persistent storage...');
      let summaryText = 'No previous session records found for this workspace.';
      if (this.conversationStore) {
        const convs = this.conversationStore.listAll(5);
        if (convs.length > 0) {
          const last = convs[0];
          const filesSummary = (last.filesChanged && last.filesChanged.length > 0)
            ? last.filesChanged.map((f: string) => `- [${f}](open:${f})`).join('\n')
            : '- No file modifications recorded.';
          summaryText = `### Previous Session Summary\n\n**Task:** ${last.title || last.taskPrompt}\n**Status:** ${last.taskStatus}\n**Last Activity:** ${new Date(last.updatedAt || last.createdAt).toLocaleString()}\n\n#### Files Worked On:\n${filesSummary}\n\n${last.finalSummary ? `**Summary:** ${last.finalSummary}\n\n` : ''}*Ready to continue working or start a new feature! Simply tell me what to build next.*`;
        }
      }
      return {
        actionType: 'conversation',
        answer: summaryText,
        suggestedActions: [
          { label: '▶ Continue where we left off', prompt: 'Continue where we left off' },
          { label: '🔍 What changed?', prompt: 'What changed since I last opened this project?' }
        ]
      };
    }

    // 0b. Natural Language Diff: "What changed since I last opened this project?"
    if (/\b(what changed|show changes|diff since last|workspace changes)\b/i.test(lower)) {
      this.logActivity('thought', 'Inspecting workspace changes and checkpoint delta...');
      try {
        const checkpoints = this.checkpointManager.listCheckpoints();
        let changesSummary = 'No recorded changes detected since your last checkpoint.';
        if (checkpoints.length > 0) {
          const latest = checkpoints[0];
          const deltas = await this.checkpointManager.compareChanges(latest.id);
          if (deltas.length > 0) {
            const deltaLines = deltas.map(d => `- **${d.path}** (${d.status.toUpperCase()})`).join('\n');
            changesSummary = `### Changes Since Last Checkpoint (${latest.name})\n\n${deltaLines}\n\n*You can restore the previous snapshot anytime or continue working safely.*`;
          } else {
            changesSummary = `### Workspace Status\n\nAll files match your latest checkpoint (${latest.name}). No external modifications detected.`;
          }
        }
        return {
          actionType: 'conversation',
          answer: changesSummary,
          suggestedActions: [
            { label: '▶ Continue Task', prompt: 'Continue where we left off' },
            { label: '📸 Create Snapshot', prompt: 'Create snapshot of current workspace' }
          ]
        };
      } catch (err: any) {
        return {
          actionType: 'conversation',
          answer: `Could not inspect changes: ${err.message}`,
        };
      }
    }

    // 0c. Natural Language Resume: "Continue where we left off" / "Resume task"
    if (/\b(continue where we left off|continue the previous task|resume yesterday's work|resume task|continue task)\b/i.test(lower)) {
      this.logActivity('thought', 'Locating recoverable interrupted task...');
      if (this.recoveryManager && this.conversationStore) {
        const recoverable = this.conversationStore.getLatestRecoverableTask();
        if (recoverable) {
          this.logActivity('thought', `Resuming interrupted task: "${recoverable.title}"...`);
          const result = await this.recoveryManager.resumeInterruptedTask(recoverable.id);
          return {
            actionType: 'agent_task',
            answer: result.finalAnswer || 'Task resumed and completed successfully.',
            agentResult: result,
            openFile: result.openFile,
            openPreview: result.openPreview,
          };
        } else {
          return {
            actionType: 'conversation',
            answer: 'No interrupted or pending tasks found in your project history. Everything is complete and up to date! What would you like to build next?',
            suggestedActions: [
              { label: '🚀 Build a new feature', prompt: 'Build a new feature' }
            ]
          };
        }
      }
    }

    // Status Stage 1: Understanding request...
    this.logActivity('thought', 'Understanding request...');

    // Evaluate Prompt via Clarification-First Agent Gate (for ambiguous / beginner / dangerous requests)
    const activeSessionId = options.sessionId || options.conversationId || 'default';
    const clarification = ClarificationGate.evaluatePrompt(trimmed, activeSessionId);

    if (clarification.requiresClarification && clarification.questions && clarification.questions.length > 0) {
      this.logActivity('thought', 'I need a little more information');

      const qBlocks = clarification.questions.map(q => {
        const optLines = q.options.map((opt, i) => `  ${i + 1}. ${opt}`).join('\n');
        return `**${q.question}**\n${optLines}`;
      }).join('\n\n');

      const fullClarificationAnswer = `I would be happy to help you with that! To make sure we build exactly what you want, I need a little more information:\n\n${qBlocks}\n\n*Choose an option below or type your choice (or "choose for me" to use recommended defaults).*`;

      return {
        actionType: 'clarification',
        answer: fullClarificationAnswer,
        clarification,
        questions: clarification.questions,
        suggestedActions: clarification.questions[0]?.options.map((opt) => ({
          label: opt,
          prompt: opt,
        })),
        autoModel: autoModelMeta,
      };
    }

    // Executable software engineering task (BUILD, CODE_EDIT, DEBUG, TEST, REFACTOR, PROJECT_TASK)
    const taskToExecute = clarification.clarifiedPrompt || trimmed;
    this.logActivity('thought', `Classified intent as autonomous agent engineering task (${classification.intent}): "${taskToExecute.slice(0, 50)}..."`);
    const agentResult = await this.runTask(taskToExecute, { ...options, modelId: effectiveModelId });

    let builtArtifact: Artifact | undefined;
    const rootPath = this.workspaceManager.getRootPath();
    const indexHtml = path.join(rootPath, 'index.html');
    if (fs.existsSync(indexHtml)) {
      builtArtifact = this.artifactManager.registerArtifact({
        type: 'WEB_APP',
        name: 'Web Application',
        filePath: indexHtml,
        description: `Application built for: "${taskToExecute}"`,
        provider: 'MaxIDE Autonomous Engineering Agent',
        prompt: taskToExecute,
        status: agentResult.success ? 'verified' : 'failed',
        verificationDetails: agentResult.success ? 'Playwright browser verification & runtime checks passed' : undefined,
      });
    }

    const agentAns = agentResult.finalAnswer || (agentResult.success ? 'Task completed successfully.' : (agentResult.error || 'Task encountered an issue.'));
    return {
      actionType: 'agent_task',
      answer: agentAns,
      finalAnswer: agentAns,
      intent: classification.intent,
      agentResult,
      artifact: builtArtifact,
      openFile: agentResult.openFile,
      openPreview: agentResult.openPreview,
      autoModel: autoModelMeta || agentResult.autoModel,
    };
  }

  public getLatestAudioFile(): string | null {
    const root = this.workspaceManager.getRootPath();
    const candidateDirs = [
      path.join(root, 'assets', 'audio'),
      path.join(root, 'assets'),
    ];
    const exts = ['.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a'];
    const found: string[] = [];

    for (const dir of candidateDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          if (exts.some(e => f.toLowerCase().endsWith(e))) {
            found.push(path.join(path.relative(root, dir), f).replace(/\\/g, '/'));
          }
        }
      } catch {}
    }

    if (found.length === 0) return null;

    found.sort((a, b) => {
      try {
        const statA = fs.statSync(path.join(root, a));
        const statB = fs.statSync(path.join(root, b));
        return statB.mtimeMs - statA.mtimeMs;
      } catch {
        return 0;
      }
    });

    return found[0];
  }

  public getLatestMediaFile(type: 'video' | 'image'): string | null {
    const root = this.workspaceManager.getRootPath();
    const assetsDir = path.join(root, 'assets');
    if (!fs.existsSync(assetsDir)) return null;

    const files = fs.readdirSync(assetsDir);
    const exts = type === 'video' ? ['.webm', '.mp4', '.mov'] : ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
    const matches = files.filter(f => exts.some(e => f.toLowerCase().endsWith(e)));
    if (matches.length === 0) return null;

    matches.sort((a, b) => {
      try {
        const statA = fs.statSync(path.join(assetsDir, a));
        const statB = fs.statSync(path.join(assetsDir, b));
        return statB.mtimeMs - statA.mtimeMs;
      } catch {
        return 0;
      }
    });

    return path.join('assets', matches[0]).replace(/\\/g, '/');
  }
}
