/**
 * MaxIDE - Unlimited AI Provider Platform
 * Persistent Conversation Store & Resume Manager
 * 
 * Preserves agent conversations, task status, tool events,
 * artifacts, and execution state across IDE restarts with AtomicStorage.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PathManager } from '../../config/PathManager.js';
import { AtomicStorage } from '../../storage/AtomicStorage.js';

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
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'PAUSED'
  | 'RECOVERABLE';

export interface ConversationTimestamps {
  created: string;
  lastActivity: string;
  completed?: string;
}

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
  timestamps: ConversationTimestamps;
  clarificationQuestions?: any[];
  clarificationAnswers?: Record<string, string>;
  pendingClarification?: {
    originalPrompt: string;
    questions: any[];
    answers: Record<string, string>;
    timestamp: string;
  };
  plan?: any;
  toolCalls?: Array<{
    id: string;
    stepNumber: number;
    name: string;
    arguments: any;
    timestamp: string;
  }>;
  toolResults?: Array<{
    toolCallId?: string;
    name: string;
    result: any;
    timestamp: string;
  }>;
  errors?: Array<{
    stepNumber: number;
    category: string;
    message: string;
    timestamp: string;
  }>;
  recoveryAttempts?: Array<{
    stepNumber: number;
    type: string;
    details: string;
    timestamp: string;
  }>;
  filesChanged?: string[];
  commandsExecuted?: Array<{
    command: string;
    exitCode?: number;
    timestamp: string;
  }>;
  browserVerificationResults?: Array<{
    url: string;
    title?: string;
    status?: number;
    timestamp: string;
  }>;
  checkpointIds?: string[];
  lastCheckpointId?: string;
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
  finalSummary?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DateGroupedConversations {
  group: string;
  conversations: ConversationRecord[];
}

export class ConversationStore {
  private baseDir: string;
  private indexFile: string;
  private index: Map<string, {
    id: string;
    projectId: string;
    title: string;
    status: ConversationTaskStatus;
    updatedAt: string;
    modelId?: string;
  }> = new Map();

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
    const raw = AtomicStorage.safeReadJsonSync<any>(this.indexFile, []);
    const list = Array.isArray(raw) ? raw : (raw && raw.id ? [raw] : []);
    for (const item of list) {
      if (item && item.id) {
        this.index.set(item.id, item);
      }
    }
  }

  private saveIndex(): void {
    try {
      const list = Array.from(this.index.values());
      AtomicStorage.atomicWriteJsonSync(this.indexFile, list);
    } catch (err: any) {
      console.warn('[ConversationStore] Failed to save conversation index:', err.message);
    }
  }

  /**
   * Mark any tasks left in 'WORKING' state when MaxIDE was closed as 'INTERRUPTED'
   * NEVER mark as FAILED!
   */
  public markInterruptedTasks(): void {
    this.loadIndex();
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
    this.markInterruptedTasks();
    const results: ConversationRecord[] = [];
    for (const [id, meta] of this.index) {
      if (meta.status === 'INTERRUPTED' || meta.status === 'RECOVERABLE' || meta.status === 'PAUSED') {
        if (!projectId || meta.projectId === projectId) {
          const conv = this.getConversation(id);
          if (conv) results.push(conv);
        }
      }
    }
    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getLatestRecoverableTask(projectId?: string): ConversationRecord | undefined {
    const tasks = this.getInterruptedTasks(projectId);
    return tasks[0];
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

    const now = new Date().toISOString();
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
          timestamp: now,
        }
      ],
      timestamps: {
        created: now,
        lastActivity: now,
      },
      toolCalls: [],
      toolResults: [],
      errors: [],
      recoveryAttempts: [],
      filesChanged: [],
      commandsExecuted: [],
      browserVerificationResults: [],
      checkpointIds: [],
      toolEvents: [],
      artifacts: [],
      createdAt: now,
      updatedAt: now,
    };

    this.saveConversation(record);
    return record;
  }

  public saveConversation(record: ConversationRecord, updateIndexFile: boolean = true, preserveTimestamp: boolean = false): void {
    const now = new Date().toISOString();
    if (!preserveTimestamp) {
      record.updatedAt = now;
    }
    if (!record.timestamps) {
      record.timestamps = {
        created: record.createdAt || record.updatedAt || now,
        lastActivity: record.updatedAt || now,
      };
    } else if (!preserveTimestamp) {
      record.timestamps.lastActivity = now;
    }

    if (record.taskStatus === 'COMPLETED' && !record.timestamps.completed) {
      record.timestamps.completed = record.updatedAt || now;
    }

    const filePath = path.join(this.baseDir, `${record.id}.json`);
    AtomicStorage.atomicWriteJsonSync(filePath, record);

    this.index.set(record.id, {
      id: record.id,
      projectId: record.projectId,
      title: record.title,
      status: record.taskStatus,
      updatedAt: record.updatedAt,
      modelId: record.modelId,
    });

    if (updateIndexFile) {
      this.saveIndex();
    }
  }

  public getConversation(id: string): ConversationRecord | undefined {
    const filePath = path.join(this.baseDir, `${id}.json`);
    const record = AtomicStorage.safeReadJsonSync<ConversationRecord | undefined>(filePath, undefined);
    return record;
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

  /**
   * Multi-Day Conversation Grouping (Today, Yesterday, 3 days ago, Last week, Older)
   */
  public getGroupedByDate(projectId?: string): DateGroupedConversations[] {
    const convs = projectId ? this.listByProject(projectId) : this.listAll(100);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const groups: Record<string, ConversationRecord[]> = {
      'Today': [],
      'Yesterday': [],
      '3 days ago': [],
      'Last week': [],
      'Older': [],
    };

    for (const c of convs) {
      const time = new Date(c.updatedAt || c.createdAt).getTime();
      const diff = now - time;
      if (diff < oneDay) {
        groups['Today'].push(c);
      } else if (diff < 2 * oneDay) {
        groups['Yesterday'].push(c);
      } else if (diff < 4 * oneDay) {
        groups['3 days ago'].push(c);
      } else if (diff < 7 * oneDay) {
        groups['Last week'].push(c);
      } else {
        groups['Older'].push(c);
      }
    }

    const output: DateGroupedConversations[] = [];
    for (const [group, items] of Object.entries(groups)) {
      if (items.length > 0) {
        output.push({ group, conversations: items });
      }
    }
    return output;
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
