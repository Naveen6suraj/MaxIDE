/**
 * MaxIDE - Intent Classification Engine
 * Separates casual conversation, concept explanation, workbench navigation,
 * git operations, and software engineering agent execution tasks.
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
  | 'PROJECT_TASK';

export interface IntentClassification {
  intent: UserIntent;
  confidence: number;
  isConversational: boolean; // CHAT or EXPLAIN -> never modifies files or runs tools
  isExecution: boolean;      // Enters autonomous agent loop
  isBrowserTask: boolean;    // Direct URL / preview navigation
  isGitTask: boolean;        // Git operations
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
    // Must NOT contain build/edit execution imperatives like "build it for me" or "add a button"
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

    // 9. Full Application / Feature Building
    // Examples: "Build a portfolio website", "Create a React dashboard", "Create a landing page"
    if (this.isBuild(lower)) {
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

    // 10. Default: PROJECT_TASK
    // General software engineering execution in workspace
    return {
      intent: 'PROJECT_TASK',
      confidence: 0.80,
      isConversational: false,
      isExecution: true,
      isBrowserTask: false,
      isGitTask: false,
      rationale: 'General software engineering workspace execution.',
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

    const hasImperativeAction = /\b(build|create|make|fix|edit|run|code|write|scaffold|test|delete|update|open|view|git)\b/i.test(raw);
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
    // External URLs
    if (/https?:\/\/[^\s]+/i.test(raw)) {
      return true;
    }

    // Localhost with port or path
    if (/localhost:\d+/i.test(raw) || /127\.0\.0\.1:\d+/i.test(raw)) {
      return true;
    }

    // "Open website", "open the website", "open preview", "launch website"
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
    return (
      /\b(refactor|clean\s+up|restructure|modernize|reorganize)\b/i.test(lower)
    );
  }

  private static isCodeEdit(lower: string): boolean {
    return (
      /\b(edit|modify|update|change|add\s+a\s+button|change\s+the\s+color|tweak)\b/i.test(lower) &&
      /\b(\.js|\.ts|\.tsx|\.html|\.css|\.json|component|style|header|footer|button)\b/i.test(lower)
    );
  }

  private static isBuild(lower: string): boolean {
    const hasBuildVerb = /\b(build|create|make|scaffold|generate)\b/i.test(lower);
    const hasSoftwareTarget = /\b(app|application|web\s*app|website|site|dashboard|portfolio|ui|api|backend|frontend|game|component|tool|system|service|calculator|counter|todo|tracker|page)\b/i.test(lower);
    if (hasBuildVerb && hasSoftwareTarget) return true;

    return /\b(build|create|make|scaffold|generate)\s+(me\s+)?(a|an|the|new)\b/i.test(lower);
  }
}
