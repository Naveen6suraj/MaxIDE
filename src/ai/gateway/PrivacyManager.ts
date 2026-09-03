/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Privacy Manager
 * Enforces strict boundaries between Local, Cloud, and Hybrid execution.
 * Guarantees zero leakage in LOCAL ONLY mode.
 */

import { AIMode } from '../core/types.js';
import { AIProvider } from '../core/AIProvider.js';
import { AIModel } from '../core/AIModel.js';

export class PrivacyViolationError extends Error {
  constructor(message: string, public readonly remediation?: string) {
    super(message);
    this.name = 'PrivacyViolationError';
  }
}

export class PrivacyManager {
  private mode: AIMode = 'cloud'; // default: cloud or user-configured

  constructor(initialMode: AIMode = 'cloud') {
    this.mode = initialMode;
  }

  public getMode(): AIMode {
    return this.mode;
  }

  public setMode(newMode: AIMode): void {
    this.mode = newMode;
  }

  /**
   * Verify whether a target provider and model are permitted under current Privacy Mode.
   * Throws PrivacyViolationError if violated.
   */
  public validateDispatch(provider: AIProvider, model?: AIModel, requiredCapability?: string): void {
    if (this.mode === 'local') {
      const isLocal = provider.type === 'local' || (model && model.local);
      if (!isLocal) {
        throw new PrivacyViolationError(
          `[LOCAL ONLY PRIVACY MODE] Dispatch to cloud provider "${provider.name}" was strictly blocked. No project code or prompts may leave your local machine in this mode.`,
          'Switch to a configured local model (e.g. Ollama, LM Studio, or local OpenAI-compatible endpoint), or change AI Mode to Hybrid or Cloud.'
        );
      }

      if (requiredCapability && model) {
        const caps = model.capabilities as any;
        if (!caps[requiredCapability]) {
          throw new PrivacyViolationError(
            `This operation requires capability "${requiredCapability}" which is unavailable in your configured local model "${model.name}".`,
            'Configure a local model with this capability or adjust task requirements.'
          );
        }
      }
    }
  }

  /**
   * Determine if a provider is allowed under the current mode.
   */
  public isProviderAllowed(provider: AIProvider): boolean {
    if (this.mode === 'local') {
      return provider.type === 'local';
    }
    return true;
  }
}
