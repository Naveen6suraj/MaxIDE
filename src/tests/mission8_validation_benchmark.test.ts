/**
 * MaxIDE APEX — Mission 8: 120-Scenario Benchmark, 4-System Comparison,
 * Learning Curves (10..1000), Pathology Checks & Generalization Runner
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { runFullMission8Validation } from '../intelligence/validation/ValidationRunner.js';

async function main() {
  console.log('\n==========================================================================');
  console.log('  MAXIDE APEX — MISSION 8 INDEPENDENT BENCHMARK & GENERALIZATION STUDY');
  console.log('==========================================================================\n');

  const t0 = Date.now();
  const report = await runFullMission8Validation({
    algorithm: 'UCB1',
    seeds: [101, 202, 303, 404, 505],
    budgets: [10, 50, 100, 250, 500, 1000],
  });
  const elapsed = Date.now() - t0;

  assert.strictEqual(report.totalScenarios, 120, 'Expected 120 benchmark scenarios');
  assert.strictEqual(report.zeroLeakageVerified, true, 'Zero data leakage between Train/Val/Holdout is mandatory');

  console.log(`Benchmark Version: ${report.benchmarkVersion} | Elapsed: ${elapsed}ms`);
  console.log(`Splits: Train=${report.trainCount}, Validation=${report.validationCount}, Holdout=${report.holdoutCount} | Zero Leakage: ${report.zeroLeakageVerified}\n`);

  console.log('--- 1. FOUR-SYSTEM HOLDOUT COMPARISON (5 Seeds × 36 Holdout = 180 Evaluations/System) ---');
  for (const s of report.systemComparison) {
    const m = s.metrics;
    console.log(
      `  ${s.label.padEnd(42)} | Comp: ${m.verifiedCompletionRate.toFixed(1)}% (95% CI [${s.completionCI95.ci95Low}%, ${s.completionCI95.ci95High}%]) | Cov: ${m.requirementCoverage.toFixed(1)}% | Build: ${m.buildSuccessRate.toFixed(1)}% | Test: ${m.testSuccessRate.toFixed(1)}% | Regr: ${m.regressionRate.toFixed(1)}% | SecViol: ${m.securityViolationsCount} | UserFix: ${m.userCorrectionRate.toFixed(1)}% | Cost: ${m.meanExecutionCostMs}ms | Recov: ${m.recoverySuccessRate.toFixed(1)}% | Rew: ${m.meanReward}`
    );
  }

  console.log('\n--- 2. LEARNING CURVES OVER EXPERIENCE BUDGETS (5 Seeds) ---');
  for (const pt of report.learningCurves) {
    console.log(
      `  Budget ${String(pt.budget).padStart(4)} | Sys C: ${pt.systemC_completion.mean.toFixed(1)}% (±${(pt.systemC_completion.ci95High - pt.systemC_completion.mean).toFixed(1)}%) | Sys D: ${pt.systemD_completion.mean.toFixed(1)}% (var=${pt.systemD_completion.variance}, 95% CI [${pt.systemD_completion.ci95Low}%, ${pt.systemD_completion.ci95High}%]) | Rew: ${pt.systemD_reward.mean} | Train: ${pt.trainCompletionMean.toFixed(1)}% | OverfitGap: ${pt.overfitGapPct.toFixed(1)}% | Entropy: ${pt.strategyEntropyNorm} | ArmCov: ${pt.armCoveragePct.toFixed(1)}%`
    );
  }

  console.log('\n--- 3. PATHOLOGY & FAILURE-MODE AUDIT ---');
  console.log(JSON.stringify(report.pathologies, null, 2));

  console.log('\n--- 4. GENERALIZATION AUDIT (UNSEEN DOMAINS, UNSEEN TIERS, UNSEEN COMBOS) ---');
  console.log(JSON.stringify(report.generalization, null, 2));

  // Persist JSON artifact for report generation & inspection
  const outDir = path.resolve(process.cwd(), 'docs', 'mission8');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'validation_results_ucb1.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nSaved complete raw results to: ${outFile}`);

  // Also run Thompson Sampling comparison for scientific completeness
  const tsReport = await runFullMission8Validation({
    algorithm: 'THOMPSON_SAMPLING',
    seeds: [101, 202, 303, 404, 505],
    budgets: [10, 50, 100, 250, 500],
  });
  const tsOutFile = path.join(outDir, 'validation_results_thompson.json');
  fs.writeFileSync(tsOutFile, JSON.stringify(tsReport, null, 2), 'utf8');
  console.log('\n--- 5. THOMPSON SAMPLING HOLDOUT SUMMARY (5 Seeds) ---');
  for (const s of tsReport.systemComparison) {
    console.log(
      `  ${s.label.padEnd(42)} | Comp: ${s.metrics.verifiedCompletionRate.toFixed(1)}% (95% CI [${s.completionCI95.ci95Low}%, ${s.completionCI95.ci95High}%]) | Rew: ${s.metrics.meanReward}`
    );
  }

  // Scientific assertions: Learned System D must strictly outperform Baseline System A on unseen Holdout verified completion
  const sysA = report.systemComparison.find((s) => s.system === 'A_BASELINE')!;
  const sysD = report.systemComparison.find((s) => s.system === 'D_BANDIT_WITH_MEM')!;
  assert.ok(
    sysD.metrics.verifiedCompletionRate > sysA.metrics.verifiedCompletionRate + 20,
    `System D (${sysD.metrics.verifiedCompletionRate}%) must substantially outperform Baseline A (${sysA.metrics.verifiedCompletionRate}%) on holdout tasks`
  );
  assert.strictEqual(report.pathologies.rewardExploitation.rewardWithoutCompletionGain, false, 'Reward exploitation detected!');
  console.log('\n✅ MISSION 8 BENCHMARK VALIDATION COMPLETE.\n');
}

main().catch((err) => {
  console.error('❌ Mission 8 benchmark failed:', err);
  process.exit(1);
});
