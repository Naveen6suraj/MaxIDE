/**
 * MaxIDE - Unlimited AI Provider Platform
 * Universal Tool Registry & Schema Definitions
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
    let tool = this.tools.get(name);
    if (!tool) {
      // Universal tool name alias mapping: camelCase <-> snake_case <-> canonical tools
      const aliases: Record<string, string> = {
        // Filesystem
        'writeFile': 'create_file',
        'write_file': 'create_file',
        'createFile': 'create_file',
        'create_file': 'create_file',
        'readFile': 'read_file',
        'read_file': 'read_file',
        'editFile': 'edit_file',
        'edit_file': 'edit_file',
        'listDir': 'list_files',
        'listFiles': 'list_files',
        'list_files': 'list_files',
        'list_dir': 'list_files',
        'deleteFile': 'delete_file',
        'delete_file': 'delete_file',
        'removeFile': 'delete_file',
        'remove_file': 'delete_file',
        'renameFile': 'rename_file',
        'rename_file': 'rename_file',
        'moveFile': 'rename_file',
        'move_file': 'rename_file',
        'createDirectory': 'create_directory',
        'create_directory': 'create_directory',
        'mkdir': 'create_directory',
        'searchFiles': 'search_files',
        'search_files': 'search_files',
        'grep': 'search_files',

        // Terminal & Processes
        'runCommand': 'run_command',
        'run_command': 'run_command',
        'executeCommand': 'run_command',
        'startProcess': 'run_command',
        'start_process': 'run_command',

        // Development
        'installDependencies': 'install_dependencies',
        'install_dependencies': 'install_dependencies',
        'npmInstall': 'install_dependencies',
        'runTests': 'run_tests',
        'run_tests': 'run_tests',
        'test': 'run_tests',
        'runBuild': 'run_build',
        'run_build': 'run_build',
        'build': 'run_build',
        'runLint': 'run_linter',
        'run_lint': 'run_linter',
        'run_linter': 'run_linter',
        'runTypecheck': 'run_typecheck',
        'run_typecheck': 'run_typecheck',
        'startDevServer': 'start_dev_server',
        'start_dev_server': 'start_dev_server',
        'stopDevServer': 'stop_dev_server',
        'stop_dev_server': 'stop_dev_server',

        // Git
        'gitStatus': 'git_status',
        'git_status': 'git_status',
        'gitDiff': 'git_diff',
        'git_diff': 'git_diff',
        'gitLog': 'git_log',
        'git_log': 'git_log',
        'gitCommit': 'git_commit',
        'git_commit': 'git_commit',

        // Browser / Playwright
        'browserNavigate': 'browser_navigate',
        'browser_navigate': 'browser_navigate',
        'navigate': 'browser_navigate',
        'browserScreenshot': 'browser_screenshot',
        'browser_screenshot': 'browser_screenshot',
        'screenshot': 'browser_screenshot',
        'browserInspectDom': 'browser_inspect_dom',
        'browser_inspect_dom': 'browser_inspect_dom',
        'inspectDom': 'browser_inspect_dom',
        'browserClick': 'browser_click',
        'browser_click': 'browser_click',
        'click': 'browser_click',
        'browserFill': 'browser_fill',
        'browser_fill': 'browser_fill',
        'fill': 'browser_fill',

        // Checkpoints & UI Navigation
        'createCheckpoint': 'create_checkpoint',
        'create_checkpoint': 'create_checkpoint',
        'restoreCheckpoint': 'restore_checkpoint',
        'restore_checkpoint': 'restore_checkpoint',
        'openFile': 'open_file',
        'open_file': 'open_file',
        'openPreview': 'open_preview',
        'open_preview': 'open_preview',
      };
      const aliasTarget = aliases[name];
      if (aliasTarget) tool = this.tools.get(aliasTarget);
    }
    return tool;
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

  public isRegistered(name: string): boolean {
    return Boolean(this.getTool(name));
  }

  /**
   * Execute tool with schema validation, timeout protection, and activity tracking.
   */
  public async execute(name: string, args: any, context?: any): Promise<ToolExecutionResult> {
    const t0 = Date.now();
    let tool = this.getTool(name);

    if (!tool && typeof args === 'object' && args !== null) {
      if (args.content !== undefined || args.code !== undefined || (name.includes('.') && (name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.html') || name.endsWith('.json') || name.endsWith('.py')))) {
        tool = this.getTool('create_file');
        args = {
          path: args.path || args.file || (name.includes('.') ? name : `${name}.js`),
          content: args.content ?? args.code ?? '',
        };
      } else if (args.command) {
        tool = this.getTool('run_command');
        args = { command: args.command };
      }
    }

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
