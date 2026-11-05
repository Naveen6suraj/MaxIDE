/**
 * MaxIDE - Unlimited AI Provider Platform
 * Path & Storage Manager
 * 
 * Separates:
 * - Application directory (binaries and bundled web assets)
 * - User Data: %APPDATA%/MaxIDE (projects, persistent conversations, settings, permissions)
 * - Agent Data: %LOCALAPPDATA%/MaxIDE (checkpoints, artifacts, execution logs, cache)
 * - Project Workspaces: arbitrary user-selected folders
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PathManager {
  private static instance: PathManager;

  public readonly appDir: string;
  public readonly userDataDir: string;
  public readonly agentDataDir: string;

  private resolveDir(envVar: string | undefined, systemPath: string, localFallback: string): string {
    if (envVar) {
      const resolved = path.resolve(envVar);
      try {
        if (!fs.existsSync(resolved)) {
          fs.mkdirSync(resolved, { recursive: true });
        }
      } catch {}
      return resolved;
    }

    try {
      if (!fs.existsSync(systemPath)) {
        fs.mkdirSync(systemPath, { recursive: true });
      }
      const probe = path.join(systemPath, `.probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
      fs.writeFileSync(probe, 'probe', 'utf8');
      fs.unlinkSync(probe);
      return systemPath;
    } catch {
      try {
        if (!fs.existsSync(localFallback)) {
          fs.mkdirSync(localFallback, { recursive: true });
        }
        return localFallback;
      } catch {
        const tmp = path.join(os.tmpdir(), 'MaxIDE');
        try {
          if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
        } catch {}
        return tmp;
      }
    }
  }

  private constructor() {
    this.appDir = path.resolve(__dirname, '../../');

    const defaultUserData = process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MaxIDE')
      : path.join(os.homedir(), '.maxide');

    const defaultAgentData = process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'MaxIDE')
      : path.join(os.homedir(), '.cache', 'maxide');

    this.userDataDir = this.resolveDir(
      process.env.MAXIDE_DATA_DIR,
      defaultUserData,
      path.resolve(this.appDir, 'data')
    );

    this.agentDataDir = this.resolveDir(
      process.env.MAXIDE_AGENT_DIR,
      defaultAgentData,
      path.resolve(this.appDir, '.agent_data')
    );

    this.ensureDirectories();
  }

  public static resetInstance(): void {
    PathManager.instance = new PathManager();
  }

  public static getInstance(): PathManager {
    if (!PathManager.instance) {
      PathManager.instance = new PathManager();
    } else if (
      (process.env.MAXIDE_DATA_DIR && PathManager.instance.userDataDir !== path.resolve(process.env.MAXIDE_DATA_DIR)) ||
      (process.env.MAXIDE_AGENT_DIR && PathManager.instance.agentDataDir !== path.resolve(process.env.MAXIDE_AGENT_DIR))
    ) {
      PathManager.instance = new PathManager();
    }
    return PathManager.instance;
  }

  public ensureDirectories(): void {
    const dirs = [
      this.userDataDir,
      this.agentDataDir,
      this.getRuntimeDir(),
      this.getConversationsDir(),
      this.getCheckpointsDir(),
      this.getLogsDir(),
      this.getArtifactsDir(),
      this.getDefaultWorkspaceDir(),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
          console.warn(`[PathManager] Could not create directory ${dir}:`, err);
        }
      }
    }
  }

  public getRuntimeDir(): string {
    return path.join(this.agentDataDir, 'runtime');
  }

  public getPortFile(): string {
    return path.join(this.getRuntimeDir(), 'port.json');
  }

  public getRecentProjectsFile(): string {
    return path.join(this.userDataDir, 'recent_projects.json');
  }

  public getProjectsFile(): string {
    return path.join(this.userDataDir, 'projects.json');
  }

  public getProvidersFile(): string {
    return path.join(this.userDataDir, 'providers.json');
  }

  public getPermissionsFile(): string {
    return path.join(this.userDataDir, 'permissions.json');
  }

  public getSettingsFile(): string {
    return path.join(this.userDataDir, 'settings.json');
  }

  public getConversationsDir(): string {
    return path.join(this.userDataDir, 'conversations');
  }

  public getCheckpointsDir(): string {
    return path.join(this.agentDataDir, 'checkpoints');
  }

  public getLogsDir(): string {
    return path.join(this.agentDataDir, 'logs');
  }

  public getArtifactsDir(): string {
    return path.join(this.agentDataDir, 'artifacts');
  }

  /**
   * Default project workspace for user projects - isolated from application directory
   */
  public getDefaultWorkspaceDir(): string {
    if (process.env.MAXIDE_WORKSPACE_DIR) {
      return path.resolve(process.env.MAXIDE_WORKSPACE_DIR);
    }
    const defaultWs = path.join(this.userDataDir, 'workspace');
    if (!fs.existsSync(defaultWs)) {
      try {
        fs.mkdirSync(defaultWs, { recursive: true });
      } catch {}
    }
    return defaultWs;
  }
}
