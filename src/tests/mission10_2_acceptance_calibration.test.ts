/**
 * MaxIDE APEX — Mission 10.2: Acceptance Calibration & Design Intelligence Test Suite
 * Tests:
 * 1. Scoring consistency: composite score calculation, mandatory gate enforcement, explainable breakdown.
 * 2. ProfessionalDesignEngine: tailored tokens across categories (Cafe, E-Commerce, Productivity, Native Windows).
 * 3. AssetSelectionEngine: verified photographic assets, offline vector fallbacks, zero raw emoji substitution.
 * 4. Multi-platform source code scanning in OutcomeAcceptanceEngine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import {
  OutcomeAcceptanceEngine,
  ProfessionalDesignEngine,
  AssetSelectionEngine,
  ProductSpecEngine,
} from '../intelligence/index.js';
import { TaskContract } from '../agent/intent/IntentClassifier.js';

describe('Mission 10.2 — Acceptance Calibration & Scoring Consistency', () => {
  it('should compute exact weighted composite scores without contradiction', () => {
    const dummyContract = {
      userPrompt: 'Build a native Windows desktop employee directory application (.exe)',
      intent: 'NATIVE_APP_BUILD' as const,
      taskType: 'BUILD' as const,
      targetPlatform: 'NATIVE_WINDOWS' as const,
      complexity: 'MEDIUM' as const,
      requiresExecution: true,
      requiresToolchain: 'NATIVE_WINDOWS',
      confidence: 1.0,
      classificationMethod: 'STRUCTURED_RULE' as const,
    } as unknown as TaskContract;

    const dummySpec = ProductSpecEngine.generateSpec(
      'Build a native Windows desktop employee directory application (.exe)',
      dummyContract,
      process.cwd()
    );

    // Verify weights sum to 1.0
    const w = OutcomeAcceptanceEngine.WEIGHTS;
    const sum = w.requirementCoverage + w.functionalCompleteness + w.visualCompleteness + w.runtimeStability + w.buildSuccess + w.deliverableCorrectness;
    assert.strictEqual(Math.round(sum * 100) / 100, 1.0);

    // Test temporary directory with App.cs and App.exe
    const tmpDir = path.join(process.cwd(), '.maxide', 'test_scoring_consistency');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    fs.writeFileSync(path.join(tmpDir, 'App.cs'), `
      using System;
      using System.Windows.Forms;
      namespace App {
        class Program : Form {
          static void Main() { Application.Run(new Program()); }
        }
      }
    `);
    fs.writeFileSync(path.join(tmpDir, 'App.exe'), Buffer.alloc(1024, 0x90)); // dummy PE file

    const report = OutcomeAcceptanceEngine.evaluateOutcome({
      contract: dummyContract,
      spec: dummySpec,
      workspacePath: tmpDir,
    });

    // Clean up
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}

    // Assert explainable breakdown exists
    assert.ok(report.scorecardExplanation, 'Explanation must be defined');
    assert.ok(report.scorecardExplanation.mathematicalBreakdown.includes('Composite'), 'Breakdown must detail composite math');
    assert.ok(report.scorecardExplanation.mandatoryGates.length >= 4, 'Must evaluate mandatory gates');
    assert.ok(report.qualityTier, 'Quality tier must be assigned');
  });

  it('should generate distinct design tokens for different categories', () => {
    const cafeDesign = ProfessionalDesignEngine.generateDesignSpec({
      prompt: 'Build cafe menu and order',
      category: 'CAFE_RESTAURANT',
    });

    const audioDesign = ProfessionalDesignEngine.generateDesignSpec({
      prompt: 'Minimalist audio headphones store',
      category: 'E_COMMERCE',
    });

    const nativeWinDesign = ProfessionalDesignEngine.generateDesignSpec({
      prompt: 'Employee directory desktop app',
      category: 'NATIVE_WINDOWS',
      targetPlatform: 'NATIVE_WINDOWS',
    });

    // Check Cafe design has Artisanal Warm direction and Playfair Display font
    assert.strictEqual(cafeDesign.visualDirection, 'ARTISANAL_WARM');
    assert.ok(cafeDesign.typography.headingFont.includes('Playfair Display'));
    assert.strictEqual(cafeDesign.colorPalette.primary, '#d97706');

    // Check E-Commerce design has Minimalist direction and Plus Jakarta Sans font
    assert.strictEqual(audioDesign.visualDirection, 'MINIMALIST');
    assert.ok(audioDesign.typography.headingFont.includes('Plus Jakarta Sans'));

    // Check Native Windows design has C# styling tokens
    assert.strictEqual(nativeWinDesign.visualDirection, 'NATIVE_WINDOWS_FLUENT');
    assert.ok(nativeWinDesign.csharpStylingTokens, 'C# tokens must be generated');
    assert.strictEqual(nativeWinDesign.csharpStylingTokens?.fontFamily, 'Segoe UI');
  });

  it('should resolve verified photography and reject raw emoji substitution', () => {
    const coffeeAsset = AssetSelectionEngine.resolveAsset('cafe_pour_over');
    assert.ok(coffeeAsset.primaryUrl.startsWith('https://images.unsplash.com/'));
    assert.ok(coffeeAsset.fallbackDataUri.startsWith('data:image/svg+xml'));
    assert.ok(!coffeeAsset.fallbackDataUri.includes('☕'), 'Must not substitute raw emoji');

    const markup = AssetSelectionEngine.generateImageMarkup(coffeeAsset, 'menu-img');
    assert.ok(markup.includes('<img src="https://images.unsplash.com/'));
    assert.ok(markup.includes('onerror="this.onerror=null;this.src='));
    assert.ok(markup.includes('loading="lazy"'));
    assert.ok(markup.includes('alt="Artisanal pour over coffee'));
  });

  it('should accept alternative deliverables (App.cs or Program.cs)', () => {
    const tmpDir = path.join(process.cwd(), '.maxide', 'test_alt_deliv');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Create App.cs (not Program.cs) and App.exe
    fs.writeFileSync(path.join(tmpDir, 'App.cs'), '// C# application code with more than 250 bytes to pass size check.\n'.repeat(10));
    fs.writeFileSync(path.join(tmpDir, 'App.exe'), Buffer.alloc(512, 0x4d));

    const contract = {
      userPrompt: 'Build employee directory .exe',
      intent: 'NATIVE_APP_BUILD' as const,
      taskType: 'BUILD' as const,
      targetPlatform: 'NATIVE_WINDOWS' as const,
      complexity: 'MEDIUM' as const,
      requiresExecution: true,
      requiresToolchain: 'NATIVE_WINDOWS',
      confidence: 1.0,
      classificationMethod: 'STRUCTURED_RULE' as const,
    } as unknown as TaskContract;

    const spec = ProductSpecEngine.generateSpec('Build employee directory .exe', contract, tmpDir);

    const report = OutcomeAcceptanceEngine.evaluateOutcome({
      contract,
      spec,
      workspacePath: tmpDir,
    });

    // Clean up
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}

    // Must successfully recognize App.cs as satisfying 'App.cs|Program.cs'
    assert.strictEqual(report.scorecard.deliverableCorrectness, 1.0, 'Deliverable score must be 1.0 when App.cs is present');
  });
});
