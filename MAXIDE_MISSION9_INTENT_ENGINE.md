# MAXIDE APEX — MISSION 9 INTENT CLASSIFICATION ENGINE

**Module:** `src/agent/intent/IntentClassifier.ts`  
**Regression Tests:** `src/tests/mission9_regression_suite.test.ts` (Tests 1–5)

---

## 1. Structured Engineering Intent Architecture

Mission 9 replaces the legacy flat keyword check with a robust, two-tiered classification pipeline that extracts structured engineering metadata alongside the primary intent:

```typescript
export interface IntentClassification {
  intent: UserIntent;
  confidence: number;
  isConversational: boolean;        // CHAT or EXPLAIN -> never modifies files
  isExecution: boolean;             // Enters autonomous agent loop
  isBrowserTask: boolean;           // Direct URL / preview navigation
  isGitTask: boolean;               // Git operations
  targetPlatform?: 'NATIVE_WINDOWS' | 'WEB_APP' | 'FULLSTACK_WEB' | 'BACKEND_SERVICE' | 'CLI_UTILITY' | 'UNKNOWN';
  requiresFileModification?: boolean;
  requiresBrowserExecution?: boolean;
  requiresNativeExecution?: boolean;
  workflowRoute?: string;
  lowConfidenceFallback?: boolean;
  rationale: string;
}
```

---

## 2. Supported Intents & Natural Language Variations

| User Intent | Workflow Route | Mutating? | Examples Handled in Mission 9 |
| :--- | :--- | :---: | :--- |
| **`CHAT`** | `CHAT_SAFE` | No | `"hello"`, `"hi"`, `"good morning"`, `"thanks"`, `"who are you"` |
| **`EXPLAIN`** | `EXPLAIN_SAFE` | No | `"Explain what a JavaScript closure is"`, `"how does this function work?"` |
| **`BUILD`** | `BUILD_FLOW` | Yes | `"Build a responsive expense tracker web app"`, `"Create a modern dashboard"` |
| **`NATIVE_APP_BUILD`** | `NATIVE_WINDOWS_FLOW` | Yes | `"Build a desktop application"`, `"Create a native Windows inventory tracker (.exe)"` |
| **`CODE_EDIT`** | `EDIT_FLOW` | Yes | `"edit app.js to add a button"`, `"update styles.css with dark theme"` |
| **`DEBUG`** | `DEBUG_REPAIR_FLOW` | Yes | `"Fix this application."`, `"Find why the application crashes."`, `"Repair the calculation."`, `"Make this code work."`, `"Why is my API failing?"`, `"Run the tests and fix the errors."` |
| **`TEST`** | `TEST_FLOW` | No | `"run tests"`, `"npm test"`, `"run the Playwright suite"` |
| **`REFACTOR`** | `REFACTOR_FLOW` | Yes | `"refactor this component"`, `"clean up unused imports"`, `"decouple routes"` |
| **`BROWSER_TASK`** | `BROWSER_PREVIEW_FLOW` | No | `"open localhost"`, `"open the website"`, `"view live preview"` |
| **`GIT_TASK`** | `GIT_FLOW` | Yes | `"git status"`, `"commit changes"`, `"push to github"` |
| **`PROJECT_TASK`** | `PROJECT_FLOW` | Yes | General workspace operations and multi-step tasks |

---

## 3. Order-of-Precedence & Safety Guarantees

1. **Precedence Invariant**: `DEBUG` checks precede `EXPLAIN` and `TEST`. A prompt like *"Why is my API failing?"* contains the word `"why"`, but expresses a debugging objective; in Mission 9, it is correctly routed to `DEBUG` (`DEBUG_REPAIR_FLOW`) rather than non-mutating `EXPLAIN`. Similarly, *"Run the tests and fix the errors"* routes to `DEBUG` so the agent enters the closed-loop repair loop.
2. **Deterministic Safety Guard**: `isConversational` is strictly enforced. `CHAT` and `EXPLAIN` set `requiresFileModification = false`, preventing hallucinated tool actions on purely conversational turns.
3. **Low-Confidence Fallback**: When prompt length $< 4$ characters or pattern match confidence $< 0.50$, `lowConfidenceFallback` is flagged so the agent can safely ask for clarification if ambiguity affects execution.
