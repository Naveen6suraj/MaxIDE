/**
 * MaxIDE - Universal Capability Planner
 * Implements Section 2, 14 & 15 of Master Architecture:
 * Plans multi-capability workflows and translates complex natural language
 * intents into structured dependency graphs across specialized agents.
 */

import { CapabilityCategory, CapabilityRegistry } from './CapabilityRegistry.js';
import { IntentClassification } from '../agent/intent/IntentClassifier.js';

export interface PlannedCapabilityStep {
  id: string;
  stepNumber: number;
  category: CapabilityCategory;
  name: string;
  agentRole: 'PlannerAgent' | 'CodingAgent' | 'ResearchAgent' | 'BrowserAgent' | 'TestingAgent' | 'DesignAgent' | 'MediaAgent' | 'DocumentAgent' | 'ReviewerAgent' | 'DataAgent';
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  dependencies: string[];
  parameters?: Record<string, any>;
  resultArtifactId?: string;
  error?: string;
}

export interface CapabilityExecutionPlan {
  id: string;
  taskPrompt: string;
  capabilitiesRequired: CapabilityCategory[];
  steps: PlannedCapabilityStep[];
  currentStepIndex: number;
  isMultiCapability: boolean;
  estimatedDurationSeconds: number;
  createdAt: string;
}

export class CapabilityPlanner {
  constructor(private capabilityRegistry: CapabilityRegistry) {}

  /**
   * Formulate an execution plan from user prompt and intent classification
   */
  public planTask(
    prompt: string,
    classification: IntentClassification
  ): CapabilityExecutionPlan {
    const planId = 'plan_' + Date.now();
    const lower = prompt.toLowerCase();

    // Detect if prompt is multi-capability (e.g. game/website + artwork + music)
    const hasCode = /\b(build|code|website|game|app|component|dashboard|fullstack|server|api|frontend)\b/i.test(lower);
    const hasImage = /\b(image|picture|artwork|illustration|logo|icon|hero|photo|graphic)\b/i.test(lower);
    const hasAudio = /\b(music|audio|song|track|sound|tune|soundtrack|effects)\b/i.test(lower);
    const hasVideo = /\b(video|clip|movie|animation|footage)\b/i.test(lower);
    const hasDoc = /\b(pdf|document|docx|presentation|pptx|report|slides)\b/i.test(lower);
    const hasData = /\b(csv|data|dataset|chart|metrics|statistics)\b/i.test(lower);
    const hasResearch = /\b(research|search|sources|citations|investigate)\b/i.test(lower);

    const detectedCategories: CapabilityCategory[] = [];
    const steps: PlannedCapabilityStep[] = [];
    let stepCount = 0;

    // Multi-Capability Workflow: Game or Web App with Media Assets
    if (hasCode && (hasImage || hasAudio)) {
      // Step 1: Project Scaffolding
      detectedCategories.push('PROJECT_MANAGEMENT', 'FILESYSTEM');
      steps.push({
        id: 's' + (++stepCount),
        stepNumber: stepCount,
        category: 'FILESYSTEM',
        name: 'Project Structure & Workspace Scaffolding',
        agentRole: 'CodingAgent',
        description: 'Initialize project layout, assets directory, and configuration',
        status: 'pending',
        dependencies: [],
      });

      // Step 2: Image Generation (if requested)
      if (hasImage) {
        detectedCategories.push('IMAGE_GENERATION');
        steps.push({
          id: 's' + (++stepCount),
          stepNumber: stepCount,
          category: 'IMAGE_GENERATION',
          name: 'Synthesize Project Artwork & Visual Assets',
          agentRole: 'MediaAgent',
          description: 'Generate photorealistic artwork, sprites, or hero imagery',
          status: 'pending',
          dependencies: ['s1'],
        });
      }

      // Step 3: Audio Generation (if requested)
      if (hasAudio) {
        detectedCategories.push('AUDIO_GENERATION');
        steps.push({
          id: 's' + (++stepCount),
          stepNumber: stepCount,
          category: 'AUDIO_GENERATION',
          name: 'Synthesize Background Audio & Music',
          agentRole: 'MediaAgent',
          description: 'Synthesize 44.1kHz stereo audio soundtrack tailored to the theme',
          status: 'pending',
          dependencies: ['s1'],
        });
      }

      // Step 4: Software Engineering & Code Synthesis
      detectedCategories.push('SOFTWARE_ENGINEERING');
      steps.push({
        id: 's' + (++stepCount),
        stepNumber: stepCount,
        category: 'SOFTWARE_ENGINEERING',
        name: 'Synthesize Application Code & Wire Assets',
        agentRole: 'CodingAgent',
        description: 'Synthesize responsive game/app logic, styles, and embed generated media assets',
        status: 'pending',
        dependencies: steps.map(s => s.id),
      });

      // Step 5: Terminal / Local Server Execution
      detectedCategories.push('TERMINAL');
      steps.push({
        id: 's' + (++stepCount),
        stepNumber: stepCount,
        category: 'TERMINAL',
        name: 'Verify Runtime & Start Development Server',
        agentRole: 'TestingAgent',
        description: 'Execute build command and verify zero syntax/runtime errors',
        status: 'pending',
        dependencies: ['s' + (stepCount - 1)],
      });

      // Step 6: Browser Live Verification
      detectedCategories.push('BROWSER');
      steps.push({
        id: 's' + (++stepCount),
        stepNumber: stepCount,
        category: 'BROWSER',
        name: 'Headless Browser App Verification',
        agentRole: 'BrowserAgent',
        description: 'Open application in Playwright Chromium, verify DOM elements, audio/video playback, and console',
        status: 'pending',
        dependencies: ['s' + (stepCount - 1)],
      });

      // Step 7: Artifact Management & Strict Verification
      detectedCategories.push('ARTIFACT_MANAGEMENT');
      steps.push({
        id: 's' + (++stepCount),
        stepNumber: stepCount,
        category: 'ARTIFACT_MANAGEMENT',
        name: 'Multi-Artifact Verification & Delivery',
        agentRole: 'ReviewerAgent',
        description: 'Inspect all generated files with VerificationEngine binary checks',
        status: 'pending',
        dependencies: ['s' + (stepCount - 1)],
      });

      return {
        id: planId,
        taskPrompt: prompt,
        capabilitiesRequired: Array.from(new Set(detectedCategories)),
        steps,
        currentStepIndex: 0,
        isMultiCapability: true,
        estimatedDurationSeconds: 15,
        createdAt: new Date().toISOString(),
      };
    }

    // Single-Domain Workflows
    if (classification.intent === 'PRESENTATION_GEN') {
      detectedCategories.push('DOCUMENTS', 'ARTIFACT_MANAGEMENT');
      steps.push(
        {
          id: 's1',
          stepNumber: 1,
          category: 'DOCUMENTS',
          name: 'Outline Presentation Structure & Themes',
          agentRole: 'PlannerAgent',
          description: 'Structure slides, content cards, and statistical callouts',
          status: 'pending',
          dependencies: [],
        },
        {
          id: 's2',
          stepNumber: 2,
          category: 'DOCUMENTS',
          name: 'Compile OpenXML PowerPoint (.pptx) Deck',
          agentRole: 'DocumentAgent',
          description: 'Generate 16:9 slides using pptxgenjs and author slide viewer',
          status: 'pending',
          dependencies: ['s1'],
        },
        {
          id: 's3',
          stepNumber: 3,
          category: 'ARTIFACT_MANAGEMENT',
          name: 'Verify PPTX Binary Magic Header (PK\x03\x04)',
          agentRole: 'ReviewerAgent',
          description: 'Verify file on disk and register artifact',
          status: 'pending',
          dependencies: ['s2'],
        }
      );
    } else if (classification.intent === 'DATA_ANALYSIS') {
      detectedCategories.push('DATA_PROCESSING', 'IMAGE_GENERATION', 'ARTIFACT_MANAGEMENT');
      steps.push(
        {
          id: 's1',
          stepNumber: 1,
          category: 'DATA_PROCESSING',
          name: 'Parse CSV & Compute Statistical Metrics',
          agentRole: 'DataAgent',
          description: 'Profile columns, missing values, min/max/mean/median',
          status: 'pending',
          dependencies: [],
        },
        {
          id: 's2',
          stepNumber: 2,
          category: 'IMAGE_GENERATION',
          name: 'Render High-Resolution PNG Chart',
          agentRole: 'MediaAgent',
          description: 'Render bar/line charts using Playwright Chromium and Chart.js',
          status: 'pending',
          dependencies: ['s1'],
        },
        {
          id: 's3',
          stepNumber: 3,
          category: 'ARTIFACT_MANAGEMENT',
          name: 'Verify Dataset & Chart Artifacts',
          agentRole: 'ReviewerAgent',
          description: 'Verify chart PNG bitmap and markdown report',
          status: 'pending',
          dependencies: ['s2'],
        }
      );
    } else if (classification.intent === 'DOCUMENT_GEN' || classification.intent === 'RESEARCH_TASK') {
      detectedCategories.push('SEARCH', 'DOCUMENTS', 'ARTIFACT_MANAGEMENT');
      steps.push(
        {
          id: 's1',
          stepNumber: 1,
          category: 'SEARCH',
          name: 'Conduct Multi-Source Live Web Research',
          agentRole: 'ResearchAgent',
          description: 'Query search engine and extract source citations',
          status: 'pending',
          dependencies: [],
        },
        {
          id: 's2',
          stepNumber: 2,
          category: 'DOCUMENTS',
          name: 'Compile Multi-Page Vector PDF Publication',
          agentRole: 'DocumentAgent',
          description: 'Generate formatted markdown and print vector PDF via Chromium',
          status: 'pending',
          dependencies: ['s1'],
        },
        {
          id: 's3',
          stepNumber: 3,
          category: 'ARTIFACT_MANAGEMENT',
          name: 'Verify %PDF- Magic Header & Citations',
          agentRole: 'ReviewerAgent',
          description: 'Verify publication and register PDF artifact',
          status: 'pending',
          dependencies: ['s2'],
        }
      );
    } else if (classification.intent === 'MEDIA_GEN') {
      const isVideo = classification.mediaType === 'video';
      const cat: CapabilityCategory = isVideo ? 'VIDEO_GENERATION' : 'IMAGE_GENERATION';
      detectedCategories.push(cat, 'ARTIFACT_MANAGEMENT');
      steps.push(
        {
          id: 's1',
          stepNumber: 1,
          category: cat,
          name: isVideo ? 'Record 60fps Hardware-Accelerated Video' : 'Synthesize Photorealistic AI Image',
          agentRole: 'MediaAgent',
          description: isVideo ? 'Record cinematic physics animation into WebM/MP4' : 'Synthesize bitmap image',
          status: 'pending',
          dependencies: [],
        },
        {
          id: 's2',
          stepNumber: 2,
          category: 'ARTIFACT_MANAGEMENT',
          name: 'Verify Media Magic Header & Register Asset',
          agentRole: 'ReviewerAgent',
          description: isVideo ? 'Verify EBML/ftyp header and duration' : 'Verify PNG/JPEG magic header',
          status: 'pending',
          dependencies: ['s1'],
        }
      );
    } else {
      // General Software Engineering / Coding Loop
      detectedCategories.push('SOFTWARE_ENGINEERING', 'FILESYSTEM', 'TERMINAL', 'BROWSER', 'ARTIFACT_MANAGEMENT');
      steps.push(
        {
          id: 's1',
          stepNumber: 1,
          category: 'FILESYSTEM',
          name: 'Inspect Workspace & Analyze Requirements',
          agentRole: 'PlannerAgent',
          description: 'Examine existing files and dependencies',
          status: 'pending',
          dependencies: [],
        },
        {
          id: 's2',
          stepNumber: 2,
          category: 'SOFTWARE_ENGINEERING',
          name: 'Synthesize Code & Modify Files',
          agentRole: 'CodingAgent',
          description: 'Create and edit required application source files',
          status: 'pending',
          dependencies: ['s1'],
        },
        {
          id: 's3',
          stepNumber: 3,
          category: 'TERMINAL',
          name: 'Run Tests & Start Dev Server',
          agentRole: 'TestingAgent',
          description: 'Execute build commands and monitor stdout/stderr',
          status: 'pending',
          dependencies: ['s2'],
        },
        {
          id: 's4',
          stepNumber: 4,
          category: 'BROWSER',
          name: 'Live Browser Verification',
          agentRole: 'BrowserAgent',
          description: 'Verify application in headless Playwright browser',
          status: 'pending',
          dependencies: ['s3'],
        },
        {
          id: 's5',
          stepNumber: 5,
          category: 'ARTIFACT_MANAGEMENT',
          name: 'Verify Application Artifact',
          agentRole: 'ReviewerAgent',
          description: 'Register web app artifact and confirm working state',
          status: 'pending',
          dependencies: ['s4'],
        }
      );
    }

    return {
      id: planId,
      taskPrompt: prompt,
      capabilitiesRequired: Array.from(new Set(detectedCategories)),
      steps,
      currentStepIndex: 0,
      isMultiCapability: steps.length > 3,
      estimatedDurationSeconds: 10,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Anti-Hallucination Unknown Tool Interception (Section 40 & 62)
   * If a model generates arbitrary composite tool names like build_game, make_music,
   * generate_video, create_website, map them to real capability categories!
   */
  public static mapUnknownToolToCapabilities(toolName: string): CapabilityCategory | null {
    const t = toolName.toLowerCase();
    if (t.includes('game') || t.includes('website') || t.includes('app') || t.includes('scaffold')) {
      return 'SOFTWARE_ENGINEERING';
    }
    if (t.includes('music') || t.includes('audio') || t.includes('sound')) {
      return 'AUDIO_GENERATION';
    }
    if (t.includes('video') || t.includes('movie') || t.includes('animation')) {
      return 'VIDEO_GENERATION';
    }
    if (t.includes('image') || t.includes('photo') || t.includes('picture')) {
      return 'IMAGE_GENERATION';
    }
    if (t.includes('pdf') || t.includes('document') || t.includes('presentation')) {
      return 'DOCUMENTS';
    }
    if (t.includes('csv') || t.includes('data') || t.includes('chart')) {
      return 'DATA_PROCESSING';
    }
    if (t.includes('zip') || t.includes('archive') || t.includes('tar')) {
      return 'ARCHIVE_PROCESSING';
    }
    return null;
  }
}
