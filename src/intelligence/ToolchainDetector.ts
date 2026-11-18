/**
 * MaxIDE APEX — Mission 9: Host & Workspace Toolchain Capability Detector (Part 3)
 * Probes real compilers, SDKs, runtimes, and workspace dependencies BEFORE strategy selection
 * so infeasible strategies (e.g., WPF without dotnet SDK, Tauri without Rust/Cargo) are
 * NEVER selected as executable strategies.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface ToolchainCapabilities {
  platformOs: NodeJS.Platform;
  // Native Windows / Desktop
  cscAvailable: boolean;
  cscPath: string | null;
  winFormsAvailable: boolean;
  dotnetAvailable: boolean;
  dotnetVersion: string | null;
  wpfAvailable: boolean;
  cargoAvailable: boolean;
  tauriAvailable: boolean;
  electronInstalled: boolean;
  // Node / Web / React / Next.js
  nodeAvailable: boolean;
  nodeVersion: string | null;
  npmAvailable: boolean;
  // Python
  pythonAvailable: boolean;
  venvDetected: boolean;
  pytestAvailable: boolean;
  // Workspace flags
  hasPackageJson: boolean;
  hasTypeScript: boolean;
  hasReact: boolean;
  hasNextJs: boolean;
  hasVite: boolean;
  gitAvailable: boolean;
  modelSupportsTools: boolean;
  detectedAt: string;
}

export interface FeasibilityCheckResult {
  feasible: boolean;
  missingCapabilities: string[];
  installInstructions: string[];
}

interface HostProbeCache {
  cscPath: string | null;
  dotnetVersion: string | null;
  cargoAvailable: boolean;
  nodeVersion: string | null;
  npmAvailable: boolean;
  pythonAvailable: boolean;
  pytestAvailable: boolean;
  gitAvailable: boolean;
  probedAt: number;
}

let cachedHostProbe: HostProbeCache | null = null;
const HOST_CACHE_TTL_MS = 60_000;

function probeCommand(cmd: string): string | null {
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    return String(out || '').trim() || 'ok';
  } catch {
    return null;
  }
}

function findWindowsCscPath(): string | null {
  if (process.platform !== 'win32') return null;
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export class ToolchainDetector {
  public static clearCache(): void {
    cachedHostProbe = null;
  }

  public static detect(
    workspacePath: string,
    overrides?: Partial<ToolchainCapabilities>
  ): ToolchainCapabilities {
    const now = Date.now();
    if (!cachedHostProbe || now - cachedHostProbe.probedAt > HOST_CACHE_TTL_MS) {
      const cscPath = findWindowsCscPath();
      const dotnetVersion = probeCommand('dotnet --version');
      const cargoOut = probeCommand('cargo --version');
      const nodeVersion = process.version || probeCommand('node -v');
      const npmOut = probeCommand('npm -v');
      const pyOut = probeCommand('python --version') || probeCommand('python3 --version');
      const pytestOut = pyOut ? probeCommand('python -m pytest --version') : null;
      const gitOut = probeCommand('git --version');

      cachedHostProbe = {
        cscPath,
        dotnetVersion,
        cargoAvailable: Boolean(cargoOut),
        nodeVersion,
        npmAvailable: Boolean(npmOut),
        pythonAvailable: Boolean(pyOut),
        pytestAvailable: Boolean(pytestOut),
        gitAvailable: Boolean(gitOut),
        probedAt: now,
      };
    }

    const root = path.resolve(workspacePath || process.cwd());
    let hasPackageJson = false;
    let hasTypeScript = false;
    let hasReact = false;
    let hasNextJs = false;
    let hasVite = false;
    let electronInstalled = false;
    let venvDetected = false;

    if (fs.existsSync(root)) {
      const pkgPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgPath)) {
        hasPackageJson = true;
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          hasTypeScript = Boolean(deps.typescript);
          hasReact = Boolean(deps.react);
          hasNextJs = Boolean(deps.next);
          hasVite = Boolean(deps.vite);
          electronInstalled = Boolean(deps.electron) && fs.existsSync(path.join(root, 'node_modules', 'electron'));
        } catch {}
      }
      venvDetected =
        fs.existsSync(path.join(root, '.venv')) ||
        fs.existsSync(path.join(root, 'venv')) ||
        fs.existsSync(path.join(root, 'env'));
    }

    const base: ToolchainCapabilities = {
      platformOs: process.platform,
      cscAvailable: Boolean(cachedHostProbe.cscPath),
      cscPath: cachedHostProbe.cscPath,
      winFormsAvailable: Boolean(cachedHostProbe.cscPath) || Boolean(cachedHostProbe.dotnetVersion),
      dotnetAvailable: Boolean(cachedHostProbe.dotnetVersion),
      dotnetVersion: cachedHostProbe.dotnetVersion,
      wpfAvailable: process.platform === 'win32' && Boolean(cachedHostProbe.dotnetVersion),
      cargoAvailable: cachedHostProbe.cargoAvailable,
      tauriAvailable: cachedHostProbe.cargoAvailable && Boolean(cachedHostProbe.nodeVersion),
      electronInstalled,
      nodeAvailable: Boolean(cachedHostProbe.nodeVersion),
      nodeVersion: cachedHostProbe.nodeVersion,
      npmAvailable: cachedHostProbe.npmAvailable,
      pythonAvailable: cachedHostProbe.pythonAvailable,
      venvDetected,
      pytestAvailable: cachedHostProbe.pytestAvailable,
      hasPackageJson,
      hasTypeScript,
      hasReact,
      hasNextJs,
      hasVite,
      gitAvailable: cachedHostProbe.gitAvailable,
      modelSupportsTools: true,
      detectedAt: new Date().toISOString(),
    };

    return overrides ? { ...base, ...overrides } : base;
  }

  /**
   * Stage 1 Feasibility Filter: Determines whether a candidate strategy can ACTUALLY
   * execute on this machine and workspace. Infeasible strategies are blocked from execution.
   */
  public static checkStrategyFeasibility(
    strategyId: string,
    caps: ToolchainCapabilities
  ): FeasibilityCheckResult {
    const missing: string[] = [];
    const install: string[] = [];

    switch (strategyId) {
      case 'native-winforms-csc':
        if (caps.platformOs !== 'win32') {
          missing.push('Windows OS');
          install.push('Run on Windows x64 or select a cross-platform desktop target.');
        }
        if (!caps.cscAvailable) {
          missing.push('Windows .NET Framework C# Compiler (csc.exe)');
          install.push('Install .NET Framework 4.8 Developer Pack or .NET 8 SDK: winget install Microsoft.DotNet.SDK.8');
        }
        break;

      case 'native-wpf-dotnet':
        if (caps.platformOs !== 'win32') {
          missing.push('Windows OS');
        }
        if (!caps.dotnetAvailable || !caps.wpfAvailable) {
          missing.push('.NET 8 Desktop SDK (dotnet CLI for WPF/XAML)');
          install.push('Install .NET 8 SDK: winget install Microsoft.DotNet.SDK.8');
        }
        break;

      case 'native-tauri-rust':
        if (!caps.cargoAvailable) {
          missing.push('Rust/Cargo Toolchain (rustc + cargo)');
          install.push('Install Rust via rustup: https://rustup.rs (or winget install Rustlang.Rustup)');
        }
        if (!caps.nodeAvailable) {
          missing.push('Node.js runtime');
          install.push('Install Node.js LTS: winget install OpenJS.NodeJS.LTS');
        }
        break;

      case 'native-electron-node':
        if (!caps.nodeAvailable || !caps.npmAvailable) {
          missing.push('Node.js + npm');
          install.push('Install Node.js LTS: winget install OpenJS.NodeJS.LTS');
        }
        if (!caps.electronInstalled) {
          missing.push('Workspace Electron dependency (node_modules/electron not installed)');
          install.push('Install Electron in workspace: npm install --save-dev electron');
        }
        break;

      case 'vite-typescript-spa':
        if (!caps.nodeAvailable || !caps.npmAvailable) {
          missing.push('Node.js + npm');
          install.push('Install Node.js LTS: winget install OpenJS.NodeJS.LTS');
        }
        if (!caps.hasPackageJson && !caps.hasVite) {
          // On greenfield local workspaces without Vite scaffolded, Vite SPA requires install/scaffold
          // Keep feasible ONLY when workspace already has Vite/React or npm is ready & not local-small
        }
        break;

      case 'modular-node-ts-sqlite-service':
      case 'zero-dep-node-http-service':
        if (!caps.nodeAvailable) {
          missing.push('Node.js runtime');
          install.push('Install Node.js LTS: winget install OpenJS.NodeJS.LTS');
        }
        break;

      default:
        break;
    }

    return {
      feasible: missing.length === 0,
      missingCapabilities: missing,
      installInstructions: install,
    };
  }
}
