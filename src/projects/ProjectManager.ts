/**
 * MaxIDE - Unlimited AI Provider Platform
 * Persistent Project & Multi-Folder Manager
 * 
 * Manages user projects with multiple authorized folders,
 * persistent preferences, active workspace state, and atomic storage.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PathManager } from '../config/PathManager.js';
import { AtomicStorage } from '../storage/AtomicStorage.js';

export interface ProjectFolder {
  path: string;
  name: string;
  isPrimary: boolean;
}

export interface ProjectGitInfo {
  branch?: string;
  headCommit?: string;
  isClean?: boolean;
  lastChecked?: string;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  folders: string[]; // List of absolute paths authorized for this project
  activeWorkspace: string; // The primary active folder
  projectPath?: string;
  providerId?: string;
  modelId?: string;
  activeModel?: string;
  autonomyMode?: 'ASK' | 'ASSIST' | 'AGENT' | 'AUTONOMOUS';
  permissions?: Record<string, boolean>;
  gitWorktreeMode?: 'LOCAL' | 'WORKTREE';
  gitInfo?: ProjectGitInfo;
  createdAt: string;
  lastOpened: string;
  lastActivityDate?: string;
  conversations: string[];
  currentConversationId?: string;
  activeTaskId?: string;
  taskStatus?: 'WORKING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED' | 'PAUSED' | 'RECOVERABLE';
  lastCheckpointId?: string;
  artifacts?: Array<{
    path: string;
    name: string;
    type: string;
    timestamp?: string;
  }>;
  recentFiles?: string[];
  settings?: Record<string, any>;
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
    const data = AtomicStorage.safeReadJsonSync<any[]>(this.projectsFile, []);
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && item.id) {
          // Normalize model fields
          if (item.modelId && !item.activeModel) item.activeModel = item.modelId;
          if (item.activeModel && !item.modelId) item.modelId = item.activeModel;
          if (!item.lastActivityDate) item.lastActivityDate = item.lastOpened || item.createdAt;
          if (!item.recentFiles) item.recentFiles = [];
          if (!item.artifacts) item.artifacts = [];
          if (!item.settings) item.settings = {};
          this.projects.set(item.id, item);
        }
      }
    }
    if (this.projects.size > 0 && !this.activeProjectId) {
      const sorted = this.listProjects();
      this.activeProjectId = sorted[0]?.id;
    }
  }

  private save(): void {
    try {
      const array = Array.from(this.projects.values());
      AtomicStorage.atomicWriteJsonSync(this.projectsFile, array);
    } catch (err: any) {
      console.warn('[ProjectManager] Could not write projects file:', err.message);
    }
  }

  private ensureDefaultProject(): void {
    if (this.projects.size === 0) {
      const defaultWs = PathManager.getInstance().getDefaultWorkspaceDir();
      const now = new Date().toISOString();
      const defProj: ProjectMetadata = {
        id: 'proj-default',
        name: 'Default Project',
        folders: [defaultWs],
        activeWorkspace: defaultWs,
        projectPath: defaultWs,
        providerId: 'ollama',
        modelId: 'auto',
        activeModel: 'auto',
        autonomyMode: 'AUTONOMOUS',
        gitWorktreeMode: 'LOCAL',
        createdAt: now,
        lastOpened: now,
        lastActivityDate: now,
        conversations: [],
        recentFiles: [],
        artifacts: [],
        settings: {},
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
    settings?: Record<string, any>;
  }): ProjectMetadata {
    const id = `proj-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const resolvedFolders = options.folders.map(f => path.resolve(f));
    for (const f of resolvedFolders) {
      if (!fs.existsSync(f)) {
        fs.mkdirSync(f, { recursive: true });
      }
    }

    const now = new Date().toISOString();
    const primaryFolder = resolvedFolders[0] || PathManager.getInstance().getDefaultWorkspaceDir();
    const effectiveModel = options.modelId || 'auto';

    const project: ProjectMetadata = {
      id,
      name: options.name,
      folders: resolvedFolders,
      activeWorkspace: primaryFolder,
      projectPath: primaryFolder,
      providerId: options.providerId || 'ollama',
      modelId: effectiveModel,
      activeModel: effectiveModel,
      autonomyMode: options.autonomyMode || 'AUTONOMOUS',
      gitWorktreeMode: options.gitWorktreeMode || 'LOCAL',
      createdAt: now,
      lastOpened: now,
      lastActivityDate: now,
      conversations: [],
      recentFiles: [],
      artifacts: [],
      settings: options.settings || {},
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
    const now = new Date().toISOString();
    proj.lastOpened = now;
    proj.lastActivityDate = now;
    this.activeProjectId = id;
    this.save();
    return proj;
  }

  public listProjects(): ProjectMetadata[] {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(b.lastOpened || b.createdAt).getTime() - new Date(a.lastOpened || a.createdAt).getTime()
    );
  }

  public addFolder(projectId: string, folderPath: string): ProjectMetadata {
    const proj = this.projects.get(projectId);
    if (!proj) throw new Error(`Project not found: ${projectId}`);
    const resolved = path.resolve(folderPath);
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });

    if (!proj.folders.includes(resolved)) {
      proj.folders.push(resolved);
      proj.lastActivityDate = new Date().toISOString();
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
      proj.projectPath = proj.activeWorkspace;
    }
    proj.lastActivityDate = new Date().toISOString();
    this.save();
    return proj;
  }

  public updateProject(id: string, updates: Partial<ProjectMetadata>): ProjectMetadata {
    const proj = this.projects.get(id);
    if (!proj) throw new Error(`Project not found: ${id}`);

    if (updates.modelId && !updates.activeModel) updates.activeModel = updates.modelId;
    if (updates.activeModel && !updates.modelId) updates.modelId = updates.activeModel;

    Object.assign(proj, updates);
    const now = new Date().toISOString();
    proj.lastOpened = now;
    proj.lastActivityDate = now;
    this.save();
    return proj;
  }

  public addRecentFile(projectId: string, filePath: string): void {
    const proj = this.projects.get(projectId);
    if (!proj) return;
    if (!proj.recentFiles) proj.recentFiles = [];
    proj.recentFiles = [filePath, ...proj.recentFiles.filter(f => f !== filePath)].slice(0, 20);
    proj.lastActivityDate = new Date().toISOString();
    this.save();
  }

  public updateGitInfo(projectId: string, gitInfo: ProjectGitInfo): void {
    const proj = this.projects.get(projectId);
    if (!proj) return;
    proj.gitInfo = { ...proj.gitInfo, ...gitInfo, lastChecked: new Date().toISOString() };
    this.save();
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
