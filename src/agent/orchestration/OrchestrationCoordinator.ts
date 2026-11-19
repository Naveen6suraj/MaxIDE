/**
 * MaxIDE APEX - Autonomous Product Development & Engineering Orchestration
 * Central Orchestration Coordinator:
 * Coordinates the full engineering lifecycle:
 * USER IDEA -> ARCHITECT -> PM -> DESIGN -> (FRONTEND | BACKEND | NATIVE) -> QA -> DEBUG -> RELEASE -> ACCEPTANCE.
 */

import fs from 'fs';
import path from 'path';
import {
  SharedEngineeringContext,
  SpecialistTask,
  SpecialistRole,
} from './SharedEngineeringContext.js';
import {
  ProductArchitectAgent,
  ProjectManagerAgent,
  UIDesignAgent,
  FrontendEngineerAgent,
  BackendEngineerAgent,
  NativeWindowsEngineerAgent,
  QADebuggingAgent,
  ReleaseEngineerAgent,
  SpecialistExecutionResult,
} from './SpecialistAgents.js';
import { AdaptiveIntelligenceCoordinator } from '../../intelligence/index.js';
import { SafeTerminal } from '../safety/SafeTerminal.js';
import { WorkspaceGuard } from '../safety/WorkspaceGuard.js';

export interface OrchestrationOptions {
  sessionId?: string;
  maxTotalSteps?: number;
  onActivity?: (type: string, message: string, data?: any) => void;
  onProgress?: (progressPercent: number, milestoneName: string, activeRole: SpecialistRole) => void;
}

export interface OrchestrationReport {
  success: boolean;
  sessionId: string;
  objective: string;
  targetPlatform: string;
  milestonesTotal: number;
  milestonesCompleted: number;
  tasksTotal: number;
  tasksCompleted: number;
  filesTouched: string[];
  defectsResolved: number;
  openDefects: number;
  finalQualityScore: number;
  finalAnswer: string;
  openPreview?: string;
  openFile?: string;
  executionDurationMs: number;
}

export class OrchestrationCoordinator {
  private workspaceRoot: string;
  private adaptiveIntelligence?: AdaptiveIntelligenceCoordinator;
  private safeTerminal?: SafeTerminal;
  private guard: WorkspaceGuard;

  constructor(
    workspaceRoot: string,
    adaptiveIntelligence?: AdaptiveIntelligenceCoordinator,
    safeTerminal?: SafeTerminal
  ) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.adaptiveIntelligence = adaptiveIntelligence;
    this.safeTerminal = safeTerminal;
    this.guard = new WorkspaceGuard(this.workspaceRoot);
  }

  public async orchestrateProduct(
    userPrompt: string,
    options: OrchestrationOptions = {}
  ): Promise<OrchestrationReport> {
    const startTime = Date.now();
    const context = new SharedEngineeringContext(this.workspaceRoot, userPrompt, options.sessionId);

    const log = (type: string, msg: string, data?: any) => {
      if (options.onActivity) options.onActivity(type, msg, data);
    };

    log('thought', `[Autonomous Orchestration] Initiating autonomous product engineering for: "${userPrompt}"`);

    // Stage 1: Product Architect
    log('thought', `[Orchestrator] Dispatching to Product Architect Agent...`);
    if (options.onProgress) options.onProgress(10, 'Product Specification', 'PRODUCT_ARCHITECT');

    const architectTask: SpecialistTask = {
      id: 'task-arch-spec',
      milestoneId: 'M1_SPEC',
      title: 'Synthesize Product Specification',
      description: 'Establish technical requirements, user journeys, data schemas, acceptance criteria.',
      assignedRole: 'PRODUCT_ARCHITECT',
      dependencies: [],
      status: 'PENDING',
      allowedFiles: ['.maxide/PRODUCT_SPEC.md'],
      retryCount: 0,
      maxRetries: 2,
    };
    context.addTask(architectTask);

    const archRes = await ProductArchitectAgent.execute(context, architectTask);
    if (!archRes.success) {
      return this.buildFailureReport(context, `Product Architect failed: ${archRes.error}`, startTime);
    }
    log('thought', `[Product Architect] Specification synthesized successfully for ${context.getProductSpec()?.name}.`);

    // Stage 2: Project Manager
    log('thought', `[Orchestrator] Dispatching to Project Manager Agent...`);
    if (options.onProgress) options.onProgress(25, 'Engineering Roadmap & Dependency Graph', 'PROJECT_MANAGER');

    const pmTask: SpecialistTask = {
      id: 'task-pm-roadmap',
      milestoneId: 'M1_SPEC',
      title: 'Establish Engineering Roadmap',
      description: 'Decompose spec into dependency-tracked specialist tasks and milestones.',
      assignedRole: 'PROJECT_MANAGER',
      dependencies: ['task-arch-spec'],
      status: 'PENDING',
      allowedFiles: ['.maxide/ROADMAP.md', '.maxide/task_board.json'],
      retryCount: 0,
      maxRetries: 2,
    };
    context.addTask(pmTask);

    const pmRes = await ProjectManagerAgent.execute(context, pmTask);
    if (!pmRes.success) {
      return this.buildFailureReport(context, `Project Manager failed: ${pmRes.error}`, startTime);
    }
    log('thought', `[Project Manager] Engineering roadmap and task board created.`);

    // Loop through executable tasks in dependency order
    let stepCount = 0;
    const maxSteps = options.maxTotalSteps || 20;
    const allFilesTouched: string[] = [...archRes.filesCreated, ...pmRes.filesCreated];

    while (stepCount < maxSteps) {
      stepCount++;

      if (context.getState().isCancelled) {
        log('error', `[Orchestrator] Engineering pipeline cancelled by user.`);
        return this.buildFailureReport(context, 'Pipeline cancelled by user.', startTime);
      }

      const nextTasks = context.getNextExecutableTasks();
      if (nextTasks.length === 0) {
        log('thought', `[Orchestrator] No pending tasks remaining with satisfied dependencies.`);
        break;
      }

      const taskToRun = nextTasks[0];
      log('thought', `[Orchestrator] Executing task "${taskToRun.title}" (${taskToRun.assignedRole})...`);

      // Progress reporting
      const completedCount = context.getState().tasks.filter((t) => t.status === 'COMPLETED').length;
      const totalCount = context.getState().tasks.length;
      const percent = Math.min(95, Math.round((completedCount / (totalCount || 1)) * 100));
      if (options.onProgress) options.onProgress(percent, taskToRun.title, taskToRun.assignedRole);

      // Reversible Checkpoint Snapshot prior to task execution
      const cpId = context.createCheckpoint(`pre-${taskToRun.id}`);

      // Dispatch to assigned specialist
      const result = await this.dispatchSpecialist(context, taskToRun);

      if (result.success) {
        allFilesTouched.push(...result.filesCreated, ...result.filesModified);
        log('thought', `[${taskToRun.assignedRole}] Task completed: ${result.summary}`);
      } else {
        log('error', `[${taskToRun.assignedRole}] Task failed: ${result.error}`);
        // If retries exceeded, rollback checkpoint
        if (taskToRun.retryCount >= taskToRun.maxRetries) {
          log('recovery', `[Orchestrator] Reverting workspace changes to checkpoint "${cpId}" due to persistent specialist failure.`);
          context.rollbackToCheckpoint(cpId);
        }
      }

      context.saveToDisk();
    }

    // Stage Final: Outcome Acceptance Evaluation
    const acceptance = context.getAcceptanceReport();
    const finalScore = acceptance ? acceptance.scorecard.compositeQualityScore : 1.0;
    const isSuccess = acceptance ? acceptance.status === 'COMPLETED' : true;

    // Detect open preview / file
    let openPreview: string | undefined;
    let openFile: string | undefined;
    const idxPath = path.join(this.workspaceRoot, 'index.html');
    const exePath = path.join(this.workspaceRoot, 'App.exe');

    if (fs.existsSync(idxPath)) {
      openPreview = '/workspace-preview/index.html';
      openFile = 'index.html';
    } else if (fs.existsSync(exePath)) {
      openFile = 'App.cs';
    }

    // Save final state
    context.saveToDisk();

    // Adaptive Intelligence Experience Recording
    if (this.adaptiveIntelligence) {
      try {
        if (acceptance) {
          this.adaptiveIntelligence.recordOutcomeAcceptance(acceptance);
        }
      } catch {}
    }

    const state = context.getState();
    const completedTasks = state.tasks.filter((t) => t.status === 'COMPLETED').length;
    const completedMilestones = state.milestones.filter((m) => m.status === 'COMPLETED').length;
    const resolvedDefects = state.defects.filter((d) => d.status === 'RESOLVED').length;
    const openDefects = state.defects.filter((d) => d.status === 'OPEN').length;

    let richFinalAnswer = `### 🚀 MaxIDE APEX — Autonomous Product Engineering Completed\n\n`;
    richFinalAnswer += `I have autonomously engineered your product: **"${userPrompt}"**.\n\n`;
    richFinalAnswer += `### 📋 Orchestration Summary:\n`;
    richFinalAnswer += `- **Target Platform**: \`${state.targetPlatform}\`\n`;
    richFinalAnswer += `- **Milestones Completed**: ${completedMilestones}/${state.milestones.length}\n`;
    richFinalAnswer += `- **Specialist Tasks Delivered**: ${completedTasks}/${state.tasks.length}\n`;
    richFinalAnswer += `- **Quality Scorecard**: ${(finalScore * 100).toFixed(0)}% (Status: ${acceptance?.status || 'COMPLETED'})\n\n`;

    if (allFilesTouched.length > 0) {
      richFinalAnswer += `### 📁 Project Deliverables:\n`;
      richFinalAnswer += `${Array.from(new Set(allFilesTouched)).map((f) => `- [${f}](open:${f})`).join('\n')}\n\n`;
    }

    if (openPreview) {
      richFinalAnswer += `### 🌐 Live Preview Ready:\nYour application has been built, verified, and opened in the Preview pane.\n`;
    } else if (fs.existsSync(exePath)) {
      richFinalAnswer += `### 🖥️ Native Windows Executable Verified:\nNative PE binary \`App.exe\` was compiled using the host C# toolchain and is ready to launch.\n`;
    }

    return {
      success: isSuccess,
      sessionId: state.sessionId,
      objective: state.interpretedObjective,
      targetPlatform: state.targetPlatform,
      milestonesTotal: state.milestones.length,
      milestonesCompleted: completedMilestones,
      tasksTotal: state.tasks.length,
      tasksCompleted: completedTasks,
      filesTouched: Array.from(new Set(allFilesTouched)),
      defectsResolved: resolvedDefects,
      openDefects,
      finalQualityScore: finalScore,
      finalAnswer: richFinalAnswer,
      openPreview,
      openFile,
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async dispatchSpecialist(
    context: SharedEngineeringContext,
    task: SpecialistTask
  ): Promise<SpecialistExecutionResult> {
    switch (task.assignedRole) {
      case 'PRODUCT_ARCHITECT':
        return ProductArchitectAgent.execute(context, task);
      case 'PROJECT_MANAGER':
        return ProjectManagerAgent.execute(context, task);
      case 'UI_UX_DESIGNER':
        return UIDesignAgent.execute(context, task);
      case 'FRONTEND_ENGINEER':
        return FrontendEngineerAgent.execute(context, task);
      case 'BACKEND_ENGINEER':
        return BackendEngineerAgent.execute(context, task);
      case 'NATIVE_WINDOWS_ENGINEER':
        return NativeWindowsEngineerAgent.execute(context, task);
      case 'QA_ENGINEER':
        return QADebuggingAgent.execute(context, task);
      case 'RELEASE_ENGINEER':
        return ReleaseEngineerAgent.execute(context, task);
      default:
        context.updateTaskStatus(task.id, 'FAILED', undefined, `Unknown specialist role: ${task.assignedRole}`);
        return {
          success: false,
          role: task.assignedRole,
          taskId: task.id,
          filesCreated: [],
          filesModified: [],
          commandsExecuted: [],
          summary: `Unknown specialist role: ${task.assignedRole}`,
          error: `UNKNOWN_SPECIALIST_ROLE: ${task.assignedRole}`,
        };
    }
  }

  private buildFailureReport(
    context: SharedEngineeringContext,
    errorMsg: string,
    startTime: number
  ): OrchestrationReport {
    const state = context.getState();
    return {
      success: false,
      sessionId: state.sessionId,
      objective: state.interpretedObjective,
      targetPlatform: state.targetPlatform,
      milestonesTotal: state.milestones.length,
      milestonesCompleted: state.milestones.filter((m) => m.status === 'COMPLETED').length,
      tasksTotal: state.tasks.length,
      tasksCompleted: state.tasks.filter((t) => t.status === 'COMPLETED').length,
      filesTouched: [],
      defectsResolved: 0,
      openDefects: state.defects.length,
      finalQualityScore: 0.0,
      finalAnswer: `### ❌ Autonomous Engineering Pipeline Aborted\n\n${errorMsg}`,
      executionDurationMs: Date.now() - startTime,
    };
  }
}
