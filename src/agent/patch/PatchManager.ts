/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Reversible AI File Editing & Patch Manager
 * 
 * Generates unified diffs for AI file modifications.
 * Allows granular Apply, Reject, and Revert per file or patch set.
 */

import fs from 'fs';
import path from 'path';

export interface FileDiffChunk {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface FilePatch {
  path: string;
  originalContent: string;
  modifiedContent: string;
  diffChunks: FileDiffChunk[];
  unifiedDiff: string;
  additions: number;
  deletions: number;
  status: 'pending' | 'applied' | 'rejected';
}

export interface PatchSet {
  id: string;
  title: string;
  timestamp: Date;
  files: FilePatch[];
  status: 'pending' | 'applied' | 'partially_applied' | 'rejected';
}

export class PatchManager {
  private workspaceRoot: string;
  private patchSets: Map<string, PatchSet> = new Map();
  private onPatchStagedCallback?: (patch: PatchSet) => void;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = path.resolve(newRoot);
  }

  public setOnPatchStaged(cb: (patch: PatchSet) => void): void {
    this.onPatchStagedCallback = cb;
  }

  /**
   * Calculate a clean line-based unified diff.
   */
  public computeDiff(original: string, modified: string): {
    diffChunks: FileDiffChunk[];
    unifiedDiff: string;
    additions: number;
    deletions: number;
  } {
    const oldLines = original.split('\n');
    const newLines = modified.split('\n');

    const diffChunks: FileDiffChunk[] = [];
    let additions = 0;
    let deletions = 0;

    // Simple LCS / Myers-style line diffing
    let i = 0;
    let j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        diffChunks.push({
          type: 'context',
          content: oldLines[i],
          oldLineNumber: i + 1,
          newLineNumber: j + 1,
        });
        i++;
        j++;
      } else {
        // Look ahead
        let foundMatchInNew = -1;
        for (let k = j + 1; k < Math.min(j + 5, newLines.length); k++) {
          if (oldLines[i] === newLines[k]) {
            foundMatchInNew = k;
            break;
          }
        }

        if (foundMatchInNew !== -1) {
          while (j < foundMatchInNew) {
            diffChunks.push({ type: 'add', content: newLines[j], newLineNumber: j + 1 });
            additions++;
            j++;
          }
        } else if (i < oldLines.length) {
          diffChunks.push({ type: 'delete', content: oldLines[i], oldLineNumber: i + 1 });
          deletions++;
          i++;
        } else if (j < newLines.length) {
          diffChunks.push({ type: 'add', content: newLines[j], newLineNumber: j + 1 });
          additions++;
          j++;
        }
      }
    }

    const unifiedDiff = diffChunks
      .map((c) => {
        if (c.type === 'add') return `+${c.content}`;
        if (c.type === 'delete') return `-${c.content}`;
        return ` ${c.content}`;
      })
      .join('\n');

    return { diffChunks, unifiedDiff, additions, deletions };
  }

  /**
   * Stage proposed file modifications into a PatchSet without altering files on disk yet.
   */
  public stagePatch(
    fileChanges: Array<{ path: string; modifiedContent: string }>,
    title?: string
  ): PatchSet {
    const id = `patch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const filePatches: FilePatch[] = [];

    for (const change of fileChanges) {
      const fullPath = path.resolve(this.workspaceRoot, change.path);
      let originalContent = '';
      if (fs.existsSync(fullPath)) {
        originalContent = fs.readFileSync(fullPath, 'utf8');
      }

      const diffResult = this.computeDiff(originalContent, change.modifiedContent);

      filePatches.push({
        path: change.path,
        originalContent,
        modifiedContent: change.modifiedContent,
        diffChunks: diffResult.diffChunks,
        unifiedDiff: diffResult.unifiedDiff,
        additions: diffResult.additions,
        deletions: diffResult.deletions,
        status: 'pending',
      });
    }

    const patchSet: PatchSet = {
      id,
      title: title || `AI Modifications (${filePatches.length} file${filePatches.length > 1 ? 's' : ''})`,
      timestamp: new Date(),
      files: filePatches,
      status: 'pending',
    };

    this.patchSets.set(id, patchSet);
    if (this.onPatchStagedCallback) this.onPatchStagedCallback(patchSet);

    return patchSet;
  }

  /**
   * Apply all files in a patch set to disk.
   */
  public async applyPatchSet(patchId: string): Promise<{ success: boolean; appliedFiles: string[] }> {
    const patch = this.patchSets.get(patchId);
    if (!patch) throw new Error(`Patch ${patchId} not found`);

    const appliedFiles: string[] = [];

    for (const file of patch.files) {
      if (file.status === 'rejected') continue;
      const fullPath = path.resolve(this.workspaceRoot, file.path);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, file.modifiedContent, 'utf8');
      file.status = 'applied';
      appliedFiles.push(file.path);
    }

    patch.status = 'applied';
    return { success: true, appliedFiles };
  }

  /**
   * Apply a single file within a patch set.
   */
  public async applyFile(patchId: string, filePath: string): Promise<boolean> {
    const patch = this.patchSets.get(patchId);
    if (!patch) return false;

    const file = patch.files.find((f) => f.path === filePath);
    if (!file) return false;

    const fullPath = path.resolve(this.workspaceRoot, file.path);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(fullPath, file.modifiedContent, 'utf8');
    file.status = 'applied';

    const allApplied = patch.files.every((f) => f.status === 'applied');
    patch.status = allApplied ? 'applied' : 'partially_applied';
    return true;
  }

  /**
   * Reject a single file.
   */
  public rejectFile(patchId: string, filePath: string): boolean {
    const patch = this.patchSets.get(patchId);
    if (!patch) return false;

    const file = patch.files.find((f) => f.path === filePath);
    if (!file) return false;

    file.status = 'rejected';
    const allRejected = patch.files.every((f) => f.status === 'rejected');
    if (allRejected) patch.status = 'rejected';
    return true;
  }

  /**
   * Reject the entire patch set.
   */
  public rejectPatchSet(patchId: string): boolean {
    const patch = this.patchSets.get(patchId);
    if (!patch) return false;

    for (const file of patch.files) {
      file.status = 'rejected';
    }
    patch.status = 'rejected';
    return true;
  }

  /**
   * Revert an applied patch set back to its original state.
   */
  public async revertPatchSet(patchId: string): Promise<boolean> {
    const patch = this.patchSets.get(patchId);
    if (!patch) return false;

    for (const file of patch.files) {
      const fullPath = path.resolve(this.workspaceRoot, file.path);
      if (file.originalContent) {
        fs.writeFileSync(fullPath, file.originalContent, 'utf8');
      } else {
        // Was a newly created file
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
      file.status = 'pending';
    }

    patch.status = 'pending';
    return true;
  }

  public getPatch(id: string): PatchSet | undefined {
    return this.patchSets.get(id);
  }

  public getPendingPatches(): PatchSet[] {
    return Array.from(this.patchSets.values()).filter((p) => p.status === 'pending');
  }

  public getAllPatches(): PatchSet[] {
    return Array.from(this.patchSets.values());
  }
}
