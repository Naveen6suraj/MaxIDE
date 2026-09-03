/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Checkpoint & Rollback System
 * 
 * Takes complete snapshots of workspace state before major tasks.
 * Allows restoring, comparing changes, and safe rollback from failed agent actions.
 */

import fs from 'fs';
import path from 'path';

export interface CheckpointFileSnapshot {
  path: string; // relative
  content: string;
  hash?: string;
}

export interface Checkpoint {
  id: string;
  name: string;
  timestamp: Date;
  files: Map<string, string>; // relativePath -> content
  fileCount: number;
  totalBytes: number;
}

export interface CheckpointMetadata {
  id: string;
  name: string;
  timestamp: Date;
  fileCount: number;
  totalBytes: number;
}

export interface WorkspaceDelta {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  originalLength?: number;
  currentLength?: number;
}

export class CheckpointManager {
  private workspaceRoot: string;
  private checkpoints: Map<string, Checkpoint> = new Map();
  private ignoredPatterns = ['node_modules', '.git', 'dist', '.cache', '.turbo', '.next'];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = path.resolve(newRoot);
    this.checkpoints.clear();
  }

  private isIgnored(relPath: string): boolean {
    const parts = relPath.split(/[/\\]/);
    return parts.some((p) => this.ignoredPatterns.includes(p));
  }

  private scanWorkspace(dir: string, fileMap: Map<string, string>): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(this.workspaceRoot, fullPath);

      if (this.isIgnored(relPath)) continue;

      if (entry.isDirectory()) {
        this.scanWorkspace(fullPath, fileMap);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size < 5 * 1024 * 1024) {
            // under 5MB per file
            const content = fs.readFileSync(fullPath, 'utf8');
            fileMap.set(relPath.replace(/\\/g, '/'), content);
          }
        } catch {
          // skip unreadable or binary
        }
      }
    }
  }

  /**
   * Create a snapshot checkpoint of the current workspace state.
   */
  public async createCheckpoint(name?: string): Promise<CheckpointMetadata> {
    const id = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const files = new Map<string, string>();

    this.scanWorkspace(this.workspaceRoot, files);

    let totalBytes = 0;
    for (const [, content] of files) {
      totalBytes += Buffer.byteLength(content);
    }

    const checkpoint: Checkpoint = {
      id,
      name: name || `Checkpoint ${new Date().toLocaleTimeString()}`,
      timestamp: new Date(),
      files,
      fileCount: files.size,
      totalBytes,
    };

    this.checkpoints.set(id, checkpoint);

    return {
      id: checkpoint.id,
      name: checkpoint.name,
      timestamp: checkpoint.timestamp,
      fileCount: checkpoint.fileCount,
      totalBytes: checkpoint.totalBytes,
    };
  }

  /**
   * Compare current workspace state against a checkpoint.
   */
  public async compareChanges(checkpointId: string): Promise<WorkspaceDelta[]> {
    const cp = this.checkpoints.get(checkpointId);
    if (!cp) throw new Error(`Checkpoint ${checkpointId} not found`);

    const currentFiles = new Map<string, string>();
    this.scanWorkspace(this.workspaceRoot, currentFiles);

    const deltas: WorkspaceDelta[] = [];

    // Check for modified and deleted files
    for (const [relPath, origContent] of cp.files) {
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
      if (!cp.files.has(relPath)) {
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
    const cp = this.checkpoints.get(checkpointId);
    if (!cp) throw new Error(`Checkpoint ${checkpointId} not found`);

    const currentFiles = new Map<string, string>();
    this.scanWorkspace(this.workspaceRoot, currentFiles);

    // Delete any files created since the checkpoint
    for (const [relPath] of currentFiles) {
      if (!cp.files.has(relPath)) {
        const fullPath = path.resolve(this.workspaceRoot, relPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }

    // Restore all files from snapshot
    let restoredCount = 0;
    for (const [relPath, content] of cp.files) {
      const fullPath = path.resolve(this.workspaceRoot, relPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(fullPath, content, 'utf8');
      restoredCount++;
    }

    return { success: true, restoredCount };
  }

  public listCheckpoints(): CheckpointMetadata[] {
    return Array.from(this.checkpoints.values()).map((cp) => ({
      id: cp.id,
      name: cp.name,
      timestamp: cp.timestamp,
      fileCount: cp.fileCount,
      totalBytes: cp.totalBytes,
    }));
  }

  public deleteCheckpoint(id: string): boolean {
    return this.checkpoints.delete(id);
  }
}
