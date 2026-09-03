/**
 * Orbit IDE - Unlimited AI Provider Platform
 * File System Tools for Autonomous Coding Agent
 */

import fs from 'fs';
import path from 'path';
import { ExecutableTool } from '../ToolDefinition.js';

export function createFileSystemTools(workspaceRoot: string): ExecutableTool[] {
  return [
    {
      definition: {
        name: 'readFile',
        description: 'Read the text content of a file within the project workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to the file' },
          },
          required: ['path'],
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { path: string }) => {
        const fullPath = path.resolve(workspaceRoot, args.path);
        if (!fs.existsSync(fullPath)) {
          return { error: `File not found: ${args.path}` };
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        return { path: args.path, content };
      },
    },
    {
      definition: {
        name: 'writeFile',
        description: 'Write or overwrite text content into a file within the project workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to the file' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
      },
      permissionLevel: 'APPROVAL_REQUIRED',
      execute: async (args: { path: string; content: string }) => {
        const fullPath = path.resolve(workspaceRoot, args.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, args.content, 'utf8');
        return { path: args.path, success: true, bytesWritten: Buffer.byteLength(args.content) };
      },
    },
    {
      definition: {
        name: 'listDir',
        description: 'List files and folders within a directory in the project workspace.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to directory (default ".")' },
          },
        },
      },
      permissionLevel: 'SAFE',
      execute: async (args: { path?: string }) => {
        const fullPath = path.resolve(workspaceRoot, args.path || '.');
        if (!fs.existsSync(fullPath)) {
          return { error: `Directory not found: ${args.path || '.'}` };
        }
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        return {
          path: args.path || '.',
          entries: entries.map(e => ({
            name: e.name,
            isDirectory: e.isDirectory(),
          })),
        };
      },
    },
  ];
}
