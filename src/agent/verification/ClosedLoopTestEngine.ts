/**
 * MaxIDE - Closed-Loop Testing and Autonomous Repair Engine
 * Implements: OBSERVE -> PLAN -> PATCH -> TEST -> DIAGNOSE -> REPAIR -> RETEST -> COMPLETE
 * Automatically discovers, executes, and parses tests through SafeTerminal, feeding
 * actionable error diagnostics back into the agent repair loop.
 */

import fs from 'fs';
import path from 'path';
import { SafeTerminal } from '../safety/SafeTerminal.js';
import { CheckpointManager } from '../checkpoint/CheckpointManager.js';

export interface TestDiscoveryResult {
  hasTests: boolean;
  testCommand?: string;
  buildCommand?: string;
  techStack: 'node' | 'python' | 'rust' | 'go' | 'generic';
  details: string;
}

export interface TestExecutionResult {
  executed: boolean;
  command: string;
  exitCode: number;
  passed: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  parsedFailures: string[];
}

export interface RepairIteration {
  iterationNumber: number;
  failingCommand: string;
  errorMessage: string;
  actionTaken?: string;
  retestPassed: boolean;
}

export class ClosedLoopTestEngine {
  constructor(
    private workspaceRoot: string,
    private safeTerminal: SafeTerminal,
    private checkpointManager?: CheckpointManager
  ) {}

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = newRoot;
  }

  public discoverTests(): TestDiscoveryResult {
    return this.discoverTestConfiguration();
  }

  public runTests(overrideCommand?: string): Promise<TestExecutionResult> {
    return this.executeTests(overrideCommand);
  }

  /**
   * Discover available test and build scripts across the workspace.
   */
  public discoverTestConfiguration(): TestDiscoveryResult {
    const pkgJsonPath = path.join(this.workspaceRoot, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const scripts = pkg.scripts || {};
        let testCmd: string | undefined;
        let buildCmd: string | undefined;

        if (scripts.test && !scripts.test.includes('no test specified')) {
          testCmd = 'npm test';
        }
        if (scripts.build) {
          buildCmd = 'npm run build';
        }

        const testsDir = path.join(this.workspaceRoot, 'tests');
        if (!testCmd && fs.existsSync(testsDir)) {
          const files = fs.readdirSync(testsDir);
          const hasJsTests = files.some(f => f.endsWith('.test.js') || f.endsWith('.spec.js'));
          if (hasJsTests) {
            testCmd = 'npm test';
          }
        }

        return {
          hasTests: !!testCmd || !!buildCmd,
          testCommand: testCmd,
          buildCommand: buildCmd,
          techStack: 'node',
          details: testCmd ? `Discovered Node.js test command: "${testCmd}"` : 'Node.js project detected without configured test script',
        };
      } catch {}
    }

    // Python test discovery
    const hasPytest = fs.existsSync(path.join(this.workspaceRoot, 'pytest.ini')) ||
                      fs.existsSync(path.join(this.workspaceRoot, 'pyproject.toml'));
    const pyTestsDir = path.join(this.workspaceRoot, 'tests');
    if (hasPytest || (fs.existsSync(pyTestsDir) && fs.readdirSync(pyTestsDir).some(f => f.endsWith('.py')))) {
      return {
        hasTests: true,
        testCommand: 'pytest',
        techStack: 'python',
        details: 'Discovered Python test suite with pytest runner',
      };
    }

    return {
      hasTests: false,
      techStack: 'generic',
      details: 'No automated test suite discovered in workspace manifests.',
    };
  }

  /**
   * Execute tests through SafeTerminal and capture real exit codes, stdout, stderr.
   */
  public async executeTests(overrideCommand?: string): Promise<TestExecutionResult> {
    const config = this.discoverTestConfiguration();
    const command = overrideCommand || config.testCommand || config.buildCommand;

    if (!command) {
      return {
        executed: false,
        command: '',
        exitCode: 0,
        passed: false,
        stdout: '',
        stderr: 'No test or build command available to execute.',
        durationMs: 0,
        parsedFailures: [],
      };
    }

    const startTime = Date.now();
    const termResult = await this.safeTerminal.executeCommand(command, { timeoutMs: 45000, bypassApproval: true });
    const durationMs = termResult.durationMs || (Date.now() - startTime);

    const stdout = termResult.stdout || '';
    const stderr = termResult.stderr || (termResult.error || '');
    const exitCode = termResult.exitCode;
    const passed = exitCode === 0;

    const parsedFailures = this.parseErrorDiagnostics(stdout, stderr);

    return {
      executed: true,
      command,
      exitCode,
      passed,
      stdout,
      stderr,
      durationMs,
      parsedFailures,
    };
  }

  /**
   * Parse test output and error traces into actionable diagnostic strings.
   */
  public parseErrorDiagnostics(stdout: string, stderr: string): string[] {
    const diagnostics: string[] = [];
    const combined = `${stdout}\n${stderr}`;

    const lines = combined.split('\n');
    for (const line of lines) {
      const clean = line.trim();
      // Assertion & TAP errors
      if (clean.includes('AssertionError') || clean.includes('assert.') || clean.includes('Expected') || clean.includes('not ok')) {
        diagnostics.push(clean);
      }
      // Syntax, reference & runtime type errors
      else if (clean.includes('SyntaxError') || clean.includes('ReferenceError') || clean.includes('TypeError') || clean.includes('Error:')) {
        diagnostics.push(clean);
      }
      // Jest / Vitest / Mocha failure lines
      else if (clean.startsWith('✕') || clean.startsWith('FAIL') || clean.includes('failed:')) {
        diagnostics.push(clean);
      }
      // Node module resolution errors
      else if (clean.includes('Cannot find module') || clean.includes('MODULE_NOT_FOUND')) {
        diagnostics.push(clean);
      }
    }

    return Array.from(new Set(diagnostics)).slice(0, 10);
  }
}
