/**
 * MaxIDE APEX — Mission 10: Outcome-Driven Planner & Strategy Orchestrator
 * Generates dependency-ordered task execution graphs, pairs user intent with
 * feasibility-verified strategy arms, and constructs progressive prompt decomposition
 * tailored for local models (e.g. qwen2.5-coder:3b).
 */

import { TaskContract, IntentClassifier } from '../agent/intent/IntentClassifier.js';
import { ProductSpec, ProductSpecEngine } from './ProductSpecEngine.js';
import { ToolchainDetector, ToolchainCapabilities } from './ToolchainDetector.js';

export interface PlanStage {
  id: string;
  name: string;
  stageNumber: number;
  description: string;
  dependencies: string[];
  expectedOutput: string;
  verificationGate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
}

export interface OutcomePlan {
  id: string;
  taskPrompt: string;
  contract: TaskContract;
  spec: ProductSpec;
  strategyId: string;
  strategyName: string;
  rationale: string;
  stages: PlanStage[];
  currentStageIndex: number;
  promptDecomposition: {
    systemDirective: string;
    fileScaffoldBrief: string;
    functionalRequirementsSummary: string;
  };
  generatedAt: string;
}

export class OutcomeDrivenPlanner {
  /**
   * Plans an outcome-driven engineering execution graph.
   */
  public static planTask(
    prompt: string,
    workspacePath: string = process.cwd(),
    caps?: ToolchainCapabilities
  ): OutcomePlan {
    const contract = IntentClassifier.createContract(prompt, workspacePath);
    const spec = ProductSpecEngine.generateSpec(prompt, contract, workspacePath);
    const activeCaps = caps || ToolchainDetector.detect(workspacePath);

    // Feasibility-verified strategy selection
    let strategyId = 'modular-multi-file-web-app';
    let strategyName = 'Modular Multi-File Frontend (index.html + styles.css + app.js)';
    let rationale = 'Production multi-file frontend architecture with interactive JS state and CSS responsive layout.';

    if (contract.targetPlatform === 'NATIVE_WINDOWS') {
      if (activeCaps.cscAvailable) {
        strategyId = 'native-winforms-csc';
        strategyName = 'Windows Forms Native Executable via csc.exe';
        rationale = 'Zero-dependency native Windows C# desktop app compiled via host csc.exe.';
      } else if (activeCaps.dotnetAvailable) {
        strategyId = 'native-wpf-dotnet';
        strategyName = '.NET 8 Desktop WPF Application';
        rationale = 'Modern .NET desktop application compiled via dotnet CLI.';
      } else {
        strategyId = 'blocked-missing-toolchain';
        strategyName = 'Host Toolchain Missing';
        rationale = 'Cannot build native Windows app without csc.exe or dotnet SDK.';
      }
    } else if (contract.targetPlatform === 'WEB_APP' || contract.targetPlatform === 'FULLSTACK_WEB') {
      if (activeCaps.hasVite) {
        strategyId = 'vite-typescript-spa';
        strategyName = 'Vite + TypeScript Structured SPA';
        rationale = 'Fast bundling and type-checked modules using installed Vite dependency.';
      } else {
        strategyId = 'modular-multi-file-web-app';
        strategyName = 'Modular Multi-File Frontend (index.html + styles.css + app.js)';
        rationale = 'Zero-build-step production web architecture running directly in browser preview.';
      }
    }

    // 5 Progressive Dependency Stages
    const stages: PlanStage[] = [
      {
        id: 'stage_1_specify',
        name: 'Product Specification & Contract',
        stageNumber: 1,
        description: `Define data models (${spec.dataModels.map(d => d.entityName).join(', ') || 'UI State'}) and interactive journeys.`,
        dependencies: [],
        expectedOutput: `ProductSpec generated with ${spec.interactiveFeatures.length} features`,
        verificationGate: 'Contract Validation Gate',
        status: 'COMPLETED',
      },
      {
        id: 'stage_2_scaffold',
        name: 'Multi-File Production Implementation',
        stageNumber: 2,
        description: `Generate full implementation across ${spec.requiredDeliverables.join(', ')} without stubs or placeholders.`,
        dependencies: ['stage_1_specify'],
        expectedOutput: `All required files (${spec.requiredDeliverables.join(', ')}) written to disk with size > 250 bytes`,
        verificationGate: 'Deliverable Non-Stub Check',
        status: 'PENDING',
      },
      {
        id: 'stage_3_visual',
        name: 'Visual Layout & Responsive Inspection',
        stageNumber: 3,
        description: 'Launch application in isolated Playwright browser, inspect layout, capture desktop and mobile screenshots.',
        dependencies: ['stage_2_scaffold'],
        expectedOutput: 'Desktop (1280x800) and Mobile (390x844) screenshots captured with zero broken images',
        verificationGate: 'Visual Quality Engine Score >= 0.70',
        status: 'PENDING',
      },
      {
        id: 'stage_4_functional',
        name: 'Interactive Functional Controls Verification',
        stageNumber: 4,
        description: 'Test buttons, search, category filters, cart operations, arithmetic totals, and receipt modal.',
        dependencies: ['stage_3_visual'],
        expectedOutput: 'Interactive user controls pass verification with 0 unhandled console errors',
        verificationGate: 'Functional Quality Engine Pass Rate >= 0.80',
        status: 'PENDING',
      },
      {
        id: 'stage_5_acceptance',
        name: 'Outcome Acceptance & Continuous Learning',
        stageNumber: 5,
        description: 'Evaluate Requirement Coverage vs Evidence. Award COMPLETED status only if all gates pass. Record experience memory.',
        dependencies: ['stage_4_functional'],
        expectedOutput: 'OutcomeAcceptanceReport with verified status and updated learning policy',
        verificationGate: 'OutcomeAcceptanceEngine Decision Gate',
        status: 'PENDING',
      },
    ];

    // Structured Prompt Guidance for 3B Local Models (qwen2.5-coder:3b)
    const fileScaffoldBrief = spec.requiredDeliverables.map(file => {
      if (file === 'index.html') {
        return `- **index.html**: Complete semantic HTML5 structure with container elements (#menuGrid, #orderSidebar, #cartCountBadge, #menuSearchInput, #customerName, #placeOrderBtn, #orderSuccessModal).`;
      }
      if (file === 'styles.css') {
        return `- **styles.css**: Clean modern CSS layout with CSS custom properties, grid/flexbox, card hover effects, order sidebar, and mobile responsive media queries.`;
      }
      if (file === 'app.js') {
        return `- **app.js**: Complete JavaScript implementation with MENU_DATA array (16 items), renderMenu(), search/filter handlers, cart state (addToCart, updateQty, remove), totals calculation, and checkout modal logic.`;
      }
      return `- **${file}**: Implementation for ${file}.`;
    }).join('\n');

    const functionalRequirementsSummary = spec.interactiveFeatures.map(f => `- **${f.name}**: ${f.expectedBehavior}`).join('\n');

    const systemDirective =
      `CRITICAL MISSION DIRECTIVE (OUTCOME-DRIVEN ENGINEERING):\n` +
      `You are an elite autonomous product engineer. The user does NOT want a bare skeleton, code explanation, or empty <h1> placeholder.\n` +
      `You must build the complete application specified below:\n\n` +
      `Product: "${spec.name}" (${spec.domain})\n` +
      `Selected Feasible Strategy: "${strategyName}" (${strategyId})\n\n` +
      `Required Files to Create:\n${fileScaffoldBrief}\n\n` +
      `Mandatory Interactive Features:\n${functionalRequirementsSummary}\n\n` +
      `EXECUTION RULES:\n` +
      `1. Call create_file for EACH required file (index.html, styles.css, app.js).\n` +
      `2. NEVER write empty placeholder comments like <!-- items will be dynamically loaded here --> without the JS that actually loads them!\n` +
      `3. Open the live preview with open_preview.\n`;

    return {
      id: `plan-outcome-${Date.now()}`,
      taskPrompt: prompt,
      contract,
      spec,
      strategyId,
      strategyName,
      rationale,
      stages,
      currentStageIndex: 0,
      promptDecomposition: {
        systemDirective,
        fileScaffoldBrief,
        functionalRequirementsSummary,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
