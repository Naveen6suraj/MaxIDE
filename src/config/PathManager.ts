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

  private constructor() {
    this.appDir = path.resolve(__dirname, '../../');

    // User Data Directory (%APPDATA%/MaxIDE on Windows, ~/.maxide on Linux/macOS)
    if (process.env.MAXIDE_DATA_DIR) {
      this.userDataDir = path.resolve(process.env.MAXIDE_DATA_DIR);
    } else if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      this.userDataDir = path.join(appData, 'MaxIDE');
    } else {
      this.userDataDir = path.join(os.homedir(), '.maxide');
    }

    // Agent Data Directory (%LOCALAPPDATA%/MaxIDE on Windows, ~/.cache/maxide on Linux/macOS)
    if (process.env.MAXIDE_AGENT_DIR) {
      this.agentDataDir = path.resolve(process.env.MAXIDE_AGENT_DIR);
    } else if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      this.agentDataDir = path.join(localAppData, 'MaxIDE');
    } else {
      this.agentDataDir = path.join(os.homedir(), '.cache', 'maxide');
    }

    this.ensureDirectories();
  }

  public static getInstance(): PathManager {
    if (!PathManager.instance) {
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
