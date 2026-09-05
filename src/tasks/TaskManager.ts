/**
 * MaxIDE - Universal Task Manager & Queue
 * Implements Section 29 & 30 of Master Architecture:
 * Manages full lifecycle for all agent and workspace tasks:
 * ACTIVE, PAUSED, WAITING, COMPLETED, FAILED, CANCELLED.
 * Supports task pausing, resumption, retry, and persistent state.
 */

import fs from 'fs';
import path from 'path';
import { CapabilityCategory } from '../capabilities/CapabilityRegistry.js';

export type TaskStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'WAITING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface TaskItem {
  id: string;
  name: string;
  prompt: string;
  status: TaskStatus;
  progressPercent: number;
  statusDetails?: string;
  projectId?: string;
  agentRole: string;
  capability: CapabilityCategory;
  model: string;
  provider: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: any;
  artifactIds: string[];
  error?: string;
  recoverable?: boolean;
}

export class TaskManager {
  private tasks: Map<string, TaskItem> = new Map();
  private storagePath: string;

  constructor(workspaceRoot: string) {
    const metaDir = path.join(workspaceRoot, '.maxide');
    if (!fs.existsSync(metaDir)) {
      try {
        fs.mkdirSync(metaDir, { recursive: true });
      } catch {}
    }
    this.storagePath = path.join(metaDir, 'tasks.json');
    this.loadFromDisk();
  }

  public setWorkspaceRoot(newRoot: string): void {
    const metaDir = path.join(newRoot, '.maxide');
    if (!fs.existsSync(metaDir)) {
      try {
        fs.mkdirSync(metaDir, { recursive: true });
      } catch {}
    }
    this.storagePath = path.join(metaDir, 'tasks.json');
    this.loadFromDisk();
  }

  /**
   * Create and register a new task
   */
  public createTask(params: {
    name: string;
    prompt: string;
    projectId?: string;
    agentRole?: string;
    capability?: CapabilityCategory;
    model?: string;
    provider?: string;
  }): TaskItem {
    const id = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    const task: TaskItem = {
      id,
      name: params.name,
      prompt: params.prompt,
      status: 'ACTIVE',
      progressPercent: 0,
      statusDetails: 'Task initialized',
      projectId: params.projectId,
      agentRole: params.agentRole || 'GeneralAgent',
      capability: params.capability || 'SOFTWARE_ENGINEERING',
      model: params.model || 'AUTO',
      provider: params.provider || 'MaxIDE Gateway',
      startedAt: now,
      updatedAt: now,
      artifactIds: [],
    };

    this.tasks.set(id, task);
    this.saveToDisk();
    return task;
  }

  public updateProgress(id: string, percent: number, statusDetails?: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.progressPercent = Math.max(0, Math.min(100, percent));
    if (statusDetails) task.statusDetails = statusDetails;
    task.updatedAt = new Date().toISOString();
    this.saveToDisk();
  }

  public pauseTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'ACTIVE') return false;

    task.status = 'PAUSED';
    task.statusDetails = 'Paused by user';
    task.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return true;
  }

  public resumeTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task || (task.status !== 'PAUSED' && !task.recoverable)) return false;

    task.status = 'ACTIVE';
    task.recoverable = false;
    task.statusDetails = 'Resumed execution';
    task.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return true;
  }

  public cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    task.status = 'CANCELLED';
    task.statusDetails = 'Cancelled by user';
    task.completedAt = new Date().toISOString();
    task.updatedAt = task.completedAt;
    this.saveToDisk();
    return true;
  }

  public retryTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    task.status = 'ACTIVE';
    task.progressPercent = 0;
    task.statusDetails = 'Retrying execution';
    task.error = undefined;
    task.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return true;
  }

  public completeTask(id: string, result?: any, artifactIds: string[] = []): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = 'COMPLETED';
    task.progressPercent = 100;
    task.statusDetails = 'Completed successfully';
    task.result = result;
    if (artifactIds.length > 0) {
      task.artifactIds = Array.from(new Set([...task.artifactIds, ...artifactIds]));
    }
    task.completedAt = new Date().toISOString();
    task.updatedAt = task.completedAt;
    this.saveToDisk();
  }

  public failTask(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = 'FAILED';
    task.error = error;
    task.statusDetails = `Failed: ${error}`;
    task.completedAt = new Date().toISOString();
    task.updatedAt = task.completedAt;
    this.saveToDisk();
  }

  public getTask(id: string): TaskItem | undefined {
    return this.tasks.get(id);
  }

  public listTasks(filter?: { status?: TaskStatus; projectId?: string }): TaskItem[] {
    let list = Array.from(this.tasks.values());
    if (filter?.status) list = list.filter(t => t.status === filter.status);
    if (filter?.projectId) list = list.filter(t => t.projectId === filter.projectId);
    return list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  public getActiveTasks(): TaskItem[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'ACTIVE' || t.status === 'WAITING');
  }

  public getRecoverableTasks(): TaskItem[] {
    return Array.from(this.tasks.values()).filter(t => t.recoverable || t.status === 'PAUSED');
  }

  private saveToDisk(): void {
    try {
      const data = Array.from(this.tasks.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {}
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const list: TaskItem[] = JSON.parse(raw);
        this.tasks.clear();
        for (const t of list) {
          // If a task was active when server exited, mark it as recoverable
          if (t.status === 'ACTIVE') {
            t.status = 'PAUSED';
            t.recoverable = true;
            t.statusDetails = 'Interrupted by session shutdown (Recoverable)';
          }
          this.tasks.set(t.id, t);
        }
      }
    } catch {}
  }
}
