/**
 * MaxIDE - Unlimited AI Provider Platform
 * Persistent Project & Multi-Folder Manager
 * 
 * Manages user projects with multiple authorized folders,
 * persistent preferences, and active workspace state.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PathManager } from '../config/PathManager.js';

export interface ProjectFolder {
  path: string;
  name: string;
  isPrimary: boolean;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  folders: string[]; // List of absolute paths authorized for this project
  activeWorkspace: string; // The primary active folder
  providerId?: string;
  modelId?: string;
  autonomyMode?: 'ASK' | 'ASSIST' | 'AGENT' | 'AUTONOMOUS';
  permissions?: Record<string, boolean>;
  gitWorktreeMode?: 'LOCAL' | 'WORKTREE';
  createdAt: string;
  lastOpened: string;
  conversations: string[];
  tags?: string[];
  description?: string;
}

export class ProjectManager {
  private projectsFile: string;
  private projects: Map<string, ProjectMetadata> = new Map();
  private activeProjectId?: string;

  constructor(customStorageFile?: string) {
    const pathMgr = PathManager.getInstance();
    this.projectsFile = customStorageFile || pathMgr.getProjectsFile();
    this.load();
    this.ensureDefaultProject();
  }

  private load(): void {
    if (!fs.existsSync(this.projectsFile)) {
      return;
    }
    try {
      const raw = fs.readFileSync(this.projectsFile, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.id) {
            this.projects.set(item.id, item);
          }
        }
      }
      if (this.projects.size > 0 && !this.activeProjectId) {
        // Pick most recently opened
        const sorted = this.listProjects();
        this.activeProjectId = sorted[0]?.id;
      }
    } catch (err) {
      console.warn('[ProjectManager] Could not read projects file:', err);
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.projectsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const array = Array.from(this.projects.values());
      fs.writeFileSync(this.projectsFile, JSON.stringify(array, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[ProjectManager] Could not write projects file:', err);
    }
  }

  private ensureDefaultProject(): void {
    if (this.projects.size === 0) {
      const defaultWs = PathManager.getInstance().getDefaultWorkspaceDir();
      const defProj: ProjectMetadata = {
        id: 'proj-default',
        name: 'Default Project',
        folders: [defaultWs],
        activeWorkspace: defaultWs,
        providerId: 'ollama',
        modelId: 'auto',
        autonomyMode: 'AUTONOMOUS',
        gitWorktreeMode: 'LOCAL',
        createdAt: new Date().toISOString(),
        lastOpened: new Date().toISOString(),
        conversations: [],
      };
      this.projects.set(defProj.id, defProj);
      this.activeProjectId = defProj.id;
      this.save();
    }
  }

  public createProject(options: {
    name: string;
    folders: string[];
    providerId?: string;
    modelId?: string;
    autonomyMode?: 'ASK' | 'ASSIST' | 'AGENT' | 'AUTONOMOUS';
    gitWorktreeMode?: 'LOCAL' | 'WORKTREE';
    description?: string;
  }): ProjectMetadata {
    const id = `proj-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const resolvedFolders = options.folders.map(f => path.resolve(f));
    for (const f of resolvedFolders) {
      if (!fs.existsSync(f)) {
        fs.mkdirSync(f, { recursive: true });
      }
    }

    const project: ProjectMetadata = {
      id,
      name: options.name,
      folders: resolvedFolders,
      activeWorkspace: resolvedFolders[0] || PathManager.getInstance().getDefaultWorkspaceDir(),
      providerId: options.providerId || 'ollama',
      modelId: options.modelId || 'auto',
      autonomyMode: options.autonomyMode || 'AUTONOMOUS',
      gitWorktreeMode: options.gitWorktreeMode || 'LOCAL',
      createdAt: new Date().toISOString(),
      lastOpened: new Date().toISOString(),
      conversations: [],
      description: options.description,
    };

    this.projects.set(id, project);
    this.activeProjectId = id;
    this.save();
    return project;
  }

  public getProject(id: string): ProjectMetadata | undefined {
    return this.projects.get(id);
  }

  public getActiveProject(): ProjectMetadata {
    if (!this.activeProjectId || !this.projects.has(this.activeProjectId)) {
      this.ensureDefaultProject();
    }
    return this.projects.get(this.activeProjectId!)!;
  }

  public setActiveProject(id: string): ProjectMetadata {
    const proj = this.projects.get(id);
    if (!proj) {
      throw new Error(`Project not found: ${id}`);
    }
    proj.lastOpened = new Date().toISOString();
    this.activeProjectId = id;
    this.save();
    return proj;
  }

  public listProjects(): ProjectMetadata[] {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
    );
  }

  public addFolder(projectId: string, folderPath: string): ProjectMetadata {
    const proj = this.projects.get(projectId);
    if (!proj) throw new Error(`Project not found: ${projectId}`);
    const resolved = path.resolve(folderPath);
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });

    if (!proj.folders.includes(resolved)) {
      proj.folders.push(resolved);
      this.save();
    }
    return proj;
  }

  public removeFolder(projectId: string, folderPath: string): ProjectMetadata {
    const proj = this.projects.get(projectId);
    if (!proj) throw new Error(`Project not found: ${projectId}`);
    const resolved = path.resolve(folderPath);

    proj.folders = proj.folders.filter(f => f !== resolved);
    if (proj.activeWorkspace === resolved) {
      proj.activeWorkspace = proj.folders[0] || PathManager.getInstance().getDefaultWorkspaceDir();
    }
    this.save();
    return proj;
  }

  public updateProject(id: string, updates: Partial<ProjectMetadata>): ProjectMetadata {
    const proj = this.projects.get(id);
    if (!proj) throw new Error(`Project not found: ${id}`);

    Object.assign(proj, updates);
    proj.lastOpened = new Date().toISOString();
    this.save();
    return proj;
  }

  public deleteProject(id: string): boolean {
    if (id === 'proj-default') return false; // Prevent deleting default sandbox
    const deleted = this.projects.delete(id);
    if (this.activeProjectId === id) {
      const remaining = this.listProjects();
      this.activeProjectId = remaining[0]?.id;
    }
    this.save();
    return deleted;
  }

  /**
   * Multi-Folder Containment Check:
   * Returns true if filePath is contained within ANY authorized folder of the project.
   */
  public isPathAuthorized(filePath: string, projectId?: string): boolean {
    const proj = projectId ? this.getProject(projectId) : this.getActiveProject();
    if (!proj) return false;

    const targetAbs = path.resolve(filePath);
    for (const folder of proj.folders) {
      const normFolder = path.resolve(folder);
      if (targetAbs === normFolder || targetAbs.startsWith(normFolder + path.sep)) {
        return true;
      }
    }
    return false;
  }
}
