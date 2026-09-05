/**
 * MaxIDE - Unlimited AI Provider Platform
 * Terminal & Command Execution Tools
 */

import { exec } from 'child_process';
import { ExecutableTool } from '../ToolDefinition.js';

export function createTerminalTools(workspaceRoot: string): ExecutableTool[] {
  return [
    {
      definition: {
        name: 'executeCommand',
        description: 'Execute a shell command within the project workspace and return stdout/stderr.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command line to run' },
          },
          required: ['command'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { command: string }) => {
        return new Promise((resolve) => {
          exec(args.command, { cwd: workspaceRoot, timeout: 20000 }, (error, stdout, stderr) => {
            resolve({
              command: args.command,
              exitCode: error ? error.code || 1 : 0,
              stdout: stdout || '',
              stderr: stderr || '',
              error: error ? error.message : undefined,
            });
          });
        });
      },
    },
  ];
}
