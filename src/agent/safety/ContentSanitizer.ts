/**
 * MaxIDE Content Sanitizer
 * Prevents model tool-call JSON envelopes and meta-tokens from leaking into project source files.
 */

export interface SanitizationResult {
  valid: boolean;
  sanitized: string;
  isEnvelope: boolean;
  error?: string;
}

export class ContentSanitizer {
  /**
   * Inspect and sanitize code content before writing to physical files.
   */
  public static sanitize(filePath: string, content: any): SanitizationResult {
    if (content === null || content === undefined) {
      return { valid: true, sanitized: '', isEnvelope: false };
    }

    let raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const trimmed = raw.trim();

    // 1. Detect if the content is an internal tool-call JSON envelope
    // e.g. { "name": "build_...", "arguments": { ... } } or { "tool": "...", "args": { ... } }
    const isJsonEnvelope = this.checkIfToolEnvelope(trimmed);
    if (isJsonEnvelope) {
      // Attempt to salvage actual source code from arguments if present
      try {
        const parsed = JSON.parse(trimmed);
        const args = parsed.arguments || parsed.args || parsed.parameters;
        if (args && typeof args === 'object') {
          const innerCode = args.content || args.code || args.html || args.js || args.text;
          if (innerCode && typeof innerCode === 'string' && !this.checkIfToolEnvelope(innerCode.trim())) {
            return {
              valid: true,
              sanitized: innerCode.trim(),
              isEnvelope: true,
            };
          }
        }
      } catch {}

      // If cannot salvage real code, reject writing the envelope into source files
      if (!filePath.endsWith('package.json') && !filePath.endsWith('tsconfig.json') && !filePath.endsWith('.json')) {
        return {
          valid: false,
          sanitized: '',
          isEnvelope: true,
          error: `Rejected writing tool-call JSON envelope into source file "${filePath}". Source files must contain real code, not tool invocations.`,
        };
      }
    }

    // 2. Clean accidental outer markdown code fence wrappers
    // e.g. writing "```javascript\nconsole.log(1)\n```" directly into a .js file
    if ((filePath.endsWith('.js') || filePath.endsWith('.ts') || filePath.endsWith('.py') || filePath.endsWith('.html') || filePath.endsWith('.css')) &&
        trimmed.startsWith('```') && trimmed.endsWith('```')) {
      const match = /^```(?:[a-zA-Z0-9_\-]+)?\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
      if (match && match[1]) {
        raw = match[1];
      }
    }

    return {
      valid: true,
      sanitized: raw,
      isEnvelope: false,
    };
  }

  /**
   * Determine if text contains or represents an internal model tool-call JSON envelope.
   */
  public static isToolEnvelope(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    let trimmed = text.trim();

    // Strip markdown code fences if wrapped
    if (trimmed.startsWith('```')) {
      trimmed = trimmed.replace(/^```(?:json|tool)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    // Strip accidental leading words like "json\n", "on\n"
    trimmed = trimmed.replace(/^(?:json|on)\s*\{/i, '{');

    // 1. Regex test for tool envelope signatures
    if (/"name"\s*:\s*"(?:build_|create_|make_)[a-zA-Z0-9_]+"/i.test(trimmed)) {
      return true;
    }
    if (/"(?:tool|function|name)"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|args|parameters)"\s*:/i.test(trimmed) ||
        /"(?:arguments|args|parameters)"\s*:\s*\{[\s\S]*?"(?:tool|function|name)"\s*:/i.test(trimmed)) {
      return true;
    }

    // 2. Structural JSON parse
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = trimmed.substring(firstBrace, lastBrace + 1);
      try {
        const obj = JSON.parse(candidate);
        if (typeof obj === 'object' && obj !== null) {
          const hasToolKey = 'tool' in obj || 'name' in obj || 'function' in obj;
          const hasArgsKey = 'arguments' in obj || 'args' in obj || 'parameters' in obj;
          if (hasToolKey && hasArgsKey) return true;
          if (obj.name && typeof obj.name === 'string' && (obj.name.startsWith('build_') || obj.name.startsWith('create_') || obj.name.startsWith('make_'))) {
            return true;
          }
        }
      } catch {}
    }

    return false;
  }

  private static checkIfToolEnvelope(text: string): boolean {
    return this.isToolEnvelope(text);
  }
}
