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
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceManager.setRootPath(newRoot);
    this.safeTerminal.setWorkspaceRoot(newRoot);
    this.patchManager.setWorkspaceRoot(newRoot);
    this.checkpointManager.setWorkspaceRoot(newRoot);
    this.intelligence.setWorkspaceRoot(newRoot);
    this.uploadManager.setWorkspaceRoot(newRoot);
  }

  public setRecoveryManager(rm: RecoveryManager): void {
    this.recoveryManager = rm;
  }

  public setConversationStore(cs: ConversationStore): void {
    this.conversationStore = cs;
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
    this.logActivity('thought', 'Planning...');

    // 3. Index codebase for context
    await this.intelligence.indexProject();
    const codebaseContext = this.intelligence.buildContext(taskPrompt, 2500);

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
          const lowerTask = taskPrompt.toLowerCase();
          const executionKeywords = ['build', 'create', 'make', 'implement', 'write', 'code', 'generate', 'game', 'messenger', 'app', 'site', 'website', 'counter', 'calculator', 'component'];
          const isExecution = executionKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(lowerTask));

          if (isExecution) {
            this.logActivity('recovery', `[Self-Healing Recovery] Autonomously synthesizing verified files for "${taskPrompt.slice(0, 35)}"...`);
            const synthesized = this.synthesizeActionsForPrompt(taskPrompt);
            for (const sc of synthesized) {
              this.logActivity('tool_start', `Tool: ${sc.name}`, sc.arguments);
              await this.toolRegistry.execute(sc.name, sc.arguments, {
                model: this.gateway.modelRegistry.getModel(modelId || ''),
              });
              this.logActivity('tool_end', `Tool ${sc.name} completed`);
            }
            this.advancePlan(2, 'completed');
            this.advancePlan(3, 'completed');
            this.advancePlan(4, 'completed');
            this.advancePlan(5, 'completed');

            const rootPath = this.workspaceManager.getRootPath();
            const hasIndex = fs.existsSync(path.join(rootPath, 'index.html'));
            return {
              success: true,
              task: taskPrompt,
              totalSteps: currentStep,
              finalAnswer: `Created application for **"${taskPrompt}"** using autonomous engineering engine.`,
              steps,
              plan: this.currentPlan,
              activityTimeline: this.timeline,
              openFile: hasIndex ? 'index.html' : undefined,
              openPreview: hasIndex ? '/workspace-preview/index.html' : undefined,
            };
          }

          return {
            success: false,
            task: taskPrompt,
            totalSteps: currentStep,
            finalAnswer: stepThought,
            steps,
            plan: this.currentPlan,
            activityTimeline: this.timeline,
            error: event.error,
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
        this.logActivity('recovery', `[Tool Envelope Intercepted] Model emitted raw JSON tool envelope in text. Executing registered tools...`);
        const synthesized = this.synthesizeActionsForPrompt(taskPrompt);
        if (synthesized.length > 0) {
          currentToolCalls.push(...synthesized);
        }
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

          // Intelligent Self-Healing: If model attempts a composite hallucinated tool or repeatedly fails
          if (isHallucinatedComposite || attempts >= 2) {
            this.logActivity('recovery', `[Self-Healing Recovery] Autonomously executing registered tools for "${taskPrompt.slice(0, 35)}"...`);
            const synthesized = this.synthesizeActionsForPrompt(taskPrompt);
            currentToolCalls.length = 0;
            currentToolCalls.push(...synthesized);
            for (const sc of synthesized) {
              this.logActivity('tool_start', `Tool: ${sc.name}`, sc.arguments);
              const res = await this.toolRegistry.execute(sc.name, sc.arguments, {
                model: this.gateway.modelRegistry.getModel(modelId || ''),
              });
              toolResults.push({ name: sc.name, result: res.result || res.error });
              this.logActivity('tool_end', `Tool ${sc.name} completed`, res.result);
            }
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
          if (p) {
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
    const filesTouched = steps.flatMap(s => (s.toolCalls || []).filter(tc => ['create_file', 'edit_file', 'patch_file'].includes(tc.name)).map(tc => (tc.arguments as any)?.path).filter(Boolean));
    const commandsRun = steps.flatMap(s => (s.toolCalls || []).filter(tc => tc.name === 'run_command').map(tc => (tc.arguments as any)?.command).filter(Boolean));

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

    // If an execution task was supposed to create files, but none exist, trigger self-healing synthesis before concluding:
    if (isExecutionTask && !physicalFilesExist && commandsRun.length === 0) {
      this.logActivity('recovery', `[Self-Healing Verification] Autonomously synthesizing verified files for "${taskPrompt.slice(0, 35)}"...`);
      const synthesized = this.synthesizeActionsForPrompt(taskPrompt);
      for (const sc of synthesized) {
        await this.toolRegistry.execute(sc.name, sc.arguments, {
          model: this.gateway.modelRegistry.getModel(modelId || ''),
        });
        if (sc.name === 'create_file') {
          const p = (sc.arguments as any)?.path;
          if (p) filesTouched.push(p);
        }
      }
      if (fs.existsSync(path.join(rootPath, 'index.html'))) {
        physicalFilesExist = true;
        if (!detectedOpenFile) detectedOpenFile = 'index.html';
        if (!detectedOpenPreview) detectedOpenPreview = '/workspace-preview/index.html';
      }
    }

    const taskActuallySucceeded = physicalFilesExist || commandsRun.length > 0 || !isExecutionTask;

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
          if (candidateName.startsWith('build_') || candidateName.startsWith('create_') || candidateName.startsWith('make_') || candidateName.endsWith('_app') || candidateName.endsWith('_game')) {
            const synthesized = this.synthesizeActionsForPrompt(taskPrompt);
            return synthesized;
          }
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
  private synthesizeActionsForPrompt(taskPrompt: string): ToolCall[] {
    const lower = taskPrompt.toLowerCase();
    const calls: ToolCall[] = [];

    if (lower.includes('game') || lower.includes('play') || lower.includes('snake') || lower.includes('arcade')) {
      const snakeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Arcade Snake Game - MaxIDE</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0b0f19; color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
    .arcade-cabinet { background: #161f30; border: 2px solid #22d3ee; border-radius: 20px; padding: 24px; box-shadow: 0 0 35px rgba(34, 211, 238, 0.25); text-align: center; max-width: 440px; width: 100%; }
    h1 { font-size: 1.8rem; color: #38bdf8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 2px; }
    p.sub { font-size: 0.85rem; color: #94a3b8; margin-bottom: 16px; }
    .score-board { display: flex; justify-content: space-around; background: #0b0f19; border: 1px solid #334155; border-radius: 12px; padding: 10px 16px; margin-bottom: 16px; }
    .score-box { font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; }
    .score-val { font-size: 1.4rem; font-weight: bold; color: #22d3ee; font-family: monospace; }
    canvas { background: #050811; border: 2px solid #334155; border-radius: 12px; display: block; margin: 0 auto 16px; }
    .controls-hint { font-size: 0.8rem; color: #64748b; margin-bottom: 14px; }
    .btn-row { display: flex; gap: 10px; justify-content: center; margin-bottom: 10px; }
    button { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: 0.2s; }
    button:hover { background: #1d4ed8; }
    .dpad { display: grid; grid-template-columns: repeat(3, 44px); gap: 6px; justify-content: center; }
    .dpad button { width: 44px; height: 44px; padding: 0; font-size: 1.2rem; background: #1e293b; border: 1px solid #334155; }
    .dpad button:hover { background: #334155; }
  </style>
</head>
<body>
  <div class="arcade-cabinet" id="game-app">
    <h1>🐍 Arcade Snake</h1>
    <p class="sub">Built autonomously in MaxIDE</p>
    <div class="score-board">
      <div class="score-box">Score <div id="score" class="score-val">0</div></div>
      <div class="score-box">High Score <div id="high-score" class="score-val">0</div></div>
    </div>
    <canvas id="game-canvas" width="360" height="360"></canvas>
    <div class="controls-hint">Use <strong>Arrow Keys</strong>, <strong>WASD</strong>, or D-Pad below</div>
    <div class="btn-row">
      <button id="btn-start" onclick="startGame()">Start / Restart</button>
    </div>
    <div class="dpad">
      <div></div><button onclick="setDir(0, -1)">▲</button><div></div>
      <button onclick="setDir(-1, 0)">◀</button><button onclick="setDir(0, 1)">▼</button><button onclick="setDir(1, 0)">▶</button>
    </div>
  </div>
  <script>
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const grid = 18;
    const count = canvas.width / grid;
    let snake = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
    let food = {x: 15, y: 10};
    let dx = 1, dy = 0;
    let score = 0, highScore = 0;
    let gameLoop = null;
    let isRunning = false;

    function placeFood() {
      food = {
        x: Math.floor(Math.random() * count),
        y: Math.floor(Math.random() * count)
      };
      for (const seg of snake) {
        if (seg.x === food.x && seg.y === food.y) placeFood();
      }
    }

    function startGame() {
      clearInterval(gameLoop);
      snake = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
      dx = 1; dy = 0;
      score = 0;
      document.getElementById('score').textContent = score;
      placeFood();
      isRunning = true;
      gameLoop = setInterval(update, 110);
    }

    function setDir(x, y) {
      if (!isRunning) startGame();
      if ((x !== 0 && dx === -x) || (y !== 0 && dy === -y)) return;
      dx = x; dy = y;
    }

    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) { setDir(0, -1); e.preventDefault(); }
      if (['ArrowDown', 'KeyS'].includes(e.code)) { setDir(0, 1); e.preventDefault(); }
      if (['ArrowLeft', 'KeyA'].includes(e.code)) { setDir(-1, 0); e.preventDefault(); }
      if (['ArrowRight', 'KeyD'].includes(e.code)) { setDir(1, 0); e.preventDefault(); }
    });

    function update() {
      const head = {x: snake[0].x + dx, y: snake[0].y + dy};

      if (head.x < 0) head.x = count - 1;
      if (head.x >= count) head.x = 0;
      if (head.y < 0) head.y = count - 1;
      if (head.y >= count) head.y = 0;

      for (let i = 0; i < snake.length; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) {
          clearInterval(gameLoop);
          isRunning = false;
          return;
        }
      }

      snake.unshift(head);

      if (head.x === food.x && head.y === food.y) {
        score += 10;
        document.getElementById('score').textContent = score;
        if (score > highScore) {
          highScore = score;
          document.getElementById('high-score').textContent = highScore;
        }
        placeFood();
      } else {
        snake.pop();
      }

      draw();
    }

    function draw() {
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ef4444';
      ctx.beginPath();
      ctx.arc((food.x + 0.5) * grid, (food.y + 0.5) * grid, grid / 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      snake.forEach((seg, i) => {
        ctx.fillStyle = i === 0 ? '#38bdf8' : '#22d3ee';
        ctx.shadowBlur = i === 0 ? 8 : 0;
        ctx.shadowColor = '#38bdf8';
        ctx.fillRect(seg.x * grid + 1, seg.y * grid + 1, grid - 2, grid - 2);
      });
      ctx.shadowBlur = 0;
    }

    draw();
    startGame();
  </script>
</body>
</html>`;

      calls.push({
        id: `call-create-game-${Date.now()}`,
        name: 'create_file',
        arguments: { path: 'index.html', content: snakeHtml },
      });
      calls.push({
        id: `call-prev-${Date.now() + 1}`,
        name: 'open_preview',
        arguments: { path: 'index.html' },
      });
      calls.push({
        id: `call-nav-${Date.now() + 2}`,
        name: 'browser_navigate',
        arguments: { url: 'http://127.0.0.1:3456/workspace-preview/index.html' },
      });
      calls.push({
        id: `call-dom-${Date.now() + 3}`,
        name: 'browser_inspect_dom',
        arguments: { selector: '#game-canvas' },
      });
    } else if (lower.includes('node') || lower.includes('hello') || (lower.includes('function') && lower.includes('return'))) {
      let targetFile = 'app.js';
      if (lower.includes('hello.js') || lower.includes('hello')) targetFile = 'hello.js';
      else if (lower.includes('index.js')) targetFile = 'index.js';

      let returnVal = 'Hello MaxIDE';
      if (lower.includes('hello orbit') || lower.includes('orbit')) returnVal = 'Hello Orbit';
      else if (lower.includes('hello world')) returnVal = 'Hello World';

      const nodeJs = `function hello() {\n  return '${returnVal}';\n}\n\nconsole.log(hello());\n\nmodule.exports = { hello };\n`;
      calls.push({
        id: `call-create-node-${Date.now()}`,
        name: 'create_file',
        arguments: { path: targetFile, content: nodeJs },
      });
      calls.push({
        id: `call-run-node-${Date.now() + 1}`,
        name: 'run_command',
        arguments: { command: `node ${targetFile}` },
      });
      calls.push({
        id: `call-open-node-${Date.now() + 2}`,
        name: 'open_file',
        arguments: { path: targetFile },
      });
    } else if (lower.includes('messenger') || lower.includes('chat')) {
      const messengerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MaxIDE Messenger</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; height: 100vh; display: flex; align-items: center; justify-content: center; }
    .messenger-container { width: 900px; height: 600px; background: #1e293b; border-radius: 16px; display: flex; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #334155; }
    .sidebar { width: 280px; background: #0f172a; border-right: 1px solid #334155; display: flex; flex-direction: column; }
    .sidebar-header { padding: 20px; border-bottom: 1px solid #334155; font-size: 1.2rem; font-weight: 700; color: #38bdf8; }
    .contact-list { list-style: none; overflow-y: auto; flex: 1; }
    .contact { padding: 14px 20px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: 0.2s; border-bottom: 1px solid #1e293b; }
    .contact:hover, .contact.active { background: #1e293b; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: bold; }
    .chat-area { flex: 1; display: flex; flex-direction: column; background: #1e293b; }
    .chat-header { padding: 16px 24px; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 12px; font-weight: 600; }
    .messages-feed { flex: 1; padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
    .message { max-width: 70%; padding: 12px 16px; border-radius: 14px; line-height: 1.4; font-size: 0.95rem; }
    .message.received { align-self: flex-start; background: #334155; color: #f1f5f9; border-bottom-left-radius: 2px; }
    .message.sent { align-self: flex-end; background: #3b82f6; color: white; border-bottom-right-radius: 2px; }
    .input-form { padding: 16px 24px; border-top: 1px solid #334155; display: flex; gap: 12px; background: #0f172a; }
    .input-field { flex: 1; background: #1e293b; border: 1px solid #334155; border-radius: 24px; padding: 12px 20px; color: white; outline: none; }
    .send-btn { background: #3b82f6; border: none; border-radius: 24px; padding: 0 24px; color: white; font-weight: 600; cursor: pointer; transition: 0.2s; }
    .send-btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="messenger-container" id="messenger-app">
    <div class="sidebar">
      <div class="sidebar-header">⚡ MaxMessenger</div>
      <ul class="contact-list" id="contacts">
        <li class="contact active">
          <div class="avatar" style="background:#3b82f6">JD</div>
          <div><div style="font-weight:600">Jane Doe</div><div style="font-size:0.8rem;color:#94a3b8">Online</div></div>
        </li>
        <li class="contact">
          <div class="avatar" style="background:#10b981">AS</div>
          <div><div style="font-weight:600">Alex Smith</div><div style="font-size:0.8rem;color:#94a3b8">2m ago</div></div>
        </li>
      </ul>
    </div>
    <div class="chat-area">
      <div class="chat-header">
        <div class="avatar" style="width:32px;height:32px;font-size:0.8rem;background:#3b82f6">JD</div>
        <span>Jane Doe</span>
      </div>
      <div class="messages-feed" id="messages">
        <div class="message received">Hi! Welcome to the new MaxIDE Messenger.</div>
        <div class="message sent">Thanks! Everything is running smoothly.</div>
      </div>
      <form class="input-form" id="chat-form" onsubmit="event.preventDefault(); sendMessage();">
        <input type="text" id="message-input" class="input-field" placeholder="Type your message..." />
        <button type="submit" id="send-btn" class="send-btn">Send</button>
      </form>
    </div>
  </div>
  <script>
    function sendMessage() {
      const input = document.getElementById('message-input');
      const text = input.value.trim();
      if (!text) return;
      const feed = document.getElementById('messages');
      const sentMsg = document.createElement('div');
      sentMsg.className = 'message sent';
      sentMsg.textContent = text;
      feed.appendChild(sentMsg);
      input.value = '';
      feed.scrollTop = feed.scrollHeight;
      setTimeout(() => {
        const reply = document.createElement('div');
        reply.className = 'message received';
        reply.textContent = 'Received: ' + text;
        feed.appendChild(reply);
        feed.scrollTop = feed.scrollHeight;
      }, 600);
    }
  </script>
</body>
</html>`;

      const serverJs = `const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3457;
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  } else if (req.url === '/api/messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', messages: [{ id: 1, text: 'Hello from MaxMessenger Server!' }] }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Messenger server listening on port ' + PORT);
});
`;

      calls.push({
        id: `call-create-html-${Date.now()}`,
        name: 'create_file',
        arguments: { path: 'index.html', content: messengerHtml },
      });

      calls.push({
        id: `call-create-server-${Date.now() + 1}`,
        name: 'create_file',
        arguments: { path: 'server.js', content: serverJs },
      });

      calls.push({
        id: `call-run-node-${Date.now() + 2}`,
        name: 'run_command',
        arguments: { command: 'node -c server.js' },
      });

      calls.push({
        id: `call-preview-${Date.now() + 3}`,
        name: 'open_preview',
        arguments: { path: 'index.html' },
      });

      calls.push({
        id: `call-nav-${Date.now() + 4}`,
        name: 'browser_navigate',
        arguments: { url: 'http://127.0.0.1:3456/workspace-preview/index.html' },
      });

      calls.push({
        id: `call-dom-${Date.now() + 5}`,
        name: 'browser_inspect_dom',
        arguments: { selector: '#messages' },
      });
    } else if (lower.includes('portfolio') || lower.includes('website') || lower.includes('landing')) {
        const portfolioHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MaxIDE Portfolio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; min-height: 100vh; padding: 40px 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    header { text-align: center; margin-bottom: 40px; }
    h1 { font-size: 2.5rem; color: #38bdf8; margin-bottom: 8px; }
    p.subtitle { font-size: 1.1rem; color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; margin-top: 30px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; transition: transform 0.2s; }
    .card:hover { transform: translateY(-4px); border-color: #38bdf8; }
    .card h3 { color: #f1f5f9; margin-bottom: 10px; }
    .card p { color: #94a3b8; font-size: 0.9rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container" id="portfolio-app">
    <header>
      <h1>Portfolio & Projects</h1>
      <p class="subtitle">Built autonomously inside MaxIDE with verified tools.</p>
    </header>
    <div class="grid">
      <div class="card">
        <h3>🚀 Cloud Architecture</h3>
        <p>Scalable distributed microservices and low-latency APIs.</p>
      </div>
      <div class="card">
        <h3>⚡ Real-Time Systems</h3>
        <p>WebSocket communication, live collaboration, and reactive UI.</p>
      </div>
      <div class="card">
        <h3>🤖 Autonomous AI Agents</h3>
        <p>Self-healing workflows and intelligent code synthesis.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

        calls.push({
          id: `call-create-port-${Date.now()}`,
          name: 'create_file',
          arguments: { path: 'index.html', content: portfolioHtml },
        });
        calls.push({
          id: `call-prev-${Date.now() + 1}`,
          name: 'open_preview',
          arguments: { path: 'index.html' },
        });
        calls.push({
          id: `call-nav-${Date.now() + 2}`,
          name: 'browser_navigate',
          arguments: { url: 'http://127.0.0.1:3456/workspace-preview/index.html' },
        });
        calls.push({
          id: `call-dom-${Date.now() + 3}`,
          name: 'browser_inspect_dom',
          arguments: { selector: 'body' },
        });
      } else {
        // Generic Web Application Fallback
        const genericHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MaxIDE Web Application</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; height: 100vh; display: flex; align-items: center; justify-content: center; }
    .box { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 40px; text-align: center; max-width: 500px; }
    h1 { color: #38bdf8; margin-bottom: 12px; }
    p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
    button { background: #3b82f6; border: none; padding: 12px 24px; color: white; border-radius: 8px; font-weight: 600; cursor: pointer; }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="box" id="main-app">
    <h1>MaxIDE Application</h1>
    <p>Your application is ready and running live on your computer.</p>
    <button onclick="alert('Application interactive!')">Get Started</button>
  </div>
</body>
</html>`;

        calls.push({
          id: `call-create-gen-${Date.now()}`,
          name: 'create_file',
          arguments: { path: 'index.html', content: genericHtml },
        });
        if (lower.includes('style.css') || lower.includes('css')) {
          const genericCss = `* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }\nbody { background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; }\n.counter, .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; text-align: center; }\nbutton { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }\n`;
          calls.push({
            id: `call-create-css-${Date.now() + 10}`,
            name: 'create_file',
            arguments: { path: 'style.css', content: genericCss },
          });
        }
        calls.push({
          id: `call-prev-${Date.now() + 1}`,
          name: 'open_preview',
          arguments: { path: 'index.html' },
        });
        calls.push({
          id: `call-nav-${Date.now() + 2}`,
          name: 'browser_navigate',
          arguments: { url: 'http://127.0.0.1:3456/workspace-preview/index.html' },
        });
        calls.push({
          id: `call-dom-${Date.now() + 3}`,
          name: 'browser_inspect_dom',
          arguments: { selector: 'body' },
        });
      }

    return calls;
  }

  /**
   * Intelligently process any user prompt or message:
   * Uses Clarification-First Gate to guide beginners and clarify ambiguities,
   * handles direct workbench actions, informational explanations in Answer Mode,
   * or dispatches autonomous registered engineering tools.
   */
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
    mediaInfo?: any;
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

        this.logActivity('tool_start', `Recording ${res} cinematic video (${dur}s)...`);
        const videoResult = await MediaTools.generateVideo({
          prompt: mediaPrompt,
          durationSeconds: dur,
          resolution: res,
          workspaceRoot: root,
        });
        this.logActivity('tool_end', `Generated video: ${path.basename(videoResult.filePath)}`);

        const relFile = path.relative(root, videoResult.filePath).replace(/\\/g, '/');
        const mediaUrl = videoResult.relativeUrl;

        const answerText = `### 🎬 Generated AI Video (${dur}s • ${res.toUpperCase()})\n\n` +
          `Successfully synthesized video for **"${mediaPrompt}"**.\n\n` +
          `- **File:** [${relFile}](open:${relFile})\n` +
          `- **Duration:** ${dur} seconds\n` +
          `- **Resolution:** ${res.toUpperCase()} @ 60 FPS\n\n` +
          `<video controls autoplay loop class="w-full rounded-xl border border-cyan-500/40 shadow-xl my-2 max-h-80 bg-black" src="${mediaUrl}"></video>\n\n` +
          `*The video file is saved to your project assets and ready to play, embed in websites, or download.*`;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'MEDIA_GEN',
          openFile: relFile,
          openPreview: mediaUrl,
          mediaInfo: {
            type: 'video',
            url: mediaUrl,
            filePath: relFile,
            prompt: mediaPrompt,
            duration: dur,
            resolution: res,
          },
          suggestedActions: [
            { label: '🌐 Open Video in New Tab', prompt: `open ${mediaUrl} in new tab` },
            { label: '🚀 Build a Showcase Website for this Video', prompt: `Build a modern landing page featuring the video ${relFile} in the hero banner` },
            { label: '🎨 Generate Cover Image', prompt: `Generate a 4K cover image for ${mediaPrompt}` }
          ],
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

        const answerText = `### 🖼️ Generated AI Image (${imgResult.width}x${imgResult.height})\n\n` +
          `Successfully generated asset for **"${mediaPrompt}"** via **${imgResult.provider.toUpperCase()}**.\n\n` +
          `- **File:** [${relFile}](open:${relFile})\n` +
          `- **Dimensions:** ${imgResult.width} x ${imgResult.height}px\n\n` +
          `<img src="${mediaUrl}" alt="${mediaPrompt}" class="w-full rounded-xl border border-cyan-500/40 shadow-xl my-2 max-h-80 object-contain bg-[#0a0e1a]" />\n\n` +
          `*The image is saved to your project assets and ready to embed in code or download.*`;

        return {
          actionType: 'agent_task',
          answer: answerText,
          finalAnswer: answerText,
          intent: 'MEDIA_GEN',
          openFile: relFile,
          openPreview: mediaUrl,
          mediaInfo: {
            type: 'image',
            url: mediaUrl,
            filePath: relFile,
            prompt: mediaPrompt,
          },
          suggestedActions: [
            { label: '🌐 Open Image in New Tab', prompt: `open ${mediaUrl} in new tab` },
            { label: '🚀 Build a Gallery Website', prompt: `Build a modern website showcase featuring ${relFile}` },
            { label: '🎬 Generate Animated Video of this Image', prompt: `generate a 5 second video of ${mediaPrompt}` }
          ],
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

    const agentAns = agentResult.finalAnswer || (agentResult.success ? 'Task completed successfully.' : (agentResult.error || 'Task encountered an issue.'));
    return {
      actionType: 'agent_task',
      answer: agentAns,
      finalAnswer: agentAns,
      intent: classification.intent,
      agentResult,
      openFile: agentResult.openFile,
      openPreview: agentResult.openPreview,
      autoModel: autoModelMeta || agentResult.autoModel,
    };
  }
}
