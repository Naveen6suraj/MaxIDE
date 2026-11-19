/**
 * MaxIDE APEX - Autonomous Product Development & Engineering Orchestration
 * Shared Engineering Context (Mission 11.1 Hardened):
 * - Durable Disk Checkpoints with SHA-256 manifests & rollback verification
 * - File ownership locks with TTL, expiration recovery, and conflict detection
 * - Structured agent handoffs, decision records, and defect diagnostics
 * - Complete project context persistence & cold restart resume
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
  ttlMs: number;
  expiresAt: number;
  reason: string;
}

export interface LockConflictRecord {
  filePath: string;
  attemptedBy: SpecialistRole;
  heldBy: SpecialistRole;
  timestamp: number;
  reason: string;
}

export interface CheckpointFileEntry {
  path: string; // relative
  sha256: string;
  size: number;
}

export interface CheckpointManifest {
  id: string;
  name: string;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  files: CheckpointFileEntry[];
}

export interface CheckpointSnapshot {
  id: string;
  name: string;
  createdAt: number;
  manifest: CheckpointManifest;
  diskPath: string;
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

export interface AgentHandoff {
  id: string;
  fromRole: SpecialistRole;
  toRole: SpecialistRole;
  taskId: string;
  artifactsPassed: string[];
  handoffRationale: string;
  timestamp: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
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
  lockConflicts: LockConflictRecord[];
  checkpoints: CheckpointSnapshot[];
  handoffs: AgentHandoff[];
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
  private maxCheckpoints = 15;
  private defaultLockTtlMs = 60000; // 60s default lock TTL

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
      lockConflicts: [],
      checkpoints: [],
      handoffs: [],
      defects: [],
      isPaused: false,
      isCancelled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Load any existing durable checkpoints already on disk
    this.discoverDiskCheckpoints();
  }

  public getState(): Readonly<SharedContextState> {
    this.cleanExpiredLocks();
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

  // --- Structured Agent Handoffs ---

  public recordHandoff(handoff: Omit<AgentHandoff, 'id' | 'timestamp' | 'status'>): AgentHandoff {
    const id = `ho-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fullHandoff: AgentHandoff = {
      id,
      ...handoff,
      timestamp: Date.now(),
      status: 'ACCEPTED',
    };
    this.state.handoffs.push(fullHandoff);
    this.state.updatedAt = Date.now();
    return fullHandoff;
  }

  public getHandoffs(): AgentHandoff[] {
    return [...this.state.handoffs];
  }

  // --- File Ownership & Lock Mechanism with TTL & Expiration Recovery ---

  public cleanExpiredLocks(): number {
    const now = Date.now();
    const initialCount = this.state.activeLocks.length;
    this.state.activeLocks = this.state.activeLocks.filter((l) => l.expiresAt > now);
    return initialCount - this.state.activeLocks.length;
  }

  public acquireLock(
    filePath: string,
    ownerRole: SpecialistRole,
    reason: string,
    ttlMs?: number
  ): boolean {
    this.cleanExpiredLocks();
    const normalized = path.normalize(filePath).toLowerCase();
    const existing = this.state.activeLocks.find(
      (l) => path.normalize(l.filePath).toLowerCase() === normalized
    );

    const ttl = ttlMs || this.defaultLockTtlMs;
    const now = Date.now();

    if (existing) {
      if (existing.ownerRole === ownerRole) {
        // Refresh TTL
        existing.expiresAt = now + ttl;
        return true;
      }

      // Record lock conflict
      this.state.lockConflicts.push({
        filePath,
        attemptedBy: ownerRole,
        heldBy: existing.ownerRole,
        timestamp: now,
        reason: `Role ${ownerRole} attempted to acquire locked file held by ${existing.ownerRole} (${existing.reason})`,
      });
      return false;
    }

    this.state.activeLocks.push({
      filePath,
      ownerRole,
      acquiredAt: now,
      ttlMs: ttl,
      expiresAt: now + ttl,
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
    this.cleanExpiredLocks();
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

  public getLockConflicts(): LockConflictRecord[] {
    return [...this.state.lockConflicts];
  }

  // --- Phase 2: Durable Disk-Persisted Checkpoints with Atomic Manifests & SHA-256 ---

  private getCheckpointsBaseDir(): string {
    return path.join(this.state.workspaceRoot, '.maxide', 'checkpoints');
  }

  private computeFileHash(absPath: string): string {
    try {
      const buffer = fs.readFileSync(absPath);
      return crypto.createHash('sha256').update(buffer).digest('hex');
    } catch {
      return '';
    }
  }

  private discoverDiskCheckpoints(): void {
    try {
      const baseDir = this.getCheckpointsBaseDir();
      if (!fs.existsSync(baseDir)) return;

      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory() || e.name.endsWith('.tmp')) continue;

        const manifestPath = path.join(baseDir, e.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest: CheckpointManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (manifest && manifest.id && Array.isArray(manifest.files)) {
              // Add to state if not already loaded
              if (!this.state.checkpoints.some((c) => c.id === manifest.id)) {
                this.state.checkpoints.push({
                  id: manifest.id,
                  name: manifest.name,
                  createdAt: new Date(manifest.createdAt).getTime(),
                  manifest,
                  diskPath: path.join(baseDir, e.name),
                });
              }
            }
          } catch {}
        }
      }

      this.state.checkpoints.sort((a, b) => a.createdAt - b.createdAt);
    } catch {}
  }

  /**
   * Atomic Durable Checkpoint Creation:
   * 1. Scans workspace files (ignoring node_modules, .git, dist, .maxide).
   * 2. Writes files and compute SHA-256 into a temporary staging folder.
   * 3. Generates manifest.json.
   * 4. Atomically renames staging folder to .maxide/checkpoints/<checkpoint-id>.
   */
  public createCheckpoint(name: string): string {
    const checkpointId = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const baseDir = this.getCheckpointsBaseDir();
    const tmpDir = path.join(baseDir, `${checkpointId}.tmp`);
    const finalDir = path.join(baseDir, checkpointId);

    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      fs.mkdirSync(tmpDir, { recursive: true });

      const fileEntries: CheckpointFileEntry[] = [];
      let totalBytes = 0;

      const scanAndCopy = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const fullPath = path.join(dir, e.name);
          const relPath = path.relative(this.state.workspaceRoot, fullPath).replace(/\\/g, '/');

          if (
            e.name === 'node_modules' ||
            e.name === '.git' ||
            e.name === 'dist' ||
            e.name === '.maxide' ||
            e.name.startsWith('.checkpoint')
          ) {
            continue;
          }

          if (e.isDirectory()) {
            scanAndCopy(fullPath);
          } else if (e.isFile()) {
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size < 5000000) { // Support files up to 5MB
                const targetPath = path.join(tmpDir, 'data', relPath);
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                fs.copyFileSync(fullPath, targetPath);

                const sha256 = this.computeFileHash(fullPath);
                fileEntries.push({
                  path: relPath,
                  sha256,
                  size: stat.size,
                });
                totalBytes += stat.size;
              }
            } catch {}
          }
        }
      };

      scanAndCopy(this.state.workspaceRoot);

      const manifest: CheckpointManifest = {
        id: checkpointId,
        name,
        createdAt: new Date().toISOString(),
        fileCount: fileEntries.length,
        totalBytes,
        files: fileEntries,
      };

      fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

      // Atomic Commit: Rename staging dir to final checkpoint dir
      fs.renameSync(tmpDir, finalDir);

      const snapshot: CheckpointSnapshot = {
        id: checkpointId,
        name,
        createdAt: Date.now(),
        manifest,
        diskPath: finalDir,
      };

      this.state.checkpoints.push(snapshot);
      if (this.state.checkpoints.length > this.maxCheckpoints) {
        const oldest = this.state.checkpoints.shift();
        if (oldest && fs.existsSync(oldest.diskPath)) {
          try {
            fs.rmSync(oldest.diskPath, { recursive: true, force: true });
          } catch {}
        }
      }

      return checkpointId;
    } catch (err: any) {
      if (fs.existsSync(tmpDir)) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
      }
      throw new Error(`Failed to create durable checkpoint: ${err.message}`);
    }
  }

  private lastRollbackReport?: { success: boolean; verifiedFiles: number; error?: string };

  public getLastRollbackReport() {
    return this.lastRollbackReport;
  }

  /**
   * Rollback with SHA-256 Verification & User Change Protection:
   * 1. Reads checkpoint directory and manifest.
   * 2. Restores files tracked in manifest.
   * 3. Verifies post-rollback SHA-256 hashes against manifest.
   * 4. Does NOT clobber newly created files unless they collide with checkpoint targets.
   * Returns true if and only if all files are verified successfully.
   */
  public rollbackToCheckpoint(checkpointId: string): boolean {
    const cp = this.state.checkpoints.find((c) => c.id === checkpointId);
    if (!cp || !fs.existsSync(cp.diskPath)) {
      this.lastRollbackReport = { success: false, verifiedFiles: 0, error: `Checkpoint "${checkpointId}" not found on disk.` };
      return false;
    }

    try {
      const manifestPath = path.join(cp.diskPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        this.lastRollbackReport = { success: false, verifiedFiles: 0, error: 'Checkpoint manifest corrupted or missing.' };
        return false;
      }

      const manifest: CheckpointManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      let verifiedCount = 0;

      for (const entry of manifest.files) {
        const sourceData = path.join(cp.diskPath, 'data', entry.path);
        const targetDest = path.join(this.state.workspaceRoot, entry.path);

        if (fs.existsSync(sourceData)) {
          fs.mkdirSync(path.dirname(targetDest), { recursive: true });
          fs.copyFileSync(sourceData, targetDest);

          // Verify restored hash
          const restoredHash = this.computeFileHash(targetDest);
          if (restoredHash === entry.sha256) {
            verifiedCount++;
          }
        }
      }

      if (verifiedCount !== manifest.files.length) {
        this.lastRollbackReport = {
          success: false,
          verifiedFiles: verifiedCount,
          error: `Integrity check failed: ${manifest.files.length - verifiedCount} files failed SHA-256 verification after restore.`,
        };
        return false;
      }

      this.lastRollbackReport = { success: true, verifiedFiles: verifiedCount };
      return true;
    } catch (err: any) {
      this.lastRollbackReport = { success: false, verifiedFiles: 0, error: err.message };
      return false;
    }
  }

  public getCheckpoints(): CheckpointSnapshot[] {
    return [...this.state.checkpoints];
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

  // --- Phase 5: Complete Project Context Persistence & Cold Restart Resume ---

  public saveToDisk(): void {
    try {
      const maxideDir = path.join(this.state.workspaceRoot, '.maxide');
      if (!fs.existsSync(maxideDir)) {
        fs.mkdirSync(maxideDir, { recursive: true });
      }

      // 1. Complete Context State JSON
      const serializedState = {
        sessionId: this.state.sessionId,
        originalPrompt: this.state.originalPrompt,
        interpretedObjective: this.state.interpretedObjective,
        targetPlatform: this.state.targetPlatform,
        currentMilestoneId: this.state.currentMilestoneId,
        milestones: this.state.milestones,
        tasks: this.state.tasks,
        activeLocks: this.state.activeLocks,
        defects: this.state.defects,
        handoffs: this.state.handoffs,
        architectureDecisions: this.state.architectureDecisions,
        isPaused: this.state.isPaused,
        isCancelled: this.state.isCancelled,
        createdAt: this.state.createdAt,
        updatedAt: this.state.updatedAt,
      };
      fs.writeFileSync(path.join(maxideDir, 'context.json'), JSON.stringify(serializedState, null, 2), 'utf8');

      // 2. Task Board JSON
      fs.writeFileSync(path.join(maxideDir, 'task_board.json'), JSON.stringify({
        sessionId: this.state.sessionId,
        objective: this.state.interpretedObjective,
        targetPlatform: this.state.targetPlatform,
        currentMilestone: this.state.currentMilestoneId,
        milestones: this.state.milestones,
        tasks: this.state.tasks,
        defects: this.state.defects,
        updatedAt: new Date(this.state.updatedAt).toISOString(),
      }, null, 2), 'utf8');

      // 3. Human-readable ROADMAP.md
      fs.writeFileSync(path.join(maxideDir, 'ROADMAP.md'), this.generateRoadmapMarkdown(), 'utf8');

      // 4. Architecture Decisions & Handoffs
      fs.writeFileSync(path.join(maxideDir, 'decisions.json'), JSON.stringify(this.state.architectureDecisions, null, 2), 'utf8');
      fs.writeFileSync(path.join(maxideDir, 'handoffs.json'), JSON.stringify(this.state.handoffs, null, 2), 'utf8');
      fs.writeFileSync(path.join(maxideDir, 'defects.json'), JSON.stringify(this.state.defects, null, 2), 'utf8');
    } catch {}
  }

  /**
   * Cold Restart: Resume existing project engineering context directly from disk.
   */
  public static loadFromDisk(workspaceRoot: string): SharedEngineeringContext | null {
    const contextJson = path.join(workspaceRoot, '.maxide', 'context.json');
    if (!fs.existsSync(contextJson)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(contextJson, 'utf8'));
      const context = new SharedEngineeringContext(workspaceRoot, data.originalPrompt || '', data.sessionId);

      context.state.interpretedObjective = data.interpretedObjective || '';
      context.state.targetPlatform = data.targetPlatform || 'WEB_APP';
      context.state.currentMilestoneId = data.currentMilestoneId;
      context.state.milestones = Array.isArray(data.milestones) ? data.milestones : [];
      context.state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
      context.state.defects = Array.isArray(data.defects) ? data.defects : [];
      context.state.handoffs = Array.isArray(data.handoffs) ? data.handoffs : [];
      context.state.architectureDecisions = Array.isArray(data.architectureDecisions) ? data.architectureDecisions : [];
      context.state.isPaused = Boolean(data.isPaused);
      context.state.isCancelled = Boolean(data.isCancelled);
      context.state.createdAt = data.createdAt || Date.now();
      context.state.updatedAt = data.updatedAt || Date.now();

      // Clean any expired locks saved from previous run
      context.cleanExpiredLocks();
      context.discoverDiskCheckpoints();

      return context;
    } catch {
      return null;
    }
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
