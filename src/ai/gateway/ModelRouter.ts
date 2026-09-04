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

    // Category-based routing handling
    const pref = (requirements.userPreferredModelId || 'auto').toLowerCase();
    if (pref === 'coding' || pref === 'category:coding') {
      requirements.requiresCodeGeneration = true;
      requirements.requiresToolCalling = true;
    } else if (pref === 'reasoning' || pref === 'category:reasoning') {
      requirements.requiresReasoning = true;
    } else if (pref === 'fast' || pref === 'category:fast') {
      requirements.preferSpeed = true;
    }

    const isCategorySelection = ['auto', 'coding', 'reasoning', 'fast', 'balanced', 'category:coding', 'category:reasoning', 'category:fast', 'category:balanced'].includes(pref);

    // 1. If explicit user preference for a specific model is given
    if (!isCategorySelection && requirements.userPreferredModelId) {
      const targetModel = this.modelRegistry.getModel(requirements.userPreferredModelId);
      if (targetModel) {
        const provider = this.providerRegistry.getProvider(targetModel.providerId);
        if (provider && provider.isEnabled) {
          const isCustomOrMock = provider.config.apiType === 'custom' || provider.config.apiType === 'openai_compatible';
          const hasCloudKey = (provider.type === 'cloud' && !isCustomOrMock)
            ? Boolean(provider.config.apiKey ||
              (provider.config.apiType === 'openai' ? process.env.OPENAI_API_KEY :
               provider.config.apiType === 'gemini' ? process.env.GEMINI_API_KEY :
               provider.config.apiType === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
               provider.config.apiType === 'groq' ? process.env.GROQ_API_KEY : ''))
            : true;

          const health = this.providerRegistry.getCachedHealth(provider.id);
          const isUsable = hasCloudKey && (health?.status !== 'offline' || provider.type === 'local' || isCustomOrMock);

          if (isUsable) {
            this.privacyManager.validateDispatch(provider, targetModel);
            this.validateCapabilities(targetModel, requirements);
            return {
              provider,
              model: targetModel,
              score: 100,
              rationale: `Selected ${targetModel.name} via ${provider.name}`,
            };
          }
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
          'This operation requires capabilities unavailable in your configured local models. Configure a local model or adjust task requirements.'
        );
      }
      throw new CapabilityMismatchError(
        'No active model matches the required capabilities for this task. Please connect an AI provider in Settings.'
      );
    }

    // 3. Score candidates based on provider configuration, health, speed, and specialization
    let bestCandidate: RouteResolution | null = null;
    let highestScore = -Infinity;

    for (const candidate of candidates) {
      const provider = this.providerRegistry.getProvider(candidate.providerId);
      if (!provider || !provider.isEnabled) continue;
      if (!this.privacyManager.isProviderAllowed(provider)) continue;

      const hasCloudKey = provider.type === 'cloud'
        ? Boolean(provider.config.apiKey ||
          (provider.config.apiType === 'openai' ? process.env.OPENAI_API_KEY :
           provider.config.apiType === 'gemini' ? process.env.GEMINI_API_KEY :
           provider.config.apiType === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
           provider.config.apiType === 'groq' ? process.env.GROQ_API_KEY : ''))
        : true;

      // Skip cloud providers without API key
      if (provider.type === 'cloud' && !hasCloudKey) {
        continue;
      }

      let score = 50;
      const health = this.providerRegistry.getCachedHealth(provider.id);

      // Penalize offline local providers
      if (health?.status === 'offline') {
        score -= 60;
      } else if (health?.status === 'online') {
        score += 25;
      }

      // Prioritize high-quality cloud models over weak local models when cloud is available
      if (provider.type === 'cloud' && hasCloudKey) {
        score += 35;
      }

      // Latency bonus
      if (health?.latencyMs && health.latencyMs < 150) score += 15;

      // Preference bonuses
      if (requirements.preferLocal && candidate.local) score += 40;
      if (requirements.preferSpeed && (provider.config.apiType === 'groq' || candidate.id.includes('mini') || candidate.id.includes('flash') || candidate.id.includes('instant'))) score += 30;

      // Specialized architecture bonuses for task fit
      if (requirements.requiresReasoning) {
        if (candidate.id.includes('o1') || candidate.id.includes('o3') || candidate.id.includes('nemotron') || candidate.id.includes('pro') || candidate.capabilities.reasoning) {
          score += 40;
        }
      }

      if (requirements.requiresCodeGeneration || requirements.requiresToolCalling) {
        if (candidate.id.includes('gpt-4o') || candidate.id.includes('flash') || candidate.id.includes('sonnet') || candidate.id.includes('coder') || candidate.id.includes('qwen')) {
          score += 35;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        let specializationRationale = 'Auto-routed based on configured providers and capabilities';
        if (requirements.requiresReasoning) {
          specializationRationale = `Auto-selected ${candidate.name} (Specialized for Reasoning & Logic)`;
        } else if (requirements.requiresCodeGeneration || requirements.requiresToolCalling) {
          specializationRationale = `Auto-selected ${candidate.name} (Specialized for Code & Tool Execution)`;
        } else if (requirements.preferSpeed) {
          specializationRationale = `Auto-selected ${candidate.name} (Optimized for Fast Interactive Response)`;
        }

        bestCandidate = {
          provider,
          model: candidate,
          score,
          rationale: `${specializationRationale} via ${provider.name}`,
        };
      }
    }

    if (!bestCandidate) {
      throw new CapabilityMismatchError('No configured AI provider is available. Connect an AI provider in Settings to activate MaxIDE Agent.');
    }

    return bestCandidate;
  }

  /**
   * Directly resolve the best model for a category ('AUTO', 'CODING', 'REASONING', 'FAST', 'BALANCED').
   */
  public resolveModelForCategory(category: string, mode?: string): AIModel {
    const cat = (category || 'AUTO').toUpperCase();
    const requirements: TaskRequirements = {
      userPreferredModelId: cat,
      preferLocal: mode === 'local',
    };
    if (cat === 'CODING') {
      requirements.requiresCodeGeneration = true;
      requirements.requiresToolCalling = true;
    } else if (cat === 'REASONING') {
      requirements.requiresReasoning = true;
    } else if (cat === 'FAST') {
      requirements.preferSpeed = true;
    }
    const resolution = this.route(requirements);
    return resolution.model;
  }
}
