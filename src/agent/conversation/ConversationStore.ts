/**
 * MaxIDE - Unlimited AI Provider Platform
 * Persistent Conversation Store & Resume Manager
 * 
 * Preserves agent conversations, task status, tool events,
 * artifacts, and execution state across IDE restarts.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PathManager } from '../../config/PathManager.js';

export interface ChatMessageRecord {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  autoModel?: {
    modelId: string;
    modelName: string;
    category: string;
    rationale: string;
  };
  stepsCompleted?: number;
  openFile?: string;
  openPreview?: string;
}

export type ConversationTaskStatus =
  | 'WORKING'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'PAUSED'
  | 'INTERRUPTED';

export interface ConversationRecord {
  id: string;
  projectId: string;
  title: string;
  taskPrompt: string;
  taskStatus: ConversationTaskStatus;
  modelId: string;
  providerId?: string;
  autonomyMode: 'ASK' | 'ASSIST' | 'AGENT' | 'AUTONOMOUS';
  messages: ChatMessageRecord[];
  toolEvents: Array<{
    timestamp: string;
    type: string;
    summary: string;
    details?: any;
  }>;
  artifacts: Array<{
    path: string;
    name: string;
    type: string;
  }>;
  checkpointId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export class ConversationStore {
  private baseDir: string;
  private indexFile: string;
  private index: Map<string, { id: string; projectId: string; title: string; status: ConversationTaskStatus; updatedAt: string }> = new Map();

  constructor(customDir?: string) {
    this.baseDir = customDir || PathManager.getInstance().getConversationsDir();
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    this.indexFile = path.join(this.baseDir, 'index.json');
    this.loadIndex();
    this.markInterruptedTasks();
  }

  private loadIndex(): void {
    if (fs.existsSync(this.indexFile)) {
      try {
        const raw = fs.readFileSync(this.indexFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            this.index.set(item.id, item);
          }
        }
      } catch (err) {
        console.warn('[ConversationStore] Failed to parse conversation index:', err);
      }
    }
  }

  private saveIndex(): void {
    try {
      const list = Array.from(this.index.values());
      fs.writeFileSync(this.indexFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[ConversationStore] Failed to save conversation index:', err);
    }
  }

  /**
   * Mark any tasks left in 'WORKING' state when MaxIDE was closed as 'INTERRUPTED'
   */
  public markInterruptedTasks(): void {
    let changed = false;
    for (const [id, meta] of this.index) {
      if (meta.status === 'WORKING') {
        meta.status = 'INTERRUPTED';
        changed = true;
        const full = this.getConversation(id);
        if (full && full.taskStatus === 'WORKING') {
          full.taskStatus = 'INTERRUPTED';
          this.saveConversation(full, false);
        }
      }
    }
    if (changed) {
      this.saveIndex();
    }
  }

  public getInterruptedTasks(projectId?: string): ConversationRecord[] {
    const results: ConversationRecord[] = [];
    for (const [id, meta] of this.index) {
      if (meta.status === 'INTERRUPTED') {
        if (!projectId || meta.projectId === projectId) {
          const conv = this.getConversation(id);
          if (conv) results.push(conv);
        }
      }
    }
    return results;
  }

  public createConversation(options: {
    projectId: string;
    taskPrompt: string;
    modelId: string;
    providerId?: string;
    autonomyMode?: 'ASK' | 'ASSIST' | 'AGENT' | 'AUTONOMOUS';
  }): ConversationRecord {
    const id = `conv-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const title = options.taskPrompt.length > 60
      ? `${options.taskPrompt.slice(0, 57)}...`
      : options.taskPrompt;

    const record: ConversationRecord = {
      id,
      projectId: options.projectId,
      title,
      taskPrompt: options.taskPrompt,
      taskStatus: 'WORKING',
      modelId: options.modelId,
      providerId: options.providerId,
      autonomyMode: options.autonomyMode || 'AUTONOMOUS',
      messages: [
        {
          id: `msg-${Date.now()}`,
          role: 'user',
          content: options.taskPrompt,
          timestamp: new Date().toISOString(),
        }
      ],
      toolEvents: [],
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.saveConversation(record);
    return record;
  }

  public saveConversation(record: ConversationRecord, updateIndexFile: boolean = true): void {
    record.updatedAt = new Date().toISOString();
    const filePath = path.join(this.baseDir, `${record.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

    this.index.set(record.id, {
      id: record.id,
      projectId: record.projectId,
      title: record.title,
      status: record.taskStatus,
      updatedAt: record.updatedAt,
    });

    if (updateIndexFile) {
      this.saveIndex();
    }
  }

  public getConversation(id: string): ConversationRecord | undefined {
    const filePath = path.join(this.baseDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return undefined;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  public listByProject(projectId: string): ConversationRecord[] {
    const results: ConversationRecord[] = [];
    for (const [id, meta] of this.index) {
      if (meta.projectId === projectId) {
        const full = this.getConversation(id);
        if (full) results.push(full);
      }
    }
    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public listAll(limit: number = 50): ConversationRecord[] {
    const results: ConversationRecord[] = [];
    const sorted = Array.from(this.index.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ).slice(0, limit);

    for (const meta of sorted) {
      const full = this.getConversation(meta.id);
      if (full) results.push(full);
    }
    return results;
  }

  public deleteConversation(id: string): boolean {
    const filePath = path.join(this.baseDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
    const deleted = this.index.delete(id);
    this.saveIndex();
    return deleted;
  }

  public search(query: string): ConversationRecord[] {
    const q = query.toLowerCase();
    const matches: ConversationRecord[] = [];

    for (const [id] of this.index) {
      const conv = this.getConversation(id);
      if (!conv) continue;

      const titleMatch = conv.title.toLowerCase().includes(q);
      const promptMatch = conv.taskPrompt.toLowerCase().includes(q);
      const msgMatch = conv.messages.some(m => m.content.toLowerCase().includes(q));
      const artMatch = conv.artifacts.some(a => a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q));

      if (titleMatch || promptMatch || msgMatch || artMatch) {
        matches.push(conv);
      }
    }

    return matches;
  }
}
