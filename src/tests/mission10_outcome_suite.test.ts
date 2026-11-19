/**
 * MaxIDE APEX — Mission 10: Comprehensive Outcome Quality Test Suite
 * Tests ProductSpecEngine, IntentClassifier contracts, ClarificationGate autonomous defaults,
 * VisualQualityEngine, FunctionalQualityEngine, and OutcomeAcceptanceEngine fail-honest invariants.
 */

import fs from 'fs';
import path from 'path';
import { IntentClassifier } from '../agent/intent/IntentClassifier.js';
import { ClarificationGate } from '../agent/ClarificationGate.js';
import { ProductSpecEngine } from '../intelligence/ProductSpecEngine.js';
import { OutcomeDrivenPlanner } from '../intelligence/OutcomeDrivenPlanner.js';
import { OutcomeAcceptanceEngine } from '../intelligence/OutcomeAcceptanceEngine.js';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runMission10OutcomeSuite(): Promise<{
  passedCount: number;
  totalCount: number;
  results: TestResult[];
  success: boolean;
}> {
  const results: TestResult[] = [];
  const tempTestDir = path.join(process.cwd(), '.temp_m10_outcome_test');
  if (!fs.existsSync(tempTestDir)) {
    fs.mkdirSync(tempTestDir, { recursive: true });
  }

  try {
    // 1. IntentClassifier: Non-explanation invariant for explicit CSS build requests
    {
      const res = IntentClassifier.classify('Build me a complete website using CSS');
      const passed = res.intent === 'BUILD' && !res.isConversational && res.isExecution;
      results.push({
        name: 'IntentClassifier routes "Build me a complete website using CSS" to BUILD intent',
        passed,
        details: `Intent: ${res.intent}, isConversational: ${res.isConversational}, isExecution: ${res.isExecution}`,
      });
    }

    // 2. IntentClassifier: Existing website improvement routed to REFACTOR / CODE_EDIT
    {
      const res = IntentClassifier.classify('Improve the CSS in my existing website');
      const passed = (res.intent === 'REFACTOR' || res.intent === 'CODE_EDIT') && res.isExecution;
      results.push({
        name: 'IntentClassifier routes "Improve the CSS in my existing website" to REFACTOR/CODE_EDIT',
        passed,
        details: `Intent: ${res.intent}, isExecution: ${res.isExecution}`,
      });
    }

    // 3. ClarificationGate: Eliminates interruptions on rich domain requests
    {
      const c1 = ClarificationGate.evaluatePrompt('build me a project for cafe restaurant for menu and order');
      const c2 = ClarificationGate.evaluatePrompt('build me an attendance analyzer web app');
      const passed = !c1.requiresClarification && !c2.requiresClarification;
      results.push({
        name: 'ClarificationGate eliminates interruptions on domain requests (cafe & attendance)',
        passed,
        details: `Cafe requiresClarification: ${c1.requiresClarification}, Attendance requiresClarification: ${c2.requiresClarification}`,
      });
    }

    // 4. TaskContract Generation across domains
    {
      const contract = IntentClassifier.createContract('build me a project for cafe restaurant for menu and order', tempTestDir);
      const passed = 
        contract.targetPlatform === 'WEB_APP' && 
        contract.functionalRequirements.length >= 3 &&
        contract.acceptanceCriteria.length >= 3;
      results.push({
        name: 'IntentClassifier generates complete TaskContract with functional and acceptance requirements',
        passed,
        details: `Target: ${contract.targetPlatform}, FuncReqs: ${contract.functionalRequirements.length}, Acceptance: ${contract.acceptanceCriteria.length}`,
      });
    }

    // 5. ProductSpecEngine: Cafe Menu Domain Specification
    {
      const contract = IntentClassifier.createContract('build me an artisanal cafe menu with ordering cart', tempTestDir);
      const spec = ProductSpecEngine.generateSpec('build me an artisanal cafe menu with ordering cart', contract, tempTestDir);
      const passed = 
        spec.domain === 'CAFE_ORDERING' &&
        spec.pages.length > 0 &&
        spec.dataModels.length > 0 &&
        spec.interactiveFeatures.some(f => f.name.toLowerCase().includes('cart') || f.name.toLowerCase().includes('order')) &&
        spec.validationRules.length > 0;
      results.push({
        name: 'ProductSpecEngine generates full Cafe Ordering spec with data models, features, and validation',
        passed,
        details: `Domain: ${spec.domain}, Pages: ${spec.pages.length}, DataModels: ${spec.dataModels.length}, Features: ${spec.interactiveFeatures.length}`,
      });
    }

    // 6. ProductSpecEngine: Student Attendance Analyzer Domain Specification
    {
      const contract = IntentClassifier.createContract('create a student attendance analyzer dashboard', tempTestDir);
      const spec = ProductSpecEngine.generateSpec('create a student attendance analyzer dashboard', contract, tempTestDir);
      const passed = 
        spec.domain === 'ATTENDANCE_ANALYZER' &&
        spec.interactiveFeatures.some(f => f.name.toLowerCase().includes('attendance') || f.name.toLowerCase().includes('filter')) &&
        spec.dataModels.some(m => m.entityName.toLowerCase().includes('student') || m.entityName.toLowerCase().includes('record'));
      results.push({
        name: 'ProductSpecEngine generates full Student Attendance Analyzer specification',
        passed,
        details: `Domain: ${spec.domain}, Features: ${spec.interactiveFeatures.length}, DataModels: ${spec.dataModels.length}`,
      });
    }

    // 7. OutcomeDrivenPlanner: Stage Decomposition & Prompts
    {
      const plan = OutcomeDrivenPlanner.planTask('build me an artisanal cafe menu with ordering cart', tempTestDir);
      const passed = 
        plan.stages.length === 5 &&
        plan.stages[0].id === 'stage_1_specify' &&
        plan.stages[1].id === 'stage_2_scaffold' &&
        plan.stages[4].id === 'stage_5_acceptance' &&
        plan.promptDecomposition.systemDirective.length > 50 &&
        plan.promptDecomposition.functionalRequirementsSummary.length > 50;
      results.push({
        name: 'OutcomeDrivenPlanner produces 5-stage progressive decomposition for 3B models',
        passed,
        details: `Stages: ${plan.stages.length}, Strategy: ${plan.strategyId}`,
      });
    }

    // 8. OutcomeAcceptanceEngine: Fail-Honest on Minimal HTML Stub (Anti-False-Positive Invariant)
    {
      const stubDir = path.join(tempTestDir, 'stub_project');
      if (!fs.existsSync(stubDir)) fs.mkdirSync(stubDir, { recursive: true });
      // Write the exact 14-line stub that broke in User Screenshot 1 & 4
      fs.writeFileSync(
        path.join(stubDir, 'index.html'),
        '<!DOCTYPE html>\n<html><head><title>Student Attendance Analyzer</title></head><body><h1>Student Attendance Analyzer</h1><div id="app"></div><script src="app.js"></script></body></html>'
      );
      fs.writeFileSync(path.join(stubDir, 'app.js'), '// TODO: implement');

      const contract = IntentClassifier.createContract('create a student attendance analyzer dashboard', stubDir);
      const spec = ProductSpecEngine.generateSpec('create a student attendance analyzer dashboard', contract, stubDir);
      const evaluation = OutcomeAcceptanceEngine.evaluateOutcome({
        contract,
        spec,
        workspacePath: stubDir,
      });

      const passed = evaluation.status === 'FAILED' && evaluation.missingRequirements.length > 0;
      results.push({
        name: 'OutcomeAcceptanceEngine rejects minimal HTML stub with honest FAILED/PARTIALLY_COMPLETED status',
        passed,
        details: `Status: ${evaluation.status}, Composite Score: ${(evaluation.scorecard.compositeQualityScore * 100).toFixed(0)}%, Missing Reqs: ${evaluation.missingRequirements.length}`,
      });
    }

    // 9. OutcomeAcceptanceEngine: Full Acceptance on Completed Production Application
    {
      const prodDir = path.join(tempTestDir, 'prod_project');
      if (!fs.existsSync(prodDir)) fs.mkdirSync(prodDir, { recursive: true });
      
      // Copy reference cafe benchmark files
      const srcRef = path.join(process.cwd(), 'src', 'benchmarks', 'cafe_menu');
      if (fs.existsSync(srcRef)) {
        for (const file of fs.readdirSync(srcRef)) {
          fs.copyFileSync(path.join(srcRef, file), path.join(prodDir, file));
        }
      }

      const contract = IntentClassifier.createContract('build me an artisanal cafe menu with ordering cart', prodDir);
      const spec = ProductSpecEngine.generateSpec('build me an artisanal cafe menu with ordering cart', contract, prodDir);
      const evaluation = OutcomeAcceptanceEngine.evaluateOutcome({
        contract,
        spec,
        workspacePath: prodDir,
      });

      const passed = evaluation.status === 'COMPLETED' && evaluation.scorecard.compositeQualityScore >= 0.85;
      results.push({
        name: 'OutcomeAcceptanceEngine awards COMPLETED status to complete production cafe app',
        passed,
        details: `Status: ${evaluation.status}, Composite Score: ${(evaluation.scorecard.compositeQualityScore * 100).toFixed(0)}%, Passed Gates: ${evaluation.passedAcceptanceGates.length}`,
      });
    }

  } finally {
    // Cleanup temporary test directory
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    } catch {}
  }

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  return {
    passedCount,
    totalCount,
    results,
    success: passedCount === totalCount,
  };
}

if (process.argv[1] && (process.argv[1].endsWith('mission10_outcome_suite.test.ts') || process.argv[1].endsWith('mission10_outcome_suite.test.js'))) {
  runMission10OutcomeSuite().then((res) => {
    console.log('\n======================================================');
    console.log(`  MISSION 10: OUTCOME QUALITY TEST SUITE`);
    console.log(`  Score: ${res.passedCount} / ${res.totalCount} Passed (${res.success ? '100% PASS' : 'FAIL'})`);
    console.log('======================================================\n');
    for (const r of res.results) {
      console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}`);
      console.log(`         ${r.details}`);
    }
    process.exit(res.success ? 0 : 1);
  }).catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
}
