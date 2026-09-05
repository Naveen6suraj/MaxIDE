/**
 * MaxIDE - Universal Intent Classification Engine
 * Intelligently classifies natural language requests into creative & technical domains:
 * CHAT, EXPLAIN, APPLICATION_BUILD, CODE_EDIT, DEBUG, TEST, REFACTOR, BROWSER_TASK,
 * GIT_TASK, MEDIA_GEN, PRESENTATION_GEN, DATA_ANALYSIS, DOCUMENT_GEN, RESEARCH_TASK.
 * STRICT: No routing everything to coding agent.
 */

export type UserIntent =
  | 'CHAT'
  | 'EXPLAIN'
  | 'CODE_EDIT'
  | 'BUILD'
  | 'DEBUG'
  | 'TEST'
  | 'REFACTOR'
  | 'BROWSER_TASK'
  | 'GIT_TASK'
  | 'MEDIA_GEN'
  | 'AUDIO_GEN'
  | 'DOCUMENT_GEN'
  | 'PRESENTATION_GEN'
  | 'DATA_ANALYSIS'
  | 'RESEARCH_TASK'
  | 'ARCHIVE_TASK'
  | 'FILESYSTEM_TASK'
  | 'MULTI_CAPABILITY'
  | 'PROJECT_TASK';

export interface IntentClassification {
  intent: UserIntent;
  confidence: number;
  isConversational: boolean; // CHAT or EXPLAIN -> never modifies files or runs tools
  isExecution: boolean;      // Enters autonomous agent loop
  isBrowserTask: boolean;    // Direct URL / preview navigation
  isGitTask: boolean;        // Git operations
  isMediaGen?: boolean;      // Media synthesis (video/image)
  mediaType?: 'image' | 'video';
  mediaDetails?: {
    prompt: string;
    durationSeconds?: number;
    resolution?: string;
    style?: string;
  };
  presentationDetails?: {
    topic: string;
    slideCount: number;
    theme?: string;
  };
  documentDetails?: {
    topic: string;
    format: 'pdf' | 'docx';
    pageCount?: number;
  };
  dataDetails?: {
    targetFile?: string;
    hasCharts: boolean;
    analysisGoal: string;
  };
  researchDetails?: {
    topic: string;
    exportPdf: boolean;
  };
  audioDetails?: {
    prompt: string;
    durationSeconds?: number;
    genre?: string;
  };
  archiveDetails?: {
    action: 'inspect' | 'extract' | 'create';
    path: string;
    destination?: string;
  };
  filesystemDetails?: {
    action: 'create_folder' | 'move' | 'rename' | 'organize' | 'delete';
    path: string;
    destination?: string;
  };
  isMultiCapability?: boolean;
  capabilitiesRequired?: string[];
  extractedTarget?: string;  // e.g. URL, file path, commit message
  rationale: string;
}

export class IntentClassifier {
  /**
   * Classify user input into one of the explicit intent categories.
   */
  public static classify(prompt: string): IntentClassification {
    const trimmed = (prompt || '').trim();
    const lower = trimmed.toLowerCase();
    const cleaned = lower.replace(/[.,!?;:'"()]/g, ' ').replace(/\s+/g, ' ').trim();

    // 1. Casual Chat / Greetings
    // Examples: "hello", "hi", "hey", "good morning", "thanks", "who are you"
    if (this.isChat(cleaned, trimmed)) {
      return {
        intent: 'CHAT',
        confidence: 0.98,
        isConversational: true,
        isExecution: false,
        isBrowserTask: false,
        isGitTask: false,
        rationale: 'Casual conversation or greeting — responding naturally without modifying files.',
      };
    }

    // 2. Git Tasks
    // Examples: "git status", "git diff", "commit changes", "push to github", "git push"
    if (this.isGitTask(lower)) {
      return {
        intent: 'GIT_TASK',
        confidence: 0.95,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: true,
        rationale: 'Source control operation (Git status / diff / commit / push).',
      };
    }

    // 3. Browser & Preview Navigation Tasks
    // Examples: "open https://example.com", "open the website", "show preview", "view live app"
    if (this.isBrowserTask(lower, trimmed)) {
      const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
      return {
        intent: 'BROWSER_TASK',
        confidence: 0.95,
        isConversational: false,
        isExecution: false,
        isBrowserTask: true,
        isGitTask: false,
        extractedTarget: urlMatch ? urlMatch[0] : undefined,
        rationale: urlMatch
          ? `Opening external website: ${urlMatch[0]}`
          : 'Opening workspace live application preview.',
      };
    }

    // 4. Conceptual Explanation / Educational Inquiry (EXPLAIN)
    // Examples: "what is React?", "explain this code", "what is a promise?", "how does this function work?"
    if (this.isExplain(lower)) {
      return {
        intent: 'EXPLAIN',
        confidence: 0.92,
        isConversational: true,
        isExecution: false,
        isBrowserTask: false,
        isGitTask: false,
        rationale: 'Conceptual explanation inquiry — providing articulate AI answer without workspace mutations.',
      };
    }

    // 5. Testing & Verification
    // Examples: "run tests", "run npm test", "verify with playwright", "test the auth system"
    if (this.isTest(lower)) {
      return {
        intent: 'TEST',
        confidence: 0.90,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        rationale: 'Test execution and verification task.',
      };
    }

    // 6. Debugging & Bug Fixing
    // Examples: "fix the login bug", "why is the preview broken?", "fix the syntax error in app.js"
    if (this.isDebug(lower)) {
      return {
        intent: 'DEBUG',
        confidence: 0.90,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        rationale: 'Bug diagnosis, troubleshooting, and autonomous repair.',
      };
    }

    // 7. Refactoring
    // Examples: "refactor this component", "clean up unused imports", "rewrite in typescript"
    if (this.isRefactor(lower)) {
      return {
        intent: 'REFACTOR',
        confidence: 0.88,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        rationale: 'Codebase refactoring and architectural improvement.',
      };
    }

    // 8. Targeted Code Editing
    // Examples: "edit app.js to add a button", "update style.css with dark theme", "add header in index.html"
    if (this.isCodeEdit(lower)) {
      return {
        intent: 'CODE_EDIT',
        confidence: 0.88,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        rationale: 'Targeted file modification and code editing.',
      };
    }

    // 9. Presentation Generation (PowerPoint / PPTX / Slide Decks)
    // Examples: "Create a professional 10-slide presentation about AI agents", "Create a pitch deck", "generate pptx presentation"
    const presCheck = this.isPresentationGen(lower, trimmed);
    if (presCheck.isPresentation) {
      return {
        intent: 'PRESENTATION_GEN',
        confidence: 0.96,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        presentationDetails: {
          topic: presCheck.topic,
          slideCount: presCheck.slideCount,
          theme: presCheck.theme,
        },
        rationale: `Presentation generation task: creating real ${presCheck.slideCount}-slide PPTX presentation on "${presCheck.topic}".`,
      };
    }

    // 10. Data Analysis & Chart Generation
    // Examples: "Analyze this CSV and create a report with charts", "Analyze this dataset", "plot charts from data"
    const dataCheck = this.isDataAnalysis(lower, trimmed);
    if (dataCheck.isDataAnalysis) {
      return {
        intent: 'DATA_ANALYSIS',
        confidence: 0.96,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        dataDetails: {
          targetFile: dataCheck.targetFile,
          hasCharts: dataCheck.hasCharts,
          analysisGoal: dataCheck.goal,
        },
        rationale: `Data analysis task: analyzing dataset with statistical profiling and charts.`,
      };
    }

    // 11. Document & Publication Generation (PDF / DOCX Reports)
    // Examples: "Create a research report and export it as PDF", "Create a 15-page research publication", "export as pdf"
    const docCheck = this.isDocumentGen(lower, trimmed);
    if (docCheck.isDocGen) {
      return {
        intent: 'DOCUMENT_GEN',
        confidence: 0.96,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        documentDetails: {
          topic: docCheck.topic,
          format: docCheck.format,
          pageCount: docCheck.pageCount,
        },
        rationale: `Document generation task: creating verified publication ${docCheck.format.toUpperCase()} on "${docCheck.topic}".`,
      };
    }

    // 12. Autonomous Research & Synthesis Task
    // Examples: "Research this topic, collect sources, write a report", "research AI agents and synthesize findings"
    const researchCheck = this.isResearchTask(lower, trimmed);
    if (researchCheck.isResearch) {
      return {
        intent: 'RESEARCH_TASK',
        confidence: 0.94,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        researchDetails: {
          topic: researchCheck.topic,
          exportPdf: researchCheck.exportPdf,
        },
        rationale: `Autonomous research task: multi-source literature review on "${researchCheck.topic}".`,
      };
    }

    // 13. Multi-Capability Workflow Detection (MUST precede single-modal media)
    // Example: "Build a game website, generate suitable artwork and background music, add them to the project, run it, and test it"
    const multiCheck = this.isMultiCapability(lower, trimmed);
    if (multiCheck.isMulti) {
      return {
        intent: 'MULTI_CAPABILITY',
        confidence: 0.98,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        capabilitiesRequired: multiCheck.capabilities,
        rationale: `Multi-capability task coordinating: ${multiCheck.capabilities.join(', ')}.`,
      };
    }

    // 13.2 Media Synthesis (Images & Videos)
    // Examples: "generate a sample 4k video of 5 seconds of super car", "create an image of a neon city", "generate wallpaper"
    const mediaCheck = this.isMediaGen(lower, trimmed);
    if (mediaCheck.isMedia) {
      return {
        intent: 'MEDIA_GEN',
        confidence: 0.96,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        isMediaGen: true,
        mediaType: mediaCheck.type,
        mediaDetails: {
          prompt: mediaCheck.prompt || trimmed,
          durationSeconds: mediaCheck.durationSeconds,
          resolution: mediaCheck.resolution,
        },
        rationale: `Media synthesis task: generating AI ${mediaCheck.type || 'media'} (${mediaCheck.resolution || 'HD'}).`,
      };
    }

    // 13.4. Audio & Music Generation Detection
    // Examples: "Generate background music for my game", "Create relaxing background music", "Create audio soundtrack"
    const audioCheck = this.isAudioGen(lower, trimmed);
    if (audioCheck.isAudio) {
      return {
        intent: 'AUDIO_GEN',
        confidence: 0.96,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        audioDetails: {
          prompt: audioCheck.prompt,
          genre: audioCheck.genre,
          durationSeconds: audioCheck.durationSeconds,
        },
        rationale: `Audio generation task: synthesizing ${audioCheck.genre || 'audio'} soundtrack for "${audioCheck.prompt}".`,
      };
    }

    // 13.6. Filesystem Management Detection
    // Examples: "Create a folder called Projects", "Move these files into a folder", "Organize my downloads", "Rename this file"
    const fsCheck = this.isFilesystemTask(lower, trimmed);
    if (fsCheck.isFilesystem) {
      return {
        intent: 'FILESYSTEM_TASK',
        confidence: 0.95,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        filesystemDetails: {
          action: fsCheck.action,
          path: fsCheck.path,
          destination: fsCheck.destination,
        },
        rationale: `Filesystem management task: ${fsCheck.action} on "${fsCheck.path}".`,
      };
    }

    // 13.8. Archive Processing Detection
    // Examples: "Open this ZIP and analyze the project", "Extract archive", "Package project to zip"
    const arcCheck = this.isArchiveTask(lower, trimmed);
    if (arcCheck.isArchive) {
      return {
        intent: 'ARCHIVE_TASK',
        confidence: 0.95,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        archiveDetails: {
          action: arcCheck.action,
          path: arcCheck.path,
          destination: arcCheck.destination,
        },
        rationale: `Archive processing task: ${arcCheck.action} on "${arcCheck.path}".`,
      };
    }

    // 14. Full Application / Feature Building
    // Examples: "Build a portfolio website", "Create a React dashboard", "Create a modern landing page for an AI startup"
    if (this.isBuild(lower, trimmed)) {
      return {
        intent: 'BUILD',
        confidence: 0.95,
        isConversational: false,
        isExecution: true,
        isBrowserTask: false,
        isGitTask: false,
        rationale: 'Full autonomous software build & scaffold workflow.',
      };
    }

    // 15. Default: PROJECT_TASK
    return {
      intent: 'PROJECT_TASK',
      confidence: 0.80,
      isConversational: false,
      isExecution: true,
      isBrowserTask: false,
      isGitTask: false,
      rationale: 'General workspace execution.',
    };
  }

  private static isChat(cleaned: string, raw: string): boolean {
    const singleWordGreetings = [
      'hi', 'hello', 'hey', 'yo', 'howdy', 'hola', 'greetings',
      'thanks', 'thank you', 'thx', 'bye', 'goodbye'
    ];
    if (singleWordGreetings.includes(cleaned)) return true;

    const chatPatterns = [
      /^hello\b/i,
      /^hi\b/i,
      /^hey\b/i,
      /^good\s+(morning|afternoon|evening|day)\b/i,
      /^who\s+(are\s+you|created\s+you|made\s+you)\b/i,
      /^what\s+can\s+you\s+do\b/i,
      /^how\s+are\s+you\b/i,
      /^nice\s+to\s+meet\s+you\b/i,
      /^help\b$/i,
    ];

    const hasImperativeAction = /\b(build|create|make|fix|edit|run|code|write|scaffold|test|delete|update|open|view|git|generate|analyze|research)\b/i.test(raw);
    if (hasImperativeAction) return false;

    return chatPatterns.some((pattern) => pattern.test(cleaned));
  }

  private static isExplain(lower: string): boolean {
    const hasExecutionAction = /\b(build\s+it\s+for\s+me|create\s+it\s+for\s+me|write\s+code\s+for\s+me|implement\s+in\s+my\s+workspace|make\s+the\s+files|add\s+to\s+my\s+project)\b/i.test(lower);
    if (hasExecutionAction) return false;

    const explainPatterns = [
      /^(can\s+you\s+)?explain\b/i,
      /^what\s+is\b/i,
      /^what\s+are\b/i,
      /^how\s+does\b/i,
      /^how\s+do\b/i,
      /^why\s+does\b/i,
      /^why\s+is\b/i,
      /^tell\s+me\s+about\b/i,
      /^describe\b/i,
      /^compare\b/i,
      /^what\s+does\s+.*\s+mean\b/i,
      /\bhow\s+does\s+this\s+(code|function|class|file|hook|promise)\s+work\b/i,
      /\bexplain\s+how\s+.*works?\b/i,
    ];

    return explainPatterns.some((p) => p.test(lower));
  }

  private static isBrowserTask(lower: string, raw: string): boolean {
    if (/https?:\/\/[^\s]+/i.test(raw)) return true;
    if (/localhost:\d+/i.test(raw) || /127\.0\.0\.1:\d+/i.test(raw)) return true;

    const openWebsitePattern = /\b(open|view|show|launch|preview)\s+(the\s+)?(website|site|web\s+app|preview|live\s+app|browser\s+preview)\b/i;
    if (openWebsitePattern.test(lower) && !/\b(build|create|make|code)\b/i.test(lower)) {
      return true;
    }

    return false;
  }

  private static isGitTask(lower: string): boolean {
    return (
      lower.startsWith('git ') ||
      /\bgit\s+(status|diff|commit|push|pull|log|branch|checkout|add)\b/i.test(lower) ||
      /\b(commit\s+(the\s+)?changes?|push\s+(to\s+)?(github|remote|origin|repo))\b/i.test(lower)
    );
  }

  private static isTest(lower: string): boolean {
    return (
      /\b(run\s+tests?|npm\s+test|run\s+the\s+tests?|test\s+runner|test\s+suite|playwright\s+test|verify\s+in\s+browser)\b/i.test(lower)
    );
  }

  private static isDebug(lower: string): boolean {
    return (
      /\b(fix|debug|resolve|repair|patch)\s+(the\s+)?(bug|error|issue|problem|failure|crash)\b/i.test(lower) ||
      /\bwhy\s+is\s+(this|the\s+app|the\s+preview|it)\s+(broken|failing|crashing|not\s+working)\b/i.test(lower) ||
      /\bfix\s+the\s+login\s+bug\b/i.test(lower)
    );
  }

  private static isRefactor(lower: string): boolean {
    return /\b(refactor|clean\s+up|restructure|modernize|reorganize)\b/i.test(lower);
  }

  private static isCodeEdit(lower: string): boolean {
    return (
      /\b(edit|modify|update|change|add\s+a\s+button|change\s+the\s+color|tweak)\b/i.test(lower) &&
      /\b(\.js|\.ts|\.tsx|\.html|\.css|\.json|component|style|header|footer|button)\b/i.test(lower)
    );
  }

  private static isPresentationGen(lower: string, raw: string): {
    isPresentation: boolean;
    topic: string;
    slideCount: number;
    theme?: string;
  } {
    const presKeywords = /\b(presentation|powerpoint|slide\s*deck|slides|pitch\s*deck|keynote|pptx)\b/i;
    if (!presKeywords.test(lower)) return { isPresentation: false, topic: '', slideCount: 0 };

    let slideCount = 10;
    const slideMatch = lower.match(/(\d+)\s*[- ]*(?:slide|slides|page|pages)\b/i);
    if (slideMatch) {
      slideCount = Math.max(3, Math.min(30, parseInt(slideMatch[1], 10)));
    }

    let topic = raw
      .replace(/\b(create|generate|make|build|design|produce)\s+(me\s+)?(a\s+|an\s+|professional\s+|clean\s+)*(\d+\s*[- ]*slides?|presentation|powerpoint|slide\s*deck|pitch\s*deck|pptx)\s*(about|on|for)?/i, '')
      .replace(/^(about|on|for)\s+/i, '')
      .trim();
    if (!topic || topic.length < 2) topic = 'AI Agents and Autonomous Systems';

    let theme = 'modern_clean';
    if (lower.includes('dark') || lower.includes('cyber')) theme = 'dark_cyber';
    if (lower.includes('corporate') || lower.includes('navy')) theme = 'corporate_navy';
    if (lower.includes('minimal') || lower.includes('emerald')) theme = 'emerald_minimal';

    return {
      isPresentation: true,
      topic,
      slideCount,
      theme,
    };
  }

  private static isDataAnalysis(lower: string, raw: string): {
    isDataAnalysis: boolean;
    targetFile?: string;
    hasCharts: boolean;
    goal: string;
  } {
    const dataKeywords = /\b(csv|dataset|dataframe|data\s+analysis|analyze\s+(this\s+)?(data|dataset|csv|metrics)|create\s+charts?\b|plot\s+charts?\b|statistical\s+report)\b/i;
    if (!dataKeywords.test(lower)) return { isDataAnalysis: false, hasCharts: false, goal: '' };

    const fileMatch = raw.match(/([a-zA-Z0-9_\-./\\]+\.csv)/i);
    const hasCharts = /\b(charts?|visualizations?|graphs?|plots?)\b/i.test(lower);

    return {
      isDataAnalysis: true,
      targetFile: fileMatch ? fileMatch[1] : undefined,
      hasCharts,
      goal: raw,
    };
  }

  private static isDocumentGen(lower: string, raw: string): {
    isDocGen: boolean;
    topic: string;
    format: 'pdf' | 'docx';
    pageCount?: number;
  } {
    const docKeywords = /\b(pdf|docx|document|publication|whitepaper|resume|report\s+and\s+export\s+(it\s+)?as\s+pdf|export\s+(it\s+)?as\s+pdf|generate\s+pdf)\b/i;
    if (!docKeywords.test(lower)) return { isDocGen: false, topic: '', format: 'pdf' };

    const isDocx = lower.includes('docx') || lower.includes('word document');
    const format = isDocx ? 'docx' : 'pdf';

    let pageCount = 5;
    const pageMatch = lower.match(/(\d+)\s*[- ]*(?:pages?|page)\b/i);
    if (pageMatch) {
      pageCount = parseInt(pageMatch[1], 10);
    }

    let topic = raw
      .replace(/\b(create|generate|make|write|build)\s+(me\s+)?(a\s+|an\s+|professional\s+|technical\s+)*(\d+\s*[- ]*pages?\s+)?(research\s+report|report|document|publication|whitepaper|resume)\s*(about|on|for)?/i, '')
      .replace(/\s*(and\s+)?export\s+(it\s+)?as\s+(pdf|docx)\b/i, '')
      .replace(/^(about|on|for)\s+/i, '')
      .trim();
    if (!topic) topic = 'Autonomous AI Agents and Architecture';

    return {
      isDocGen: true,
      topic,
      format,
      pageCount,
    };
  }

  private static isResearchTask(lower: string, raw: string): {
    isResearch: boolean;
    topic: string;
    exportPdf: boolean;
  } {
    const researchKeywords = /\b(research\s+this\s+topic|collect\s+sources|deep\s+research|literature\s+review|investigate\s+and\s+write\s+report)\b/i;
    if (!researchKeywords.test(lower)) return { isResearch: false, topic: '', exportPdf: false };

    const exportPdf = lower.includes('pdf') || lower.includes('export');
    let topic = raw
      .replace(/\b(research\s+this\s+topic|research|collect\s+sources|write\s+a\s+report)\s*(about|on|for)?/i, '')
      .replace(/^(about|on|for)\s+/i, '')
      .trim();
    if (!topic) topic = 'Emerging AI Agent Technologies';

    return {
      isResearch: true,
      topic,
      exportPdf,
    };
  }

  private static isMediaGen(lower: string, raw: string): {
    isMedia: boolean;
    type?: 'image' | 'video';
    prompt?: string;
    durationSeconds?: number;
    resolution?: string;
  } {
    // 1. Video patterns (e.g. "generate a sample 4k video of 5 seconds of super car", "create video of ocean waves")
    const videoPattern = /\b(video|clip|mp4|webm|animation|teaser|footage)\b/i;
    const isVideoRequest = videoPattern.test(lower) && /\b(generate|make|create|render|produce|record|animate)\b/i.test(lower);
    const isVideoSubject = /^(video|clip|animation|footage)\s+of\b/i.test(lower);

    if (isVideoRequest || isVideoSubject) {
      let durationSeconds = 5;
      const durMatch = lower.match(/(\d+)\s*(?:seconds?|secs?|s\b)/);
      if (durMatch) {
        durationSeconds = Math.max(1, Math.min(60, parseInt(durMatch[1], 10)));
      }

      let resolution = '1080p';
      if (lower.includes('4k') || lower.includes('uhd')) resolution = '4k';
      else if (lower.includes('720p') || lower.includes('hd')) resolution = '720p';

      let mediaPrompt = raw
        .replace(/\b(generate|make|create|render|produce)\s+(me\s+)?(a\s+|an\s+|sample\s+|4k\s+|hd\s+|short\s+|cinematic\s+)*(video|clip|animation|mp4|webm|footage)\s*(of\s+)?/i, '')
        .replace(/\b(of\s+)?(\d+)\s*(seconds?|secs?|s\b)(\s+of)?/i, '')
        .trim();
      if (!mediaPrompt) mediaPrompt = raw;

      return {
        isMedia: true,
        type: 'video',
        prompt: mediaPrompt,
        durationSeconds,
        resolution,
      };
    }

    // 2. Image patterns (e.g. "generate an image of a cybernetic cat", "create wallpaper of mountains")
    const imagePattern = /\b(image|photo|picture|wallpaper|illustration|artwork|poster|icon|logo|banner|thumbnail|drawing|painting)\b/i;
    const isImageRequest = imagePattern.test(lower) && /\b(generate|make|create|render|draw|paint|produce|design)\b/i.test(lower);
    const isImageSubject = /^(image|photo|picture|wallpaper|illustration)\s+of\b/i.test(lower);

    if (isImageRequest || isImageSubject) {
      let resolution = '1024x1024';
      if (lower.includes('4k') || lower.includes('wallpaper') || lower.includes('banner')) resolution = '1920x1080';

      let mediaPrompt = raw
        .replace(/\b(generate|make|create|render|draw|paint|produce|design)\s+(me\s+)?(a\s+|an\s+|sample\s+|4k\s+|hd\s+|realistic\s+|cinematic\s+)*(image|photo|picture|wallpaper|illustration|artwork|poster|icon|logo|banner|thumbnail|drawing|painting)\s*(of\s+)?/i, '')
        .trim();
      if (!mediaPrompt) mediaPrompt = raw;

      return {
        isMedia: true,
        type: 'image',
        prompt: mediaPrompt,
        resolution,
      };
    }

    return { isMedia: false };
  }

  private static isBuild(lower: string, raw: string = ''): boolean {
    if (this.isMediaGen(lower, raw).isMedia) return false;
    if (this.isPresentationGen(lower, raw).isPresentation) return false;
    if (this.isDataAnalysis(lower, raw).isDataAnalysis) return false;
    if (this.isDocumentGen(lower, raw).isDocGen) return false;
    if (this.isResearchTask(lower, raw).isResearch) return false;

    const hasBuildVerb = /\b(build|create|make|scaffold|generate)\b/i.test(lower);
    const hasSoftwareTarget = /\b(app|application|web\s*app|website|site|dashboard|portfolio|ui|api|backend|frontend|game|component|tool|system|service|calculator|counter|todo|tracker|page|landing\s+page)\b/i.test(lower);
    if (hasBuildVerb && hasSoftwareTarget) return true;

    return /\b(build|create|make|scaffold|generate)\s+(me\s+)?(a|an|the|new)\b/i.test(lower);
  }
  private static isMultiCapability(lower: string, raw: string): { isMulti: boolean; capabilities: string[] } {
    const hasCode = /\b(build|create|code)\b.*\b(game|website|app|application|dashboard|portal)\b/i.test(lower);
    const hasMedia = /\b(artwork|art|image|images|picture|music|audio|soundtrack|sound|video)\b/i.test(lower);

    if (hasCode && hasMedia) {
      const caps: string[] = ['SOFTWARE_ENGINEERING', 'FILESYSTEM', 'TERMINAL', 'BROWSER', 'VERIFICATION'];
      if (/\b(image|artwork|art|illustration|picture)\b/i.test(lower)) caps.push('IMAGE_GENERATION');
      if (/\b(music|audio|soundtrack|sound|tune)\b/i.test(lower)) caps.push('AUDIO_GENERATION');
      if (/\b(video|animation|clip)\b/i.test(lower)) caps.push('VIDEO_GENERATION');
      return { isMulti: true, capabilities: caps };
    }
    return { isMulti: false, capabilities: [] };
  }

  private static isAudioGen(lower: string, raw: string): { isAudio: boolean; prompt: string; genre: string; durationSeconds: number } {
    const audioKeywords = [
      'music', 'audio', 'soundtrack', 'sound track', 'song', 'tune', 'melody',
      'sound effect', 'sound effects', 'background music', 'game audio', 'game music',
    ];
    const verbs = ['generate', 'create', 'compose', 'make', 'synthesize', 'produce'];

    const hasVerb = verbs.some(v => new RegExp(`\\b${v}\\b`, 'i').test(lower));
    const hasAudio = audioKeywords.some(k => lower.includes(k));

    if (hasAudio && (hasVerb || lower.startsWith('music') || lower.startsWith('audio'))) {
      let genre = 'relaxing';
      if (/\b(game|arcade|retro|8-bit|chiptune)\b/i.test(lower)) genre = 'game';
      else if (/\b(cyber|cyberpunk|synth|futuristic|electronic)\b/i.test(lower)) genre = 'cyberpunk';
      else if (/\b(epic|cinematic|orchestral)\b/i.test(lower)) genre = 'cinematic';
      else if (/\b(ambient|calm|meditation|chill)\b/i.test(lower)) genre = 'ambient';

      let dur = 10;
      const secMatch = lower.match(/(\d+)\s*(?:second|sec|s\b)/i);
      if (secMatch) dur = Math.max(3, Math.min(60, parseInt(secMatch[1], 10)));

      return { isAudio: true, prompt: raw, genre, durationSeconds: dur };
    }
    return { isAudio: false, prompt: '', genre: 'relaxing', durationSeconds: 10 };
  }

  private static isFilesystemTask(lower: string, raw: string): { isFilesystem: boolean; action: any; path: string; destination?: string } {
    // 1. Create folder
    const folderMatch = raw.match(/create\s+(?:a\s+)?folder(?:\s+called)?\s+["']?([^"'\n]+)["']?/i);
    if (folderMatch) {
      return { isFilesystem: true, action: 'create_folder', path: folderMatch[1].trim() };
    }

    // 2. Move file(s)
    const moveMatch = raw.match(/move\s+["']?([^"']+)["']?\s+(?:in|into|to)\s+["']?([^"']+)["']?/i);
    if (moveMatch) {
      return { isFilesystem: true, action: 'move', path: moveMatch[1].trim(), destination: moveMatch[2].trim() };
    }

    // 3. Rename file
    const renameMatch = raw.match(/rename\s+["']?([^"']+)["']?\s+to\s+["']?([^"']+)["']?/i);
    if (renameMatch) {
      return { isFilesystem: true, action: 'rename', path: renameMatch[1].trim(), destination: renameMatch[2].trim() };
    }

    // 4. Organize files/downloads
    if (/\b(organize|sort)\b.*\b(files|folder|directory|downloads)\b/i.test(lower)) {
      let targetDir = '.';
      const dirMatch = raw.match(/organize\s+(?:my\s+)?([a-zA-Z0-9_-]+)/i);
      if (dirMatch && !['files', 'my'].includes(dirMatch[1].toLowerCase())) {
        targetDir = dirMatch[1].trim();
      }
      return { isFilesystem: true, action: 'organize', path: targetDir };
    }

    // 5. Delete file
    const deleteMatch = raw.match(/delete\s+(?:the\s+)?file\s+["']?([^"']+)["']?/i);
    if (deleteMatch) {
      return { isFilesystem: true, action: 'delete', path: deleteMatch[1].trim() };
    }

    return { isFilesystem: false, action: 'create_folder', path: '' };
  }

  private static isArchiveTask(lower: string, raw: string): { isArchive: boolean; action: any; path: string; destination?: string } {
    if (/\b(inspect|view|list|show)\b.*\b(zip|archive)\b/i.test(lower) || /\b(zip|archive)\b.*\b(contents|files)\b/i.test(lower)) {
      const zipMatch = raw.match(/["']?([^"'\s]+\.zip)["']?/i);
      return { isArchive: true, action: 'inspect', path: zipMatch ? zipMatch[1] : 'archive.zip' };
    }
    if (/\b(extract|unzip|open)\b.*\b(zip|archive)\b/i.test(lower)) {
      const zipMatch = raw.match(/["']?([^"'\s]+\.zip)["']?/i);
      return { isArchive: true, action: 'extract', path: zipMatch ? zipMatch[1] : 'archive.zip' };
    }
    if (/\b(create|package|compress|bundle)\b.*\b(zip|archive)\b/i.test(lower)) {
      return { isArchive: true, action: 'create', path: 'dist.zip' };
    }
    return { isArchive: false, action: 'inspect', path: '' };
  }
}
