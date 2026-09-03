/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Advanced Tool Framework with Schema Validation, Permission Tiers & Safety
 */

import { ToolDefinition } from '../ai/core/AIRequest.js';

export type PermissionLevel = 'SAFE' | 'APPROVAL_REQUIRED' | 'BLOCKED';

export interface ToolActivityLog {
  id: string;
  timestamp: Date;
  toolName: string;
  arguments: Record<string, any>;
  permissionLevel: PermissionLevel;
  approved?: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'denied';
  durationMs?: number;
  resultSummary?: string;
  error?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
  permissionLevel: PermissionLevel;
  activityLog: ToolActivityLog;
}

export interface ExecutableTool {
  definition: ToolDefinition;
  permissionLevel: PermissionLevel;
  timeoutMs?: number;
  validate?: (args: any) => { valid: boolean; error?: string };
  execute: (args: any, context?: any) => Promise<any>;
}

export class ToolRegistry {
  private tools: Map<string, ExecutableTool> = new Map();
  private activityLogs: ToolActivityLog[] = [];
  private onActivityCallback?: (log: ToolActivityLog) => void;

  public setOnActivity(cb: (log: ToolActivityLog) => void): void {
    this.onActivityCallback = cb;
  }

  public registerTool(tool: ExecutableTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  public getTool(name: string): ExecutableTool | undefined {
    return this.tools.get(name);
  }

  public getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  public getAllTools(): ExecutableTool[] {
    return Array.from(this.tools.values());
  }

  public getActivityLogs(): ToolActivityLog[] {
    return [...this.activityLogs];
  }

  /**
   * Execute tool with schema validation, timeout protection, and activity tracking.
   */
  public async execute(name: string, args: any, context?: any): Promise<ToolExecutionResult> {
    const t0 = Date.now();
    const tool = this.tools.get(name);

    const log: ToolActivityLog = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
      toolName: name,
      arguments: args || {},
      permissionLevel: tool?.permissionLevel || 'APPROVAL_REQUIRED',
      status: 'running',
    };

    if (this.onActivityCallback) this.onActivityCallback(log);

    if (!tool) {
      log.status = 'failed';
      log.error = `Tool "${name}" is not registered.`;
      log.durationMs = Date.now() - t0;
      this.activityLogs.push(log);
      return {
        success: false,
        error: log.error,
        durationMs: log.durationMs,
        permissionLevel: 'BLOCKED',
        activityLog: log,
      };
    }

    // 1. Validation
    if (tool.validate) {
      const val = tool.validate(args);
      if (!val.valid) {
        log.status = 'failed';
        log.error = `Schema validation failed for tool "${name}": ${val.error}`;
        log.durationMs = Date.now() - t0;
        this.activityLogs.push(log);
        return {
          success: false,
          error: log.error,
          durationMs: log.durationMs,
          permissionLevel: tool.permissionLevel,
          activityLog: log,
        };
      }
    }

    // 2. Permission check
    if (tool.permissionLevel === 'BLOCKED') {
      log.status = 'denied';
      log.error = `Tool "${name}" is BLOCKED by workspace safety policy.`;
      log.durationMs = Date.now() - t0;
      this.activityLogs.push(log);
      return {
        success: false,
        error: log.error,
        durationMs: log.durationMs,
        permissionLevel: 'BLOCKED',
        activityLog: log,
      };
    }

    // 3. Execution with timeout
    const timeoutMs = tool.timeoutMs || 30000;
    try {
      const executePromise = tool.execute(args, context);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const result = await Promise.race([executePromise, timeoutPromise]);
      const durationMs = Date.now() - t0;

      log.status = 'completed';
      log.durationMs = durationMs;
      log.resultSummary = typeof result === 'string'
        ? result.slice(0, 150)
        : JSON.stringify(result).slice(0, 150);

      this.activityLogs.push(log);
      if (this.onActivityCallback) this.onActivityCallback(log);

      return {
        success: true,
        result,
        durationMs,
        permissionLevel: tool.permissionLevel,
        activityLog: log,
      };
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      log.status = 'failed';
      log.error = err?.message || 'Execution failed';
      log.durationMs = durationMs;

      this.activityLogs.push(log);
      if (this.onActivityCallback) this.onActivityCallback(log);

      return {
        success: false,
        error: log.error,
        durationMs,
        permissionLevel: tool.permissionLevel,
        activityLog: log,
      };
    }
  }
}
