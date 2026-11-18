/**
 * MaxIDE - AI-Native Software Engineering Studio
 * Full Suite of Software Engineering Tools
 * 
 * Implements:
 * - list_files, read_file, search_files, create_file, edit_file, delete_file, rename_file
 * - run_command, get_command_output
 * - run_tests, run_linter, run_typecheck, run_build
 * - git_status, git_diff, git_log
 * - start_dev_server, stop_dev_server
 */

import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { ExecutableTool } from '../ToolDefinition.js';
import { WorkspaceManager } from '../../workspace/WorkspaceManager.js';
import { SafeTerminal } from '../safety/SafeTerminal.js';
import { PatchManager } from '../patch/PatchManager.js';
import { CodebaseIntelligence } from '../intelligence/CodebaseIntelligence.js';
import { ContentSanitizer } from '../safety/ContentSanitizer.js';
import { InspectionTracker } from '../safety/InspectionTracker.js';

export class DevServerManager {
  private activeServers: Map<string, { process: ChildProcess; port?: number; command: string; cwd?: string }> = new Map();

  public startServer(id: string, command: string, cwd: string, port?: number): Promise<{ success: boolean; message: string; port?: number }> {
    return new Promise((resolve) => {
      try {
        const resolvedCwd = path.resolve(cwd);
        const child = spawn(command, { cwd: resolvedCwd, shell: true });
        this.activeServers.set(id, { process: child, port, command, cwd: resolvedCwd });

        const cleanup = () => {
          this.activeServers.delete(id);
        };

        child.on('error', cleanup);
        child.on('exit', cleanup);
        child.on('close', cleanup);

        // Give process 500ms to verify startup
        setTimeout(() => {
          if (child.exitCode !== null || child.killed) {
            this.activeServers.delete(id);
            resolve({ success: false, message: `Dev server "${id}" exited immediately with code ${child.exitCode}` });
          } else {
            resolve({
              success: true,
              message: `Dev server "${id}" started with command: "${command}"`,
              port,
            });
          }
        }, 500);
      } catch (err: any) {
        resolve({ success: false, message: `Failed to start server: ${err.message}` });
      }
    });
  }

  public stopServer(id: string): boolean {
    const s = this.activeServers.get(id);
    if (!s) return false;
    try {
      s.process.kill();
    } catch {}
    this.activeServers.delete(id);
    return true;
  }

  public stopServersForWorkspace(cwd: string): void {
    const norm = path.resolve(cwd).toLowerCase();
    for (const [id, s] of this.activeServers.entries()) {
      if (s.cwd && path.resolve(s.cwd).toLowerCase() === norm) {
        try { s.process.kill(); } catch {}
        this.activeServers.delete(id);
      }
    }
  }

  public getActiveServers(forCwd?: string): Array<{ id: string; command: string; port?: number; cwd?: string }> {
    const normCwd = forCwd ? path.resolve(forCwd).toLowerCase() : null;
    const result: Array<{ id: string; command: string; port?: number; cwd?: string }> = [];

    for (const [id, s] of this.activeServers.entries()) {
      // Check if process is still alive
      if ((s.process as any).exitCode !== null && (s.process as any).exitCode !== undefined) {
        this.activeServers.delete(id);
        continue;
      }
      if ((s.process as any).killed) {
        this.activeServers.delete(id);
        continue;
      }
      if (normCwd && s.cwd && path.resolve(s.cwd).toLowerCase() !== normCwd) {
        continue;
      }
      result.push({
        id,
        command: s.command,
        port: s.port,
        cwd: s.cwd,
      });
    }
    return result;
  }
}

import { CheckpointManager } from '../checkpoint/CheckpointManager.js';

function validateAgentFileWrite(filePath: string, content: string, enforceAppQuality: boolean): void {
  const trimmedPath = String(filePath || '').trim();
  if (/^(node|npm|npx|python|python3|git|cd|mkdir|powershell|cmd|bash|sh)\s+/i.test(trimmedPath)) {
    throw new Error(`Invalid filename "${trimmedPath}": looks like a shell command, not a file path. Use "run_command" to execute commands, or provide a clean file path like "index.html" or "app.js".`);
  }
  if (enforceAppQuality && trimmedPath.toLowerCase().endsWith('.html')) {
    const trimmedBody = String(content || '').trim();
    const hasDocStructure = /<html|<body|<style|<script/i.test(trimmedBody);
    if (trimmedBody.length < 260 || !hasDocStructure) {
      throw new Error(`REJECTED_HTML_STUB: Refused to overwrite "${trimmedPath}" with a minimal stub (${trimmedBody.length} chars). Write a COMPLETE, self-contained HTML5 application (<!DOCTYPE html>) with rich modern CSS inside <style>, interactive forms/tables/stats/filters in <body>, realistic sample data, and complete working JavaScript inside <script> with localStorage persistence.`);
    }
  }
}

export function createWorkspaceTools(
  workspaceManager: WorkspaceManager,
  safeTerminal: SafeTerminal,
  patchManager: PatchManager,
  intelligence: CodebaseIntelligence,
  devServerManager: DevServerManager,
  checkpointManager?: CheckpointManager
): ExecutableTool[] {
  return [
    // 1. list_files
    {
      definition: {
        name: 'list_files',
        description: 'List files and directories within a relative workspace path.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to list (default: ".")' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { path?: string }) => {
        const target = args.path || '.';
        try {
          const abs = workspaceManager.resolveSafePath(target);
          if (!fs.existsSync(abs)) return { error: `Directory not found: ${target}` };
          const entries = fs.readdirSync(abs, { withFileTypes: true });
          return {
            path: target,
            entries: entries.map((e) => ({
              name: e.name,
              isDirectory: e.isDirectory(),
            })),
          };
        } catch (err: any) {
          return { error: err.message };
        }
      },
    },

    // 2. read_file
    {
      definition: {
        name: 'read_file',
        description: 'Read the complete text content of a file in the workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative file path' },
          },
          required: ['path'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { path: string }) => {
        if (!args.path) return { error: 'Path is required' };
        const content = workspaceManager.readFile(args.path);
        InspectionTracker.getInstance().recordInspection(
          'global-default-session',
          workspaceManager.getRootPath(),
          args.path
        );
        return { path: args.path, content };
      },
    },

    // 3. search_files
    {
      definition: {
        name: 'search_files',
        description: 'Search for text or regex patterns across files in the codebase.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term or regex pattern' },
            maxResults: { type: 'number', description: 'Max number of results to return (default: 15)' },
          },
          required: ['query'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { query: string; maxResults?: number }) => {
        return intelligence.searchCode(args.query, args.maxResults || 15);
      },
    },

    // 4. create_file
    {
      definition: {
        name: 'create_file',
        description: 'Create a new file with specified content in the workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative file path' },
            content: { type: 'string', description: 'Text content to write' },
          },
          required: ['path', 'content'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: any, context?: any) => {
        const filePath = args.path || args.file || args.filename;
        if (!filePath) {
          throw new Error('Path is required to create a file');
        }
        let content = args.content ?? args.code ?? args.text ?? args.body ?? args.data;
        if (typeof content === 'object' && content !== null) {
          content = content.content ?? content.code ?? content.value ?? content.text ?? JSON.stringify(content);
        }
        if (content === undefined || content === null) {
          throw new Error('Content is required to create a file');
        }
        const rootPath = workspaceManager.getRootPath();
        const preCheck = InspectionTracker.getInstance().validatePreEdit(
          'global-default-session',
          rootPath,
          filePath
        );
        if (!preCheck.allowed) {
          throw new Error(preCheck.message || 'Pre-edit inspection required');
        }
        const sanitization = ContentSanitizer.sanitize(filePath, content);
        if (!sanitization.valid) {
          throw new Error(sanitization.error);
        }
        content = sanitization.sanitized;
        validateAgentFileWrite(filePath, String(content), Boolean(context?.enforceAppQuality));
        workspaceManager.writeFile(filePath, String(content));
        InspectionTracker.getInstance().recordInspection(
          'global-default-session',
          rootPath,
          filePath
        );
        return { success: true, path: filePath, bytesWritten: Buffer.byteLength(String(content)) };
      },
    },

    // 5. edit_file (Creates reversible patch & can auto-apply if approved)
    {
      definition: {
        name: 'edit_file',
        description: 'Modify an existing file by staging a reversible patch with diff review.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative file path' },
            content: { type: 'string', description: 'New modified content for the file' },
            autoApply: { type: 'boolean', description: 'Whether to apply immediately (default true in agent mode)' },
          },
          required: ['path', 'content'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { path: string; content: string; autoApply?: boolean }, context?: any) => {
        if (!args.path) throw new Error('Path is required to edit a file');
        if (args.content === undefined || args.content === null) throw new Error('Content is required to edit a file');
        const rootPath = workspaceManager.getRootPath();
        const preCheck = InspectionTracker.getInstance().validatePreEdit(
          'global-default-session',
          rootPath,
          args.path
        );
        if (!preCheck.allowed) {
          throw new Error(preCheck.message || 'Pre-edit inspection required');
        }
        const sanitization = ContentSanitizer.sanitize(args.path, args.content);
        if (!sanitization.valid) {
          throw new Error(sanitization.error);
        }
        const safeContent = sanitization.sanitized;
        validateAgentFileWrite(args.path, safeContent, Boolean(context?.enforceAppQuality));
        const patch = patchManager.stagePatch([{ path: args.path, modifiedContent: safeContent }]);
        if (args.autoApply !== false) {
          await patchManager.applyPatchSet(patch.id);
          InspectionTracker.getInstance().recordInspection(
            'global-default-session',
            rootPath,
            args.path
          );
          return {
            success: true,
            patchId: patch.id,
            path: args.path,
            status: 'applied',
            diff: patch.files[0]?.unifiedDiff,
          };
        }
        return {
          success: true,
          patchId: patch.id,
          path: args.path,
          status: 'staged_for_review',
          diff: patch.files[0]?.unifiedDiff,
        };
      },
    },

    // 6. delete_file
    {
      definition: {
        name: 'delete_file',
        description: 'Delete a file or directory from the workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to delete' },
          },
          required: ['path'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { path: string }) => {
        const ok = workspaceManager.deleteItem(args.path);
        return { success: ok, path: args.path };
      },
    },

    // 7. rename_file
    {
      definition: {
        name: 'rename_file',
        description: 'Rename or move a file within the workspace.',
        parameters: {
          type: 'object',
          properties: {
            oldPath: { type: 'string', description: 'Current relative path' },
            newPath: { type: 'string', description: 'New relative path' },
          },
          required: ['oldPath', 'newPath'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { oldPath: string; newPath: string }) => {
        const ok = workspaceManager.renameItem(args.oldPath, args.newPath);
        return { success: ok, oldPath: args.oldPath, newPath: args.newPath };
      },
    },

    // 8. run_command
    {
      definition: {
        name: 'run_command',
        description: 'Execute a shell command within the workspace via SafeTerminal.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command string' },
            reason: { type: 'string', description: 'Reason for running command' },
          },
          required: ['command'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED', // SafeTerminal dynamically checks command safety
      timeoutMs: 120000,
      execute: async (args: { command: string; reason?: string }, context?: any) => {
        const cmd = String(args.command || '').trim();
        const lower = cmd.toLowerCase();
        // Intercept blocking foreground static servers or browser-launch commands so run_command NEVER hangs 30s
        if (/\b(http-server|live-server|http\.server|npx\s+serve|serve\s+-|browser-sync)\b/i.test(lower) || /^(start|open|explorer)\s+https?:\/\//i.test(lower)) {
          return {
            command: cmd,
            exitCode: 0,
            stdout: 'MaxIDE already serves this workspace live at /workspace-preview/index.html (no foreground HTTP server needed). Call open_preview with url "/workspace-preview/index.html" to display it immediately.',
            stderr: '',
            durationMs: 5,
            safetyTier: 'SAFE',
            previewUrl: '/workspace-preview/index.html',
          };
        }
        // Intercept long-running dev servers (npm run dev / vite / npm start) and launch in background
        if (/^(npm\s+run\s+dev|npm\s+start|npx\s+vite|vite(\s|$))/i.test(lower)) {
          const root = workspaceManager.getRootPath();
          const hasPkg = fs.existsSync(path.join(root, 'package.json'));
          if (!hasPkg) {
            return {
              command: cmd,
              exitCode: 0,
              stdout: 'Static workspace detected (no package.json dev server). MaxIDE serves index.html directly at /workspace-preview/index.html. Call open_preview now.',
              stderr: '',
              durationMs: 5,
              safetyTier: 'SAFE',
              previewUrl: '/workspace-preview/index.html',
            };
          }
          const srv = await devServerManager.startServer('auto-dev-' + Date.now(), cmd, root);
          return {
            command: cmd,
            exitCode: srv.success ? 0 : 1,
            stdout: srv.message,
            stderr: srv.success ? '' : srv.message,
            durationMs: 500,
            safetyTier: 'SAFE',
            previewUrl: srv.port ? `http://127.0.0.1:${srv.port}` : '/workspace-preview/index.html',
          };
        }
        // Intercept node/python server scripts or browser client scripts to prevent synchronous hangs
        const scriptMatch = cmd.match(/^(?:node|python|py)\s+([^\s]+)/i);
        if (scriptMatch) {
          const scriptFile = scriptMatch[1].replace(/["']/g, '');
          const root = workspaceManager.getRootPath();
          const targetPath = path.isAbsolute(scriptFile) ? scriptFile : path.join(root, scriptFile);
          if (fs.existsSync(targetPath)) {
            try {
              const content = fs.readFileSync(targetPath, 'utf8');
              const isServer = /\.(listen|run|serve)\s*\(|http\.createserver|express\s*\(|fastify\s*\(|flask\s*\(/i.test(content);
              const isBrowserScript = /\b(document\.|window\.|localStorage\.|sessionStorage\.)/i.test(content) && !content.includes('jsdom');

              if (isBrowserScript && !isServer) {
                return {
                  command: cmd,
                  exitCode: 0,
                  stdout: `Client-side browser script detected ("${scriptFile}" references DOM APIs). MaxIDE serves this workspace live at /workspace-preview/index.html. Call open_preview to interact with it.`,
                  stderr: '',
                  durationMs: 5,
                  safetyTier: 'SAFE',
                  previewUrl: '/workspace-preview/index.html',
                };
              }

              if (isServer) {
                const portMatch = content.match(/\.(listen|run)\s*\(\s*(\d{4,5})/i);
                const detectedPort = portMatch ? parseInt(portMatch[2], 10) : undefined;
                const srv = await devServerManager.startServer('server-' + Date.now(), cmd, root, detectedPort);
                return {
                  command: cmd,
                  exitCode: srv.success ? 0 : 1,
                  stdout: srv.message + (detectedPort ? ` (Listening on port ${detectedPort})` : ''),
                  stderr: srv.success ? '' : srv.message,
                  durationMs: 500,
                  safetyTier: 'SAFE',
                  previewUrl: detectedPort ? `http://localhost:${detectedPort}` : '/workspace-preview/index.html',
                };
              }
            } catch {}
          }
        }

        const autoBypass = context?.autonomyMode === 'AUTONOMOUS';
        return safeTerminal.executeCommand(cmd, { reason: args.reason, bypassApproval: autoBypass, timeoutMs: 60000 });
      },
    },

    // 9. get_command_output
    {
      definition: {
        name: 'get_command_output',
        description: 'Inspect command output and terminal history.',
        parameters: {
          type: 'object',
          properties: {
            lastLines: { type: 'number', description: 'Number of lines to retrieve' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { lastLines?: number }) => {
        return { status: 'ok', message: 'Terminal active' };
      },
    },

    // 10. run_tests
    {
      definition: {
        name: 'run_tests',
        description: 'Run project test suite (npm test, pytest, etc.).',
        parameters: {
          type: 'object',
          properties: {
            customCommand: { type: 'string', description: 'Optional custom test command' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { customCommand?: string }) => {
        const cmd = args.customCommand || 'npm test';
        return safeTerminal.executeCommand(cmd, { bypassApproval: true });
      },
    },

    // 11. run_linter
    {
      definition: {
        name: 'run_linter',
        description: 'Run project linter to check for syntax and style issues.',
        parameters: {
          type: 'object',
          properties: {
            customCommand: { type: 'string', description: 'Optional linter command' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { customCommand?: string }) => {
        const cmd = args.customCommand || 'npm run lint';
        return safeTerminal.executeCommand(cmd, { bypassApproval: true });
      },
    },

    // 12. run_typecheck
    {
      definition: {
        name: 'run_typecheck',
        description: 'Run TypeScript compiler type-check (tsc --noEmit).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      permissionLevel: 'SAFE',
      execute: async () => {
        return safeTerminal.executeCommand('npx tsc --noEmit', { bypassApproval: true });
      },
    },

    // 13. run_build
    {
      definition: {
        name: 'run_build',
        description: 'Run project build command (npm run build, etc.).',
        parameters: {
          type: 'object',
          properties: {
            customCommand: { type: 'string', description: 'Optional build command' },
          },
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { customCommand?: string }) => {
        const cmd = args.customCommand || 'npm run build';
        return safeTerminal.executeCommand(cmd);
      },
    },

    // 14. git_status
    {
      definition: {
        name: 'git_status',
        description: 'Get current Git repository status (modified, added, untracked files).',
        parameters: { type: 'object', properties: {} },
      },
      permissionLevel: 'SAFE',
      execute: async () => {
        return workspaceManager.getGitStatus();
      },
    },

    // 15. git_diff
    {
      definition: {
        name: 'git_diff',
        description: 'Get unstaged or staged Git diffs for modified files.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Optional file path' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { path?: string }) => {
        return { diff: await workspaceManager.getGitDiff(args.path) };
      },
    },

    // 16. git_log
    {
      definition: {
        name: 'git_log',
        description: 'Get recent Git commit history.',
        parameters: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of commits (default: 8)' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { count?: number }) => {
        return { commits: await workspaceManager.getGitLog(args.count || 8) };
      },
    },

    // 17. start_dev_server
    {
      definition: {
        name: 'start_dev_server',
        description: 'Start a development server process in the background.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Server identifier (e.g. "web")' },
            command: { type: 'string', description: 'Start command (e.g. "npm run dev")' },
            port: { type: 'number', description: 'Port number (e.g. 3000)' },
          },
          required: ['id', 'command'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { id: string; command: string; port?: number }) => {
        return devServerManager.startServer(args.id, args.command, workspaceManager.getRootPath(), args.port);
      },
    },

    // 18. stop_dev_server
    {
      definition: {
        name: 'stop_dev_server',
        description: 'Stop a running development server process.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Server identifier' },
          },
          required: ['id'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { id: string }) => {
        const ok = devServerManager.stopServer(args.id);
        return { success: ok, id: args.id };
      },
    },

    // 19. create_directory
    {
      definition: {
        name: 'create_directory',
        description: 'Create a new directory (and any parent directories) in the workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path of directory to create' },
          },
          required: ['path'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { path: string }) => {
        const abs = path.resolve(workspaceManager.getRootPath(), args.path);
        fs.mkdirSync(abs, { recursive: true });
        return { success: true, path: args.path, message: `Directory created: ${args.path}` };
      },
    },

    // 20. install_dependencies
    {
      definition: {
        name: 'install_dependencies',
        description: 'Install project packages and dependencies via npm or yarn.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Install command (default: "npm install")' },
          },
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { command?: string }) => {
        const cmd = args.command || 'npm install';
        return safeTerminal.executeCommand(cmd);
      },
    },

    // 21. git_commit
    {
      definition: {
        name: 'git_commit',
        description: 'Stage all changes and create a Git commit with a descriptive message.',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Commit message' },
          },
          required: ['message'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { message: string }) => {
        return workspaceManager.gitCommit(args.message);
      },
    },

    // 22. create_checkpoint
    {
      definition: {
        name: 'create_checkpoint',
        description: 'Take a complete workspace snapshot before making substantial changes.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Checkpoint name/label' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { name?: string }) => {
        if (!checkpointManager) return { error: 'CheckpointManager not configured' };
        const cp = await checkpointManager.createCheckpoint(args.name || `Checkpoint-${Date.now()}`);
        return { success: true, id: cp.id, name: cp.name, fileCount: cp.fileCount };
      },
    },

    // 23. rollback_checkpoint
    {
      definition: {
        name: 'rollback_checkpoint',
        description: 'Restore the workspace to a previously saved checkpoint snapshot.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Checkpoint identifier to restore' },
          },
          required: ['id'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { id: string }) => {
        if (!checkpointManager) return { error: 'CheckpointManager not configured' };
        return checkpointManager.restoreCheckpoint(args.id);
      },
    },

    // 24. open_file
    {
      definition: {
        name: 'open_file',
        description: 'Open a workspace file in the MaxIDE Monaco editor tab for the user to view or edit.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path of file to open in editor' },
          },
          required: ['path'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { path: string }) => {
        return {
          success: true,
          action: 'open_file',
          path: args.path,
          message: `Opened "${args.path}" in editor.`
        };
      },
    },

    // 25. open_preview
    {
      definition: {
        name: 'open_preview',
        description: 'Open the live web preview or browser inspector for a workspace HTML page or dev server URL.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL or path to preview (default: "/workspace-preview/index.html")' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { url?: string }) => {
        const previewUrl = args.url || '/workspace-preview/index.html';
        return {
          success: true,
          action: 'open_preview',
          url: previewUrl,
          message: `Opened live browser preview at ${previewUrl}.`
        };
      },
    },
  ];
}
