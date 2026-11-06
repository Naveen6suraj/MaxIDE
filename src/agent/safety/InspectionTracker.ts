/**
 * MaxIDE - Mandatory Pre-Edit File Inspection Guardrail Tracker
 * Server-side enforcement mechanism ensuring agents never blindly overwrite or edit
 * existing files without first reading and understanding their contents and AST context.
 */

import fs from 'fs';
import path from 'path';
import { WorkspaceManager } from '../../workspace/WorkspaceManager.js';

export interface InspectionRecord {
  filePath: string;
  inspectedAt: string;
  mtimeMs: number;
  sizeBytes: number;
}

export interface PreEditValidationResult {
  allowed: boolean;
  isNewFile: boolean;
  reason?: 'PRE_EDIT_INSPECTION_REQUIRED' | 'INSPECTION_STALE' | 'SECURITY_VIOLATION';
  message?: string;
}

export class InspectionTracker {
  private static instance: InspectionTracker;
  // Map of taskSessionId -> Map of normalizedRelPath -> InspectionRecord
  private taskInspections: Map<string, Map<string, InspectionRecord>> = new Map();
  // Global session fallback if no taskId provided
  private defaultSessionId: string = 'global-default-session';

  public static getInstance(): InspectionTracker {
    if (!InspectionTracker.instance) {
      InspectionTracker.instance = new InspectionTracker();
    }
    return InspectionTracker.instance;
  }

  public normalizeKey(relPath: string): string {
    return relPath.replace(/\\/g, '/').toLowerCase().trim();
  }

  /**
   * Record that a file was inspected (read) in a task session.
   */
  public recordInspection(taskSessionId: string, workspaceRoot: string, relPath: string): void {
    const sessionId = taskSessionId || this.defaultSessionId;
    let sessionMap = this.taskInspections.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map();
      this.taskInspections.set(sessionId, sessionMap);
    }

    try {
      const fullPath = WorkspaceManager.resolveSafePathForRoot(workspaceRoot, relPath);
      let mtimeMs = Date.now();
      let sizeBytes = 0;
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        mtimeMs = stats.mtimeMs;
        sizeBytes = stats.size;
      }

      const key = this.normalizeKey(relPath);
      sessionMap.set(key, {
        filePath: relPath,
        inspectedAt: new Date().toISOString(),
        mtimeMs,
        sizeBytes,
      });
    } catch {}
  }

  /**
   * Check if an inspection record exists for the given file in the session.
   */
  public hasInspected(taskSessionId: string, relPath: string): boolean {
    const sessionId = taskSessionId || this.defaultSessionId;
    const sessionMap = this.taskInspections.get(sessionId);
    if (!sessionMap) return false;
    return sessionMap.has(this.normalizeKey(relPath));
  }

  /**
   * Validate whether editing/writing to a file is authorized based on inspection evidence.
   */
  public validatePreEdit(taskSessionId: string, workspaceRoot: string, relPath: string): PreEditValidationResult {
    let fullPath: string;
    try {
      fullPath = WorkspaceManager.resolveSafePathForRoot(workspaceRoot, relPath);
    } catch (err: any) {
      return {
        allowed: false,
        isNewFile: false,
        reason: 'SECURITY_VIOLATION',
        message: err.message,
      };
    }

    // If file does NOT exist on disk, it is a genuinely new file: creation is authorized
    if (!fs.existsSync(fullPath)) {
      return { allowed: true, isNewFile: true };
    }

    const sessionId = taskSessionId || this.defaultSessionId;
    const sessionMap = this.taskInspections.get(sessionId);
    const key = this.normalizeKey(relPath);
    const record = sessionMap?.get(key);

    if (!record) {
      return {
        allowed: false,
        isNewFile: false,
        reason: 'PRE_EDIT_INSPECTION_REQUIRED',
        message: `Pre-Edit Inspection Required: The target file "${relPath}" exists on disk but has not been inspected. You must read it with read_file before modifying it.`,
      };
    }

    // Check if file on disk was modified after the recorded inspection
    try {
      const stats = fs.statSync(fullPath);
      if (stats.mtimeMs > record.mtimeMs + 50) { // 50ms buffer for filesystem timestamp resolution
        return {
          allowed: false,
          isNewFile: false,
          reason: 'INSPECTION_STALE',
          message: `Pre-Edit Inspection Stale: The file "${relPath}" was modified on disk after inspection. You must call read_file to inspect the latest content before modifying it.`,
        };
      }
    } catch {}

    return { allowed: true, isNewFile: false };
  }

  /**
   * Reset session tracking data.
   */
  public resetSession(taskSessionId: string): void {
    this.taskInspections.delete(taskSessionId || this.defaultSessionId);
  }

  public getInspectedFiles(taskSessionId: string): string[] {
    const sessionMap = this.taskInspections.get(taskSessionId || this.defaultSessionId);
    if (!sessionMap) return [];
    return Array.from(sessionMap.values()).map(r => r.filePath);
  }
}
