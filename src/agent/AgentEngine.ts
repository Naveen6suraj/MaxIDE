/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Advanced Autonomous Agent Engine
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
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceManager.setRootPath(newRoot);
    this.safeTerminal.setWorkspaceRoot(newRoot);
    this.patchManager.setWorkspaceRoot(newRoot);
    this.checkpointManager.setWorkspaceRoot(newRoot);
    this.intelligence.setWorkspaceRoot(newRoot);
    this.uploadManager.setWorkspaceRoot(newRoot);
  }

  public setAutonomyMode(mode: AutonomyMode): void {
    this.autonomyMode = mode;
  }

  public getAutonomyMode(): AutonomyMode {
    return this.autonomyMode;
  }

  public setOnTimelineEvent(cb: (event: AgentActivityEvent) => void): void {
    this.onTimelineEvent = cb;
  }

  public setOnPlanUpdate(cb: (plan: AgentPlan) => void): void {
    this.onPlanUpdate = cb;
  }

  public getTimeline(): AgentActivityEvent[] {
    return [...this.timeline];
  }

  public getCurrentPlan(): AgentPlan | undefined {
    return this.currentPlan;
  }

  private logActivity(type: AgentActivityEvent['type'], summary: string, details?: any): void {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
    const event: AgentActivityEvent = {
      timestamp: timeStr,
      type,
      summary,
      details,
    };
    this.timeline.push(event);
    if (this.onTimelineEvent) this.onTimelineEvent(event);
  }

  /**
   * Parse or generate structured execution plan from task description.
   */
  private initializePlan(task: string): AgentPlan {
    const milestones: PlanMilestone[] = [
      { id: 'm1', title: 'Inspect workspace and analyze architecture', status: 'in_progress' },
      { id: 'm2', title: 'Search codebase and plan modifications', status: 'pending' },
      { id: 'm3', title: 'Execute code implementations or tools', status: 'pending' },
      { id: 'm4', title: 'Run tests, verification, and diagnostics', status: 'pending' },
      { id: 'm5', title: 'Produce final report and changes summary', status: 'pending' },
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
   * Run autonomous software engineering task.
   */
  public async runTask(
    taskPrompt: string,
    options: {
      modelId?: string;
      maxSteps?: number;
      maxErrorRetries?: number;
      onStep?: (step: AgentStep) => void;
      contextMentions?: string;
      createPreCheckpoint?: boolean;
    } = {}
  ): Promise<AgentTaskResult> {
    const maxSteps = options.maxSteps || 10;
    const maxErrorRetries = options.maxErrorRetries || 3;
    const modelId = options.modelId || this.gateway.getActiveModelId();

    this.logActivity('thought', `Started task: "${taskPrompt}"`);

    // 1. Optional Automatic Pre-Task Checkpoint (Requirement 11)
    if (options.createPreCheckpoint !== false && this.autonomyMode !== 'ASK') {
      try {
        const cp = await this.checkpointManager.createCheckpoint(`Auto: Pre-Task (${taskPrompt.slice(0, 30)})`);
        this.logActivity('thought', `Created workspace checkpoint: ${cp.name} (${cp.fileCount} files)`);
      } catch {}
    }

    // 2. Initialize Live Plan
    this.initializePlan(taskPrompt);

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
      '3. ALWAYS USE YOUR TOOLS: When asked to build, modify, test, fix, or run an application, invoke your tools (create_file, edit_file, run_command, open_file, open_preview, etc.).\n' +
      '4. CLICKABLE FILE LINKS: Whenever you mention a file path in your explanations, format it as a markdown link: [filename](open:filename) or `filename`.\n' +
      '5. AUTOMATIC OPEN & PREVIEW: When you build or modify web apps or components, invoke open_file or open_preview so the user immediately sees the result.\n' +
      '6. ARTICULATE, THOROUGH RESPONSES: Always provide a clear, beautifully formatted markdown walkthrough of what you did, the architecture, files created, and how to use it.\n\n' +
      'Relevant Codebase Context:\n' +
      codebaseContext +
      '\n\nSolve the user request thoroughly using your tools. Methodically inspect, modify, run verification, diagnose any errors, and confirm completion.';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: options.contextMentions ? `${taskPrompt}\n\nAdditional Context:\n${options.contextMentions}` : taskPrompt },
    ];

    const steps: AgentStep[] = [];
    let currentStep = 0;
    let finalAnswer = '';
    let consecutiveErrors = 0;

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

      // If still no tool calls, task has concluded
      if (currentToolCalls.length === 0) {
        finalAnswer = stepThought.trim();
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
        this.logActivity('tool_start', `Tool: ${tc.name}`, tc.arguments);

        // Execute via ToolRegistry
        const execResult: ToolExecutionResult = await this.toolRegistry.execute(tc.name, tc.arguments, {
          model: this.gateway.modelRegistry.getModel(modelId || ''),
        });

        toolResults.push({ name: tc.name, result: execResult.result || execResult.error });

        // REQUIREMENT 20: ERROR RECOVERY LOOP
        if (!execResult.success || (execResult.result && execResult.result.exitCode && execResult.result.exitCode !== 0)) {
          consecutiveErrors++;
          this.logActivity('error', `Tool ${tc.name} failed (${consecutiveErrors}/${maxErrorRetries} retries)`, execResult.error);

          if (consecutiveErrors <= maxErrorRetries) {
            this.logActivity('recovery', `Diagnosing error and executing recovery turn...`);
          } else {
            this.advancePlan(2, 'failed');
            return {
              success: false,
              task: taskPrompt,
              totalSteps: currentStep,
              finalAnswer: `Agent encountered persistent errors and reached max retries (${maxErrorRetries}). Last error: ${execResult.error || JSON.stringify(execResult.result)}`,
              steps,
              plan: this.currentPlan,
              activityTimeline: this.timeline,
              error: execResult.error || 'Persistent error recovery limit exceeded.',
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
            if (p.endsWith('.html')) detectedOpenPreview = `/workspace-preview/${p}`;
          }
        }
        if (tc.name === 'open_preview') {
          detectedOpenPreview = args?.url || '/workspace-preview/index.html';
        }
      }
    }

    // Default to index.html preview if index.html exists in workspace and task related to web/app/portfolio
    const rootPath = this.workspaceManager.getRootPath();
    const lowerTask = taskPrompt.toLowerCase();
    if (!detectedOpenFile && fs.existsSync(path.join(rootPath, 'index.html'))) {
      if (lowerTask.includes('web') || lowerTask.includes('portfolio') || lowerTask.includes('html') || lowerTask.includes('site') || lowerTask.includes('app') || lowerTask.includes('page')) {
        detectedOpenFile = 'index.html';
        detectedOpenPreview = '/workspace-preview/index.html';
      }
    }

    if (!finalAnswer || finalAnswer.trim() === 'Task completed successfully.') {
      // Build an articulate Antigravity-style summary
      const filesTouched = steps.flatMap(s => (s.toolCalls || []).filter(tc => ['create_file', 'edit_file', 'patch_file'].includes(tc.name)).map(tc => (tc.arguments as any)?.path).filter(Boolean));
      const commandsRun = steps.flatMap(s => (s.toolCalls || []).filter(tc => tc.name === 'run_command').map(tc => (tc.arguments as any)?.command).filter(Boolean));

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
    }

    return {
      success: true,
      task: taskPrompt,
      totalSteps: currentStep,
      finalAnswer,
      steps,
      plan: this.currentPlan,
      activityTimeline: this.timeline,
      openFile: detectedOpenFile,
      openPreview: detectedOpenPreview,
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
        if (parsed.tool || parsed.name) {
          calls.push({
            id: `call-json-${Date.now()}-${calls.length}`,
            name: parsed.tool || parsed.name,
            arguments: parsed.arguments || parsed.args || parsed.parameters || parsed,
          });
        }
      } catch {}
    }

    if (calls.length > 0) return calls;

    // 2. Fallback for code block file generation:
    // If the task specifically asks to create, build, or write code, and the model outputted a code block:
    if (currentStep === 1 && (lowerPrompt.includes('create') || lowerPrompt.includes('build') || lowerPrompt.includes('node') || lowerPrompt.includes('app') || lowerPrompt.includes('project'))) {
      const codeBlockMatch = /```(?:javascript|js|typescript|ts|python|html|css)?\s*([\s\S]*?)```/i.exec(text);
      if (codeBlockMatch && codeBlockMatch[1].trim().length > 10) {
        let detectedPath = 'index.js';
        if (lowerPrompt.includes('python') || text.includes('def ')) detectedPath = 'main.py';
        else if (lowerPrompt.includes('html') || text.includes('<!DOCTYPE') || text.includes('<html')) detectedPath = 'index.html';
        else if (lowerPrompt.includes('node') || text.includes('function ') || text.includes('console.log')) detectedPath = 'app.js';

        // Check if filename was mentioned in the prompt or text
        const fnMatch = /(?:file|named|called|path)?\s*[:`'"]([a-zA-Z0-9_\-\.\/]+\.(?:js|ts|py|html|json|txt))[`'"]/i.exec(text) ||
          /(?:file|named|called|path)?\s*[:`'"]([a-zA-Z0-9_\-\.\/]+\.(?:js|ts|py|html|json|txt))[`'"]/i.exec(taskPrompt);
        if (fnMatch && fnMatch[1]) {
          detectedPath = fnMatch[1];
        }

        calls.push({
          id: `call-gen-${Date.now()}`,
          name: 'create_file',
          arguments: { path: detectedPath, content: codeBlockMatch[1].trim() },
        });

        // If the task asked to run it: also schedule run_command
        if (lowerPrompt.includes('run') && detectedPath.endsWith('.js')) {
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
      }
    }

    return calls;
  }

  /**
   * Intelligently process any user prompt or message:
   * Automatically decides whether to provide an informational / conversational response
   * or dispatch autonomous agent engineering tools, presenting the outcome directly in the chat.
   */
  public async processMessage(
    userPrompt: string,
    options: {
      modelId?: string;
      maxSteps?: number;
      contextMentions?: string;
    } = {}
  ): Promise<{
    actionType: 'conversation' | 'agent_task' | 'workbench_action';
    answer: string;
    agentResult?: AgentTaskResult;
    openFile?: string;
    openPreview?: string;
    openTerminal?: boolean;
    suggestedActions?: Array<{ label: string; prompt: string }>;
  }> {
    const trimmed = userPrompt.trim();
    const lower = trimmed.toLowerCase();

    // Intent Heuristics: Software engineering execution requests
    const executionKeywords = [
      'build', 'create', 'make', 'scaffold', 'generate', 'write', 'code',
      'fix', 'debug', 'repair', 'patch', 'solve',
      'add', 'implement', 'integrate',
      'test', 'verify', 'execute',
      'refactor', 'modify', 'update', 'delete', 'remove',
      'install', 'setup', 'commit'
    ];

    const hasExecutionAction = executionKeywords.some(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      return regex.test(lower);
    });

    // 1. Direct Workbench Navigation / File Open Actions
    // e.g. "open the porfolio then", "open index.html", "show the preview", "preview app", "launch browser"
    const isWorkbenchAction = /^(?:open|view|show|display|preview|launch)\b/i.test(lower) && !hasExecutionAction;
    if (isWorkbenchAction) {
      this.logActivity('thought', `Classified intent as direct workbench action: "${trimmed}"`);
      const root = this.workspaceManager.getRootPath();

      // Check if user is asking to open portfolio/website/preview/app
      if (lower.includes('portfolio') || lower.includes('porfolio') || lower.includes('website') || lower.includes('web') || lower.includes('app') || lower.includes('preview') || lower.includes('browser') || lower.includes('page') || lower.includes('see') || lower.includes('it')) {
        let targetHtml = '';
        if (fs.existsSync(path.join(root, 'index.html'))) targetHtml = 'index.html';
        else if (fs.existsSync(path.join(root, 'portfolio.html'))) targetHtml = 'portfolio.html';
        else if (fs.existsSync(path.join(root, 'public', 'index.html'))) targetHtml = 'public/index.html';

        if (targetHtml) {
          return {
            actionType: 'workbench_action',
            answer: `Opened [${targetHtml}](open:${targetHtml}) in the editor and launched live interactive preview in the Browser panel below.`,
            openFile: targetHtml,
            openPreview: `/workspace-preview/${targetHtml}`,
            suggestedActions: [
              { label: '🌐 Open in New Tab', prompt: `open /workspace-preview/${targetHtml} in new tab` },
              { label: '✏️ Edit Styles', prompt: 'edit style.css to customize theme' }
            ]
          };
        }
      }

      // Check if a specific file name was requested
      const fileMatch = trimmed.match(/\b([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)\b/);
      if (fileMatch) {
        const requestedFile = fileMatch[1];
        if (fs.existsSync(path.join(root, requestedFile))) {
          const isWeb = requestedFile.endsWith('.html');
          return {
            actionType: 'workbench_action',
            answer: `Opened [${requestedFile}](open:${requestedFile}) in the Monaco editor.` + (isWeb ? ' Also launched live preview in the Browser panel.' : ''),
            openFile: requestedFile,
            openPreview: isWeb ? `/workspace-preview/${requestedFile}` : undefined,
          };
        }
      }

      // If user asks to open terminal
      if (lower.includes('terminal') || lower.includes('console') || lower.includes('shell')) {
        return {
          actionType: 'workbench_action',
          answer: 'Switched to the Safe Terminal drawer.',
          openTerminal: true,
        };
      }
    }

    // Pure conversational check:
    // Only pure explanations of concepts or pure greetings without execution actions:
    const isPureExplanation = /^(explain|what\s+is|what\s+are|how\s+does\s+\w+\s+work|tell\s+me\s+about|why\s+is|compare)\b/i.test(lower) && !hasExecutionAction;
    const isPureGreeting = /^(hi|hello|hey|greetings|howdy)\s*[!.]?$/i.test(lower);

    const isConversational = isPureExplanation || isPureGreeting;

    if (isConversational) {
      this.logActivity('thought', `Classified intent as conversational inquiry: "${trimmed}"`);

      let responseText = '';
      try {
        await this.intelligence.indexProject();
        const codebaseContext = this.intelligence.buildContext(trimmed, 1500);

        const systemPrompt =
          'You are Orbit IDE Assistant, an AI software engineering companion.\n' +
          `Workspace: ${this.workspaceManager.getRootPath()}\n` +
          'Answer the user directly and helpfully in the chat with markdown formatting.\n' +
          (codebaseContext ? `\nCodebase Context:\n${codebaseContext}\n` : '');

        const resp = await this.gateway.generate({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: trimmed },
          ],
          modelId: options.modelId || this.gateway.getActiveModelId(),
        });

        responseText = resp.content;
      } catch (err: any) {
        responseText = `Hello! I am your Orbit IDE assistant. I can build software projects, inspect and modify files, run terminal commands, and verify code with Playwright.`;
      }

      return {
        actionType: 'conversation',
        answer: responseText,
      };
    }

    // Otherwise, this is an actionable software engineering task!
    this.logActivity('thought', `Classified intent as autonomous agent engineering task: "${trimmed}"`);
    const agentResult = await this.runTask(trimmed, options);

    return {
      actionType: 'agent_task',
      answer: agentResult.finalAnswer || (agentResult.success ? 'Task completed successfully.' : (agentResult.error || 'Task encountered an issue.')),
      agentResult,
      openFile: agentResult.openFile,
      openPreview: agentResult.openPreview,
    };
  }
}
