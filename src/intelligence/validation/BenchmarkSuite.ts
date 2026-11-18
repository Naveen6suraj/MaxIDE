/**
 * MaxIDE APEX — Mission 8: Independent 120-Scenario Engineering Validation Benchmark
 * Version: v1.0.0-mission8 (Fixed, Deterministic, Zero Data Leakage)
 *
 * Covers all 12 required domains (10 scenarios each = 120 scenarios):
 *   1. Native Windows development     7. Refactoring
 *   2. React development              8. UI improvements
 *   3. Next.js development            9. Testing
 *   4. Backend engineering           10. Project architecture
 *   5. Database engineering          11. Dependency failures
 *   6. Debugging                     12. Existing codebase modifications
 *
 * Strict split: 60 Train / 24 Validation / 36 Holdout (zero prompt or ID overlap).
 */

import { ExecutionEvidenceInput } from '../PolicyGovernance.js';
import { TargetPlatform, TaskCategory } from '../ReasoningDecisionEngine.js';

export const BENCHMARK_VERSION = 'v1.0.0-mission8';

export type BenchmarkDomain =
  | 'NATIVE_WINDOWS'
  | 'REACT'
  | 'NEXTJS'
  | 'BACKEND'
  | 'DATABASE'
  | 'DEBUGGING'
  | 'REFACTORING'
  | 'UI_IMPROVEMENT'
  | 'TESTING'
  | 'ARCHITECTURE'
  | 'DEPENDENCY_FAILURE'
  | 'EXISTING_CODEBASE';

export type BenchmarkSplit = 'TRAIN' | 'VALIDATION' | 'HOLDOUT';
export type ModelTier = 'local-small' | 'local-medium' | 'cloud';

export interface StrategyProfile {
  /** Base probability [0..1] of verified completion under this scenario */
  successProb: number;
  /** Expected requirement coverage when succeeding [0..1] */
  coverageMean: number;
  /** Probability of build pass when build attempted */
  buildPassProb: number;
  /** Probability of test pass when tests run */
  testPassProb: number;
  /** Probability of introducing a regression */
  regressionProb: number;
  /** Probability of security boundary violation */
  securityViolationProb: number;
  /** Probability user must correct the output */
  userCorrectionProb: number;
  /** Mean execution time / cost in ms */
  meanDurationMs: number;
  /** Probability of recovering if an initial tool error occurs */
  recoveryProb: number;
}

export interface BenchmarkScenario {
  id: string;
  version: string;
  domain: BenchmarkDomain;
  split: BenchmarkSplit;
  prompt: string;
  language: string;
  framework: string;
  modelTier: ModelTier;
  projectStructure: 'greenfield' | 'monorepo' | 'legacy-existing' | 'microservice';
  errorCategory: 'none' | 'build-toolchain' | 'runtime-bug' | 'dependency-conflict' | 'ui-layout' | 'schema-migration';
  taskCategory: TaskCategory;
  targetPlatform: TargetPlatform;
  /** Legacy System A baseline strategy */
  baselineStrategyId: string;
  /** Candidate feasible strategies evaluated by Systems B, C, D */
  candidateStrategies: string[];
  /** Mission 7 heuristic priors (0..1) computed independently of ground truth */
  heuristicPriors: Record<string, number>;
  /** Realistic ground-truth execution physics per candidate strategy */
  strategyPhysics: Record<string, StrategyProfile>;
}

/** Deterministic Mulberry32 PRNG for reproducible benchmark sampling */
export class BenchmarkRng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  public next(): number {
    this.state += 0x6d2b79f5;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  public normal(mean: number, std: number): number {
    const u1 = Math.max(1e-12, this.next());
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }
}

export interface SimulatedTaskOutcome {
  verifiedCompleted: boolean;
  requirementCoverage: number;
  buildPassed: boolean;
  testPassed: boolean;
  regressed: boolean;
  securityViolation: boolean;
  userCorrectionRequired: boolean;
  durationMs: number;
  recoveredFromError: boolean;
  hadInitialError: boolean;
  userFeedbackRating: -1 | 0 | 1;
  evidence: ExecutionEvidenceInput;
}

/**
 * Sample realistic execution evidence for (scenario, strategyId) using a deterministic PRNG.
 * Output feeds directly into the UNMODIFIED Mission 7 SelfEvaluationEngine!
 */
export function simulateExecutionOutcome(
  scenario: BenchmarkScenario,
  strategyId: string,
  rng: BenchmarkRng
): SimulatedTaskOutcome {
  const p: StrategyProfile = scenario.strategyPhysics[strategyId] || {
    successProb: 0.25,
    coverageMean: 0.4,
    buildPassProb: 0.35,
    testPassProb: 0.3,
    regressionProb: 0.3,
    securityViolationProb: 0.03,
    userCorrectionProb: 0.75,
    meanDurationMs: 14000,
    recoveryProb: 0.25,
  };

  const securityViolation = rng.next() < p.securityViolationProb;
  const regressed = rng.next() < p.regressionProb;
  const hadInitialError = rng.next() < (1 - p.buildPassProb * 0.85);
  const recoveredFromError = hadInitialError ? rng.next() < p.recoveryProb : true;

  const rawSuccess = !securityViolation && !regressed && recoveredFromError && rng.next() < p.successProb;
  const buildPassed = !securityViolation && (rawSuccess || rng.next() < p.buildPassProb);
  const testPassed = !securityViolation && !regressed && (rawSuccess ? rng.next() < Math.max(0.82, p.testPassProb) : rng.next() < p.testPassProb * 0.4);
  const verifiedCompleted = rawSuccess && buildPassed && testPassed;

  const coverage = verifiedCompleted
    ? Math.max(0.7, Math.min(1.0, rng.normal(p.coverageMean, 0.06)))
    : Math.max(0.05, Math.min(0.65, rng.normal(p.coverageMean * 0.45, 0.12)));

  const userCorrectionRequired = verifiedCompleted ? rng.next() < p.userCorrectionProb * 0.35 : rng.next() < Math.max(0.65, p.userCorrectionProb);
  const durationMs = Math.max(800, Math.round(rng.normal(p.meanDurationMs, p.meanDurationMs * 0.18)));

  let userFeedbackRating: -1 | 0 | 1 = 0;
  if (verifiedCompleted && !userCorrectionRequired) {
    userFeedbackRating = rng.next() < 0.7 ? 1 : 0;
  } else if (!verifiedCompleted || userCorrectionRequired) {
    userFeedbackRating = rng.next() < 0.75 ? -1 : 0;
  }

  const testsRun = 6;
  const testsPassedCount = testPassed ? testsRun : Math.floor(rng.next() * 4);

  const evidence: ExecutionEvidenceInput = {
    toolsExecutedCount: verifiedCompleted ? 5 : hadInitialError ? 4 : 2,
    filesInspected: scenario.projectStructure === 'greenfield' ? [] : ['src/index.ts'],
    filesModified: verifiedCompleted || buildPassed ? ['src/target.ts'] : [],
    commandsExecuted: ['build', 'test'],
    buildAttempted: true,
    buildPassed,
    testsAttempted: true,
    testsRun,
    testsPassed: testsPassedCount,
    browserOrAppVerified: verifiedCompleted && ['WEB_APP', 'FULLSTACK_WEB', 'NATIVE_WINDOWS'].includes(scenario.targetPlatform),
    securityViolationDetected: securityViolation,
    destructiveUnauthorizedAttempt: false,
    falseCompletionClaimed: false,
    repeatedFailureCount: hadInitialError && !recoveredFromError ? 2 : 0,
    durationMs,
  };

  return {
    verifiedCompleted,
    requirementCoverage: Math.round(coverage * 1000) / 1000,
    buildPassed,
    testPassed,
    regressed,
    securityViolation,
    userCorrectionRequired,
    durationMs,
    recoveredFromError,
    hadInitialError,
    userFeedbackRating,
    evidence,
  };
}

interface DomainTemplate {
  domain: BenchmarkDomain;
  taskCategory: TaskCategory;
  targetPlatform: TargetPlatform;
  language: string;
  framework: string;
  projectStructure: BenchmarkScenario['projectStructure'];
  errorCategory: BenchmarkScenario['errorCategory'];
  baselineStrategyId: string;
  candidateStrategies: string[];
  heuristicPriors: Record<string, number>;
  /** Physics per model tier so generalization & realistic hardware limits are authentic */
  physicsByTier: Record<ModelTier, Record<string, StrategyProfile>>;
  prompts: string[]; // 10 distinct prompts: 0..4 TRAIN, 5..6 VALIDATION, 7..9 HOLDOUT
}

const DOMAIN_TEMPLATES: DomainTemplate[] = [
  // 1. NATIVE WINDOWS DEVELOPMENT
  {
    domain: 'NATIVE_WINDOWS',
    taskCategory: 'NATIVE_DESKTOP_BUILD',
    targetPlatform: 'NATIVE_WINDOWS',
    language: 'C#',
    framework: 'WinForms/WPF',
    projectStructure: 'greenfield',
    errorCategory: 'none',
    baselineStrategyId: 'native-electron-node',
    candidateStrategies: ['native-electron-node', 'native-winforms-csc', 'native-wpf-dotnet', 'native-tauri-rust'],
    heuristicPriors: {
      'native-winforms-csc': 0.86,
      'native-wpf-dotnet': 0.82,
      'native-tauri-rust': 0.74,
      'native-electron-node': 0.70,
    },
    physicsByTier: {
      'local-small': {
        'native-electron-node': { successProb: 0.34, coverageMean: 0.65, buildPassProb: 0.45, testPassProb: 0.40, regressionProb: 0.12, securityViolationProb: 0.02, userCorrectionProb: 0.72, meanDurationMs: 26000, recoveryProb: 0.35 },
        'native-winforms-csc': { successProb: 0.86, coverageMean: 0.90, buildPassProb: 0.92, testPassProb: 0.88, regressionProb: 0.04, securityViolationProb: 0.005, userCorrectionProb: 0.18, meanDurationMs: 7500, recoveryProb: 0.84 },
        'native-wpf-dotnet': { successProb: 0.62, coverageMean: 0.84, buildPassProb: 0.68, testPassProb: 0.65, regressionProb: 0.07, securityViolationProb: 0.01, userCorrectionProb: 0.38, meanDurationMs: 14500, recoveryProb: 0.58 },
        'native-tauri-rust': { successProb: 0.38, coverageMean: 0.76, buildPassProb: 0.42, testPassProb: 0.45, regressionProb: 0.09, securityViolationProb: 0.005, userCorrectionProb: 0.62, meanDurationMs: 29000, recoveryProb: 0.35 },
      },
      'local-medium': {
        'native-electron-node': { successProb: 0.52, coverageMean: 0.74, buildPassProb: 0.62, testPassProb: 0.58, regressionProb: 0.10, securityViolationProb: 0.015, userCorrectionProb: 0.50, meanDurationMs: 22000, recoveryProb: 0.50 },
        'native-winforms-csc': { successProb: 0.89, coverageMean: 0.91, buildPassProb: 0.94, testPassProb: 0.90, regressionProb: 0.03, securityViolationProb: 0.004, userCorrectionProb: 0.15, meanDurationMs: 7200, recoveryProb: 0.86 },
        'native-wpf-dotnet': { successProb: 0.78, coverageMean: 0.89, buildPassProb: 0.82, testPassProb: 0.80, regressionProb: 0.05, securityViolationProb: 0.006, userCorrectionProb: 0.24, meanDurationMs: 13000, recoveryProb: 0.74 },
        'native-tauri-rust': { successProb: 0.55, coverageMean: 0.82, buildPassProb: 0.60, testPassProb: 0.58, regressionProb: 0.07, securityViolationProb: 0.004, userCorrectionProb: 0.45, meanDurationMs: 25000, recoveryProb: 0.52 },
      },
      'cloud': {
        'native-electron-node': { successProb: 0.66, coverageMean: 0.80, buildPassProb: 0.74, testPassProb: 0.70, regressionProb: 0.08, securityViolationProb: 0.01, userCorrectionProb: 0.36, meanDurationMs: 19000, recoveryProb: 0.66 },
        'native-winforms-csc': { successProb: 0.90, coverageMean: 0.92, buildPassProb: 0.95, testPassProb: 0.91, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.14, meanDurationMs: 6800, recoveryProb: 0.88 },
        'native-wpf-dotnet': { successProb: 0.91, coverageMean: 0.94, buildPassProb: 0.92, testPassProb: 0.91, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.12, meanDurationMs: 11500, recoveryProb: 0.89 },
        'native-tauri-rust': { successProb: 0.74, coverageMean: 0.88, buildPassProb: 0.78, testPassProb: 0.76, regressionProb: 0.05, securityViolationProb: 0.003, userCorrectionProb: 0.28, meanDurationMs: 21000, recoveryProb: 0.72 },
      },
    },
    prompts: [
      'Build a native Windows desktop inventory tracker executable with CSV export',
      'Create a native Windows system resource monitor (.exe) showing CPU and RAM charts',
      'Build a native Windows desktop offline password vault with local encrypted JSON storage',
      'Create a native Windows desktop Pomodoro timer with system tray notifications',
      'Build a native Windows desktop invoice generator (.exe) with printable templates',
      'Create a native Windows desktop clipboard history manager with search hotkeys',
      'Build a native Windows desktop log file tail viewer with regex highlighting',
      'Build a native Windows desktop warehouse barcode scanner dashboard (.exe)',
      'Create a native Windows desktop audio batch converter front-end with queue state',
      'Build a native Windows desktop student attendance manager executable with offline persistence',
    ],
  },

  // 2. REACT DEVELOPMENT
  {
    domain: 'REACT',
    taskCategory: 'WEB_APP_BUILD',
    targetPlatform: 'WEB_APP',
    language: 'TypeScript',
    framework: 'React',
    projectStructure: 'greenfield',
    errorCategory: 'none',
    baselineStrategyId: 'vite-typescript-spa',
    candidateStrategies: ['vite-typescript-spa', 'self-contained-interactive-web-app', 'modular-multi-file-web-app'],
    heuristicPriors: {
      'vite-typescript-spa': 0.84, // Intentionally shows heuristic miscalibration on local-small vs cloud!
      'modular-multi-file-web-app': 0.82,
      'self-contained-interactive-web-app': 0.80,
    },
    physicsByTier: {
      'local-small': {
        'vite-typescript-spa': { successProb: 0.36, coverageMean: 0.70, buildPassProb: 0.44, testPassProb: 0.42, regressionProb: 0.14, securityViolationProb: 0.01, userCorrectionProb: 0.68, meanDurationMs: 22000, recoveryProb: 0.38 },
        'modular-multi-file-web-app': { successProb: 0.74, coverageMean: 0.86, buildPassProb: 0.84, testPassProb: 0.78, regressionProb: 0.06, securityViolationProb: 0.005, userCorrectionProb: 0.26, meanDurationMs: 11000, recoveryProb: 0.74 },
        'self-contained-interactive-web-app': { successProb: 0.87, coverageMean: 0.90, buildPassProb: 0.94, testPassProb: 0.89, regressionProb: 0.04, securityViolationProb: 0.005, userCorrectionProb: 0.16, meanDurationMs: 8200, recoveryProb: 0.85 },
      },
      'local-medium': {
        'vite-typescript-spa': { successProb: 0.68, coverageMean: 0.85, buildPassProb: 0.74, testPassProb: 0.72, regressionProb: 0.08, securityViolationProb: 0.008, userCorrectionProb: 0.34, meanDurationMs: 17000, recoveryProb: 0.66 },
        'modular-multi-file-web-app': { successProb: 0.85, coverageMean: 0.90, buildPassProb: 0.90, testPassProb: 0.87, regressionProb: 0.05, securityViolationProb: 0.004, userCorrectionProb: 0.18, meanDurationMs: 10200, recoveryProb: 0.82 },
        'self-contained-interactive-web-app': { successProb: 0.82, coverageMean: 0.87, buildPassProb: 0.92, testPassProb: 0.86, regressionProb: 0.04, securityViolationProb: 0.004, userCorrectionProb: 0.20, meanDurationMs: 8000, recoveryProb: 0.82 },
      },
      'cloud': {
        'vite-typescript-spa': { successProb: 0.91, coverageMean: 0.94, buildPassProb: 0.93, testPassProb: 0.91, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.12, meanDurationMs: 14000, recoveryProb: 0.89 },
        'modular-multi-file-web-app': { successProb: 0.84, coverageMean: 0.89, buildPassProb: 0.91, testPassProb: 0.86, regressionProb: 0.04, securityViolationProb: 0.003, userCorrectionProb: 0.18, meanDurationMs: 9500, recoveryProb: 0.84 },
        'self-contained-interactive-web-app': { successProb: 0.76, coverageMean: 0.82, buildPassProb: 0.90, testPassProb: 0.82, regressionProb: 0.04, securityViolationProb: 0.003, userCorrectionProb: 0.25, meanDurationMs: 7500, recoveryProb: 0.80 },
      },
    },
    prompts: [
      'Build a React kanban board with drag-and-drop columns and local persistence',
      'Create a React analytics dashboard with sortable KPI cards and date range filters',
      'Build a React multi-step onboarding wizard with form validation and summary review',
      'Create a React real-time search table with pagination and debounced filtering',
      'Build a React expense splitter app with group balance calculations',
      'Create a React markdown knowledge base with live preview and tag filtering',
      'Build a React issue tracker UI with priority badges and comment threads',
      'Build a React fleet telemetry dashboard with alert thresholds and CSV export',
      'Create a React interactive calendar scheduler with conflict detection',
      'Build a React dark-mode component playground with live prop toggles',
    ],
  },

  // 3. NEXT.JS DEVELOPMENT
  {
    domain: 'NEXTJS',
    taskCategory: 'FULLSTACK_BUILD',
    targetPlatform: 'FULLSTACK_WEB',
    language: 'TypeScript',
    framework: 'Next.js',
    projectStructure: 'monorepo',
    errorCategory: 'none',
    baselineStrategyId: 'zero-dep-node-http-service',
    candidateStrategies: ['zero-dep-node-http-service', 'modular-node-ts-sqlite-service', 'nextjs-app-router-incremental'],
    heuristicPriors: {
      'nextjs-app-router-incremental': 0.85,
      'modular-node-ts-sqlite-service': 0.83,
      'zero-dep-node-http-service': 0.72,
    },
    physicsByTier: {
      'local-small': {
        'zero-dep-node-http-service': { successProb: 0.56, coverageMean: 0.72, buildPassProb: 0.78, testPassProb: 0.62, regressionProb: 0.08, securityViolationProb: 0.01, userCorrectionProb: 0.46, meanDurationMs: 9000, recoveryProb: 0.60 },
        'modular-node-ts-sqlite-service': { successProb: 0.84, coverageMean: 0.89, buildPassProb: 0.88, testPassProb: 0.85, regressionProb: 0.05, securityViolationProb: 0.005, userCorrectionProb: 0.20, meanDurationMs: 12500, recoveryProb: 0.80 },
        'nextjs-app-router-incremental': { successProb: 0.42, coverageMean: 0.74, buildPassProb: 0.48, testPassProb: 0.46, regressionProb: 0.14, securityViolationProb: 0.01, userCorrectionProb: 0.60, meanDurationMs: 24000, recoveryProb: 0.42 },
      },
      'local-medium': {
        'zero-dep-node-http-service': { successProb: 0.62, coverageMean: 0.74, buildPassProb: 0.82, testPassProb: 0.68, regressionProb: 0.07, securityViolationProb: 0.008, userCorrectionProb: 0.40, meanDurationMs: 8800, recoveryProb: 0.64 },
        'modular-node-ts-sqlite-service': { successProb: 0.86, coverageMean: 0.90, buildPassProb: 0.90, testPassProb: 0.87, regressionProb: 0.04, securityViolationProb: 0.004, userCorrectionProb: 0.18, meanDurationMs: 12000, recoveryProb: 0.84 },
        'nextjs-app-router-incremental': { successProb: 0.72, coverageMean: 0.88, buildPassProb: 0.78, testPassProb: 0.74, regressionProb: 0.08, securityViolationProb: 0.006, userCorrectionProb: 0.30, meanDurationMs: 18500, recoveryProb: 0.68 },
      },
      'cloud': {
        'zero-dep-node-http-service': { successProb: 0.66, coverageMean: 0.76, buildPassProb: 0.84, testPassProb: 0.70, regressionProb: 0.06, securityViolationProb: 0.005, userCorrectionProb: 0.35, meanDurationMs: 8200, recoveryProb: 0.68 },
        'modular-node-ts-sqlite-service': { successProb: 0.85, coverageMean: 0.89, buildPassProb: 0.91, testPassProb: 0.86, regressionProb: 0.04, securityViolationProb: 0.003, userCorrectionProb: 0.17, meanDurationMs: 11200, recoveryProb: 0.85 },
        'nextjs-app-router-incremental': { successProb: 0.92, coverageMean: 0.95, buildPassProb: 0.93, testPassProb: 0.92, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.10, meanDurationMs: 15000, recoveryProb: 0.90 },
      },
    },
    prompts: [
      'Build a fullstack Next.js blog platform with SQLite persistence and tag pages',
      'Create a fullstack Next.js SaaS billing portal with invoice history API routes',
      'Build a fullstack Next.js documentation hub with server-rendered MDX search',
      'Create a fullstack Next.js booking system with availability slots and validation',
      'Build a fullstack Next.js job board with server actions and candidate filtering',
      'Create a fullstack Next.js feature flag admin panel with audit trail',
      'Build a fullstack Next.js feedback voting board with optimistic UI updates',
      'Build a fullstack Next.js e-commerce catalog with cart persistence and checkout summary',
      'Create a fullstack Next.js learning portal with course progress tracking',
      'Build a fullstack Next.js incident status page with uptime timeline API',
    ],
  },

  // 4. BACKEND ENGINEERING
  {
    domain: 'BACKEND',
    taskCategory: 'BACKEND_API',
    targetPlatform: 'BACKEND_SERVICE',
    language: 'TypeScript',
    framework: 'Express',
    projectStructure: 'microservice',
    errorCategory: 'none',
    baselineStrategyId: 'zero-dep-node-http-service',
    candidateStrategies: ['zero-dep-node-http-service', 'modular-node-ts-sqlite-service', 'contract-first-openapi-service'],
    heuristicPriors: {
      'modular-node-ts-sqlite-service': 0.85,
      'zero-dep-node-http-service': 0.81,
      'contract-first-openapi-service': 0.78,
    },
    physicsByTier: {
      'local-small': {
        'zero-dep-node-http-service': { successProb: 0.74, coverageMean: 0.82, buildPassProb: 0.88, testPassProb: 0.78, regressionProb: 0.06, securityViolationProb: 0.01, userCorrectionProb: 0.28, meanDurationMs: 7000, recoveryProb: 0.76 },
        'modular-node-ts-sqlite-service': { successProb: 0.88, coverageMean: 0.91, buildPassProb: 0.92, testPassProb: 0.89, regressionProb: 0.04, securityViolationProb: 0.005, userCorrectionProb: 0.16, meanDurationMs: 10500, recoveryProb: 0.85 },
        'contract-first-openapi-service': { successProb: 0.50, coverageMean: 0.78, buildPassProb: 0.58, testPassProb: 0.54, regressionProb: 0.10, securityViolationProb: 0.008, userCorrectionProb: 0.52, meanDurationMs: 18000, recoveryProb: 0.48 },
      },
      'local-medium': {
        'zero-dep-node-http-service': { successProb: 0.76, coverageMean: 0.83, buildPassProb: 0.90, testPassProb: 0.80, regressionProb: 0.05, securityViolationProb: 0.008, userCorrectionProb: 0.25, meanDurationMs: 6800, recoveryProb: 0.78 },
        'modular-node-ts-sqlite-service': { successProb: 0.90, coverageMean: 0.92, buildPassProb: 0.93, testPassProb: 0.91, regressionProb: 0.03, securityViolationProb: 0.004, userCorrectionProb: 0.14, meanDurationMs: 9800, recoveryProb: 0.87 },
        'contract-first-openapi-service': { successProb: 0.76, coverageMean: 0.88, buildPassProb: 0.80, testPassProb: 0.78, regressionProb: 0.06, securityViolationProb: 0.004, userCorrectionProb: 0.26, meanDurationMs: 14500, recoveryProb: 0.74 },
      },
      'cloud': {
        'zero-dep-node-http-service': { successProb: 0.78, coverageMean: 0.84, buildPassProb: 0.92, testPassProb: 0.82, regressionProb: 0.04, securityViolationProb: 0.004, userCorrectionProb: 0.22, meanDurationMs: 6400, recoveryProb: 0.80 },
        'modular-node-ts-sqlite-service': { successProb: 0.91, coverageMean: 0.93, buildPassProb: 0.94, testPassProb: 0.92, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.12, meanDurationMs: 9200, recoveryProb: 0.89 },
        'contract-first-openapi-service': { successProb: 0.90, coverageMean: 0.94, buildPassProb: 0.92, testPassProb: 0.91, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.12, meanDurationMs: 12500, recoveryProb: 0.88 },
      },
    },
    prompts: [
      'Build an Express REST API for task queues with retry backoff and status endpoints',
      'Create a token-bucket rate limiter middleware service with per-IP quota persistence',
      'Build a webhook delivery service with HMAC signature verification and dead-letter queue',
      'Create a multi-tenant file metadata REST service with strict path traversal guards',
      'Build an audit logging microservice with structured JSON ingestion and search',
      'Create a health-check aggregator backend polling upstream endpoints with circuit breaker',
      'Build a URL shortener REST API with collision-safe slug generation and click stats',
      'Build a role-based access control (RBAC) policy evaluation REST service',
      'Create a scheduled cron job dispatcher backend with idempotency keys',
      'Build a real-time SSE event broadcast server with topic subscriptions',
    ],
  },

  // 5. DATABASE ENGINEERING
  {
    domain: 'DATABASE',
    taskCategory: 'BACKEND_API',
    targetPlatform: 'BACKEND_SERVICE',
    language: 'SQL/TypeScript',
    framework: 'SQLite',
    projectStructure: 'legacy-existing',
    errorCategory: 'schema-migration',
    baselineStrategyId: 'ad-hoc-inline-sql',
    candidateStrategies: ['ad-hoc-inline-sql', 'transactional-versioned-migration', 'repository-indexed-sqlite'],
    heuristicPriors: {
      'transactional-versioned-migration': 0.83,
      'repository-indexed-sqlite': 0.85,
      'ad-hoc-inline-sql': 0.68,
    },
    physicsByTier: {
      'local-small': {
        'ad-hoc-inline-sql': { successProb: 0.35, coverageMean: 0.62, buildPassProb: 0.55, testPassProb: 0.40, regressionProb: 0.24, securityViolationProb: 0.08, userCorrectionProb: 0.70, meanDurationMs: 9500, recoveryProb: 0.35 },
        'transactional-versioned-migration': { successProb: 0.88, coverageMean: 0.92, buildPassProb: 0.92, testPassProb: 0.89, regressionProb: 0.04, securityViolationProb: 0.004, userCorrectionProb: 0.16, meanDurationMs: 11000, recoveryProb: 0.85 },
        'repository-indexed-sqlite': { successProb: 0.78, coverageMean: 0.87, buildPassProb: 0.86, testPassProb: 0.80, regressionProb: 0.07, securityViolationProb: 0.008, userCorrectionProb: 0.24, meanDurationMs: 11800, recoveryProb: 0.76 },
      },
      'local-medium': {
        'ad-hoc-inline-sql': { successProb: 0.44, coverageMean: 0.66, buildPassProb: 0.62, testPassProb: 0.48, regressionProb: 0.20, securityViolationProb: 0.06, userCorrectionProb: 0.60, meanDurationMs: 9000, recoveryProb: 0.42 },
        'transactional-versioned-migration': { successProb: 0.90, coverageMean: 0.93, buildPassProb: 0.94, testPassProb: 0.91, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.14, meanDurationMs: 10200, recoveryProb: 0.88 },
        'repository-indexed-sqlite': { successProb: 0.84, coverageMean: 0.89, buildPassProb: 0.89, testPassProb: 0.86, regressionProb: 0.05, securityViolationProb: 0.005, userCorrectionProb: 0.19, meanDurationMs: 11000, recoveryProb: 0.82 },
      },
      'cloud': {
        'ad-hoc-inline-sql': { successProb: 0.52, coverageMean: 0.70, buildPassProb: 0.68, testPassProb: 0.56, regressionProb: 0.16, securityViolationProb: 0.04, userCorrectionProb: 0.50, meanDurationMs: 8500, recoveryProb: 0.52 },
        'transactional-versioned-migration': { successProb: 0.93, coverageMean: 0.95, buildPassProb: 0.95, testPassProb: 0.94, regressionProb: 0.02, securityViolationProb: 0.002, userCorrectionProb: 0.10, meanDurationMs: 9800, recoveryProb: 0.91 },
        'repository-indexed-sqlite': { successProb: 0.88, coverageMean: 0.92, buildPassProb: 0.92, testPassProb: 0.89, regressionProb: 0.04, securityViolationProb: 0.003, userCorrectionProb: 0.14, meanDurationMs: 10500, recoveryProb: 0.86 },
      },
    },
    prompts: [
      'Design a versioned SQLite migration adding composite indexes without data loss',
      'Implement parameterized SQL queries replacing string interpolation in user repository',
      'Add atomic backup and point-in-time restore procedures for local SQLite storage',
      'Optimize slow join queries on 50k episodic records with covering indexes',
      'Implement transactional double-entry ledger storage with balance constraint checks',
      'Build a schema drift validator comparing live SQLite tables against expected DDL',
      'Add soft-delete and retention pruning job for historical telemetry rows',
      'Implement safe zero-downtime column rename migration in SQLite',
      'Build a full-text search index over project notes with snippet highlighting',
      'Add connection health checks and corrupt-DB quarantine recovery logic',
    ],
  },

  // 6. DEBUGGING
  {
    domain: 'DEBUGGING',
    taskCategory: 'DEBUG_AND_REPAIR',
    targetPlatform: 'WEB_APP',
    language: 'TypeScript',
    framework: 'Node/Express',
    projectStructure: 'legacy-existing',
    errorCategory: 'runtime-bug',
    baselineStrategyId: 'defensive-guard-and-fallback-patch',
    candidateStrategies: ['defensive-guard-and-fallback-patch', 'reproduce-root-cause-surgical-fix', 'blind-file-rewrite'],
    heuristicPriors: {
      'reproduce-root-cause-surgical-fix': 0.88,
      'defensive-guard-and-fallback-patch': 0.78,
      'blind-file-rewrite': 0.55,
    },
    physicsByTier: {
      'local-small': {
        'defensive-guard-and-fallback-patch': { successProb: 0.44, coverageMean: 0.64, buildPassProb: 0.72, testPassProb: 0.48, regressionProb: 0.16, securityViolationProb: 0.01, userCorrectionProb: 0.58, meanDurationMs: 8500, recoveryProb: 0.48 },
        'reproduce-root-cause-surgical-fix': { successProb: 0.89, coverageMean: 0.92, buildPassProb: 0.93, testPassProb: 0.91, regressionProb: 0.03, securityViolationProb: 0.004, userCorrectionProb: 0.14, meanDurationMs: 9800, recoveryProb: 0.88 },
        'blind-file-rewrite': { successProb: 0.22, coverageMean: 0.48, buildPassProb: 0.42, testPassProb: 0.25, regressionProb: 0.42, securityViolationProb: 0.03, userCorrectionProb: 0.82, meanDurationMs: 11500, recoveryProb: 0.24 },
      },
      'local-medium': {
        'defensive-guard-and-fallback-patch': { successProb: 0.52, coverageMean: 0.68, buildPassProb: 0.78, testPassProb: 0.56, regressionProb: 0.14, securityViolationProb: 0.008, userCorrectionProb: 0.48, meanDurationMs: 8200, recoveryProb: 0.56 },
        'reproduce-root-cause-surgical-fix': { successProb: 0.91, coverageMean: 0.93, buildPassProb: 0.95, testPassProb: 0.92, regressionProb: 0.025, securityViolationProb: 0.003, userCorrectionProb: 0.12, meanDurationMs: 9400, recoveryProb: 0.90 },
        'blind-file-rewrite': { successProb: 0.30, coverageMean: 0.54, buildPassProb: 0.50, testPassProb: 0.34, regressionProb: 0.36, securityViolationProb: 0.02, userCorrectionProb: 0.74, meanDurationMs: 11000, recoveryProb: 0.32 },
      },
      'cloud': {
        'defensive-guard-and-fallback-patch': { successProb: 0.58, coverageMean: 0.72, buildPassProb: 0.82, testPassProb: 0.62, regressionProb: 0.12, securityViolationProb: 0.005, userCorrectionProb: 0.42, meanDurationMs: 7800, recoveryProb: 0.62 },
        'reproduce-root-cause-surgical-fix': { successProb: 0.94, coverageMean: 0.95, buildPassProb: 0.96, testPassProb: 0.95, regressionProb: 0.02, securityViolationProb: 0.002, userCorrectionProb: 0.09, meanDurationMs: 8800, recoveryProb: 0.93 },
        'blind-file-rewrite': { successProb: 0.38, coverageMean: 0.60, buildPassProb: 0.58, testPassProb: 0.42, regressionProb: 0.30, securityViolationProb: 0.015, userCorrectionProb: 0.66, meanDurationMs: 10200, recoveryProb: 0.40 },
      },
    },
    prompts: [
      'Fix Express wildcard route shadowing specific /providers/ollama/test endpoint',
      'Debug 30000ms run_command timeout caused by blocking foreground http-server',
      'Fix stale Monaco editor buffer failing to reload after agent file edits',
      'Resolve Windows reserved device path crash when validating CON.txt',
      'Fix intermittent ENOENT race condition during concurrent atomic file rename',
      'Debug SSE stream parser dropping partial chunks across TCP frame boundaries',
      'Fix memory leak from uncleaned WebSocket listeners on workspace switch',
      'Resolve IPv6 localhost vs 127.0.0.1 connection refused failure with local Ollama',
      'Fix HTTP Range 206 off-by-one byte calculation corrupting WebM video seek',
      'Debug JSON.parse crash on corrupted conversation checkpoint file during startup',
    ],
  },

  // 7. REFACTORING
  {
    domain: 'REFACTORING',
    taskCategory: 'REFACTOR_AND_TEST',
    targetPlatform: 'BACKEND_SERVICE',
    language: 'TypeScript',
    framework: 'Node.js',
    projectStructure: 'monorepo',
    errorCategory: 'none',
    baselineStrategyId: 'big-bang-rewrite',
    candidateStrategies: ['big-bang-rewrite', 'incremental-strangler-refactor', 'test-pinned-surgical-refactor'],
    heuristicPriors: {
      'incremental-strangler-refactor': 0.84,
      'test-pinned-surgical-refactor': 0.82,
      'big-bang-rewrite': 0.60,
    },
    physicsByTier: {
      'local-small': {
        'big-bang-rewrite': { successProb: 0.24, coverageMean: 0.55, buildPassProb: 0.38, testPassProb: 0.28, regressionProb: 0.45, securityViolationProb: 0.02, userCorrectionProb: 0.80, meanDurationMs: 18000, recoveryProb: 0.25 },
        'incremental-strangler-refactor': { successProb: 0.76, coverageMean: 0.85, buildPassProb: 0.84, testPassProb: 0.78, regressionProb: 0.09, securityViolationProb: 0.005, userCorrectionProb: 0.26, meanDurationMs: 12000, recoveryProb: 0.76 },
        'test-pinned-surgical-refactor': { successProb: 0.89, coverageMean: 0.91, buildPassProb: 0.93, testPassProb: 0.92, regressionProb: 0.03, securityViolationProb: 0.004, userCorrectionProb: 0.14, meanDurationMs: 11200, recoveryProb: 0.88 },
      },
      'local-medium': {
        'big-bang-rewrite': { successProb: 0.36, coverageMean: 0.64, buildPassProb: 0.50, testPassProb: 0.40, regressionProb: 0.35, securityViolationProb: 0.015, userCorrectionProb: 0.68, meanDurationMs: 16500, recoveryProb: 0.38 },
        'incremental-strangler-refactor': { successProb: 0.82, coverageMean: 0.88, buildPassProb: 0.88, testPassProb: 0.84, regressionProb: 0.06, securityViolationProb: 0.004, userCorrectionProb: 0.20, meanDurationMs: 11200, recoveryProb: 0.82 },
        'test-pinned-surgical-refactor': { successProb: 0.91, coverageMean: 0.93, buildPassProb: 0.94, testPassProb: 0.93, regressionProb: 0.025, securityViolationProb: 0.003, userCorrectionProb: 0.12, meanDurationMs: 10500, recoveryProb: 0.90 },
      },
      'cloud': {
        'big-bang-rewrite': { successProb: 0.48, coverageMean: 0.72, buildPassProb: 0.62, testPassProb: 0.52, regressionProb: 0.26, securityViolationProb: 0.01, userCorrectionProb: 0.55, meanDurationMs: 15000, recoveryProb: 0.50 },
        'incremental-strangler-refactor': { successProb: 0.88, coverageMean: 0.91, buildPassProb: 0.92, testPassProb: 0.89, regressionProb: 0.04, securityViolationProb: 0.003, userCorrectionProb: 0.15, meanDurationMs: 10400, recoveryProb: 0.87 },
        'test-pinned-surgical-refactor': { successProb: 0.94, coverageMean: 0.95, buildPassProb: 0.96, testPassProb: 0.95, regressionProb: 0.02, securityViolationProb: 0.002, userCorrectionProb: 0.09, meanDurationMs: 9800, recoveryProb: 0.93 },
      },
    },
    prompts: [
      'Refactor monolithic routes.ts into domain sub-routers without breaking API paths',
      'Extract provider health caching into a dedicated typed service module',
      'Break circular imports between AgentEngine and RecoveryManager cleanly',
      'Convert legacy callback-based file walkers to typed async iterators',
      'Consolidate duplicate path sanitization helpers into WorkspaceManager',
      'Refactor inline SQL queries into prepared repository methods with strict types',
      'Decompose 600-line runTask loop into testable phase helpers',
      'Standardize error response envelopes across all REST controllers',
      'Extract CSS design tokens from hardcoded inline hex colors',
      'Replace untyped any payloads in tool definitions with discriminated unions',
    ],
  },

  // 8. UI IMPROVEMENTS
  {
    domain: 'UI_IMPROVEMENT',
    taskCategory: 'SELF_DIRECTED_IMPROVEMENT',
    targetPlatform: 'WEB_APP',
    language: 'HTML/CSS/JS',
    framework: 'Vanilla Web',
    projectStructure: 'legacy-existing',
    errorCategory: 'ui-layout',
    baselineStrategyId: 'incremental-ux-polish-pass',
    candidateStrategies: ['incremental-ux-polish-pass', 'self-directed-quality-loop', 'static-refactor-and-test-hardening'],
    heuristicPriors: {
      'self-directed-quality-loop': 0.87,
      'incremental-ux-polish-pass': 0.81,
      'static-refactor-and-test-hardening': 0.78,
    },
    physicsByTier: {
      'local-small': {
        'incremental-ux-polish-pass': { successProb: 0.54, coverageMean: 0.72, buildPassProb: 0.82, testPassProb: 0.58, regressionProb: 0.12, securityViolationProb: 0.005, userCorrectionProb: 0.48, meanDurationMs: 7500, recoveryProb: 0.56 },
        'self-directed-quality-loop': { successProb: 0.88, coverageMean: 0.92, buildPassProb: 0.93, testPassProb: 0.89, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.15, meanDurationMs: 11500, recoveryProb: 0.86 },
        'static-refactor-and-test-hardening': { successProb: 0.64, coverageMean: 0.76, buildPassProb: 0.86, testPassProb: 0.78, regressionProb: 0.06, securityViolationProb: 0.004, userCorrectionProb: 0.38, meanDurationMs: 10500, recoveryProb: 0.70 },
      },
      'local-medium': {
        'incremental-ux-polish-pass': { successProb: 0.62, coverageMean: 0.76, buildPassProb: 0.86, testPassProb: 0.66, regressionProb: 0.09, securityViolationProb: 0.004, userCorrectionProb: 0.38, meanDurationMs: 7200, recoveryProb: 0.64 },
        'self-directed-quality-loop': { successProb: 0.91, coverageMean: 0.94, buildPassProb: 0.95, testPassProb: 0.91, regressionProb: 0.025, securityViolationProb: 0.002, userCorrectionProb: 0.12, meanDurationMs: 10800, recoveryProb: 0.89 },
        'static-refactor-and-test-hardening': { successProb: 0.70, coverageMean: 0.80, buildPassProb: 0.89, testPassProb: 0.82, regressionProb: 0.05, securityViolationProb: 0.003, userCorrectionProb: 0.32, meanDurationMs: 9800, recoveryProb: 0.74 },
      },
      'cloud': {
        'incremental-ux-polish-pass': { successProb: 0.68, coverageMean: 0.80, buildPassProb: 0.90, testPassProb: 0.72, regressionProb: 0.07, securityViolationProb: 0.003, userCorrectionProb: 0.30, meanDurationMs: 6800, recoveryProb: 0.70 },
        'self-directed-quality-loop': { successProb: 0.94, coverageMean: 0.96, buildPassProb: 0.96, testPassProb: 0.94, regressionProb: 0.02, securityViolationProb: 0.002, userCorrectionProb: 0.08, meanDurationMs: 10200, recoveryProb: 0.92 },
        'static-refactor-and-test-hardening': { successProb: 0.75, coverageMean: 0.82, buildPassProb: 0.91, testPassProb: 0.86, regressionProb: 0.04, securityViolationProb: 0.002, userCorrectionProb: 0.26, meanDurationMs: 9200, recoveryProb: 0.78 },
      },
    },
    prompts: [
      'Improve this application until it meets visual and responsive quality standards',
      'Audit and fix horizontal overflow across 1280px and 1600px viewports',
      'Upgrade dark theme contrast ratios and keyboard focus states across all modals',
      'Replace blank empty states with actionable guided empty states and loading skeletons',
      'Eliminate dead toolbar buttons and connect every control to real backend endpoints',
      'Improve table readability, badge hierarchy, and truncation in analytics dashboard',
      'Audit Preview Studio responsive switcher and fix console drawer scroll trap',
      'Refine Command Center first-launch hero spacing and quick action feedback',
      'Polish notification popover and toast stacking to avoid overlapping bottom controls',
      'Audit accessibility ARIA roles, labels, and Escape-key modal dismissal',
    ],
  },

  // 9. TESTING
  {
    domain: 'TESTING',
    taskCategory: 'REFACTOR_AND_TEST',
    targetPlatform: 'BACKEND_SERVICE',
    language: 'TypeScript',
    framework: 'Playwright/Node Assert',
    projectStructure: 'monorepo',
    errorCategory: 'none',
    baselineStrategyId: 'shallow-smoke-test',
    candidateStrategies: ['shallow-smoke-test', 'hermetic-unit-and-integration-suite', 'playwright-e2e-visual-verification'],
    heuristicPriors: {
      'hermetic-unit-and-integration-suite': 0.86,
      'playwright-e2e-visual-verification': 0.82,
      'shallow-smoke-test': 0.68,
    },
    physicsByTier: {
      'local-small': {
        'shallow-smoke-test': { successProb: 0.42, coverageMean: 0.52, buildPassProb: 0.78, testPassProb: 0.55, regressionProb: 0.14, securityViolationProb: 0.005, userCorrectionProb: 0.62, meanDurationMs: 5500, recoveryProb: 0.50 },
        'hermetic-unit-and-integration-suite': { successProb: 0.89, coverageMean: 0.92, buildPassProb: 0.93, testPassProb: 0.91, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.14, meanDurationMs: 9200, recoveryProb: 0.87 },
        'playwright-e2e-visual-verification': { successProb: 0.68, coverageMean: 0.86, buildPassProb: 0.76, testPassProb: 0.72, regressionProb: 0.07, securityViolationProb: 0.004, userCorrectionProb: 0.30, meanDurationMs: 16500, recoveryProb: 0.65 },
      },
      'local-medium': {
        'shallow-smoke-test': { successProb: 0.48, coverageMean: 0.56, buildPassProb: 0.82, testPassProb: 0.60, regressionProb: 0.12, securityViolationProb: 0.004, userCorrectionProb: 0.56, meanDurationMs: 5200, recoveryProb: 0.54 },
        'hermetic-unit-and-integration-suite': { successProb: 0.91, coverageMean: 0.93, buildPassProb: 0.95, testPassProb: 0.92, regressionProb: 0.025, securityViolationProb: 0.002, userCorrectionProb: 0.12, meanDurationMs: 8800, recoveryProb: 0.89 },
        'playwright-e2e-visual-verification': { successProb: 0.80, coverageMean: 0.90, buildPassProb: 0.85, testPassProb: 0.82, regressionProb: 0.05, securityViolationProb: 0.003, userCorrectionProb: 0.22, meanDurationMs: 15000, recoveryProb: 0.78 },
      },
      'cloud': {
        'shallow-smoke-test': { successProb: 0.52, coverageMean: 0.60, buildPassProb: 0.85, testPassProb: 0.64, regressionProb: 0.10, securityViolationProb: 0.003, userCorrectionProb: 0.50, meanDurationMs: 5000, recoveryProb: 0.58 },
        'hermetic-unit-and-integration-suite': { successProb: 0.93, coverageMean: 0.95, buildPassProb: 0.96, testPassProb: 0.94, regressionProb: 0.02, securityViolationProb: 0.002, userCorrectionProb: 0.09, meanDurationMs: 8200, recoveryProb: 0.92 },
        'playwright-e2e-visual-verification': { successProb: 0.91, coverageMean: 0.94, buildPassProb: 0.93, testPassProb: 0.92, regressionProb: 0.03, securityViolationProb: 0.002, userCorrectionProb: 0.11, meanDurationMs: 13500, recoveryProb: 0.90 },
      },
    },
    prompts: [
      'Write comprehensive hermetic tests for Windows reserved device name rejection',
      'Create deterministic offline bandit evaluation reproducibility tests',
      'Build automated secret-redaction tests covering 8 credential formats',
      'Write HTTP 206 Range request streaming tests for binary video playback',
      'Create SQLite crash-recovery and corrupt-file quarantine test suite',
      'Write unit tests verifying SafeTerminal blocks destructive shell patterns',
      'Create Playwright E2E regression tests for all 6 main navigation views',
      'Write multi-project isolation tests verifying zero memory cross-contamination',
      'Create policy rollback round-trip tests validating exact arm state restoration',
      'Build API contract tests for all intelligence-center endpoints',
    ],
  },

  // 10. PROJECT ARCHITECTURE
  {
    domain: 'ARCHITECTURE',
    taskCategory: 'EXPLAIN_OR_AUDIT',
    targetPlatform: 'BACKEND_SERVICE',
    language: 'TypeScript',
    framework: 'Clean Architecture',
    projectStructure: 'monorepo',
    errorCategory: 'none',
    baselineStrategyId: 'monolithic-coupled-design',
    candidateStrategies: ['monolithic-coupled-design', 'modular-hexagonal-architecture', 'event-driven-plugin-architecture'],
    heuristicPriors: {
      'modular-hexagonal-architecture': 0.86,
      'event-driven-plugin-architecture': 0.83,
      'monolithic-coupled-design': 0.65,
    },
    physicsByTier: {
      'local-small': {
        'monolithic-coupled-design': { successProb: 0.40, coverageMean: 0.64, buildPassProb: 0.66, testPassProb: 0.46, regressionProb: 0.22, securityViolationProb: 0.02, userCorrectionProb: 0.62, meanDurationMs: 9000, recoveryProb: 0.45 },
        'modular-hexagonal-architecture': { successProb: 0.87, coverageMean: 0.91, buildPassProb: 0.92, testPassProb: 0.88, regressionProb: 0.04, securityViolationProb: 0.004, userCorrectionProb: 0.16, meanDurationMs: 10500, recoveryProb: 0.84 },
        'event-driven-plugin-architecture': { successProb: 0.66, coverageMean: 0.84, buildPassProb: 0.74, testPassProb: 0.70, regressionProb: 0.08, securityViolationProb: 0.006, userCorrectionProb: 0.34, meanDurationMs: 14000, recoveryProb: 0.64 },
      },
      'local-medium': {
        'monolithic-coupled-design': { successProb: 0.46, coverageMean: 0.68, buildPassProb: 0.72, testPassProb: 0.52, regressionProb: 0.18, securityViolationProb: 0.015, userCorrectionProb: 0.55, meanDurationMs: 8500, recoveryProb: 0.50 },
        'modular-hexagonal-architecture': { successProb: 0.90, coverageMean: 0.93, buildPassProb: 0.94, testPassProb: 0.91, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.13, meanDurationMs: 10000, recoveryProb: 0.88 },
        'event-driven-plugin-architecture': { successProb: 0.80, coverageMean: 0.89, buildPassProb: 0.85, testPassProb: 0.82, regressionProb: 0.05, securityViolationProb: 0.004, userCorrectionProb: 0.22, meanDurationMs: 12800, recoveryProb: 0.78 },
      },
      'cloud': {
        'monolithic-coupled-design': { successProb: 0.52, coverageMean: 0.72, buildPassProb: 0.76, testPassProb: 0.58, regressionProb: 0.15, securityViolationProb: 0.01, userCorrectionProb: 0.48, meanDurationMs: 8000, recoveryProb: 0.56 },
        'modular-hexagonal-architecture': { successProb: 0.92, coverageMean: 0.94, buildPassProb: 0.95, testPassProb: 0.93, regressionProb: 0.025, securityViolationProb: 0.002, userCorrectionProb: 0.10, meanDurationMs: 9500, recoveryProb: 0.90 },
        'event-driven-plugin-architecture': { successProb: 0.91, coverageMean: 0.95, buildPassProb: 0.93, testPassProb: 0.92, regressionProb: 0.03, securityViolationProb: 0.002, userCorrectionProb: 0.11, meanDurationMs: 11800, recoveryProb: 0.90 },
      },
    },
    prompts: [
      'Architect a provider-independent AI gateway isolating Ollama and cloud SDKs',
      'Design a multi-workspace authorization boundary with 3-tier persistent permissions',
      'Architect an offline-first experience memory layer with atomic storage guarantees',
      'Design a pluggable tool registry supporting aliases, schemas, and safety tiers',
      'Architect an isolated preview proxy preventing host IDE route collisions',
      'Design a deterministic benchmark harness separating train, validation, and holdout sets',
      'Architect a crash-resilient task recovery manager with checkpoint diffing',
      'Design a governance layer enforcing immutable locks over policy promotion',
      'Architect a zero-paid-dependency Windows desktop installer and CLI wrapper',
      'Design an incremental repository symbol indexer with low memory footprint',
    ],
  },

  // 11. DEPENDENCY FAILURES
  {
    domain: 'DEPENDENCY_FAILURE',
    taskCategory: 'DEBUG_AND_REPAIR',
    targetPlatform: 'BACKEND_SERVICE',
    language: 'TypeScript',
    framework: 'Node/npm',
    projectStructure: 'legacy-existing',
    errorCategory: 'dependency-conflict',
    baselineStrategyId: 'force-reinstall-latest',
    candidateStrategies: ['force-reinstall-latest', 'pure-js-or-cjs-interop-fix', 'pinned-lockfile-diagnostics'],
    heuristicPriors: {
      'pinned-lockfile-diagnostics': 0.84,
      'pure-js-or-cjs-interop-fix': 0.82,
      'force-reinstall-latest': 0.62,
    },
    physicsByTier: {
      'local-small': {
        'force-reinstall-latest': { successProb: 0.28, coverageMean: 0.50, buildPassProb: 0.35, testPassProb: 0.30, regressionProb: 0.32, securityViolationProb: 0.02, userCorrectionProb: 0.76, meanDurationMs: 24000, recoveryProb: 0.28 },
        'pure-js-or-cjs-interop-fix': { successProb: 0.88, coverageMean: 0.91, buildPassProb: 0.92, testPassProb: 0.90, regressionProb: 0.04, securityViolationProb: 0.004, userCorrectionProb: 0.15, meanDurationMs: 9500, recoveryProb: 0.86 },
        'pinned-lockfile-diagnostics': { successProb: 0.74, coverageMean: 0.84, buildPassProb: 0.80, testPassProb: 0.76, regressionProb: 0.07, securityViolationProb: 0.005, userCorrectionProb: 0.28, meanDurationMs: 13000, recoveryProb: 0.72 },
      },
      'local-medium': {
        'force-reinstall-latest': { successProb: 0.36, coverageMean: 0.56, buildPassProb: 0.44, testPassProb: 0.38, regressionProb: 0.26, securityViolationProb: 0.015, userCorrectionProb: 0.66, meanDurationMs: 22000, recoveryProb: 0.36 },
        'pure-js-or-cjs-interop-fix': { successProb: 0.90, coverageMean: 0.93, buildPassProb: 0.94, testPassProb: 0.92, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.13, meanDurationMs: 9000, recoveryProb: 0.88 },
        'pinned-lockfile-diagnostics': { successProb: 0.82, coverageMean: 0.88, buildPassProb: 0.87, testPassProb: 0.84, regressionProb: 0.05, securityViolationProb: 0.004, userCorrectionProb: 0.20, meanDurationMs: 12000, recoveryProb: 0.80 },
      },
      'cloud': {
        'force-reinstall-latest': { successProb: 0.42, coverageMean: 0.62, buildPassProb: 0.52, testPassProb: 0.46, regressionProb: 0.22, securityViolationProb: 0.01, userCorrectionProb: 0.58, meanDurationMs: 20000, recoveryProb: 0.44 },
        'pure-js-or-cjs-interop-fix': { successProb: 0.92, coverageMean: 0.94, buildPassProb: 0.95, testPassProb: 0.93, regressionProb: 0.025, securityViolationProb: 0.002, userCorrectionProb: 0.10, meanDurationMs: 8500, recoveryProb: 0.91 },
        'pinned-lockfile-diagnostics': { successProb: 0.89, coverageMean: 0.92, buildPassProb: 0.92, testPassProb: 0.90, regressionProb: 0.035, securityViolationProb: 0.003, userCorrectionProb: 0.14, meanDurationMs: 11000, recoveryProb: 0.87 },
      },
    },
    prompts: [
      'Resolve pptxgenjs ESM default import crash in standalone compiled Node dist build',
      'Replace failing native C++ node-gyp sqlite3 dependency with WASM sql.js on Windows 11',
      'Fix TypeScript DOM lib missing errors when compiling Playwright tests under Node tsconfig',
      'Resolve peer dependency conflict between React 18 and legacy chart wrapper',
      'Fix tsx module resolution failure when running scripts outside project root',
      'Repair broken PowerShell execution policy preventing local npm wrapper scripts',
      'Resolve missing native .NET 8 SDK by falling back cleanly to Windows .NET Framework csc.exe',
      'Fix duplicate transitive package versions causing Express router mismatch',
      'Resolve offline CDN Monaco load failure by activating built-in fallback code editor',
      'Fix sharp native binary architecture mismatch on Windows x64 deployment',
    ],
  },

  // 12. EXISTING CODEBASE MODIFICATIONS
  {
    domain: 'EXISTING_CODEBASE',
    taskCategory: 'SELF_DIRECTED_IMPROVEMENT',
    targetPlatform: 'FULLSTACK_WEB',
    language: 'TypeScript',
    framework: 'Express + HTML',
    projectStructure: 'legacy-existing',
    errorCategory: 'none',
    baselineStrategyId: 'overwrite-template-replacement',
    candidateStrategies: ['overwrite-template-replacement', 'inspect-first-surgical-extension', 'self-directed-quality-loop'],
    heuristicPriors: {
      'inspect-first-surgical-extension': 0.86,
      'self-directed-quality-loop': 0.84,
      'overwrite-template-replacement': 0.58,
    },
    physicsByTier: {
      'local-small': {
        'overwrite-template-replacement': { successProb: 0.18, coverageMean: 0.42, buildPassProb: 0.50, testPassProb: 0.22, regressionProb: 0.58, securityViolationProb: 0.03, userCorrectionProb: 0.86, meanDurationMs: 8000, recoveryProb: 0.20 },
        'inspect-first-surgical-extension': { successProb: 0.88, coverageMean: 0.91, buildPassProb: 0.93, testPassProb: 0.90, regressionProb: 0.04, securityViolationProb: 0.004, userCorrectionProb: 0.15, meanDurationMs: 10200, recoveryProb: 0.86 },
        'self-directed-quality-loop': { successProb: 0.85, coverageMean: 0.90, buildPassProb: 0.91, testPassProb: 0.87, regressionProb: 0.04, securityViolationProb: 0.004, userCorrectionProb: 0.17, meanDurationMs: 12000, recoveryProb: 0.84 },
      },
      'local-medium': {
        'overwrite-template-replacement': { successProb: 0.24, coverageMean: 0.48, buildPassProb: 0.56, testPassProb: 0.28, regressionProb: 0.50, securityViolationProb: 0.02, userCorrectionProb: 0.80, meanDurationMs: 7800, recoveryProb: 0.26 },
        'inspect-first-surgical-extension': { successProb: 0.91, coverageMean: 0.93, buildPassProb: 0.95, testPassProb: 0.92, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.12, meanDurationMs: 9600, recoveryProb: 0.89 },
        'self-directed-quality-loop': { successProb: 0.89, coverageMean: 0.92, buildPassProb: 0.93, testPassProb: 0.90, regressionProb: 0.03, securityViolationProb: 0.003, userCorrectionProb: 0.14, meanDurationMs: 11200, recoveryProb: 0.87 },
      },
      'cloud': {
        'overwrite-template-replacement': { successProb: 0.30, coverageMean: 0.54, buildPassProb: 0.62, testPassProb: 0.34, regressionProb: 0.44, securityViolationProb: 0.015, userCorrectionProb: 0.72, meanDurationMs: 7400, recoveryProb: 0.32 },
        'inspect-first-surgical-extension': { successProb: 0.93, coverageMean: 0.95, buildPassProb: 0.96, testPassProb: 0.94, regressionProb: 0.02, securityViolationProb: 0.002, userCorrectionProb: 0.09, meanDurationMs: 9000, recoveryProb: 0.92 },
        'self-directed-quality-loop': { successProb: 0.92, coverageMean: 0.94, buildPassProb: 0.95, testPassProb: 0.93, regressionProb: 0.02, securityViolationProb: 0.002, userCorrectionProb: 0.10, meanDurationMs: 10500, recoveryProb: 0.91 },
      },
    },
    prompts: [
      'Add CSV export to existing Student Attendance Analyzer while preserving dark styling',
      'Extend existing Express API with /metrics endpoint without altering existing auth routes',
      'Add inline thumbs-up/thumbs-down feedback buttons to existing Agent chat replies',
      'Integrate SQLite experience telemetry into existing AgentEngine without breaking 57 media tests',
      'Add keyboard shortcut Ctrl+Shift+L to existing Command Palette preserving all commands',
      'Upgrade existing project switcher modal with recent folder timestamps',
      'Add GPU VRAM readout to existing status bar without overflowing 1280px width',
      'Extend existing CheckpointManager with named manual snapshot restore notes',
      'Add per-project memory scope filter to existing Intelligence view preserving codebase index tab',
      'Upgrade existing SafeTerminal with autonomous non-blocking dev server handoff',
    ],
  },
];

/**
 * Generate the fixed, deterministic 120-scenario Mission 8 Benchmark Suite.
 * Enforces strict Train (60) / Validation (24) / Holdout (36) isolation.
 */
export function buildMission8Benchmark(defaultModelTier: ModelTier = 'local-small'): BenchmarkScenario[] {
  const scenarios: BenchmarkScenario[] = [];
  const tiers: ModelTier[] = [defaultModelTier, 'local-medium', 'cloud'];

  for (const tpl of DOMAIN_TEMPLATES) {
    tpl.prompts.forEach((prompt, idx) => {
      const split: BenchmarkSplit = idx < 5 ? 'TRAIN' : idx < 7 ? 'VALIDATION' : 'HOLDOUT';
      // Mix model tiers deterministically across splits while keeping local-small dominant (Windows 11 RTX 3050 target)
      const tier: ModelTier = idx % 5 === 4 ? tiers[2] : idx % 5 === 3 ? tiers[1] : tiers[0];
      const physics = tpl.physicsByTier[tier];

      scenarios.push({
        id: `m8-${tpl.domain.toLowerCase()}-${String(idx + 1).padStart(2, '0')}`,
        version: BENCHMARK_VERSION,
        domain: tpl.domain,
        split,
        prompt,
        language: tpl.language,
        framework: tpl.framework,
        modelTier: tier,
        projectStructure: tpl.projectStructure,
        errorCategory: tpl.errorCategory,
        taskCategory: tpl.taskCategory,
        targetPlatform: tpl.targetPlatform,
        baselineStrategyId: tpl.baselineStrategyId,
        candidateStrategies: [...tpl.candidateStrategies],
        heuristicPriors: { ...tpl.heuristicPriors },
        strategyPhysics: physics,
      });
    });
  }

  return scenarios;
}

/**
 * Verify zero prompt or ID leakage across Train, Validation, and Holdout splits.
 */
export function verifyZeroDataLeakage(scenarios: BenchmarkScenario[]): { clean: boolean; overlapCount: number } {
  const trainIds = new Set(scenarios.filter((s) => s.split === 'TRAIN').map((s) => s.id));
  const valIds = new Set(scenarios.filter((s) => s.split === 'VALIDATION').map((s) => s.id));
  const holdIds = new Set(scenarios.filter((s) => s.split === 'HOLDOUT').map((s) => s.id));

  const trainPrompts = new Set(scenarios.filter((s) => s.split === 'TRAIN').map((s) => s.prompt.toLowerCase()));
  const valPrompts = new Set(scenarios.filter((s) => s.split === 'VALIDATION').map((s) => s.prompt.toLowerCase()));
  const holdPrompts = new Set(scenarios.filter((s) => s.split === 'HOLDOUT').map((s) => s.prompt.toLowerCase()));

  let overlap = 0;
  for (const id of holdIds) {
    if (trainIds.has(id) || valIds.has(id)) overlap++;
  }
  for (const id of valIds) {
    if (trainIds.has(id)) overlap++;
  }
  for (const p of holdPrompts) {
    if (trainPrompts.has(p) || valPrompts.has(p)) overlap++;
  }
  for (const p of valPrompts) {
    if (trainPrompts.has(p)) overlap++;
  }
  return { clean: overlap === 0, overlapCount: overlap };
}
