/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Resilient Fallback Chain Manager
 * Handles multi-tiered failover while strictly respecting capability requirements.
 */

import { ProviderRegistry } from '../registry/ProviderRegistry.js';
import { ModelRegistry } from '../registry/ModelRegistry.js';
import { PrivacyManager } from './PrivacyManager.js';
import { AIProvider } from '../core/AIProvider.js';
import { AIModel } from '../core/AIModel.js';
import { TaskRequirements } from './ModelRouter.js';

export interface FallbackEntry {
  providerId: string;
  modelId?: string;
  priority: number;
}

export class FallbackManager {
  private chain: FallbackEntry[] = [];

  constructor(
    private providerRegistry: ProviderRegistry,
    private modelRegistry: ModelRegistry,
    private privacyManager: PrivacyManager
  ) {}

  public setFallbackChain(chain: FallbackEntry[]): void {
    this.chain = [...chain].sort((a, b) => a.priority - b.priority);
  }

  public getFallbackChain(): FallbackEntry[] {
    return [...this.chain];
  }

  public addFallbackEntry(entry: FallbackEntry): void {
    this.chain.push(entry);
    this.chain.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Resolve an ordered list of viable (provider, model) pairs that can fulfill the task,
   * starting from the primary target and cascading through the fallback chain.
   * Ensures every step in the chain satisfies capability requirements and privacy constraints.
   */
  public getEligibleFallbackChain(
    primaryProvider: AIProvider,
    primaryModel: AIModel,
    requirements: TaskRequirements
  ): Array<{ provider: AIProvider; model: AIModel }> {
    const list: Array<{ provider: AIProvider; model: AIModel }> = [];
    const seenProviders = new Set<string>();

    // 1. Primary
    if (primaryProvider.isEnabled && this.privacyManager.isProviderAllowed(primaryProvider)) {
      list.push({ provider: primaryProvider, model: primaryModel });
      seenProviders.add(primaryProvider.id);
    }

    // 2. Configured Fallback Chain
    for (const entry of this.chain) {
      if (seenProviders.has(entry.providerId)) continue;

      const provider = this.providerRegistry.getProvider(entry.providerId);
      if (!provider || !provider.isEnabled) continue;
      if (!this.privacyManager.isProviderAllowed(provider)) continue;
      const needsCloudKey = provider.type === 'cloud' && ['gemini', 'groq', 'anthropic'].includes(provider.config.apiType);
      if (needsCloudKey && !provider.config.apiKey) continue;

      // Find model for this fallback
      let model: AIModel | undefined;
      if (entry.modelId) {
        model = this.modelRegistry.getModel(entry.modelId);
      }
      if (!model) {
        // Pick best matching model from this provider
        const provModels = this.modelRegistry.searchModels({ providerId: provider.id });
        model = provModels[0];
      }

      if (!model) continue;

      // CRITICAL REQUIREMENT: Fallback must respect capability requirements!
      if (requirements.requiresToolCalling && !model.capabilities.toolCalling) {
        continue;
      }
      if (requirements.requiresVision && !model.capabilities.vision) {
        continue;
      }

      list.push({ provider, model });
      seenProviders.add(provider.id);
    }

    // 3. Dynamic Registry Fallback: If no explicit chain configured or after chain,
    // automatically cascade to any other enabled, configured providers in the registry
    for (const provider of this.providerRegistry.getAllProviders()) {
      if (seenProviders.has(provider.id) || !provider.isEnabled) continue;
      if (!this.privacyManager.isProviderAllowed(provider)) continue;
      const needsCloudKey = provider.type === 'cloud' && ['gemini', 'groq', 'anthropic'].includes(provider.config.apiType);
      if (needsCloudKey && !provider.config.apiKey) continue;

      const provModels = this.modelRegistry.searchModels({ providerId: provider.id });
      for (const model of provModels) {
        if (requirements.requiresToolCalling && !model.capabilities.toolCalling) continue;
        if (requirements.requiresVision && !model.capabilities.vision) continue;

        list.push({ provider, model });
        seenProviders.add(provider.id);
        break;
      }
    }

    return list;
  }
}
