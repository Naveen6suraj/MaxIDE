const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/agent/AgentEngine.ts');
let code = fs.readFileSync(filePath, 'utf8');
const isCRLF = code.includes('\r\n');
const EOL = isCRLF ? '\r\n' : '\n';

console.log('Detected line ending:', isCRLF ? 'CRLF' : 'LF');

// 1. Add ClosedLoopTestEngine import & Lifecycle Types
const importTarget = `import { VerificationEngine } from './verification/VerificationEngine.js';`;
const newImports = `import { VerificationEngine } from './verification/VerificationEngine.js';${EOL}import { ClosedLoopTestEngine } from './verification/ClosedLoopTestEngine.js';${EOL}${EOL}export type TaskLifecycleState = 'IDLE' | 'PLANNING' | 'INSPECTING' | 'EXECUTING' | 'TESTING' | 'DIAGNOSING' | 'REPAIRING' | 'COMPLETED' | 'FAILED';${EOL}${EOL}export interface TaskExecutionEvidence {${EOL}  inspectedFiles: string[];${EOL}  modifiedFiles: string[];${EOL}  commandsExecuted: string[];${EOL}  testsRun: number;${EOL}  testsPassed: number;${EOL}  diagnostics: string[];${EOL}}`;

if (code.includes(importTarget)) {
  code = code.replace(importTarget, newImports);
  console.log('1. Imports & types added.');
} else {
  console.error('FAILED to find import target');
}

// 2. Add testEngine field & Lifecycle fields to AgentEngine class
const classFieldTarget = `  public readonly jobManager: BackgroundJobManager;`;
const newClassFields = `  public readonly jobManager: BackgroundJobManager;${EOL}  public readonly testEngine: ClosedLoopTestEngine;${EOL}  private currentLifecycleState: TaskLifecycleState = 'IDLE';${EOL}  private currentEvidence: TaskExecutionEvidence = {${EOL}    inspectedFiles: [],${EOL}    modifiedFiles: [],${EOL}    commandsExecuted: [],${EOL}    testsRun: 0,${EOL}    testsPassed: 0,${EOL}    diagnostics: [],${EOL}  };`;

if (code.includes(classFieldTarget)) {
  code = code.replace(classFieldTarget, newClassFields);
  console.log('2. testEngine and lifecycle fields added to AgentEngine class.');
} else {
  console.error('FAILED to find classFieldTarget');
}

// 3. Initialize testEngine in constructor
const ctorTarget = `    this.jobManager = new BackgroundJobManager(workspaceRoot);`;
const newCtorInit = `    this.jobManager = new BackgroundJobManager(workspaceRoot);${EOL}    this.testEngine = new ClosedLoopTestEngine(workspaceRoot, this.safeTerminal, this.checkpointManager);`;

if (code.includes(ctorTarget)) {
  code = code.replace(ctorTarget, newCtorInit);
  console.log('3. testEngine initialized in constructor.');
} else {
  console.error('FAILED to find ctorTarget');
}

// 4. Update setWorkspaceRoot
const rootTarget = `    this.jobManager.setWorkspaceRoot(newRoot);`;
const newRootInit = `    this.jobManager.setWorkspaceRoot(newRoot);${EOL}    this.testEngine.setWorkspaceRoot(newRoot);`;

if (code.includes(rootTarget)) {
  code = code.replace(rootTarget, newRootInit);
  console.log('4. testEngine.setWorkspaceRoot wired.');
} else {
  console.error('FAILED to find rootTarget');
}

// 5. Add lifecycle getter/setter methods to AgentEngine
const methodTarget = `  public setConversationStore(cs: ConversationStore): void {${EOL}    this.conversationStore = cs;${EOL}  }`;
const newMethods = `  public setConversationStore(cs: ConversationStore): void {${EOL}    this.conversationStore = cs;${EOL}  }${EOL}${EOL}  public getLifecycleState(): TaskLifecycleState {${EOL}    return this.currentLifecycleState;${EOL}  }${EOL}${EOL}  public setLifecycleState(state: TaskLifecycleState): void {${EOL}    this.currentLifecycleState = state;${EOL}    this.logActivity('thought', \`[Lifecycle: \${state}]\`);${EOL}  }${EOL}${EOL}  public getExecutionEvidence(): TaskExecutionEvidence {${EOL}    return { ...this.currentEvidence };${EOL}  }`;

if (code.includes(methodTarget)) {
  code = code.replace(methodTarget, newMethods);
  console.log('5. Lifecycle getter/setter methods added.');
} else {
  console.error('FAILED to find methodTarget');
}

// 6. In runTask, initialize evidence and lifecycle state at start
const runTaskStartTarget = `    // 2. Initialize Live Plan${EOL}    this.initializePlan(taskPrompt);${EOL}    this.logActivity('thought', 'Planning...');`;
const newRunTaskStart = `    // 2. Initialize Live Plan${EOL}    this.initializePlan(taskPrompt);${EOL}    this.setLifecycleState('PLANNING');${EOL}    this.currentEvidence = {${EOL}      inspectedFiles: [],${EOL}      modifiedFiles: [],${EOL}      commandsExecuted: [],${EOL}      testsRun: 0,${EOL}      testsPassed: 0,${EOL}      diagnostics: [],${EOL}    };${EOL}    this.logActivity('thought', 'Planning...');`;

if (code.includes(runTaskStartTarget)) {
  code = code.replace(runTaskStartTarget, newRunTaskStart);
  console.log('6. runTask lifecycle & evidence initialization added.');
} else {
  console.error('FAILED to find runTaskStartTarget');
}

// 7. Remove fake synthesis from event.type === 'error'
const oldErrorRegex = new RegExp(
  `\\} else if \\(event\\.type === 'error'\\) \\{[\\s\\S]*?\\n\\s*return \\{[\\s\\S]*?\\n\\s*error: event\\.error,?\\n\\s*\\};\\n\\s*\\}`
);

const newErrorBlock = `} else if (event.type === 'error') {
          this.logActivity('error', \`Generation error: \${event.error}\`);
          this.setLifecycleState('FAILED');
          return {
            success: false,
            task: taskPrompt,
            totalSteps: currentStep,
            finalAnswer: \`Task failed: AI provider error (\${event.error}). Workspace preserved without modification. Please verify your AI provider credentials and connectivity.\`,
            steps,
            plan: this.currentPlan,
            activityTimeline: this.timeline,
            error: \`PROVIDER_UNAVAILABLE: \${event.error}\`,
          };
        }`.replace(/\n/g, EOL);

if (oldErrorRegex.test(code)) {
  code = code.replace(oldErrorRegex, newErrorBlock);
  console.log('7. Generation error fake synthesis replaced with fail-honest return.');
} else {
  console.error('FAILED to match oldErrorRegex');
}

// 8. Remove synthesis on tool envelope in stepThought
const toolEnvelopeTarget = `      if (currentToolCalls.length === 0 && ContentSanitizer.isToolEnvelope(stepThought)) {${EOL}        this.logActivity('recovery', \`[Tool Envelope Intercepted] Model emitted raw JSON tool envelope in text. Executing registered tools...\`);${EOL}        const synthesized = this.synthesizeActionsForPrompt(taskPrompt);${EOL}        if (synthesized.length > 0) {${EOL}          currentToolCalls.push(...synthesized);${EOL}        }${EOL}      }`;
const newToolEnvelope = `      if (currentToolCalls.length === 0 && ContentSanitizer.isToolEnvelope(stepThought)) {${EOL}        this.logActivity('thought', \`[Tool Envelope Observed] Model emitted JSON envelope in thought stream.\`);${EOL}      }`;

if (code.includes(toolEnvelopeTarget)) {
  code = code.replace(toolEnvelopeTarget, newToolEnvelope);
  console.log('8. Tool envelope fake synthesis removed.');
} else {
  console.error('FAILED to find toolEnvelopeTarget');
}

// 9. Remove synthesis on hallucinated composite tool
const compositeTarget = '          // Intelligent Self-Healing: If model attempts a composite hallucinated tool or repeatedly fails' + EOL +
  '          if (isHallucinatedComposite || attempts >= 2) {' + EOL +
  '            this.logActivity(\'recovery\', `[Self-Healing Recovery] Autonomously executing registered tools for "${taskPrompt.slice(0, 35)}"...`);' + EOL +
  '            const synthesized = this.synthesizeActionsForPrompt(taskPrompt);' + EOL +
  '            currentToolCalls.length = 0;' + EOL +
  '            currentToolCalls.push(...synthesized);' + EOL +
  '            for (const sc of synthesized) {' + EOL +
  '              this.logActivity(\'tool_start\', `Tool: ${sc.name}`, sc.arguments);' + EOL +
  '              const res = await this.toolRegistry.execute(sc.name, sc.arguments, {' + EOL +
  '                model: this.gateway.modelRegistry.getModel(modelId || \'\'),' + EOL +
  '              });' + EOL +
  '              toolResults.push({ name: sc.name, result: res.result || res.error });' + EOL +
  '              this.logActivity(\'tool_end\', `Tool ${sc.name} completed`, res.result);' + EOL +
  '            }' + EOL +
  '            consecutiveErrors = 0;' + EOL +
  '            break;' + EOL +
  '          }';

const newComposite = '          // Steer model to registered tools when hallucinated composite or repeated failure occurs' + EOL +
  '          if (isHallucinatedComposite || attempts >= 2) {' + EOL +
  '            this.logActivity(\'recovery\', `[Steering Model] Unregistered tool "${tc.name}". Steering to registered tools (create_file, edit_file, read_file, run_command).`);' + EOL +
  '            messages.push({' + EOL +
  '              role: \'tool\',' + EOL +
  '              name: tc.name,' + EOL +
  '              toolCallId: tc.id,' + EOL +
  '              content: JSON.stringify({' + EOL +
  '                status: \'error\',' + EOL +
  '                failureType: \'TOOL_NOT_REGISTERED\',' + EOL +
  '                error: `Tool "${tc.name}" is not registered. You must ONLY call registered tools: create_file, edit_file, read_file, list_files, run_command.`,' + EOL +
  '                availableTools: this.toolRegistry.getDefinitions().map(d => d.name),' + EOL +
  '              }),' + EOL +
  '            });' + EOL +
  '            consecutiveErrors = 0;' + EOL +
  '            break;' + EOL +
  '          }';

if (code.includes(compositeTarget)) {
  code = code.replace(compositeTarget, newComposite);
  console.log('9. Hallucinated composite fake synthesis replaced with steer feedback.');
} else {
  console.error('FAILED to find compositeTarget');
}

// 10. In extractToolCallsFromText, remove hallucinated tool synthesis
const extractSynthTarget = '          if (candidateName.startsWith(\'build_\') || candidateName.startsWith(\'create_\') || candidateName.startsWith(\'make_\') || candidateName.endsWith(\'_app\') || candidateName.endsWith(\'_game\')) {' + EOL +
  '            const synthesized = this.synthesizeActionsForPrompt(taskPrompt);' + EOL +
  '            return synthesized;' + EOL +
  '          }';
const newExtractSynth = '          // Pass candidateName directly to tool execution boundary';

if (code.includes(extractSynthTarget)) {
  code = code.replace(extractSynthTarget, newExtractSynth);
  console.log('10. extractToolCallsFromText fake synthesis removed.');
} else {
  console.error('FAILED to find extractSynthTarget');
}

const concludingTarget = '    // If an execution task was supposed to create files, but none exist, trigger self-healing synthesis before concluding:' + EOL +
  '    if (isExecutionTask && !physicalFilesExist && commandsRun.length === 0) {' + EOL +
  '      this.logActivity(\'recovery\', `[Self-Healing Verification] Autonomously synthesizing verified files for "${taskPrompt.slice(0, 35)}"...`);' + EOL +
  '      const synthesized = this.synthesizeActionsForPrompt(taskPrompt);' + EOL +
  '      for (const sc of synthesized) {' + EOL +
  '        await this.toolRegistry.execute(sc.name, sc.arguments, {' + EOL +
  '          model: this.gateway.modelRegistry.getModel(modelId || \'\'),' + EOL +
  '        });' + EOL +
  '        if (sc.name === \'create_file\') {' + EOL +
  '          const p = (sc.arguments as any)?.path;' + EOL +
  '          if (p) filesTouched.push(p);' + EOL +
  '        }' + EOL +
  '      }' + EOL +
  '      if (fs.existsSync(path.join(rootPath, \'index.html\'))) {' + EOL +
  '        physicalFilesExist = true;' + EOL +
  '        if (!detectedOpenFile) detectedOpenFile = \'index.html\';' + EOL +
  '        if (!detectedOpenPreview) detectedOpenPreview = \'/workspace-preview/index.html\';' + EOL +
  '      }' + EOL +
  '    }' + EOL + EOL +
  '    const taskActuallySucceeded = physicalFilesExist || commandsRun.length > 0 || !isExecutionTask;';

const newConcluding = `    // Closed-Loop Verification: Automatically discover and execute project test suite${EOL}    const disc = this.testEngine.discoverTests();${EOL}    if (disc.hasTests && isExecutionTask && (this.currentEvidence.modifiedFiles.length > 0 || physicalFilesExist)) {${EOL}      this.setLifecycleState('TESTING');${EOL}      this.logActivity('thought', \`[Closed-Loop Verification] Discovered automated tests: "\${disc.testCommand}". Running verification suite...\`);${EOL}      const testRes = await this.testEngine.runTests(disc.testCommand);${EOL}      this.currentEvidence.testsRun++;${EOL}      if (testRes.passed) {${EOL}        this.currentEvidence.testsPassed++;${EOL}        this.logActivity('thought', \`[Closed-Loop Verification] Automated test suite passed successfully (0 errors).\`);${EOL}      } else {${EOL}        this.currentEvidence.diagnostics.push(...testRes.parsedFailures);${EOL}        this.logActivity('error', \`[Closed-Loop Verification Failed] Tests failed: \${testRes.parsedFailures.slice(0, 3).join('; ')}\`);${EOL}      }${EOL}    }${EOL}${EOL}    const testsFailed = this.currentEvidence.testsRun > 0 && this.currentEvidence.testsPassed === 0;${EOL}    const taskActuallySucceeded = (physicalFilesExist || commandsRun.length > 0 || !isExecutionTask) && !testsFailed;${EOL}${EOL}    if (taskActuallySucceeded) {${EOL}      this.setLifecycleState('COMPLETED');${EOL}    } else {${EOL}      this.setLifecycleState('FAILED');${EOL}    }`;

if (code.includes(concludingTarget)) {
  code = code.replace(concludingTarget, newConcluding);
  console.log('11. Concluding fake synthesis replaced with ClosedLoopTestEngine.');
} else {
  console.error('FAILED to find concludingTarget');
}

// 12. Replace the 460-line synthesizeActionsForPrompt method
const synthStart = `  private synthesizeActionsForPrompt(taskPrompt: string): ToolCall[] {`;
const synthEnd = `  public async processMessage(`;

const startIndex = code.indexOf(synthStart);
const endIndex = code.indexOf(synthEnd);

if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
  const replacement = `  /**${EOL}   * Canned synthesis is deprecated. MaxIDE uses genuine autonomous execution${EOL}   * and closed-loop testing via ClosedLoopTestEngine.${EOL}   */${EOL}  private synthesizeActionsForPrompt(_taskPrompt: string): ToolCall[] {${EOL}    return [];${EOL}  }${EOL}${EOL}  `;
  code = code.slice(0, startIndex) + replacement + code.slice(endIndex);
  console.log('12. synthesizeActionsForPrompt body cleanly replaced.');
} else {
  console.error('FAILED to find synthesizeActionsForPrompt method range', { startIndex, endIndex });
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('AgentEngine.ts reconstruction completed successfully.');
