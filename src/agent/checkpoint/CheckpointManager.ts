/**
 * MaxIDE - Production-Grade Checkpoint & Recovery System
 * 
 * Takes complete snapshots of workspace state before/after major operations.
 * Allows restoring, comparing changes, and safe rollback from failed agent actions.
 * Supports:
 * - PROJECT_CHECKPOINT (workspace snapshots, file tree, manual named snapshots)
 * - AGENT_CHECKPOINT (step-by-step agent execution state, plan, tool events, deltas)
 * - Persistent storage under %LOCALAPPDATA%/MaxIDE/checkpoints
 * - Rolling retention policy (keeps recent 20 automatic checkpoints, never prunes manual snapshots)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PathManager } from '../../config/PathManager.js';
import { AtomicStorage } from '../../storage/AtomicStorage.js';

export type CheckpointType = 'PROJECT_CHECKPOINT' | 'AGENT_CHECKPOINT';

export interface CheckpointFileSnapshot {
  path: string; // relative
  content?: string;
  hash: string;
  size: number;
}

export interface CheckpointAgentState {
  taskId?: string;
  conversationId?: string;
  stepNumber?: number;
  milestoneCategory?: string;
  plan?: any;
  completedSteps?: number;
  pendingSteps?: number;
  modelId?: string;
  providerId?: string;
  autonomyMode?: string;
  lastToolCall?: any;
  lastToolResult?: any;
  deltas?: WorkspaceDelta[];
}

export interface Checkpoint {
  id: string;
  type: CheckpointType;
  name: string;
  description?: string;
  timestamp: string;
  isManual?: boolean;
  projectId?: string;
  files: Record<string, string>; // relativePath -> content
  fileHashes: Record<string, string>; // relativePath -> sha256
  fileCount: number;
  totalBytes: number;
  agentState?: CheckpointAgentState;
}

export interface CheckpointMetadata {
  id: string;
  type: CheckpointType;
  name: string;
  description?: string;
  timestamp: string;
  isManual?: boolean;
  projectId?: string;
  fileCount: number;
  totalBytes: number;
  agentState?: CheckpointAgentState;
}

export interface WorkspaceDelta {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  originalLength?: number;
  currentLength?: number;
}

export class CheckpointManager {
  private workspaceRoot: string;
  private storageDir: string;
  private indexFile: string;
  private checkpointsIndex: Map<string, CheckpointMetadata> = new Map();
  private ignoredPatterns = ['node_modules', '.git', 'dist', '.cache', '.turbo', '.next'];
  private maxAutoCheckpoints = 20;

  constructor(workspaceRoot: string, customStorageDir?: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    const pathMgr = PathManager.getInstance();
    this.storageDir = customStorageDir || pathMgr.getCheckpointsDir();
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.indexFile = path.join(this.storageDir, 'checkpoints_index.json');
    this.loadIndex();
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = path.resolve(newRoot);
  }

  private loadIndex(): void {
    const list = AtomicStorage.safeReadJsonSync<CheckpointMetadata[]>(this.indexFile, []);
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item && item.id) {
          this.checkpointsIndex.set(item.id, item);
        }
      }
    }
  }

  private saveIndex(): void {
    try {
      const list = Array.from(this.checkpointsIndex.values());
      AtomicStorage.atomicWriteJsonSync(this.indexFile, list);
    } catch (err: any) {
      console.warn('[CheckpointManager] Failed to save checkpoints index:', err.message);
    }
  }

  private isIgnored(relPath: string): boolean {
    const parts = relPath.split(/[/\\]/);
    return parts.some((p) => this.ignoredPatterns.includes(p));
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private scanWorkspace(dir: string, fileMap: Map<string, string>, hashMap: Map<string, string>): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(this.workspaceRoot, fullPath);

      if (this.isIgnored(relPath)) continue;

      if (entry.isDirectory()) {
        this.scanWorkspace(fullPath, fileMap, hashMap);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size < 5 * 1024 * 1024) {
            // under 5MB per file
            const content = fs.readFileSync(fullPath, 'utf8');
            const normPath = relPath.replace(/\\/g, '/');
            fileMap.set(normPath, content);
            hashMap.set(normPath, this.hashContent(content));
          }
        } catch {
          // skip unreadable or binary
        }
      }
    }
  }

  /**
   * Enforces rolling retention: keeps recent 20 automatic checkpoints,
   * while never deleting manual snapshots.
   */
  private enforceRetention(): void {
    const autoList = Array.from(this.checkpointsIndex.values())
      .filter(cp => !cp.isManual)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (autoList.length > this.maxAutoCheckpoints) {
      const toRemove = autoList.slice(this.maxAutoCheckpoints);
      for (const cp of toRemove) {
        this.deleteCheckpoint(cp.id);
      }
    }
  }

  /**
   * Create a snapshot checkpoint of the current workspace state.
   */
  public async createCheckpoint(
    name?: string,
    options: {
      type?: CheckpointType;
      isManual?: boolean;
      description?: string;
      agentState?: CheckpointAgentState;
      projectId?: string;
    } = {}
  ): Promise<CheckpointMetadata> {
    const id = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const files = new Map<string, string>();
    const hashes = new Map<string, string>();

    this.scanWorkspace(this.workspaceRoot, files, hashes);

    let totalBytes = 0;
    const fileObj: Record<string, string> = {};
    const hashObj: Record<string, string> = {};

    for (const [relPath, content] of files) {
      totalBytes += Buffer.byteLength(content);
      fileObj[relPath] = content;
      hashObj[relPath] = hashes.get(relPath) || this.hashContent(content);
    }

    const checkpoint: Checkpoint = {
      id,
      type: options.type || (options.agentState ? 'AGENT_CHECKPOINT' : 'PROJECT_CHECKPOINT'),
      name: name || `Checkpoint ${new Date().toLocaleTimeString()}`,
      description: options.description,
      timestamp: new Date().toISOString(),
      isManual: Boolean(options.isManual),
      projectId: options.projectId,
      files: fileObj,
      fileHashes: hashObj,
      fileCount: files.size,
      totalBytes,
      agentState: options.agentState,
    };

    // 1. Write checkpoint payload atomically
    const cpFilePath = path.join(this.storageDir, `${id}.json`);
    AtomicStorage.atomicWriteJsonSync(cpFilePath, checkpoint);

    // 2. Update index
    const meta: CheckpointMetadata = {
      id: checkpoint.id,
      type: checkpoint.type,
      name: checkpoint.name,
      description: checkpoint.description,
      timestamp: checkpoint.timestamp,
      isManual: checkpoint.isManual,
      projectId: checkpoint.projectId,
      fileCount: checkpoint.fileCount,
      totalBytes: checkpoint.totalBytes,
      agentState: checkpoint.agentState,
    };

    this.checkpointsIndex.set(id, meta);
    this.enforceRetention();
    this.saveIndex();

    return meta;
  }

  /**
   * Create named manual snapshot (e.g. "Before auth changes")
   */
  public async createNamedSnapshot(
    name: string,
    description?: string,
    projectId?: string
  ): Promise<CheckpointMetadata> {
    return this.createCheckpoint(name, {
      type: 'PROJECT_CHECKPOINT',
      isManual: true,
      description,
      projectId,
    });
  }

  public getCheckpoint(id: string): Checkpoint | undefined {
    const cpFilePath = path.join(this.storageDir, `${id}.json`);
    return AtomicStorage.safeReadJsonSync<Checkpoint | undefined>(cpFilePath, undefined);
  }

  /**
   * Compare current workspace state against a checkpoint.
   */
  public async compareChanges(checkpointId: string): Promise<WorkspaceDelta[]> {
    const cp = this.getCheckpoint(checkpointId);
    if (!cp) throw new Error(`Checkpoint ${checkpointId} not found`);

    const currentFiles = new Map<string, string>();
    const currentHashes = new Map<string, string>();
    this.scanWorkspace(this.workspaceRoot, currentFiles, currentHashes);

    const deltas: WorkspaceDelta[] = [];

    // Check for modified and deleted files
    for (const [relPath, origContent] of Object.entries(cp.files)) {
      if (!currentFiles.has(relPath)) {
        deltas.push({
          path: relPath,
          status: 'deleted',
          originalLength: origContent.length,
          currentLength: 0,
        });
      } else {
        const curContent = currentFiles.get(relPath)!;
        if (curContent !== origContent) {
          deltas.push({
            path: relPath,
            status: 'modified',
            originalLength: origContent.length,
            currentLength: curContent.length,
          });
        }
      }
    }

    // Check for newly added files
    for (const [relPath, curContent] of currentFiles) {
      if (!(relPath in cp.files)) {
        deltas.push({
          path: relPath,
          status: 'added',
          originalLength: 0,
          currentLength: curContent.length,
        });
      }
    }

    return deltas;
  }

  /**
   * Restore workspace to exact checkpoint state.
   */
  public async restoreCheckpoint(checkpointId: string): Promise<{ success: boolean; restoredCount: number }> {
    const cp = this.getCheckpoint(checkpointId);
    if (!cp) throw new Error(`Checkpoint ${checkpointId} not found`);

    const currentFiles = new Map<string, string>();
    const currentHashes = new Map<string, string>();
    this.scanWorkspace(this.workspaceRoot, currentFiles, currentHashes);

    // Delete any files created since the checkpoint
    for (const [relPath] of currentFiles) {
      if (!(relPath in cp.files)) {
        const fullPath = path.resolve(this.workspaceRoot, relPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }

    // Restore all files from snapshot
    let restoredCount = 0;
    for (const [relPath, content] of Object.entries(cp.files)) {
      const fullPath = path.resolve(this.workspaceRoot, relPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(fullPath, content, 'utf8');
      restoredCount++;
    }

    return { success: true, restoredCount };
  }

  public listCheckpoints(projectId?: string): CheckpointMetadata[] {
    const list = Array.from(this.checkpointsIndex.values());
    const filtered = projectId ? list.filter(cp => !cp.projectId || cp.projectId === projectId) : list;
    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public listSnapshots(projectId?: string): CheckpointMetadata[] {
    return this.listCheckpoints(projectId).filter(cp => cp.isManual);
  }

  public deleteCheckpoint(id: string): boolean {
    const cpFilePath = path.join(this.storageDir, `${id}.json`);
    if (fs.existsSync(cpFilePath)) {
      try {
        fs.unlinkSync(cpFilePath);
      } catch {}
    }
    const deleted = this.checkpointsIndex.delete(id);
    this.saveIndex();
    return deleted;
  }
}
