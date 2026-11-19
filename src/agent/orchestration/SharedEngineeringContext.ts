/**
 * MaxIDE APEX - Autonomous Product Development & Engineering Orchestration
 * Shared Engineering Context: Central Project State, File Ownership Locks,
 * Checkpoints, Milestones, Task Boards, Defects, and Verifiable Handoffs.
 */

import fs from 'fs';
import path from 'path';
import { ProductSpec } from '../../intelligence/ProductSpecEngine.js';
import { OutcomeAcceptanceReport } from '../../intelligence/OutcomeAcceptanceEngine.js';

export type SpecialistRole =
  | 'PRODUCT_ARCHITECT'
  | 'PROJECT_MANAGER'
  | 'UI_UX_DESIGNER'
  | 'FRONTEND_ENGINEER'
  | 'BACKEND_ENGINEER'
  | 'NATIVE_WINDOWS_ENGINEER'
  | 'QA_ENGINEER'
  | 'DEBUGGING_ENGINEER'
  | 'RELEASE_ENGINEER';

export type TaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED';

export interface SpecialistTask {
  id: string;
  milestoneId: string;
  title: string;
  description: string;
  assignedRole: SpecialistRole;
  dependencies: string[];
  status: TaskStatus;
  allowedFiles: string[];
  evidence?: {
    filesCreated?: string[];
    filesModified?: string[];
    commandsExecuted?: string[];
    testResults?: { passed: boolean; details: string };
    buildExitCode?: number;
    verificationNotes?: string;
  };
  retryCount: number;
  maxRetries: number;
  blockerReason?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  taskIds: string[];
  completedAt?: number;
}

export interface EngineeringDefect {
  id: string;
  category: 'SYNTAX' | 'COMPILATION' | 'RUNTIME' | 'DOM_SELECTOR' | 'VISUAL' | 'MISSING_FEATURE' | 'SECURITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affectedFiles: string[];
  discoveredBy: SpecialistRole;
  assignedTo: SpecialistRole;
  status: 'OPEN' | 'IN_REPAIR' | 'RESOLVED' | 'WONT_FIX';
  resolution?: string;
  discoveredAt: number;
  resolvedAt?: number;
}

export interface FileLock {
  filePath: string;
  ownerRole: SpecialistRole;
  acquiredAt: number;
  reason: string;
}

export interface CheckpointSnapshot {
  id: string;
  name: string;
  createdAt: number;
  files: Map<string, string>; // relativePath -> fileContent
}

export interface ArchitectureDecision {
  id: string;
  title: string;
  rationale: string;
  chosenStack: string;
  targetPlatform: 'WEB_APP' | 'NATIVE_WINDOWS' | 'FULLSTACK' | 'HYBRID';
  decidedBy: SpecialistRole;
  timestamp: number;
}

export interface SharedContextState {
  sessionId: string;
  workspaceRoot: string;
  originalPrompt: string;
  interpretedObjective: string;
  targetPlatform: 'WEB_APP' | 'NATIVE_WINDOWS' | 'FULLSTACK' | 'HYBRID';
  productSpec?: ProductSpec;
  architectureDecisions: ArchitectureDecision[];
  milestones: Milestone[];
  tasks: SpecialistTask[];
  activeLocks: FileLock[];
  checkpoints: CheckpointSnapshot[];
  defects: EngineeringDefect[];
  acceptanceReport?: OutcomeAcceptanceReport;
  currentMilestoneId?: string;
  isPaused: boolean;
  isCancelled: boolean;
  createdAt: number;
  updatedAt: number;
}

export class SharedEngineeringContext {
  private state: SharedContextState;
  private maxCheckpoints = 10;

  constructor(workspaceRoot: string, prompt: string, sessionId?: string) {
    this.state = {
      sessionId: sessionId || `m11-sess-${Date.now()}`,
      workspaceRoot: path.resolve(workspaceRoot),
      originalPrompt: prompt,
      interpretedObjective: prompt,
      targetPlatform: 'WEB_APP',
      architectureDecisions: [],
      milestones: [],
      tasks: [],
      activeLocks: [],
      checkpoints: [],
      defects: [],
      isPaused: false,
      isCancelled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  public getState(): Readonly<SharedContextState> {
    return this.state;
  }

  public setInterpretedObjective(objective: string): void {
    this.state.interpretedObjective = objective;
    this.state.updatedAt = Date.now();
  }

  public setTargetPlatform(platform: 'WEB_APP' | 'NATIVE_WINDOWS' | 'FULLSTACK' | 'HYBRID'): void {
    this.state.targetPlatform = platform;
    this.state.updatedAt = Date.now();
  }

  public setProductSpec(spec: ProductSpec): void {
    this.state.productSpec = spec;
    this.state.updatedAt = Date.now();
    this.persistSpecToWorkspace();
  }

  public getProductSpec(): ProductSpec | undefined {
    return this.state.productSpec;
  }

  public addArchitectureDecision(decision: ArchitectureDecision): void {
    this.state.architectureDecisions.push(decision);
    this.state.updatedAt = Date.now();
  }

  // --- Milestones & Task Management ---

  public setMilestones(milestones: Milestone[]): void {
    this.state.milestones = milestones;
    if (milestones.length > 0 && !this.state.currentMilestoneId) {
      this.state.currentMilestoneId = milestones[0].id;
      milestones[0].status = 'IN_PROGRESS';
    }
    this.state.updatedAt = Date.now();
  }

  public setTasks(tasks: SpecialistTask[]): void {
    this.state.tasks = tasks;
    this.state.updatedAt = Date.now();
  }

  public addTask(task: SpecialistTask): void {
    this.state.tasks.push(task);
    this.state.updatedAt = Date.now();
  }

  public getTask(taskId: string): SpecialistTask | undefined {
    return this.state.tasks.find((t) => t.id === taskId);
  }

  public getTasksForRole(role: SpecialistRole): SpecialistTask[] {
    return this.state.tasks.filter((t) => t.assignedRole === role);
  }

  public getPendingTasks(): SpecialistTask[] {
    return this.state.tasks.filter((t) => t.status === 'PENDING');
  }

  public getNextExecutableTasks(): SpecialistTask[] {
    const completedIds = new Set(
      this.state.tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.id)
    );
    return this.state.tasks.filter((t) => {
      if (t.status !== 'PENDING') return false;
      return t.dependencies.every((depId) => completedIds.has(depId));
    });
  }

  public updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    evidence?: SpecialistTask['evidence'],
    blockerReason?: string
  ): void {
    const task = this.getTask(taskId);
    if (!task) return;

    task.status = status;
    task.retryCount = status === 'FAILED' ? task.retryCount + 1 : task.retryCount;
    if (evidence) {
      task.evidence = { ...task.evidence, ...evidence };
    }
    if (blockerReason) {
      task.blockerReason = blockerReason;
    }
    if (status === 'IN_PROGRESS' && !task.startedAt) {
      task.startedAt = Date.now();
    }
    if (status === 'COMPLETED') {
      task.completedAt = Date.now();
    }

    // Check if current milestone is complete
    this.evaluateMilestones();
    this.state.updatedAt = Date.now();
  }

  private evaluateMilestones(): void {
    for (const m of this.state.milestones) {
      const mTasks = this.state.tasks.filter((t) => m.taskIds.includes(t.id));
      if (mTasks.length === 0) continue;

      if (mTasks.every((t) => t.status === 'COMPLETED')) {
        m.status = 'COMPLETED';
        if (!m.completedAt) m.completedAt = Date.now();
      } else if (mTasks.some((t) => t.status === 'FAILED' && t.retryCount >= t.maxRetries)) {
        m.status = 'FAILED';
      } else if (mTasks.some((t) => t.status === 'IN_PROGRESS' || t.status === 'COMPLETED')) {
        m.status = 'IN_PROGRESS';
      }
    }

    const nextPending = this.state.milestones.find((m) => m.status === 'IN_PROGRESS' || m.status === 'PENDING');
    if (nextPending) {
      this.state.currentMilestoneId = nextPending.id;
      if (nextPending.status === 'PENDING') {
        nextPending.status = 'IN_PROGRESS';
      }
    }
  }

  // --- File Ownership & Locking Mechanism ---

  public acquireLock(filePath: string, ownerRole: SpecialistRole, reason: string): boolean {
    const normalized = path.normalize(filePath).toLowerCase();
    const existing = this.state.activeLocks.find(
      (l) => path.normalize(l.filePath).toLowerCase() === normalized
    );

    if (existing) {
      if (existing.ownerRole === ownerRole) {
        return true; // Already holds lock
      }
      return false; // Held by another specialist!
    }

    this.state.activeLocks.push({
      filePath,
      ownerRole,
      acquiredAt: Date.now(),
      reason,
    });
    return true;
  }

  public releaseLock(filePath: string, ownerRole: SpecialistRole): boolean {
    const normalized = path.normalize(filePath).toLowerCase();
    const idx = this.state.activeLocks.findIndex(
      (l) => path.normalize(l.filePath).toLowerCase() === normalized && l.ownerRole === ownerRole
    );
    if (idx !== -1) {
      this.state.activeLocks.splice(idx, 1);
      return true;
    }
    return false;
  }

  public releaseAllLocksForRole(ownerRole: SpecialistRole): void {
    this.state.activeLocks = this.state.activeLocks.filter((l) => l.ownerRole !== ownerRole);
  }

  public assertCanModify(filePath: string, role: SpecialistRole): { allowed: boolean; reason?: string } {
    const normalized = path.normalize(filePath).toLowerCase();
    const lock = this.state.activeLocks.find(
      (l) => path.normalize(l.filePath).toLowerCase() === normalized
    );

    if (lock && lock.ownerRole !== role) {
      return {
        allowed: false,
        reason: `File "${filePath}" is locked by ${lock.ownerRole} (${lock.reason}). ${role} cannot clobber it.`,
      };
    }

    return { allowed: true };
  }

  // --- Reversible Checkpoints ---

  public createCheckpoint(name: string): string {
    const checkpointId = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const snapshotFiles = new Map<string, string>();

    try {
      if (fs.existsSync(this.state.workspaceRoot)) {
        const scanDir = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const fullPath = path.join(dir, e.name);
            const relPath = path.relative(this.state.workspaceRoot, fullPath);

            if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name.startsWith('.checkpoint')) {
              continue;
            }

            if (e.isDirectory()) {
              scanDir(fullPath);
            } else if (e.isFile()) {
              try {
                const stat = fs.statSync(fullPath);
                if (stat.size < 500000) { // Keep snapshots under 500KB per file
                  const content = fs.readFileSync(fullPath, 'utf8');
                  snapshotFiles.set(relPath, content);
                }
              } catch {}
            }
          }
        };

        scanDir(this.state.workspaceRoot);
      }
    } catch {}

    const checkpoint: CheckpointSnapshot = {
      id: checkpointId,
      name,
      createdAt: Date.now(),
      files: snapshotFiles,
    };

    this.state.checkpoints.push(checkpoint);
    if (this.state.checkpoints.length > this.maxCheckpoints) {
      this.state.checkpoints.shift();
    }

    return checkpointId;
  }

  public rollbackToCheckpoint(checkpointId: string): boolean {
    const cp = this.state.checkpoints.find((c) => c.id === checkpointId);
    if (!cp) return false;

    try {
      for (const [relPath, content] of cp.files.entries()) {
        const fullPath = path.join(this.state.workspaceRoot, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
      }
      return true;
    } catch {
      return false;
    }
  }

  // --- Defects & Quality Diagnostics ---

  public recordDefect(defect: Omit<EngineeringDefect, 'id' | 'discoveredAt' | 'status'>): string {
    const id = `def-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newDefect: EngineeringDefect = {
      id,
      ...defect,
      status: 'OPEN',
      discoveredAt: Date.now(),
    };
    this.state.defects.push(newDefect);
    this.state.updatedAt = Date.now();
    return id;
  }

  public resolveDefect(defectId: string, resolution: string): boolean {
    const def = this.state.defects.find((d) => d.id === defectId);
    if (!def) return false;

    def.status = 'RESOLVED';
    def.resolution = resolution;
    def.resolvedAt = Date.now();
    this.state.updatedAt = Date.now();
    return true;
  }

  public getOpenDefects(): EngineeringDefect[] {
    return this.state.defects.filter((d) => d.status === 'OPEN' || d.status === 'IN_REPAIR');
  }

  public setAcceptanceReport(report: OutcomeAcceptanceReport): void {
    this.state.acceptanceReport = report;
    this.state.updatedAt = Date.now();
  }

  public getAcceptanceReport(): OutcomeAcceptanceReport | undefined {
    return this.state.acceptanceReport;
  }

  // --- Execution Controls ---

  public pause(): void {
    this.state.isPaused = true;
    this.state.updatedAt = Date.now();
  }

  public resume(): void {
    this.state.isPaused = false;
    this.state.updatedAt = Date.now();
  }

  public cancel(): void {
    this.state.isCancelled = true;
    this.state.updatedAt = Date.now();
  }

  // --- Persistence & Workspace Artifacts ---

  public saveToDisk(): void {
    try {
      const maxideDir = path.join(this.state.workspaceRoot, '.maxide');
      if (!fs.existsSync(maxideDir)) {
        fs.mkdirSync(maxideDir, { recursive: true });
      }

      // 1. Task Board JSON
      const taskBoardData = {
        sessionId: this.state.sessionId,
        objective: this.state.interpretedObjective,
        targetPlatform: this.state.targetPlatform,
        currentMilestone: this.state.currentMilestoneId,
        milestones: this.state.milestones,
        tasks: this.state.tasks,
        defects: this.state.defects,
        updatedAt: new Date(this.state.updatedAt).toISOString(),
      };
      fs.writeFileSync(path.join(maxideDir, 'task_board.json'), JSON.stringify(taskBoardData, null, 2), 'utf8');

      // 2. Human-readable ROADMAP.md
      const roadmapMd = this.generateRoadmapMarkdown();
      fs.writeFileSync(path.join(maxideDir, 'ROADMAP.md'), roadmapMd, 'utf8');

      // 3. Architecture Decisions JSON
      fs.writeFileSync(
        path.join(maxideDir, 'architecture.json'),
        JSON.stringify(this.state.architectureDecisions, null, 2),
        'utf8'
      );
    } catch {}
  }

  private persistSpecToWorkspace(): void {
    if (!this.state.productSpec) return;
    try {
      const maxideDir = path.join(this.state.workspaceRoot, '.maxide');
      if (!fs.existsSync(maxideDir)) {
        fs.mkdirSync(maxideDir, { recursive: true });
      }

      const spec = this.state.productSpec;
      let md = `# ${spec.name}\n\n`;
      md += `**Domain**: ${spec.domain} | **Platform**: ${spec.targetPlatform} | **Generated**: ${spec.generatedAt}\n\n`;
      md += `## Architecture Overview\n${spec.architectureDescription}\n\n`;

      if (spec.designSpec) {
        md += `## Design Identity & Token Blueprints\n`;
        md += `- **Product Tone**: ${spec.designSpec.targetAudience} (${spec.designSpec.visualDirection})\n`;
        md += `- **Primary Color**: \`${spec.designSpec.colorPalette.primary}\`\n`;
        md += `- **Accent Color**: \`${spec.designSpec.colorPalette.accent}\`\n`;
        md += `- **Background**: \`${spec.designSpec.colorPalette.background}\`\n`;
        md += `- **Heading Font**: ${spec.designSpec.typography.headingFont}\n`;
        md += `- **Body Font**: ${spec.designSpec.typography.bodyFont}\n\n`;
      }

      md += `## Required Deliverables\n`;
      for (const d of spec.requiredDeliverables) {
        md += `- \`${d}\`\n`;
      }
      md += `\n`;

      md += `## Interactive Features & User Journeys\n`;
      for (const f of spec.interactiveFeatures) {
        md += `- **${f.name}**: (Trigger: \`${f.trigger}\`, Action: ${f.expectedBehavior})\n`;
      }
      md += `\n`;

      if (spec.dataModels && spec.dataModels.length > 0) {
        md += `## Data Schemas\n`;
        for (const dm of spec.dataModels) {
          md += `### ${dm.entityName}\n`;
          for (const field of dm.fields) {
            md += `- \`${field.name}\` (${field.type}${field.required ? ', required' : ''}): ${field.description || ''}\n`;
          }
          md += `\n`;
        }
      }

      md += `## Test & Acceptance Criteria\n`;
      for (const tc of spec.testCriteria) {
        md += `- [ ] **${tc.id}** (${tc.category}): ${tc.description}\n`;
      }

      fs.writeFileSync(path.join(maxideDir, 'PRODUCT_SPEC.md'), md, 'utf8');
    } catch {}
  }

  private generateRoadmapMarkdown(): string {
    let md = `# Autonomous Engineering Roadmap\n\n`;
    md += `**Objective**: ${this.state.interpretedObjective}\n`;
    md += `**Target Platform**: ${this.state.targetPlatform}\n`;
    md += `**Status**: ${this.state.isCancelled ? 'CANCELLED' : this.state.isPaused ? 'PAUSED' : 'ACTIVE'}\n\n`;

    md += `## Milestones & Execution Progress\n\n`;
    for (const m of this.state.milestones) {
      const icon = m.status === 'COMPLETED' ? '✅' : m.status === 'IN_PROGRESS' ? '⏳' : m.status === 'FAILED' ? '❌' : '⚪';
      md += `### ${icon} ${m.name} (${m.status})\n${m.description}\n\n`;

      const mTasks = this.state.tasks.filter((t) => m.taskIds.includes(t.id));
      for (const t of mTasks) {
        const tIcon = t.status === 'COMPLETED' ? '[x]' : '[ ]';
        md += `- ${tIcon} **${t.title}** (${t.assignedRole}) — \`${t.status}\`\n`;
        if (t.evidence?.verificationNotes) {
          md += `  - *Evidence*: ${t.evidence.verificationNotes}\n`;
        }
        if (t.blockerReason) {
          md += `  - *Blocker*: ⚠️ ${t.blockerReason}\n`;
        }
      }
      md += `\n`;
    }

    if (this.state.defects.length > 0) {
      md += `## Discovered Defects & Fixes\n\n`;
      for (const d of this.state.defects) {
        const dIcon = d.status === 'RESOLVED' ? '🟢' : '🔴';
        md += `- ${dIcon} [${d.severity}] **${d.category}**: ${d.description} (Assigned: ${d.assignedTo})\n`;
        if (d.resolution) {
          md += `  - *Resolution*: ${d.resolution}\n`;
        }
      }
      md += `\n`;
    }

    return md;
  }
}
