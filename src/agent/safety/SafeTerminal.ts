/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Safe Terminal & Command Boundary Guard
 * 
 * Classifies commands into SAFE, APPROVAL_REQUIRED, and BLOCKED.
 * Enforces workspace isolation and manages interactive approval requests.
 */

import { exec, ChildProcess } from 'child_process';
import path from 'path';
import { PermissionLevel } from '../ToolDefinition.js';

export interface CommandApprovalRequest {
  id: string;
  command: string;
  reason: string;
  timestamp: Date;
  permissionLevel: PermissionLevel;
  status: 'pending' | 'allowed_once' | 'allowed_for_task' | 'denied';
  resolve?: (approved: boolean) => void;
}

export interface TerminalExecutionResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  safetyTier: PermissionLevel;
  error?: string;
}

export class SafeTerminal {
  private workspaceRoot: string;
  private allowedForTaskCommands: Set<string> = new Set();
  private pendingApprovals: Map<string, CommandApprovalRequest> = new Map();
  private onApprovalRequested?: (req: CommandApprovalRequest) => void;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = path.resolve(newRoot);
    this.allowedForTaskCommands.clear();
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  public setOnApprovalRequested(callback: (req: CommandApprovalRequest) => void): void {
    this.onApprovalRequested = callback;
  }

  public resetTaskPermissions(): void {
    this.allowedForTaskCommands.clear();
  }

  /**
   * Classify risk level of a command.
   */
  public classifyCommand(command: string): { level: PermissionLevel; reason: string } {
    const trimmed = command.trim();
    const lower = trimmed.toLowerCase();

    // 1. BLOCKED COMMANDS: Destructive or system-wide attacks
    const blockedPatterns = [
      /rm\s+-rf\s+[\/\\]/i,
      /rmdir\s+[\/\\]s\s+[\/\\]q\s+[c-z]:\\/i,
      /format\s+[c-z]:/i,
      /mkfs/i,
      /dd\s+if=/i,
      /shutdown/i,
      /reboot/i,
      /:(){ :|:& };:/i, // fork bomb
      />\s*[\/\\]dev[\/\\]sd[a-z]/i,
      /del\s+\/f\s+\/s\s+\/q\s+[c-z]:\\windows/i,
      /reg\s+delete/i,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(lower)) {
        return {
          level: 'BLOCKED',
          reason: 'Command contains catastrophic system modification patterns.',
        };
      }
    }

    // Path escape detection: attempts to navigate above workspace root
    if (lower.includes('..\\..\\..') || lower.includes('../../../')) {
      return {
        level: 'BLOCKED',
        reason: 'Command attempts to escape project workspace boundary.',
      };
    }

    // 2. Already approved for current task
    if (this.allowedForTaskCommands.has(trimmed)) {
      return { level: 'SAFE', reason: 'Previously approved for this task session.' };
    }

    // 3. SAFE COMMANDS: Read-only, tests, typechecking, linters, and runner scripts within workspace
    const safePrefixes = [
      'git status', 'git log', 'git diff', 'git branch',
      'npm test', 'npm run test', 'npx jest', 'npx vitest', 'npm run lint',
      'tsc --noemit', 'npx tsc --noemit',
      'node -v', 'npm -v', 'git --version', 'python --version',
      'node ', 'python ',
      'dir', 'ls', 'pwd', 'echo', 'cat', 'type', 'head', 'tail',
      'pytest', 'cargo test', 'go test',
    ];

    for (const prefix of safePrefixes) {
      const clean = prefix.trim();
      if (lower === clean || lower.startsWith(clean + ' ')) {
        return { level: 'SAFE', reason: 'Standard non-destructive development or test command.' };
      }
    }

    // 4. APPROVAL REQUIRED: Package installs, file deletions, builds, external commands
    return {
      level: 'APPROVAL_REQUIRED',
      reason: 'Command modifies dependencies, builds binaries, or alters project state.',
    };
  }

  /**
   * Request approval for a command if required.
   */
  public async requestApproval(command: string, reason: string): Promise<boolean> {
    const classification = this.classifyCommand(command);

    if (classification.level === 'BLOCKED') {
      return false;
    }

    if (classification.level === 'SAFE') {
      return true;
    }

    // Create approval request
    return new Promise<boolean>((resolve) => {
      const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const req: CommandApprovalRequest = {
        id,
        command,
        reason: `${reason} (${classification.reason})`,
        timestamp: new Date(),
        permissionLevel: 'APPROVAL_REQUIRED',
        status: 'pending',
        resolve,
      };

      this.pendingApprovals.set(id, req);
      if (this.onApprovalRequested) {
        this.onApprovalRequested(req);
      }
    });
  }

  public resolveApproval(id: string, decision: 'allow_once' | 'allow_for_task' | 'deny' | 'reject' | 'cancel_task'): boolean {
    const req = this.pendingApprovals.get(id);
    if (!req) return false;

    if (decision === 'allow_once') {
      req.status = 'allowed_once';
      if (req.resolve) req.resolve(true);
    } else if (decision === 'allow_for_task') {
      req.status = 'allowed_for_task';
      this.allowedForTaskCommands.add(req.command.trim());
      if (req.resolve) req.resolve(true);
    } else {
      req.status = 'denied';
      if (req.resolve) req.resolve(false);
    }

    this.pendingApprovals.delete(id);
    return true;
  }

  public getPendingApprovals(): CommandApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).map(r => ({
      id: r.id,
      command: r.command,
      reason: r.reason,
      timestamp: r.timestamp,
      permissionLevel: r.permissionLevel,
      status: r.status,
    }));
  }

  /**
   * Execute a command safely in the workspace.
   */
  public async executeCommand(
    command: string,
    options: { timeoutMs?: number; reason?: string; bypassApproval?: boolean } = {}
  ): Promise<TerminalExecutionResult> {
    const t0 = Date.now();
    const classification = this.classifyCommand(command);

    if (classification.level === 'BLOCKED') {
      return {
        command,
        exitCode: 1,
        stdout: '',
        stderr: `[BLOCKED BY SAFE TERMINAL] ${classification.reason}`,
        durationMs: 0,
        safetyTier: 'BLOCKED',
        error: classification.reason,
      };
    }

    if (classification.level === 'APPROVAL_REQUIRED' && !options.bypassApproval) {
      const approved = await this.requestApproval(command, options.reason || 'Agent requested command execution');
      if (!approved) {
        return {
          command,
          exitCode: 1,
          stdout: '',
          stderr: '[TERMINAL PERMISSION DENIED] Command was rejected by the user or security policy.',
          durationMs: Date.now() - t0,
          safetyTier: 'APPROVAL_REQUIRED',
          error: 'User denied command execution',
        };
      }
    }

    const timeout = options.timeoutMs || 45000;

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: this.workspaceRoot,
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - t0;
          resolve({
            command,
            exitCode: error ? error.code || 1 : 0,
            stdout: stdout || '',
            stderr: stderr || '',
            durationMs,
            safetyTier: classification.level,
            error: error ? error.message : undefined,
          });
        }
      );
    });
  }
}
