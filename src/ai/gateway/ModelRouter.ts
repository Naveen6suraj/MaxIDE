/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Intelligent Model Router & Capability Guard
 * Evaluates required capabilities, context size, privacy mode, and latency
 * to intelligently pick or validate models.
 */

import { AIModel } from '../core/AIModel.js';
import { ModelRegistry } from '../registry/ModelRegistry.js';
import { ProviderRegistry } from '../registry/ProviderRegistry.js';
import { PrivacyManager } from './PrivacyManager.js';
import { AIProvider } from '../core/AIProvider.js';

export interface TaskRequirements {
  requiresToolCalling?: boolean;
  requiresVision?: boolean;
  requiresReasoning?: boolean;
  requiresCodeGeneration?: boolean;
  estimatedTokens?: number;
  preferSpeed?: boolean;
  preferLocal?: boolean;
  userPreferredModelId?: string;
}

export interface RouteResolution {
  provider: AIProvider;
  model: AIModel;
  score: number;
  rationale: string;
}

export class CapabilityMismatchError extends Error {
  constructor(message: string, public readonly compatibleModels: AIModel[] = []) {
    super(message);
    this.name = 'CapabilityMismatchError';
  }
}

export class ModelRouter {
  private autoRoutingEnabled: boolean = true;

  constructor(
    private providerRegistry: ProviderRegistry,
    private modelRegistry: ModelRegistry,
    private privacyManager: PrivacyManager
  ) {}

  public isAutoRoutingEnabled(): boolean {
    return this.autoRoutingEnabled;
  }

  public setAutoRoutingEnabled(enabled: boolean): void {
    this.autoRoutingEnabled = enabled;
  }

  /**
   * Validate that the requested model satisfies the task's required capabilities (Requirement 11).
   * Does NOT pretend unsupported capabilities exist!
   */
  public validateCapabilities(model: AIModel, requirements: TaskRequirements): void {
    if (requirements.requiresToolCalling && !model.capabilities.toolCalling) {
      const compatible = this.modelRegistry.searchModels({
        capabilities: { toolCalling: true },
        localOnly: this.privacyManager.getMode() === 'local',
      });
      throw new CapabilityMismatchError(
        `This model "${model.name}" does not support tool calling. Choose another model or provider.`,
        compatible
      );
    }

    if (requirements.requiresVision && !model.capabilities.vision) {
      const compatible = this.modelRegistry.searchModels({
        capabilities: { vision: true },
        localOnly: this.privacyManager.getMode() === 'local',
      });
      throw new CapabilityMismatchError(
        `This model "${model.name}" does not support vision processing.`,
        compatible
      );
    }
  }

  /**
   * Route task to the optimal model based on requirements, privacy mode, and health (Requirement 12).
   */
  public route(requirements: TaskRequirements): RouteResolution {
    const isLocalOnly = this.privacyManager.getMode() === 'local';

    // 1. If explicit user preference is given and satisfies capabilities & privacy
    if (requirements.userPreferredModelId) {
      const targetModel = this.modelRegistry.getModel(requirements.userPreferredModelId);
      if (targetModel) {
        const provider = this.providerRegistry.getProvider(targetModel.providerId);
        if (provider && provider.isEnabled) {
          // Enforce privacy guard: if in Local Only mode and user explicitly requested a cloud model, reject immediately!
          this.privacyManager.validateDispatch(provider, targetModel);
          this.validateCapabilities(targetModel, requirements);
          return {
            provider,
            model: targetModel,
            score: 100,
            rationale: `Direct user selection: ${targetModel.name} (${provider.name})`,
          };
        }
      }
    }

    // 2. Find all candidate models that satisfy constraints
    const candidates = this.modelRegistry.searchModels({
      localOnly: isLocalOnly || requirements.preferLocal,
      capabilities: {
        toolCalling: requirements.requiresToolCalling,
        vision: requirements.requiresVision,
        reasoning: requirements.requiresReasoning,
        codeGeneration: requirements.requiresCodeGeneration,
      },
    });

    if (candidates.length === 0) {
      if (isLocalOnly) {
        throw new CapabilityMismatchError(
          'This operation requires capabilities unavailable in your configured local models. Configure a local model (e.g. Ollama with tool support) or adjust task requirements.'
        );
      }
      throw new CapabilityMismatchError(
        'No active model matches the required capabilities for this task. Please enable a compatible provider or add a model.'
      );
    }

    // 3. Score candidates based on speed, context window, and provider latency
    let bestCandidate: RouteResolution | null = null;
    let highestScore = -Infinity;

    for (const candidate of candidates) {
      const provider = this.providerRegistry.getProvider(candidate.providerId);
      if (!provider || !provider.isEnabled) continue;
      if (!this.privacyManager.isProviderAllowed(provider)) continue;

      let score = 50;
      const health = this.providerRegistry.getCachedHealth(provider.id);

      if (health?.status === 'online') score += 20;
      if (health?.status === 'offline') score -= 50;

      // Latency bonus
      if (health?.latencyMs && health.latencyMs < 100) score += 15;

      // Context window fit
      if (requirements.estimatedTokens && candidate.contextWindow) {
        if (candidate.contextWindow >= requirements.estimatedTokens * 1.5) score += 10;
        else if (candidate.contextWindow < requirements.estimatedTokens) score -= 30;
      }

      // Preference bonuses
      if (requirements.preferLocal && candidate.local) score += 25;
      if (requirements.preferSpeed && (provider.config.apiType === 'groq' || candidate.local)) score += 20;
      if (requirements.requiresReasoning && candidate.capabilities.reasoning) score += 25;

      if (score > highestScore) {
        highestScore = score;
        bestCandidate = {
          provider,
          model: candidate,
          score,
          rationale: `Auto-routed based on capabilities and latency (${provider.name} / ${candidate.name})`,
        };
      }
    }

    if (!bestCandidate) {
      throw new CapabilityMismatchError('No available and healthy provider matches your requirements.');
    }

    return bestCandidate;
  }
}
