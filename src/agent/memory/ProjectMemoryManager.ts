/**
 * MaxIDE APEX — Persistent Project-Specific Memory Manager
 * Stores architecture notes, project instructions, engineering decisions,
 * known issues, task history, and dependencies locally in <workspace>/.maxide/memory.json.
 * Strictly scrubs API keys, tokens, and credentials before persistence.
 */

import fs from 'fs';
import path from 'path';

export interface ProjectMemoryEntry {
  id: string;
  timestamp: string;
  summary: string;
  status?: 'COMPLETED' | 'FAILED' | 'PARTIALLY_COMPLETED' | 'CANCELLED' | 'INTERRUPTED';
  filesChanged?: string[];
}

export interface ProjectMemoryState {
  schemaVersion: number;
  projectName: string;
  architecture: string;
  instructions: string;
  decisions: string[];
  knownIssues: string[];
  dependencies: string[];
  taskHistory: ProjectMemoryEntry[];
  updatedAt: string;
}

export class ProjectMemoryManager {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = path.resolve(newRoot);
  }

  private getMemoryFilePath(): string {
    return path.join(this.workspaceRoot, '.maxide', 'memory.json');
  }

  /**
   * Scrub any sensitive credential patterns before persisting project memory.
   */
  public static sanitizeText(input: string): string {
    if (!input) return '';
    return String(input)
      .replace(/\b(sk-[a-zA-Z0-9_-]{12,})\b/g, '[REDACTED_SECRET]')
      .replace(/\b(AIza[0-9A-Za-z_-]{20,})\b/g, '[REDACTED_SECRET]')
      .replace(/\b(gsk_[0-9A-Za-z_-]{16,})\b/g, '[REDACTED_SECRET]')
      .replace(/\b(ghp_[0-9A-Za-z]{20,})\b/g, '[REDACTED_SECRET]')
      .replace(/(Bearer\s+)[A-Za-z0-9._-]{16,}/gi, '$1[REDACTED_TOKEN]')
      .replace(/(api[_-]?key\s*[:=]\s*['"]?)[^\s'"]{8,}/gi, '$1[REDACTED_SECRET]');
  }

  private createDefaultState(): ProjectMemoryState {
    return {
      schemaVersion: 1,
      projectName: path.basename(this.workspaceRoot) || 'Workspace',
      architecture: '',
      instructions: '',
      decisions: [],
      knownIssues: [],
      dependencies: [],
      taskHistory: [],
      updatedAt: new Date().toISOString(),
    };
  }

  public load(): ProjectMemoryState {
    const file = this.getMemoryFilePath();
    if (!fs.existsSync(file)) {
      return this.createDefaultState();
    }
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...this.createDefaultState(),
        ...parsed,
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        knownIssues: Array.isArray(parsed.knownIssues) ? parsed.knownIssues : [],
        dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
        taskHistory: Array.isArray(parsed.taskHistory) ? parsed.taskHistory : [],
      };
    } catch {
      return this.createDefaultState();
    }
  }

  public save(update: Partial<ProjectMemoryState>): ProjectMemoryState {
    const current = this.load();
    const merged: ProjectMemoryState = {
      ...current,
      ...update,
      architecture: ProjectMemoryManager.sanitizeText(update.architecture ?? current.architecture),
      instructions: ProjectMemoryManager.sanitizeText(update.instructions ?? current.instructions),
      decisions: (update.decisions ?? current.decisions).map((d) => ProjectMemoryManager.sanitizeText(d)).filter(Boolean).slice(0, 50),
      knownIssues: (update.knownIssues ?? current.knownIssues).map((d) => ProjectMemoryManager.sanitizeText(d)).filter(Boolean).slice(0, 50),
      dependencies: (update.dependencies ?? current.dependencies).map((d) => ProjectMemoryManager.sanitizeText(d)).filter(Boolean).slice(0, 100),
      taskHistory: (update.taskHistory ?? current.taskHistory).slice(0, 40),
      updatedAt: new Date().toISOString(),
    };

    const file = this.getMemoryFilePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return merged;
  }

  public recordTask(summary: string, status: ProjectMemoryEntry['status'], filesChanged: string[] = []): void {
    const current = this.load();
    const entry: ProjectMemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      summary: ProjectMemoryManager.sanitizeText(summary).slice(0, 200),
      status,
      filesChanged: Array.from(new Set(filesChanged)).slice(0, 20),
    };
    const nextHistory = [entry, ...current.taskHistory].slice(0, 40);
    this.save({ taskHistory: nextHistory });
  }

  public buildPromptContext(): string {
    const mem = this.load();
    const parts: string[] = [];
    if (mem.architecture) parts.push(`Architecture Notes: ${mem.architecture}`);
    if (mem.instructions) parts.push(`Project Instructions: ${mem.instructions}`);
    if (mem.decisions.length > 0) parts.push(`Decisions: ${mem.decisions.slice(0, 5).join(' | ')}`);
    if (mem.knownIssues.length > 0) parts.push(`Known Issues: ${mem.knownIssues.slice(0, 5).join(' | ')}`);
    if (mem.taskHistory.length > 0) {
      const recent = mem.taskHistory.slice(0, 3).map((t) => `[${t.status}] ${t.summary}`).join('; ');
      parts.push(`Recent Tasks: ${recent}`);
    }
    return parts.join('\n');
  }
}
