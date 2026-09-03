/**
 * MaxIDE - Unlimited AI Provider Platform
 * 3-Tier Persistent Permission Manager
 * 
 * Levels:
 * - GLOBAL: Safe baseline defaults (read-only allowed, dangerous blocked)
 * - PROJECT: Explicit persistent grants per project (filesystem, terminal, browser, git)
 * - TASK: Temporary single-session grants (allow_for_task)
 */

import fs from 'fs';
import path from 'path';
import { PathManager } from '../../config/PathManager.js';

export interface ProjectPermissionGrants {
  filesystem: {
    read: boolean;
    write: boolean;
    delete: boolean;
  };
  terminal: {
    node: boolean;
    npm: boolean;
    python: boolean;
    git: boolean;
    customCommands: string[];
  };
  browser: {
    playwright: boolean;
    networkInspect: boolean;
  };
  git: {
    status: boolean;
    diff: boolean;
    commit: boolean;
    push: boolean;
  };
}

export const DEFAULT_PROJECT_PERMISSIONS: ProjectPermissionGrants = {
  filesystem: {
    read: true,
    write: true,
    delete: false,
  },
  terminal: {
    node: true,
    npm: true,
    python: true,
    git: true,
    customCommands: [],
  },
  browser: {
    playwright: true,
    networkInspect: true,
  },
  git: {
    status: true,
    diff: true,
    commit: false,
    push: false,
  },
};

export class PermissionManager {
  private permissionsFile: string;
  private projectGrants: Map<string, ProjectPermissionGrants> = new Map();
  private taskTemporaryGrants: Map<string, Set<string>> = new Map(); // taskId -> set of granted actions

  constructor(customFile?: string) {
    this.permissionsFile = customFile || PathManager.getInstance().getPermissionsFile();
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.permissionsFile)) {
      try {
        const raw = fs.readFileSync(this.permissionsFile, 'utf-8');
        const obj = JSON.parse(raw);
        for (const [projectId, grants] of Object.entries(obj)) {
          this.projectGrants.set(projectId, grants as ProjectPermissionGrants);
        }
      } catch (err) {
        console.warn('[PermissionManager] Could not read permissions file:', err);
      }
    }
  }

  private save(): void {
    try {
      const obj: Record<string, ProjectPermissionGrants> = {};
      for (const [projId, grants] of this.projectGrants) {
        obj[projId] = grants;
      }
      fs.writeFileSync(this.permissionsFile, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[PermissionManager] Could not save permissions file:', err);
    }
  }

  public getProjectPermissions(projectId: string): ProjectPermissionGrants {
    if (!this.projectGrants.has(projectId)) {
      this.projectGrants.set(projectId, JSON.parse(JSON.stringify(DEFAULT_PROJECT_PERMISSIONS)));
      this.save();
    }
    return this.projectGrants.get(projectId)!;
  }

  public updateProjectPermissions(projectId: string, updates: Partial<ProjectPermissionGrants>): ProjectPermissionGrants {
    const current = this.getProjectPermissions(projectId);
    if (updates.filesystem) Object.assign(current.filesystem, updates.filesystem);
    if (updates.terminal) Object.assign(current.terminal, updates.terminal);
    if (updates.browser) Object.assign(current.browser, updates.browser);
    if (updates.git) Object.assign(current.git, updates.git);

    this.projectGrants.set(projectId, current);
    this.save();
    return current;
  }

  public grantTaskPermission(taskId: string, permissionKey: string): void {
    if (!this.taskTemporaryGrants.has(taskId)) {
      this.taskTemporaryGrants.set(taskId, new Set());
    }
    this.taskTemporaryGrants.get(taskId)!.add(permissionKey);
  }

  public clearTaskPermissions(taskId: string): void {
    this.taskTemporaryGrants.delete(taskId);
  }

  public checkPermission(options: {
    projectId: string;
    taskId?: string;
    category: 'filesystem' | 'terminal' | 'browser' | 'git';
    action: string;
  }): boolean {
    const { projectId, taskId, category, action } = options;

    // 1. Task-level temporary override
    if (taskId && this.taskTemporaryGrants.get(taskId)?.has(`${category}.${action}`)) {
      return true;
    }

    // 2. Project-level persistent grants
    const grants = this.getProjectPermissions(projectId);
    if (category === 'filesystem') {
      if (action === 'read') return grants.filesystem.read;
      if (action === 'write') return grants.filesystem.write;
      if (action === 'delete') return grants.filesystem.delete;
    } else if (category === 'terminal') {
      if (action.startsWith('node')) return grants.terminal.node;
      if (action.startsWith('npm') || action.startsWith('npx')) return grants.terminal.npm;
      if (action.startsWith('python') || action.startsWith('pip')) return grants.terminal.python;
      if (action.startsWith('git')) return grants.terminal.git;
      return grants.terminal.customCommands.some(cmd => action.startsWith(cmd));
    } else if (category === 'browser') {
      if (action === 'playwright') return grants.browser.playwright;
      if (action === 'network') return grants.browser.networkInspect;
    } else if (category === 'git') {
      if (action === 'status') return grants.git.status;
      if (action === 'diff') return grants.git.diff;
      if (action === 'commit') return grants.git.commit;
      if (action === 'push') return grants.git.push;
    }

    return false;
  }
}
