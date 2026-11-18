/**
 * MaxIDE APEX — Mission 7: Reasoning & Decision Engine + Strategy Selection (Modules A & D)
 * Implements objective-driven 12-step planning, 9-criteria strategy comparison,
 * native Windows desktop vs web vs backend platform discernment,
 * self-directed application improvement workflows, and Contextual Bandit + Experience Memory integration.
 */

import fs from 'fs';
import path from 'path';
import { BanditContext, BanditSelection, ContextualBandit } from './ContextualBandit.js';
import { ExperienceMemory, SimilarExperienceMatch } from './ExperienceMemory.js';

export type TargetPlatform =
  | 'NATIVE_WINDOWS'
  | 'WEB_APP'
  | 'FULLSTACK_WEB'
  | 'BACKEND_SERVICE'
  | 'MOBILE_APP'
  | 'CROSS_PLATFORM'
  | 'CLI_UTILITY';

export type TaskCategory =
  | 'NATIVE_DESKTOP_BUILD'
  | 'WEB_APP_BUILD'
  | 'FULLSTACK_BUILD'
  | 'BACKEND_API'
  | 'DEBUG_AND_REPAIR'
  | 'SELF_DIRECTED_IMPROVEMENT'
  | 'REFACTOR_AND_TEST'
  | 'EXPLAIN_OR_AUDIT';

export interface StrategyCriteriaScores {
  requirementCoverage: number;   // 0..1
  technicalFeasibility: number;  // 0..1
  maintainability: number;       // 0..1
  performance: number;           // 0..1
  security: number;              // 0..1
  cost: number;                  // 0..1 (1 = ₹0 local-first)
  hardwareCompatibility: number; // 0..1 (Windows 11, 16GB RAM, 4GB VRAM)
  complexity: number;            // 0..1 (1 = cleanly manageable, low failure risk)
  verificationFeasibility: number; // 0..1
}

export interface CandidateStrategy {
  id: string;
  name: string;
  targetPlatform: TargetPlatform;
  taskCategories: TaskCategory[];
  summary: string;
  executionStages: string[];
  recommendedTools: string[];
  criteria: StrategyCriteriaScores;
  weightedHeuristicScore: number;
  pros: string[];
  cons: string[];
}

export interface WorkspaceInspectionSummary {
  projectId: string;
  rootPath: string;
  fileCount: number;
  topFiles: string[];
  detectedStack: string[];
  hasPackageJson: boolean;
  hasHtmlEntry: boolean;
  hasCSharpOrDotnet: boolean;
  hasPython: boolean;
  hasTests: boolean;
  isEmptyWorkspace: boolean;
}

export interface ObjectiveAnalysis {
  rawPrompt: string;
  requestedOutcome: string;
  taskCategory: TaskCategory;
  targetPlatform: TargetPlatform;
  functionalRequirements: string[];
  qualityExpectations: string[];
  platformConstraints: string[];
  missingInformation: string[];
  needsClarification: boolean;
  clarificationQuestion?: string;
  autoDefaultsApplied: boolean;
}

export interface DecisionPlan {
  id: string;
  projectId: string;
  createdAt: string;
  analysis: ObjectiveAnalysis;
  workspace: WorkspaceInspectionSummary;
  candidates: CandidateStrategy[];
  selectedStrategy: CandidateStrategy;
  banditSelection: BanditSelection;
  similarExperiences: SimilarExperienceMatch[];
  decisionRationale: string;
  orderedStages: string[];
  promptGuidance: string;
}

const CRITERIA_WEIGHTS: Record<keyof StrategyCriteriaScores, number> = {
  requirementCoverage: 0.22,
  technicalFeasibility: 0.16,
  maintainability: 0.11,
  performance: 0.09,
  security: 0.11,
  cost: 0.07,
  hardwareCompatibility: 0.08,
  complexity: 0.06,
  verificationFeasibility: 0.10,
};

export function computeWeightedCriteriaScore(c: StrategyCriteriaScores): number {
  let sum = 0;
  for (const key of Object.keys(CRITERIA_WEIGHTS) as Array<keyof StrategyCriteriaScores>) {
    sum += (c[key] ?? 0.5) * CRITERIA_WEIGHTS[key];
  }
  return Math.round(sum * 10000) / 10000;
}

export class ReasoningDecisionEngine {
  constructor(
    private memory: ExperienceMemory,
    private bandit: ContextualBandit
  ) {}

  /**
   * Execute the 12-step objective-driven reasoning, strategy comparison,
   * experience retrieval, and contextual bandit selection pipeline.
   */
  public plan(input: {
    prompt: string;
    workspacePath: string;
    projectId?: string;
    modelId?: string;
    modelTier?: 'local-small' | 'local-medium' | 'cloud';
    allowCrossProject?: boolean;
  }): DecisionPlan {
    const projectId = input.projectId || ReasoningDecisionEngine.deriveProjectId(input.workspacePath);
    const workspace = this.inspectWorkspace(input.workspacePath, projectId);
    const analysis = this.analyzeObjective(input.prompt, workspace);
    const candidates = this.generateFeasibleStrategies(analysis, workspace);

    // Retrieve verified similar experiences from SQLite ExperienceMemory
    const similarExperiences = this.memory.retrieveSimilarEpisodes(input.prompt, {
      projectId: input.allowCrossProject === false ? projectId : undefined,
      taskCategory: analysis.taskCategory,
      verifiedOnly: false,
      topK: 5,
    });

    // Build heuristic prior map for Contextual Bandit, gently incorporating verified similar episodes
    const heuristicPriors: Record<string, number> = {};
    for (const strat of candidates) {
      let prior = strat.weightedHeuristicScore;
      const matchingVerified = similarExperiences.filter(
        (m) => m.episode.strategyId === strat.id && m.episode.verified && m.similarity >= 0.2
      );
      const matchingFailed = similarExperiences.filter(
        (m) => m.episode.strategyId === strat.id && m.episode.status === 'FAILED' && m.similarity >= 0.25
      );
      if (matchingVerified.length > 0) {
        prior = Math.min(0.98, prior + 0.06 * Math.min(2, matchingVerified.length));
      }
      if (matchingFailed.length > 0) {
        prior = Math.max(0.05, prior - 0.08 * Math.min(2, matchingFailed.length));
      }
      heuristicPriors[strat.id] = Math.round(prior * 10000) / 10000;
    }

    const modelTier = input.modelTier || ReasoningDecisionEngine.inferModelTier(input.modelId || '');
    const banditCtx: BanditContext = {
      taskCategory: analysis.taskCategory,
      platform: analysis.targetPlatform,
      modelTier,
    };

    const banditSelection = this.bandit.selectStrategy(
      banditCtx,
      candidates.map((c) => c.id),
      heuristicPriors
    );

    const selectedStrategy =
      candidates.find((c) => c.id === banditSelection.selectedStrategyId) || candidates[0];

    // Sort candidates by bandit final score for clean presentation
    const scoreMap = new Map(banditSelection.scores.map((s) => [s.strategyId, s.score]));
    const rankedCandidates = [...candidates].sort(
      (a, b) => (scoreMap.get(b.id) ?? b.weightedHeuristicScore) - (scoreMap.get(a.id) ?? a.weightedHeuristicScore)
    );

    const decisionRationale = this.buildDecisionRationale(
      analysis,
      selectedStrategy,
      rankedCandidates,
      banditSelection,
      similarExperiences
    );

    const promptGuidance = this.buildPromptGuidance(
      analysis,
      selectedStrategy,
      similarExperiences
    );

    return {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      createdAt: new Date().toISOString(),
      analysis,
      workspace,
      candidates: rankedCandidates,
      selectedStrategy,
      banditSelection,
      similarExperiences,
      decisionRationale,
      orderedStages: [...selectedStrategy.executionStages],
      promptGuidance,
    };
  }

  public static deriveProjectId(workspacePath: string): string {
    const norm = path.resolve(workspacePath || process.cwd()).replace(/\\/g, '/').toLowerCase();
    const base = path.basename(norm) || 'workspace';
    let hash = 2166136261;
    for (let i = 0; i < norm.length; i++) {
      hash ^= norm.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${base}-${(hash >>> 0).toString(36).slice(0, 6)}`;
  }

  public static inferModelTier(modelId: string): 'local-small' | 'local-medium' | 'cloud' {
    const m = (modelId || '').toLowerCase();
    if (!m || m.includes('0.5b') || m.includes('1.5b') || m.includes('3b') || m.includes('4b')) {
      return 'local-small';
    }
    if (m.includes('7b') || m.includes('8b') || m.includes('14b') || m.includes('ollama')) {
      return 'local-medium';
    }
    if (m.includes('gemini') || m.includes('gpt') || m.includes('claude') || m.includes('groq') || m.includes('llama-3.3')) {
      return 'cloud';
    }
    return 'local-small';
  }

  /**
   * Step 5: Fast deterministic workspace inspection (never guesses structure).
   */
  public inspectWorkspace(workspacePath: string, projectId: string): WorkspaceInspectionSummary {
    const root = path.resolve(workspacePath || process.cwd());
    const topFiles: string[] = [];
    const stack = new Set<string>();
    let hasPackageJson = false;
    let hasHtmlEntry = false;
    let hasCSharpOrDotnet = false;
    let hasPython = false;
    let hasTests = false;
    let fileCount = 0;

    if (fs.existsSync(root)) {
      try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const e of entries) {
          if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'bin' || e.name === 'obj') {
            continue;
          }
          fileCount++;
          if (topFiles.length < 20) topFiles.push(e.isDirectory() ? `${e.name}/` : e.name);
          const lower = e.name.toLowerCase();
          if (lower === 'package.json') {
            hasPackageJson = true;
            stack.add('Node.js');
            try {
              const pkg = JSON.parse(fs.readFileSync(path.join(root, e.name), 'utf8'));
              const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
              if (deps.typescript) stack.add('TypeScript');
              if (deps.react) stack.add('React');
              if (deps.express) stack.add('Express');
              if (deps.vite) stack.add('Vite');
              if (deps.playwright) stack.add('Playwright');
              if (pkg.scripts?.test) hasTests = true;
            } catch {}
          }
          if (lower.endsWith('.html')) {
            hasHtmlEntry = true;
            stack.add('HTML/CSS/JS');
          }
          if (lower.endsWith('.cs') || lower.endsWith('.csproj') || lower.endsWith('.sln') || lower === 'desktop') {
            hasCSharpOrDotnet = true;
            stack.add('C#/.NET');
          }
          if (lower.endsWith('.py') || lower === 'requirements.txt' || lower === 'pyproject.toml') {
            hasPython = true;
            stack.add('Python');
          }
          if (lower.includes('test') || lower === 'tests' || lower === '__tests__') {
            hasTests = true;
          }
        }
      } catch {}
    }

    return {
      projectId,
      rootPath: root,
      fileCount,
      topFiles,
      detectedStack: Array.from(stack),
      hasPackageJson,
      hasHtmlEntry,
      hasCSharpOrDotnet,
      hasPython,
      hasTests,
      isEmptyWorkspace: fileCount === 0,
    };
  }

  /**
   * Steps 1–4 & 6: Extract requested outcome, functional requirements,
   * quality expectations, platform constraints, and whether clarification is truly required.
   */
  public analyzeObjective(rawPrompt: string, workspace: WorkspaceInspectionSummary): ObjectiveAnalysis {
    const prompt = (rawPrompt || '').trim();
    const lower = prompt.toLowerCase();

    const autoDefaultsApplied =
      /\b(do whichever is best|choose for me|decide yourself|your choice|everything by yourself|auto)\b/i.test(lower);

    // Detect target platform carefully — NEVER conflate native Windows desktop with browser HTML
    const explicitNativeWindows =
      /\b(native\s+windows|windows\s+desktop\s+app|windows\s+app|winforms|wpf|winui|win32|\.exe\b|desktop\s+executable|c#\s+desktop|tauri\s+desktop|native\s+desktop)\b/i.test(lower);
    const explicitMobile =
      /\b(android\s+app|ios\s+app|flutter|react\s+native|mobile\s+app)\b/i.test(lower);
    const explicitBackend =
      /\b(rest\s+api|backend\s+service|microservice|graphql\s+server|express\s+api|fastapi|cli\s+tool|command[- ]line)\b/i.test(lower) &&
      !/\b(ui|frontend|dashboard|website|html|page|browser)\b/i.test(lower);
    const explicitFullstack =
      /\b(full[- ]?stack|backend\s+and\s+frontend|database\s+and\s+ui|api\s+and\s+dashboard|express\s+and\s+react|sqlite.*ui)\b/i.test(lower);
    const explicitCrossPlatform =
      /\b(cross[- ]?platform\s+desktop|electron\s+app|tauri\s+app)\b/i.test(lower);
    const explicitCli =
      /\b(cli\s+tool|cli\s+app|command[- ]line\s+utility|terminal\s+tool)\b/i.test(lower);

    let targetPlatform: TargetPlatform = 'WEB_APP';
    if (explicitNativeWindows) targetPlatform = 'NATIVE_WINDOWS';
    else if (explicitCrossPlatform) targetPlatform = 'CROSS_PLATFORM';
    else if (explicitMobile) targetPlatform = 'MOBILE_APP';
    else if (explicitCli) targetPlatform = 'CLI_UTILITY';
    else if (explicitFullstack) targetPlatform = 'FULLSTACK_WEB';
    else if (explicitBackend) targetPlatform = 'BACKEND_SERVICE';
    else if (workspace.hasCSharpOrDotnet && !workspace.hasHtmlEntry && /\b(app|window|form|build|improve)\b/i.test(lower)) {
      targetPlatform = 'NATIVE_WINDOWS';
    }

    // Detect task category
    const isSelfDirectedImprovement =
      /\b(improve\s+this\s+app|improve\s+this\s+application|until\s+it\s+meets\s+quality|polish\s+this\s+app|audit\s+and\s+improve|make\s+this\s+production[- ]ready|self[- ]directed|upgrade\s+the\s+existing\s+app)\b/i.test(lower);
    const isDebugRepair =
      /\b(fix|debug|repair|broken|crash|error|exception|bug|failing|not\s+working|unable\s+to\s+open|500|404)\b/i.test(lower);
    const isRefactorTest =
      /\b(refactor|write\s+tests|add\s+unit\s+tests|test\s+suite|clean\s+up\s+code)\b/i.test(lower);
    const isExplainAudit =
      /^(explain|review|summarize|inspect|what\s+does|how\s+does|analyze)\b/i.test(lower) &&
      !/\b(fix|build|create|implement|improve|modify|edit)\b/i.test(lower);

    let taskCategory: TaskCategory;
    if (isSelfDirectedImprovement) {
      taskCategory = 'SELF_DIRECTED_IMPROVEMENT';
    } else if (isDebugRepair) {
      taskCategory = 'DEBUG_AND_REPAIR';
    } else if (isRefactorTest) {
      taskCategory = 'REFACTOR_AND_TEST';
    } else if (isExplainAudit) {
      taskCategory = 'EXPLAIN_OR_AUDIT';
    } else if (targetPlatform === 'NATIVE_WINDOWS' || targetPlatform === 'CROSS_PLATFORM') {
      taskCategory = 'NATIVE_DESKTOP_BUILD';
    } else if (targetPlatform === 'FULLSTACK_WEB') {
      taskCategory = 'FULLSTACK_BUILD';
    } else if (targetPlatform === 'BACKEND_SERVICE' || targetPlatform === 'CLI_UTILITY') {
      taskCategory = 'BACKEND_API';
    } else {
      taskCategory = 'WEB_APP_BUILD';
    }

    // Extract functional requirements from clauses
    const functionalRequirements: string[] = [];
    const clauses = prompt
      .split(/[\n.;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6);
    for (const c of clauses.slice(0, 6)) {
      functionalRequirements.push(c);
    }
    if (functionalRequirements.length === 0 && prompt.length > 0) {
      functionalRequirements.push(prompt);
    }

    // Extract quality expectations
    const qualityExpectations: string[] = [
      'Verified execution evidence before claiming completion',
      'No placeholder stubs or unverified code claims',
    ];
    if (/\b(modern|premium|polished|beautiful|responsive|clean\s+ui|dashboard)\b/i.test(lower)) {
      qualityExpectations.push('Responsive, visually polished interface with zero broken layout or console errors');
    }
    if (/\b(secure|security|safe|sanitize|auth)\b/i.test(lower)) {
      qualityExpectations.push('Strict security hygiene and secret protection');
    }
    if (/\b(fast|lightweight|performance|low\s+memory)\b/i.test(lower)) {
      qualityExpectations.push('Resource-efficient execution on 16 GB RAM / 4 GB VRAM hardware');
    }
    if (taskCategory === 'SELF_DIRECTED_IMPROVEMENT') {
      qualityExpectations.push('Preserve existing application identity while fixing real defects and proving regression safety');
    }

    // Platform constraints
    const platformConstraints: string[] = [
      'Host OS: Windows 11 x64',
      'Hardware Budget: 16 GB RAM, RTX 3050 4 GB VRAM, ₹0 zero-cost local-first',
    ];
    if (targetPlatform === 'NATIVE_WINDOWS') {
      platformConstraints.push('MUST deliver a real native Windows executable/desktop application (NEVER substitute browser-only HTML)');
    }

    // Only ask for clarification when truly ambiguous AND destructive/impossible to default safely
    const missingInformation: string[] = [];
    let needsClarification = false;
    let clarificationQuestion: string | undefined;

    if (!autoDefaultsApplied && prompt.length < 8 && /^(build|create|make|app|fix)$/i.test(prompt)) {
      missingInformation.push('Concrete application purpose or target feature');
      needsClarification = true;
      clarificationQuestion = 'What application or problem would you like MaxIDE to build or fix?';
    }

    return {
      rawPrompt: prompt,
      requestedOutcome: functionalRequirements[0] || prompt,
      taskCategory,
      targetPlatform,
      functionalRequirements,
      qualityExpectations,
      platformConstraints,
      missingInformation,
      needsClarification,
      clarificationQuestion,
      autoDefaultsApplied,
    };
  }

  /**
   * Steps 7–8: Generate and score multiple genuinely distinct engineering strategies
   * across all 9 decision criteria so the system evaluates alternatives instead of blindly
   * taking the first plan.
   */
  public generateFeasibleStrategies(
    analysis: ObjectiveAnalysis,
    workspace: WorkspaceInspectionSummary
  ): CandidateStrategy[] {
    const raw: Array<Omit<CandidateStrategy, 'weightedHeuristicScore'>> = [];

    if (analysis.taskCategory === 'NATIVE_DESKTOP_BUILD' || analysis.targetPlatform === 'NATIVE_WINDOWS') {
      // Native Windows Desktop Engineering Options (NEVER browser HTML!)
      raw.push(
        {
          id: 'native-winforms-csc',
          name: 'Native Windows C# WinForms (Zero-SDK csc.exe)',
          targetPlatform: 'NATIVE_WINDOWS',
          taskCategories: ['NATIVE_DESKTOP_BUILD'],
          summary: 'Compiles a real standalone native Windows .exe using built-in Windows .NET Framework csc.exe with zero external downloads and minimal RAM footprint.',
          executionStages: [
            'Inspect workspace and verify Windows .NET Framework csc.exe availability',
            'Design native Windows Form layout, controls, menus, keyboard shortcuts, and state persistence',
            'Implement C# source files (Program.cs, MainForm.cs, Services) with high-DPI support',
            'Compile native Windows executable (.exe) via csc.exe with strict error checking',
            'Verify executable launches cleanly, run automated verification script, and confirm persisted state',
          ],
          recommendedTools: ['list_files', 'write_file', 'run_command', 'read_file'],
          criteria: {
            requirementCoverage: 0.94,
            technicalFeasibility: 0.96,
            maintainability: 0.84,
            performance: 0.95,
            security: 0.90,
            cost: 1.0,
            hardwareCompatibility: 0.98,
            complexity: 0.88,
            verificationFeasibility: 0.90,
          },
          pros: ['Guaranteed native .exe on Windows 11 with zero downloads', 'Tiny memory footprint (<35 MB RAM)', 'Fast compile cycle (<2s)'],
          cons: ['Classic Win32/WinForms styling requires custom owner-draw for modern dark themes'],
        },
        {
          id: 'native-wpf-dotnet',
          name: 'Native Windows C# WPF (.NET 8 SDK)',
          targetPlatform: 'NATIVE_WINDOWS',
          taskCategories: ['NATIVE_DESKTOP_BUILD'],
          summary: 'Hardware-accelerated XAML desktop UI compiled with dotnet SDK for rich modern Windows desktop apps.',
          executionStages: [
            'Verify dotnet SDK installation and target framework',
            'Scaffold WPF .csproj, App.xaml, and MainWindow.xaml with MVVM view-models',
            'Implement native business logic, bindings, and local SQLite/JSON storage',
            'Run dotnet build and dotnet test to verify compilation and unit tests',
            'Launch compiled WPF binary and confirm zero startup exceptions',
          ],
          recommendedTools: ['run_command', 'write_file', 'read_file'],
          criteria: {
            requirementCoverage: 0.96,
            technicalFeasibility: 0.78,
            maintainability: 0.92,
            performance: 0.92,
            security: 0.92,
            cost: 1.0,
            hardwareCompatibility: 0.92,
            complexity: 0.72,
            verificationFeasibility: 0.86,
          },
          pros: ['Rich XAML styling and hardware acceleration', 'Strong MVVM separation'],
          cons: ['Requires .NET 8 SDK installed on machine'],
        },
        {
          id: 'native-tauri-rust',
          name: 'Native Desktop Tauri (Rust + WebView2)',
          targetPlatform: 'CROSS_PLATFORM',
          taskCategories: ['NATIVE_DESKTOP_BUILD'],
          summary: 'Lightweight native WebView2 shell backed by Rust commands for modern desktop UI with small binary size.',
          executionStages: [
            'Verify cargo/rustc and WebView2 runtime availability',
            'Scaffold Tauri backend commands and frontend assets',
            'Implement native IPC handlers and secure filesystem allowlist',
            'Build native executable via cargo tauri build and verify tests',
          ],
          recommendedTools: ['run_command', 'write_file', 'read_file'],
          criteria: {
            requirementCoverage: 0.92,
            technicalFeasibility: 0.65,
            maintainability: 0.85,
            performance: 0.94,
            security: 0.94,
            cost: 1.0,
            hardwareCompatibility: 0.86,
            complexity: 0.58,
            verificationFeasibility: 0.78,
          },
          pros: ['Modern UI with low RAM via system WebView2', 'Strong Rust safety'],
          cons: ['Requires Rust toolchain + MSVC build tools; slower first compile'],
        },
        {
          id: 'native-electron-node',
          name: 'Cross-Platform Electron Desktop Shell',
          targetPlatform: 'CROSS_PLATFORM',
          taskCategories: ['NATIVE_DESKTOP_BUILD'],
          summary: 'Packages Node.js + Chromium into a desktop shell with IPC preload bridge.',
          executionStages: [
            'Initialize package.json with electron and preload bridge',
            'Implement main process window lifecycle and renderer UI',
            'Verify strict contextIsolation and nodeIntegration=false',
            'Smoke-test Electron startup and IPC handlers',
          ],
          recommendedTools: ['run_command', 'write_file', 'read_file'],
          criteria: {
            requirementCoverage: 0.88,
            technicalFeasibility: 0.76,
            maintainability: 0.84,
            performance: 0.62,
            security: 0.78,
            cost: 1.0,
            hardwareCompatibility: 0.65,
            complexity: 0.74,
            verificationFeasibility: 0.82,
          },
          pros: ['Familiar JS/TS stack across OSes'],
          cons: ['High RAM/disk overhead (150MB+ Chromium bundle) on 16GB machine'],
        }
      );
    } else if (analysis.taskCategory === 'SELF_DIRECTED_IMPROVEMENT') {
      raw.push(
        {
          id: 'self-directed-quality-loop',
          name: 'Self-Directed Inspect -> Audit -> Prioritize -> Patch -> Regress Loop',
          targetPlatform: analysis.targetPlatform,
          taskCategories: ['SELF_DIRECTED_IMPROVEMENT'],
          summary: 'Inspects the existing application, runs it, audits UX/runtime/code defects, prioritizes high-impact issues, applies surgical fixes preserving identity, verifies tests, and re-inspects.',
          executionStages: [
            'Inspect existing workspace files, architecture, and entry points (never overwrite blindly)',
            'Launch or build the current application and capture live runtime/console/test baseline',
            'Audit visual hierarchy, responsiveness, error handling, edge cases, and security',
            'Prioritize findings into Critical -> Functional -> Visual Polish queue',
            'Apply targeted surgical improvements while preserving existing product identity',
            'Run automated build/test/browser regression suite to verify zero regressions',
            'Re-inspect updated application and produce evidence-backed improvement report',
          ],
          recommendedTools: ['list_files', 'read_file', 'search_files', 'replace_in_file', 'run_command'],
          criteria: {
            requirementCoverage: 0.96,
            technicalFeasibility: 0.94,
            maintainability: 0.95,
            performance: 0.90,
            security: 0.94,
            cost: 1.0,
            hardwareCompatibility: 0.96,
            complexity: 0.85,
            verificationFeasibility: 0.95,
          },
          pros: ['Preserves working features & identity', 'Evidence-driven prioritization', 'Prevents regressions'],
          cons: ['Takes structured multi-step passes rather than single-shot rewrite'],
        },
        {
          id: 'incremental-ux-polish-pass',
          name: 'Targeted UI/UX & Error-Handling Refinement',
          targetPlatform: analysis.targetPlatform,
          taskCategories: ['SELF_DIRECTED_IMPROVEMENT'],
          summary: 'Focused refinement pass targeting CSS layout, accessibility, empty/error states, and interactive responsiveness.',
          executionStages: [
            'Read existing UI templates and stylesheets',
            'Fix layout overflow, contrast, responsive breakpoints, and dead controls',
            'Verify rendered UI with zero console errors',
          ],
          recommendedTools: ['read_file', 'replace_in_file', 'run_command'],
          criteria: {
            requirementCoverage: 0.78,
            technicalFeasibility: 0.95,
            maintainability: 0.88,
            performance: 0.92,
            security: 0.86,
            cost: 1.0,
            hardwareCompatibility: 0.96,
            complexity: 0.92,
            verificationFeasibility: 0.88,
          },
          pros: ['Fast and low-risk for frontend-only polish'],
          cons: ['May miss deeper backend logic or architectural defects'],
        },
        {
          id: 'static-refactor-and-test-hardening',
          name: 'Architecture Refactor & Test Hardening Pass',
          targetPlatform: analysis.targetPlatform,
          taskCategories: ['SELF_DIRECTED_IMPROVEMENT'],
          summary: 'Hardens edge cases, error handling, types, and automated test coverage before UI polish.',
          executionStages: [
            'Inspect core logic modules and existing tests',
            'Add missing validation, error handling, and unit tests',
            'Execute full test suite and verify 100% pass rate',
          ],
          recommendedTools: ['read_file', 'replace_in_file', 'write_file', 'run_command'],
          criteria: {
            requirementCoverage: 0.82,
            technicalFeasibility: 0.92,
            maintainability: 0.94,
            performance: 0.88,
            security: 0.95,
            cost: 1.0,
            hardwareCompatibility: 0.96,
            complexity: 0.86,
            verificationFeasibility: 0.94,
          },
          pros: ['High reliability and regression safety'],
          cons: ['Less focus on visual/UX refinement unless paired with UI audit'],
        }
      );
    } else if (analysis.taskCategory === 'DEBUG_AND_REPAIR') {
      raw.push(
        {
          id: 'reproduce-root-cause-surgical-fix',
          name: 'Reproduce -> Root-Cause Trace -> Surgical Patch -> Regression Test',
          targetPlatform: analysis.targetPlatform,
          taskCategories: ['DEBUG_AND_REPAIR'],
          summary: 'Reproduces the exact failure first, inspects call sites, applies the minimal verified root-cause fix, and re-runs tests to confirm resolution.',
          executionStages: [
            'Inspect failing files and error traces without guessing',
            'Reproduce the failure via command or test execution',
            'Identify the true root cause and affected edge cases',
            'Apply minimal surgical patch using inspected file context',
            'Re-run reproduction and regression tests to verify repair',
          ],
          recommendedTools: ['search_files', 'read_file', 'run_command', 'replace_in_file'],
          criteria: {
            requirementCoverage: 0.95,
            technicalFeasibility: 0.94,
            maintainability: 0.94,
            performance: 0.90,
            security: 0.92,
            cost: 1.0,
            hardwareCompatibility: 0.96,
            complexity: 0.88,
            verificationFeasibility: 0.96,
          },
          pros: ['Eliminates guesswork and band-aid fixes', 'Proves fix with real test output'],
          cons: ['Requires reading relevant modules before editing'],
        },
        {
          id: 'defensive-guard-and-fallback-patch',
          name: 'Defensive Guard & Runtime Diagnostic Patch',
          targetPlatform: analysis.targetPlatform,
          taskCategories: ['DEBUG_AND_REPAIR'],
          summary: 'Adds explicit input validation, structured error reporting, and safe fallbacks around unstable runtime boundaries.',
          executionStages: [
            'Read failing boundary module',
            'Add defensive validation and explicit actionable errors',
            'Verify error handling path under negative inputs',
          ],
          recommendedTools: ['read_file', 'replace_in_file', 'run_command'],
          criteria: {
            requirementCoverage: 0.82,
            technicalFeasibility: 0.95,
            maintainability: 0.84,
            performance: 0.92,
            security: 0.90,
            cost: 1.0,
            hardwareCompatibility: 0.96,
            complexity: 0.92,
            verificationFeasibility: 0.88,
          },
          pros: ['Fast stabilization for runtime edge cases'],
          cons: ['Less thorough if deeper architectural bug exists'],
        }
      );
    } else if (analysis.taskCategory === 'BACKEND_API' || analysis.taskCategory === 'FULLSTACK_BUILD') {
      raw.push(
        {
          id: 'modular-node-ts-sqlite-service',
          name: 'Modular Node.js + Express + Local SQLite/JSON Architecture',
          targetPlatform: analysis.targetPlatform,
          taskCategories: ['BACKEND_API', 'FULLSTACK_BUILD'],
          summary: 'Clean layered REST API + local persistence + automated integration tests with zero paid external services.',
          executionStages: [
            'Inspect existing workspace dependencies and conventions',
            'Design data schema, API contract, and validation layer',
            'Implement modular service, storage, and HTTP routes',
            'Build frontend integration if full-stack',
            'Run automated endpoint & persistence verification tests',
          ],
          recommendedTools: ['list_files', 'read_file', 'write_file', 'run_command'],
          criteria: {
            requirementCoverage: 0.94,
            technicalFeasibility: 0.94,
            maintainability: 0.92,
            performance: 0.90,
            security: 0.92,
            cost: 1.0,
            hardwareCompatibility: 0.95,
            complexity: 0.84,
            verificationFeasibility: 0.94,
          },
          pros: ['Zero cloud cost', 'Fast local startup & deterministic API tests'],
          cons: ['Requires Node runtime'],
        },
        {
          id: 'zero-dep-node-http-service',
          name: 'Zero-Dependency Native Node HTTP + File Storage Service',
          targetPlatform: analysis.targetPlatform,
          taskCategories: ['BACKEND_API', 'FULLSTACK_BUILD'],
          summary: 'Ultra-lightweight service using Node built-ins (`http`, `fs`, `crypto`) with zero npm install latency.',
          executionStages: [
            'Design routes and atomic JSON persistence',
            'Implement zero-dependency server module',
            'Verify live HTTP responses and CRUD persistence via test script',
          ],
          recommendedTools: ['write_file', 'run_command'],
          criteria: {
            requirementCoverage: 0.86,
            technicalFeasibility: 0.97,
            maintainability: 0.84,
            performance: 0.96,
            security: 0.90,
            cost: 1.0,
            hardwareCompatibility: 0.98,
            complexity: 0.92,
            verificationFeasibility: 0.92,
          },
          pros: ['Instant offline startup with no package install step'],
          cons: ['Manual routing for large API surfaces'],
        }
      );
    } else {
      // WEB_APP_BUILD, REFACTOR_AND_TEST, EXPLAIN_OR_AUDIT
      const preferExistingFramework = workspace.hasPackageJson && (workspace.detectedStack.includes('React') || workspace.detectedStack.includes('Vite'));
      raw.push(
        {
          id: 'self-contained-interactive-web-app',
          name: 'Self-Contained Production HTML5/CSS3/JS Interactive App',
          targetPlatform: 'WEB_APP',
          taskCategories: ['WEB_APP_BUILD', 'REFACTOR_AND_TEST', 'EXPLAIN_OR_AUDIT'],
          summary: 'Zero-build-step, instant-preview interactive web application with full CSS design system, state management, localStorage persistence, and rich interactive controls.',
          executionStages: [
            'Inspect existing workspace files to preserve or extend cleanly',
            'Design full responsive layout, design tokens, interactive state, and sample data',
            'Write complete production-grade HTML/CSS/JS implementation (never minimal stubs)',
            'Verify HTML structure, zero JS syntax errors, interactive handlers, and live localhost preview',
          ],
          recommendedTools: ['list_files', 'write_file', 'read_file', 'run_command'],
          criteria: {
            requirementCoverage: preferExistingFramework ? 0.84 : 0.94,
            technicalFeasibility: 0.98,
            maintainability: 0.88,
            performance: 0.96,
            security: 0.92,
            cost: 1.0,
            hardwareCompatibility: 0.99,
            complexity: 0.94,
            verificationFeasibility: 0.95,
          },
          pros: ['Instant browser preview with zero bundler/network failure risk', 'Ideal for local 3B–7B models'],
          cons: ['Less modular than multi-file framework projects for huge apps'],
        },
        {
          id: 'modular-multi-file-web-app',
          name: 'Modular Multi-File Frontend (index.html + styles.css + app.js)',
          targetPlatform: 'WEB_APP',
          taskCategories: ['WEB_APP_BUILD', 'REFACTOR_AND_TEST'],
          summary: 'Separates markup, design tokens/CSS, and ES module state/logic into dedicated maintainable files.',
          executionStages: [
            'Inspect existing workspace structure',
            'Create modular styles.css, app.js, and index.html with clean separation of concerns',
            'Verify module loading, syntax checks, and live preview rendering',
          ],
          recommendedTools: ['list_files', 'write_file', 'read_file', 'run_command'],
          criteria: {
            requirementCoverage: 0.93,
            technicalFeasibility: 0.93,
            maintainability: 0.95,
            performance: 0.94,
            security: 0.92,
            cost: 1.0,
            hardwareCompatibility: 0.97,
            complexity: 0.86,
            verificationFeasibility: 0.92,
          },
          pros: ['High maintainability and clean separation of CSS/JS/HTML'],
          cons: ['Requires verifying relative asset paths across multiple files'],
        },
        {
          id: 'vite-typescript-spa',
          name: 'Vite + TypeScript Structured SPA',
          targetPlatform: 'WEB_APP',
          taskCategories: ['WEB_APP_BUILD', 'REFACTOR_AND_TEST'],
          summary: 'Type-safe componentized SPA using Vite bundler when project already uses Node/Vite or demands strict typing.',
          executionStages: [
            'Verify package.json and node_modules dependencies',
            'Implement typed components and state store',
            'Run TypeScript typecheck, production build, and automated tests',
          ],
          recommendedTools: ['list_files', 'read_file', 'write_file', 'run_command'],
          criteria: {
            requirementCoverage: preferExistingFramework ? 0.96 : 0.88,
            technicalFeasibility: preferExistingFramework ? 0.94 : 0.72,
            maintainability: 0.96,
            performance: 0.90,
            security: 0.92,
            cost: 1.0,
            hardwareCompatibility: 0.85,
            complexity: 0.70,
            verificationFeasibility: 0.90,
          },
          pros: ['Strong static typing and modern bundler ecosystem'],
          cons: ['Requires npm install + build step if starting from empty workspace'],
        }
      );
    }

    return raw.map((item) => ({
      ...item,
      weightedHeuristicScore: computeWeightedCriteriaScore(item.criteria),
    }));
  }

  private buildDecisionRationale(
    analysis: ObjectiveAnalysis,
    selected: CandidateStrategy,
    ranked: CandidateStrategy[],
    banditSelection: BanditSelection,
    similar: SimilarExperienceMatch[]
  ): string {
    const runnerUp = ranked.find((r) => r.id !== selected.id);
    const verifiedMatches = similar.filter((s) => s.episode.verified).length;
    const parts: string[] = [
      `Selected "${selected.name}" (${selected.id}) for ${analysis.taskCategory} on ${analysis.targetPlatform}.`,
      `Evaluated ${ranked.length} feasible strategies across 9 criteria (weighted heuristic=${selected.weightedHeuristicScore.toFixed(2)}).`,
    ];
    if (runnerUp) {
      parts.push(`Preferred over "${runnerUp.name}" (heuristic=${runnerUp.weightedHeuristicScore.toFixed(2)}).`);
    }
    parts.push(banditSelection.rationale);
    if (verifiedMatches > 0) {
      parts.push(`Informed by ${verifiedMatches} verified similar past episode(s) in Experience Memory.`);
    }
    return parts.join(' ');
  }

  private buildPromptGuidance(
    analysis: ObjectiveAnalysis,
    selected: CandidateStrategy,
    similar: SimilarExperienceMatch[]
  ): string {
    const lines: string[] = [
      `=== ADAPTIVE REASONING & STRATEGY DIRECTIVE ===`,
      `Task Category: ${analysis.taskCategory} | Target Platform: ${analysis.targetPlatform}`,
      `Selected Strategy: ${selected.name} (${selected.id})`,
      `Execution Stages:`,
      ...selected.executionStages.map((s, idx) => `  ${idx + 1}. ${s}`),
    ];

    if (analysis.targetPlatform === 'NATIVE_WINDOWS') {
      lines.push(
        `CRITICAL PLATFORM CONSTRAINT: The user requested a NATIVE WINDOWS desktop application. Do NOT substitute a browser-only HTML file. Build and compile a real native Windows desktop artifact.`
      );
    }
    if (analysis.taskCategory === 'SELF_DIRECTED_IMPROVEMENT') {
      lines.push(
        `SELF-DIRECTED IMPROVEMENT RULE: Inspect existing files first, preserve the application's core identity, fix real prioritized defects, and run verification checks before summarizing.`
      );
    }

    const usefulMemories = similar.filter((m) => m.similarity >= 0.2).slice(0, 3);
    if (usefulMemories.length > 0) {
      lines.push(`Relevant Past Experiences (verified evidence only):`);
      for (const m of usefulMemories) {
        const tag = m.episode.verified ? 'VERIFIED_SUCCESS' : m.episode.status;
        lines.push(
          `  - [${tag}, reward=${m.episode.reward.toFixed(2)}, sim=${m.similarity.toFixed(2)}] strategy=${m.episode.strategyId}: ${m.episode.summary.slice(0, 140)}`
        );
      }
    }
    lines.push(`=== END DIRECTIVE ===`);
    return lines.join('\n');
  }
}
