import path from 'path';
import { PathManager } from '../config/PathManager.js';
import { AtomicStorage } from '../storage/AtomicStorage.js';
/**
 * MaxIDE - Clarification-First Agent Gate
 * Classifies user intent, engages beginners with plain-language questions,
 * and prevents premature or hallucinated file modifications.
 */

export type UserIntentType =
  | 'CLEAR_EXECUTABLE'
  | 'PARTIALLY_CLEAR'
  | 'AMBIGUOUS'
  | 'INFORMATIONAL'
  | 'BEGINNER_HELP'
  | 'DANGEROUS';

export interface ClarificationQuestion {
  id: string;
  question: string;
  options: string[];
  recommendedOption?: string;
}

export interface ClarificationResult {
  intent: UserIntentType;
  requiresClarification: boolean;
  questions?: ClarificationQuestion[];
  clarifiedPrompt?: string;
  informationalResponse?: string;
  assumptionsMade?: string[];
}

export class ClarificationGate {
  private static activeSessions: Map<string, {
    originalPrompt: string;
    questions: ClarificationQuestion[];
    answers: Record<string, string>;
    timestamp?: string;
  }> = new Map();
  private static isLoaded = false;

  private static getStorageFile(): string {
    return path.join(PathManager.getInstance().userDataDir, 'clarifications.json');
  }

  private static loadSessions(): void {
    if (this.isLoaded) return;
    try {
      const data = AtomicStorage.safeReadJsonSync<Record<string, any>>(this.getStorageFile(), {});
      for (const [k, v] of Object.entries(data)) {
        if (v && v.originalPrompt && Array.isArray(v.questions)) {
          this.activeSessions.set(k, v);
        }
      }
      this.isLoaded = true;
    } catch {}
  }

  private static saveSessions(): void {
    try {
      const obj: Record<string, any> = {};
      for (const [k, v] of this.activeSessions.entries()) {
        obj[k] = v;
      }
      AtomicStorage.atomicWriteJsonSync(this.getStorageFile(), obj);
    } catch {}
  }

  public static getPendingSession(sessionId: string = 'default') {
    this.loadSessions();
    return this.activeSessions.get(sessionId);
  }

  public static hasPendingSession(sessionId: string = 'default'): boolean {
    this.loadSessions();
    return this.activeSessions.has(sessionId);
  }

  /**
   * Evaluate a prompt and determine whether it can be executed immediately
   * or requires clarification.
   */
  public static evaluatePrompt(prompt: string, sessionId: string = 'default'): ClarificationResult {
    this.loadSessions();
    const trimmed = prompt.trim();
    const lower = trimmed.toLowerCase();

    // Check if there is an active pending clarification session for this conversation
    const activeSession = this.activeSessions.get(sessionId);
    const isExplicitNewTask = this.isAmbiguous(lower) || this.isBeginnerHelp(lower) || /^(build|create|make|scaffold)\s+(me\s+)?(a|an|the|new)\b/i.test(lower);
    if (activeSession && !isExplicitNewTask) {
      return this.handleClarificationAnswer(trimmed, activeSession, sessionId);
    }

    // 0. DANGEROUS REQUESTS ("delete everything", "rm -rf", "format c:")
    if (this.isDangerous(lower)) {
      return {
        intent: 'DANGEROUS',
        requiresClarification: true,
        questions: [
          {
            id: 'danger_confirmation',
            question: 'This operation involves deleting files or potentially destructive changes. Are you sure you want to proceed?',
            options: [
              'No, cancel this operation',
              'Yes, I understand and want to proceed',
            ],
            recommendedOption: 'No, cancel this operation',
          },
        ],
      };
    }

    // 1. INFORMATIONAL REQUESTS ("How do I...", "How does...", "What is...", "Explain...")
    if (this.isInformational(lower)) {
      return {
        intent: 'INFORMATIONAL',
        requiresClarification: false,
        informationalResponse: this.generateInformationalResponse(trimmed),
      };
    }

    // 2. BEGINNER ASKING FOR HELP ("I don't know how to make this...", "Can you build it for me?")
    if (this.isBeginnerHelp(lower)) {
      const questions = this.generateQuestionsForBeginner(lower);
      this.activeSessions.set(sessionId, {
        timestamp: new Date().toISOString(),
        originalPrompt: trimmed,
        questions,
        answers: {},
      });
      this.saveSessions();
      return {
        intent: 'BEGINNER_HELP',
        requiresClarification: true,
        questions,
      };
    }

    // 3. CLEAR EXECUTABLE REQUESTS (Explicit file, command, or complete specification)
    if (this.isClearExecutable(lower, trimmed)) {
      return {
        intent: 'CLEAR_EXECUTABLE',
        requiresClarification: false,
        clarifiedPrompt: trimmed,
      };
    }

    // 4. AMBIGUOUS REQUESTS ("Build an app", "Build an AI app", "Make my website better")
    if (this.isAmbiguous(lower)) {
      const questions = this.generateQuestionsForAmbiguous(lower);
      this.activeSessions.set(sessionId, {
        timestamp: new Date().toISOString(),
        originalPrompt: trimmed,
        questions,
        answers: {},
      });
      this.saveSessions();
      return {
        intent: 'AMBIGUOUS',
        requiresClarification: true,
        questions,
      };
    }

    // 5. PARTIALLY CLEAR REQUESTS ("Build me a messenger", "Create a website for my business")
    if (this.isPartiallyClear(lower)) {
      const questions = this.generateQuestionsForPartiallyClear(lower);
      this.activeSessions.set(sessionId, {
        timestamp: new Date().toISOString(),
        originalPrompt: trimmed,
        questions,
        answers: {},
      });
      this.saveSessions();
      return {
        intent: 'PARTIALLY_CLEAR',
        requiresClarification: true,
        questions,
      };
    }

    // Default: treat as clear executable with sensible defaults
    return {
      intent: 'CLEAR_EXECUTABLE',
      requiresClarification: false,
      clarifiedPrompt: trimmed,
    };
  }

  private static isDangerous(lower: string): boolean {
    const compact = lower.replace(/[.,!?;]/g, '').trim();
    return (
      compact.includes('delete everything') ||
      compact.includes('delete all files') ||
      compact.includes('remove all files') ||
      compact.includes('wipe workspace') ||
      compact.includes('rm -rf') ||
      compact.includes('format c:') ||
      compact.includes('drop database')
    );
  }

  private static isInformational(lower: string): boolean {
    if (lower.includes('build it for me') || lower.includes('create it for me') || lower.includes('write code for me')) {
      return false;
    }
    return (
      lower.startsWith('how to ') ||
      lower.startsWith('how do i ') ||
      lower.startsWith('how does ') ||
      lower.startsWith('what is ') ||
      lower.startsWith('what are ') ||
      lower.startsWith('explain ') ||
      lower.startsWith('can you explain ') ||
      lower.startsWith('tell me about ') ||
      lower.startsWith('why does ') ||
      lower.startsWith('why is ')
    );
  }

  private static isBeginnerHelp(lower: string): boolean {
    return (
      lower.includes("i don't know how") ||
      lower.includes("i do not know how") ||
      lower.includes("help me build") ||
      lower.includes("i'm a beginner") ||
      lower.includes("i am a beginner") ||
      lower.includes("new to coding") ||
      lower.includes("can you guide me") ||
      lower.includes("can you build it for me") ||
      lower.includes("build this for me")
    );
  }

  private static generateQuestionsForBeginner(lower: string): ClarificationQuestion[] {
    if (lower.includes('website') || lower.includes('web page') || lower.includes('site')) {
      return [
        {
          id: 'beginner_website_type',
          question: 'I would be happy to build your website for you! What kind of website do you need?',
          options: [
            'A modern personal portfolio to showcase projects and skills',
            'A clean business landing page with services and contact details',
            'A creative blog or news layout',
            'Not sure — build a clean portfolio starter for me',
          ],
          recommendedOption: 'A modern personal portfolio to showcase projects and skills',
        },
      ];
    }
    return [
      {
        id: 'beginner_project_goal',
        question: 'I would love to help you build it! What would you like us to create today?',
        options: [
          'A modern personal website or portfolio',
          'A working messenger / chat application',
          'A todo / task manager app',
          'Not sure — recommend a beginner-friendly project for me',
        ],
        recommendedOption: 'A working messenger / chat application',
      },
    ];
  }

  private static isClearExecutable(lower: string, raw: string): boolean {
    // Mentions explicit file name to create/edit (e.g. "hello.js", "app.py", "index.html")
    if (/\b[a-zA-Z0-9_\-]+\.(?:js|ts|py|html|css|json|txt|md)\b/i.test(raw)) {
      return true;
    }

    // Explicit specific instruction like "make this button blue", "fix the red error"
    if (lower.startsWith('fix ') || lower.startsWith('change ') || lower.startsWith('make this ') || lower.startsWith('run ')) {
      return true;
    }

    // Detailed specification with technical scope (e.g. "full-stack messenger with authentication and real-time messaging")
    if (lower.includes('full-stack') && (lower.includes('auth') || lower.includes('real-time') || lower.includes('database'))) {
      return true;
    }

    // Specific design or domain targets (landing page, dashboard, portfolio, ecommerce, showcase)
    if (/\b(landing\s+page|dashboard|portfolio|ecommerce|e-commerce|store|showcase|presentation|report|resume|publication)\b/i.test(lower)) {
      return true;
    }

    return false;
  }

  private static isAmbiguous(lower: string): boolean {
    const compact = lower.replace(/[.,!?;]/g, '').trim();

    // Any prompt asking to build or play a game without an explicit filename
    if (/\b(game|play|arcade|canvas)\b/i.test(lower)) {
      return true;
    }

    // General app, web app, or website requests without explicit specification
    if (/\b(build|create|make|develop)\s+(?:me\s+)?(?:an?\s+)?(?:app|application|web\s+app|website|site|project|something)\b/i.test(lower)) {
      return true;
    }

    return (
      compact === 'build an app' ||
      compact === 'create an app' ||
      compact === 'make an app' ||
      compact === 'build a web app' ||
      compact === 'build an ai app' ||
      compact === 'create an ai app' ||
      compact === 'make my website better' ||
      compact === 'build something' ||
      compact === 'create an online store'
    );
  }

  private static isPartiallyClear(lower: string): boolean {
    return (
      (lower.includes('messenger') || lower.includes('chat app')) && !lower.includes('full-stack') ||
      lower.includes('website for my business') ||
      lower.includes('landing page') ||
      lower.includes('todo app') ||
      lower.includes('dashboard') ||
      lower.includes('portfolio')
    );
  }

  private static generateQuestionsForAmbiguous(lower: string): ClarificationQuestion[] {
    // Game requests (e.g. "I am asking for a website to build to play a game", "Build a game")
    if (lower.includes('game') || lower.includes('play')) {
      return [
        {
          id: 'game_type',
          question: 'What kind of game would you like to build?',
          options: [
            'Classic Arcade Snake with live canvas and score tracking',
            'Interactive Tic-Tac-Toe with win detection',
            'Memory Card Matching Game',
            'Brick Breakout / Arcade Paddle Game',
            'Not sure — choose for me',
          ],
          recommendedOption: 'Classic Arcade Snake with live canvas and score tracking',
        },
        {
          id: 'game_platform',
          question: 'Where would you like the game to run?',
          options: [
            'Web browser with responsive keyboard controls',
            'Embedded visual canvas',
            'Not sure — choose for me',
          ],
          recommendedOption: 'Web browser with responsive keyboard controls',
        },
      ];
    }

    if (lower.includes('ai app')) {
      return [
        {
          id: 'ai_app_type',
          question: 'What should the AI app do?',
          options: [
            'Chatbot that answers questions',
            'Text or code generator',
            'Image analysis or creative assistant',
            'Not sure — recommend a simple starter',
          ],
          recommendedOption: 'Chatbot that answers questions',
        },
        {
          id: 'ai_app_platform',
          question: 'Where should it run?',
          options: [
            'Web browser on this computer',
            'Terminal / Command line',
            'Not sure — choose for me',
          ],
          recommendedOption: 'Web browser on this computer',
        },
      ];
    }

    if (lower.includes('store') || lower.includes('ecommerce')) {
      return [
        {
          id: 'store_scope',
          question: 'What type of store would you like?',
          options: [
            'A clean product catalog demo with shopping cart',
            'A full store ready for real payments later',
            'Not sure — choose for me',
          ],
          recommendedOption: 'A clean product catalog demo with shopping cart',
        },
      ];
    }

    return [
      {
        id: 'app_type',
        question: 'What kind of application would you like to build?',
        options: [
          'A modern website or landing page',
          'A web application with interactive features',
          'A simple messenger or chat demo',
          'An interactive arcade game',
          'Not sure — recommend a popular project',
        ],
        recommendedOption: 'A web application with interactive features',
      },
      {
        id: 'app_platform',
        question: 'Where would you like it to run?',
        options: [
          'Web browser',
          'Desktop window',
          'Not sure — choose for me',
        ],
        recommendedOption: 'Web browser',
      },
    ];
  }

  private static generateQuestionsForPartiallyClear(lower: string): ClarificationQuestion[] {
    if (lower.includes('messenger') || lower.includes('chat')) {
      return [
        {
          id: 'messenger_type',
          question: 'What type of messenger would you like?',
          options: [
            'A simple design / visual demo',
            'A working local messenger on this computer',
            'A real-time messenger for multiple users',
            'Not sure — choose for me',
          ],
          recommendedOption: 'A working local messenger on this computer',
        },
        {
          id: 'messenger_auth',
          question: 'Do users need to log in with an account?',
          options: [
            'No, start right away without accounts',
            'Yes, with usernames and passwords',
            'Not sure — choose for me',
          ],
          recommendedOption: 'No, start right away without accounts',
        },
      ];
    }

    if (lower.includes('business') || lower.includes('website')) {
      return [
        {
          id: 'business_type',
          question: 'What type of business or service is this website for?',
          options: [
            'Professional services / consulting',
            'Restaurant, cafe, or local store',
            'Technology or software product',
            'Portfolio / creative work',
          ],
          recommendedOption: 'Professional services / consulting',
        },
        {
          id: 'website_style',
          question: 'What visual style do you prefer?',
          options: [
            'Modern and professional',
            'Minimal and clean',
            'Vibrant and colorful',
            'Not sure — choose for me',
          ],
          recommendedOption: 'Modern and professional',
        },
      ];
    }

    return [
      {
        id: 'generic_clarity',
        question: 'How should we set this up for you?',
        options: [
          'A clean browser-based web application',
          'A lightweight standalone application',
          'Not sure — use recommended defaults',
        ],
        recommendedOption: 'A clean browser-based web application',
      },
    ];
  }

  private static handleClarificationAnswer(
    answer: string,
    session: { originalPrompt: string; questions: ClarificationQuestion[]; answers: Record<string, string> },
    sessionId: string
  ): ClarificationResult {
    // Find first unanswered question
    const unanswered = session.questions.find(q => !session.answers[q.id]);
    if (!unanswered) {
      this.activeSessions.delete(sessionId);
      this.saveSessions();
      return {
        intent: 'CLEAR_EXECUTABLE',
        requiresClarification: false,
        clarifiedPrompt: session.originalPrompt,
      };
    }

    // Resolve answer (handles numbers like "1", "2", or plain text, or "choose for me")
    const isChooseForMe = answer.toLowerCase().includes('choose for me') || answer.toLowerCase().includes('not sure') || answer.toLowerCase().includes('default');

    if (isChooseForMe) {
      // Automatically resolve all remaining questions with recommended options
      for (const q of session.questions) {
        if (!session.answers[q.id]) {
          session.answers[q.id] = q.recommendedOption || q.options[0];
        }
      }
    } else {
      let selectedAnswer = answer;
      const num = parseInt(answer.trim(), 10);
      if (!isNaN(num) && num >= 1 && num <= unanswered.options.length) {
        selectedAnswer = unanswered.options[num - 1];
      }
      session.answers[unanswered.id] = selectedAnswer;

      // If user selected primary game/app specification, automatically apply recommended platform
      for (const q of session.questions) {
        if (!session.answers[q.id] && (q.id === 'game_platform' || q.id === 'app_platform' || q.id === 'ai_app_platform')) {
          session.answers[q.id] = q.recommendedOption || q.options[0];
        }
      }
    }

    // Check if more questions remain
    const remaining = session.questions.find(q => !session.answers[q.id]);
    if (remaining) {
      return {
        intent: 'PARTIALLY_CLEAR',
        requiresClarification: true,
        questions: [remaining],
      };
    }

    // All questions answered! Construct clear executable brief
    this.activeSessions.delete(sessionId);
      this.saveSessions();

    const assumptions: string[] = [];
    for (const [qId, ans] of Object.entries(session.answers)) {
      assumptions.push(`${qId}: ${ans}`);
    }

    let clarifiedDescription = `${session.originalPrompt}. Specifications agreed: ${assumptions.join('; ')}. Create the required files, run it, and verify it in the browser.`;

    return {
      intent: 'CLEAR_EXECUTABLE',
      requiresClarification: false,
      clarifiedPrompt: clarifiedDescription,
      assumptionsMade: assumptions,
    };
  }

  private static generateInformationalResponse(prompt: string): string {
    const lower = prompt.toLowerCase();
    if (lower.includes('state') || lower.includes('react')) {
      return `### How React State Works\n\nIn React, **state** is a component's private memory. When state changes, React automatically re-renders the component to update the user interface.\n\n#### Key Concepts:\n1. **\`useState\` Hook**: Declares a reactive state variable and its setter function.\n\`\`\`jsx\nimport React, { useState } from 'react';\n\nfunction Counter() {\n  const [count, setCount] = useState(0);\n  return (\n    <button onClick={() => setCount(count + 1)}>\n      Clicked {count} times\n    </button>\n  );\n}\n\`\`\`\n2. **Immutability**: Never mutate state directly (e.g. \`count = count + 1\`). Always call the setter function (\`setCount\`) so React is notified to schedule a render.\n3. **Unidirectional Data Flow**: State flows down from parent components to child components via props.\n\n*Note: No workspace files were modified in answer mode. If you would like me to build a working React application with interactive state in your workspace, simply reply: "Build a React app for me".*`;
    }

    return `### Understanding ${prompt}\n\nHere is a conceptual overview of the requested topic:\n\n1. **Core Principle**: In modern software engineering, clean architecture and separation of concerns ensure maintainable and testable code.\n2. **How It Operates**: Code is structured into modular functions and components with explicit inputs and outputs.\n\n*Note: No workspace files were modified in answer mode. If you would like me to build a working implementation directly in your workspace, just let me know!*`;
  }

  /**
   * Reset any pending clarification session for a given session/conversation.
   */
  public static clearSession(sessionId?: string): void {
    if (sessionId) {
      this.activeSessions.delete(sessionId);
    } else {
      this.activeSessions.clear();
    }
    this.saveSessions();
  }
}
