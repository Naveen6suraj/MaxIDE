/**
 * MaxIDE - Production Live Website & Project Preview Routing Manager
 * 
 * Guarantees strict separation between MaxIDE Studio UI and User Application Previews.
 * Features:
 * - Dynamic entry-point auto-detection (root index.html, dist/, public/, src/, subdirectories)
 * - Dev server vs. static preview routing (actual dev server ports e.g. 5173, 3000)
 * - Multi-project isolation (/project-preview/:idOrName/*)
 * - Active workspace preview (/workspace-preview/*)
 * - Generic project/folder routing (e.g. /modern-web-app/index.html)
 * - Centralized resolveSafePath security sandboxing (no path traversal, no UNC/device paths)
 * - Accurate MIME types for all assets (.html, .css, .js, .png, .svg, .json, fonts, media, etc.)
 * - Strict 404 handling: unmatched preview requests NEVER fall through to MaxIDE SPA index.html
 * - Preview identity check: ensures MaxIDE UI markers never leak into user preview pages
 */

import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { WorkspaceManager } from '../../workspace/WorkspaceManager.js';
import { ProjectManager, ProjectMetadata } from '../../projects/ProjectManager.js';
import { DevServerManager } from '../../agent/tools/WorkspaceTools.js';

export interface PreviewInfo {
  type: 'static' | 'dev_server';
  previewUrl: string; // e.g. "/workspace-preview/index.html" or "http://127.0.0.1:5173"
  fullUrl: string; // Absolute browser URL
  entryFile: string; // Relative path e.g. "index.html" or "dist/index.html"
  projectPath: string;
  projectName: string;
  projectId: string;
  port?: number;
  serverRunning: boolean;
}

export class PreviewManager {
  private workspaceManager: WorkspaceManager;
  private projectManager: ProjectManager;
  private devServerManager: DevServerManager;
  private serverPort: number;

  public static readonly MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.wasm': 'application/wasm',
    '.pdf': 'application/pdf',
  };

  constructor(
    workspaceManager: WorkspaceManager,
    projectManager: ProjectManager,
    devServerManager: DevServerManager,
    serverPort: number = 3456
  ) {
    this.workspaceManager = workspaceManager;
    this.projectManager = projectManager;
    this.devServerManager = devServerManager;
    this.serverPort = serverPort;
  }

  public setServerPort(port: number): void {
    this.serverPort = port;
  }

  /**
   * Intelligently detect the application entry point inside a project or workspace directory.
   */
  public detectEntryPoint(rootDir: string): { entryFile: string; relativePath: string } {
    if (!fs.existsSync(rootDir)) {
      return { entryFile: 'index.html', relativePath: 'index.html' };
    }

    // Standard entry point candidates in order of precedence
    const standardCandidates = [
      'index.html',
      'public/index.html',
      'dist/index.html',
      'build/index.html',
      'src/index.html',
    ];

    for (const cand of standardCandidates) {
      const full = path.join(rootDir, cand);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return { entryFile: path.basename(cand), relativePath: cand.replace(/\\/g, '/') };
      }
    }

    // Check immediate subdirectories (e.g., modern-web-app/index.html, app/index.html, client/index.html)
    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });
      const subdirs = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map(e => e.name);

      for (const dir of subdirs) {
        const subIndex = path.join(rootDir, dir, 'index.html');
        if (fs.existsSync(subIndex) && fs.statSync(subIndex).isFile()) {
          return { entryFile: 'index.html', relativePath: `${dir}/index.html` };
        }
      }

      // Check any .html file in the root
      const rootHtml = entries.find(e => e.isFile() && e.name.endsWith('.html'));
      if (rootHtml) {
        return { entryFile: rootHtml.name, relativePath: rootHtml.name };
      }
    } catch {}

    return { entryFile: 'index.html', relativePath: 'index.html' };
  }

  /**
   * Check if an active development server is running for this workspace.
   */
  public detectRunningDevServer(rootDir?: string): { port: number; command: string } | null {
    const servers = this.devServerManager.getActiveServers(rootDir);
    if (servers.length === 0) return null;

    // Return the first server that has a designated port
    const withPort = servers.find(s => typeof s.port === 'number' && s.port > 0);
    if (withPort) {
      return { port: withPort.port!, command: withPort.command };
    }

    // If running server has no port in metadata, check if standard ports (3000, 5173, 8080, 8000) are in command
    for (const s of servers) {
      const m = s.command.match(/--port\s+(\d+)|-p\s+(\d+)/i);
      if (m) {
        const p = parseInt(m[1] || m[2], 10);
        if (p) return { port: p, command: s.command };
      }
    }

    return null;
  }

  /**
   * Get the authoritative PreviewInfo for the active project or specified project.
   */
  public getPreviewInfo(projectId?: string): PreviewInfo {
    let proj: ProjectMetadata | undefined;
    if (projectId) {
      proj = this.projectManager.findProjectByNameOrId(projectId);
    }
    if (!proj) {
      proj = this.projectManager.getActiveProject();
    }

    const rootDir = proj?.activeWorkspace || this.workspaceManager.getRootPath();
    const projectName = proj?.name || path.basename(rootDir) || 'Default Project';
    const projId = proj?.id || 'default';

    // 1. Check if running dev server
    const devServer = this.detectRunningDevServer(rootDir);
    if (devServer) {
      const devUrl = `http://127.0.0.1:${devServer.port}`;
      return {
        type: 'dev_server',
        previewUrl: devUrl,
        fullUrl: devUrl,
        entryFile: 'dev-server',
        projectPath: rootDir,
        projectName,
        projectId: projId,
        port: devServer.port,
        serverRunning: true,
      };
    }

    // 2. Static application preview
    const { entryFile, relativePath } = this.detectEntryPoint(rootDir);
    const relUrl = `/workspace-preview/${relativePath}`;
    const fullUrl = `http://127.0.0.1:${this.serverPort}${relUrl}`;

    return {
      type: 'static',
      previewUrl: relUrl,
      fullUrl,
      entryFile,
      projectPath: rootDir,
      projectName,
      projectId: projId,
      port: this.serverPort,
      serverRunning: false,
    };
  }

  /**
   * Check whether HTML content contains MaxIDE UI markers (meaning MaxIDE was accidentally served).
   */
  public static verifyPreviewNotMaxIDE(htmlContent: string): { isMaxIDE: boolean; marker?: string } {
    if (!htmlContent || typeof htmlContent !== 'string') {
      return { isMaxIDE: false };
    }
    const markers = [
      'monaco-container',
      'MaxIDE — AI Software Engineering Studio',
      'MaxIDE — AI-Native Software Engineering Studio',
      'MaxIDE Verification Battery',
      'id="agent-chat-messages"',
      'id="header-model-select"',
    ];

    for (const marker of markers) {
      if (htmlContent.includes(marker)) {
        return { isMaxIDE: true, marker };
      }
    }
    return { isMaxIDE: false };
  }

  /**
   * Safely serve a static file from a project root directory.
   * Defends against path traversal, sends correct MIME types, and returns clean 404s.
   * NEVER falls through to MaxIDE SPA.
   */
  public serveStaticFile(req: Request, res: Response, rootDir: string, rawRelPath: string): void {
    let cleanPath = rawRelPath || '';
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
    
    // Decode URI
    try {
      cleanPath = decodeURIComponent(cleanPath);
    } catch {}

    // Default to index.html if empty or ends with slash
    if (!cleanPath || cleanPath.endsWith('/')) {
      cleanPath = cleanPath ? `${cleanPath}index.html` : 'index.html';
    }

    let absPath: string;
    try {
      absPath = WorkspaceManager.resolveSafePathForRoot(rootDir, cleanPath);
    } catch (err: any) {
      res.status(403).setHeader('Content-Type', 'text/html; charset=utf-8').send(`
        <!DOCTYPE html>
        <html>
        <head><title>403 Forbidden - MaxIDE Preview Sandbox</title></head>
        <body style="font-family:sans-serif;padding:2rem;background:#0f172a;color:#f87171;">
          <h2>Security Violation</h2>
          <p>${err.message}</p>
        </body>
        </html>
      `);
      return;
    }

    // If requesting root index.html and it doesn't exist directly at root, check detected entry point
    if ((cleanPath === 'index.html' || cleanPath === '') && !fs.existsSync(absPath)) {
      const detected = this.detectEntryPoint(rootDir);
      if (detected.relativePath !== 'index.html') {
        const altEntry = path.join(rootDir, detected.relativePath);
        if (fs.existsSync(altEntry)) {
          absPath = altEntry;
        }
      }
    }

    // If path resolves to a directory, check if index.html exists inside it
    if (fs.existsSync(absPath)) {
      try {
        const stat = fs.statSync(absPath);
        if (stat.isDirectory()) {
          const indexInside = path.join(absPath, 'index.html');
          if (fs.existsSync(indexInside)) {
            absPath = indexInside;
          } else {
            res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(`
              <!DOCTYPE html>
              <html>
              <head><title>404 Not Found</title></head>
              <body style="font-family:sans-serif;padding:2rem;background:#0f172a;color:#cbd5e1;">
                <h2>Directory Index Not Found</h2>
                <p>No <code>index.html</code> file found in directory <code>${cleanPath}</code>.</p>
              </body>
              </html>
            `);
            return;
          }
        }
      } catch {}
    }

    // Check file existence
    if (!fs.existsSync(absPath)) {
      // Check if maybe it's in a subdirectory like public/ or dist/
      const altCandidates = [
        path.join(rootDir, 'public', cleanPath),
        path.join(rootDir, 'dist', cleanPath),
        path.join(rootDir, 'build', cleanPath),
      ];
      let altFound = false;
      for (const alt of altCandidates) {
        if (fs.existsSync(alt) && fs.statSync(alt).isFile()) {
          absPath = alt;
          altFound = true;
          break;
        }
      }

      if (!altFound) {
        res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(`
          <!DOCTYPE html>
          <html>
          <head><title>404 Not Found - Project Preview</title></head>
          <body style="font-family:sans-serif;padding:2rem;background:#0f172a;color:#cbd5e1;">
            <h2 style="color:#38bdf8;">Application Resource Not Found</h2>
            <p>The requested preview file <code>${cleanPath}</code> was not found in project workspace:</p>
            <pre style="background:#1e293b;padding:1rem;border-radius:0.5rem;color:#94a3b8;">${rootDir}</pre>
          </body>
          </html>
        `);
        return;
      }
    }

    // Determine MIME Type
    const ext = path.extname(absPath).toLowerCase();
    const mimeType = PreviewManager.MIME_TYPES[ext] || 'application/octet-stream';

    // Set headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Stream file contents
    const stream = fs.createReadStream(absPath);
    stream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).send(`Error reading file: ${err.message}`);
      }
    });
    stream.pipe(res);
  }

  /**
   * Express Route Handler for /workspace-preview/*
   */
  public handleWorkspacePreview = (req: Request, res: Response): void => {
    const rootDir = this.workspaceManager.getRootPath();
    const relPath = req.params[0] || req.path.replace(/^\/workspace-preview\/?/, '');
    this.serveStaticFile(req, res, rootDir, relPath);
  };

  /**
   * Express Route Handler for /project-preview/:projectIdOrName/*
   */
  public handleProjectPreview = (req: Request, res: Response): void => {
    const projectIdOrName = req.params.projectIdOrName;
    const proj = this.projectManager.findProjectByNameOrId(projectIdOrName);
    
    if (!proj) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(`
        <!DOCTYPE html>
        <html>
        <head><title>404 Project Not Found</title></head>
        <body style="font-family:sans-serif;padding:2rem;background:#0f172a;color:#f87171;">
          <h2>Project Not Found</h2>
          <p>No project found matching "<code>${projectIdOrName}</code>".</p>
        </body>
        </html>
      `);
      return;
    }

    const rootDir = proj.activeWorkspace || this.workspaceManager.getRootPath();
    const relPath = req.params[0] || '';
    this.serveStaticFile(req, res, rootDir, relPath);
  };

  /**
   * Express Middleware to catch requests to project names or subdirectories (e.g. /modern-web-app/index.html)
   * If matched, serves the project file instead of falling through to MaxIDE SPA!
   */
  public handleDynamicProjectOrFolder = (req: Request, res: Response, next: NextFunction): void => {
    const p = req.path;
    // Skip if API or workspace-preview or project-preview
    if (p.startsWith('/api') || p.startsWith('/workspace-preview') || p.startsWith('/project-preview')) {
      return next();
    }

    // Check if the first segment matches a project name/id or an immediate directory in workspace
    const parts = p.split('/').filter(Boolean);
    if (parts.length === 0) return next();

    const firstSegment = parts[0];

    const subPath = parts.slice(1).join('/');

    // 1. Check if first segment matches an existing directory inside the active workspace
    const activeWs = this.workspaceManager.getRootPath();
    const candidateSubdir = path.join(activeWs, firstSegment);
    if (fs.existsSync(candidateSubdir) && fs.statSync(candidateSubdir).isDirectory()) {
      return this.serveStaticFile(req, res, candidateSubdir, subPath);
    }

    // 2. Check if first segment matches a project
    const proj = this.projectManager.findProjectByNameOrId(firstSegment);
    if (proj) {
      const rootDir = proj.activeWorkspace;
      if (subPath && fs.existsSync(path.join(rootDir, firstSegment, subPath))) {
        return this.serveStaticFile(req, res, path.join(rootDir, firstSegment), subPath);
      }
      return this.serveStaticFile(req, res, rootDir, subPath);
    }

    // 3. Check if active project name matches or active workspace folder name matches
    const activeProj = this.projectManager.getActiveProject();
    if (
      activeProj &&
      (activeProj.name.toLowerCase() === firstSegment.toLowerCase() ||
       path.basename(activeProj.activeWorkspace).toLowerCase() === firstSegment.toLowerCase())
    ) {
      const subPath = parts.slice(1).join('/');
      return this.serveStaticFile(req, res, activeProj.activeWorkspace, subPath);
    }

    next();
  };
}
