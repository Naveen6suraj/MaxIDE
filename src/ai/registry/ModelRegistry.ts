/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Dynamic Model Registry
 * Discovers, filters, organizes, and manages models dynamically without hardcoding.
 */

import { AIModel } from '../core/AIModel.js';
import { ProviderRegistry } from './ProviderRegistry.js';

export interface ModelSearchFilters {
  query?: string;
  providerId?: string;
  localOnly?: boolean;
  cloudOnly?: boolean;
  capabilities?: {
    toolCalling?: boolean;
    vision?: boolean;
    reasoning?: boolean;
    codeGeneration?: boolean;
  };
  favoriteOnly?: boolean;
}

export class ModelRegistry {
  private models: Map<string, AIModel> = new Map();
  private customModels: Map<string, AIModel> = new Map();
  private recentModelIds: string[] = [];
  private favoriteModelIds: Set<string> = new Set();

  constructor(private providerRegistry: ProviderRegistry) {}

  /**
   * Register or update a single model.
   */
  public registerModel(model: AIModel): void {
    const fullKey = `${model.providerId}:${model.id}`;
    this.models.set(fullKey, model);
    if (model.isCustom) {
      this.customModels.set(fullKey, model);
    }
  }

  /**
   * Add a user-defined custom model manually (Requirement 15).
   */
  public addCustomModel(model: AIModel): AIModel {
    const custom: AIModel = {
      ...model,
      isCustom: true,
    };
    this.registerModel(custom);
    return custom;
  }

  /**
   * Dynamically discover models from all active providers (Requirement 9).
   */
  public async discoverAllModels(): Promise<AIModel[]> {
    const providers = this.providerRegistry.getActiveProviders();
    const discovered: AIModel[] = [];

    await Promise.all(
      providers.map(async (provider) => {
        try {
          const list = await provider.listModels();
          for (const m of list) {
            this.registerModel(m);
            discovered.push(m);
          }
        } catch (err) {
          console.warn(`Could not discover models for provider ${provider.name}:`, err);
        }
      })
    );

    // Re-register any custom models
    for (const [, custom] of this.customModels) {
      this.registerModel(custom);
    }

    return discovered;
  }

  /**
   * Discover models for a specific provider.
   */
  public async discoverProviderModels(providerId: string): Promise<AIModel[]> {
    const provider = this.providerRegistry.getProvider(providerId);
    if (!provider) return [];

    try {
      const list = await provider.listModels();
      for (const m of list) {
        this.registerModel(m);
      }
      return list;
    } catch {
      return [];
    }
  }

  /**
   * Get a model by either `providerId:modelId` or simply `modelId`.
   */
  public getModel(idOrKey: string): AIModel | undefined {
    if (this.models.has(idOrKey)) {
      return this.models.get(idOrKey);
    }

    // Try matching by raw model ID across any provider
    for (const [, model] of this.models) {
      if (model.id === idOrKey) {
        return model;
      }
    }

    return undefined;
  }

  public getAllModels(): AIModel[] {
    return Array.from(this.models.values());
  }

  /**
   * Universal Model Search & Filter (Requirement 10).
   */
  public searchModels(filters: ModelSearchFilters = {}): AIModel[] {
    return Array.from(this.models.values()).filter((model) => {
      // Query search
      if (filters.query) {
        const q = filters.query.toLowerCase();
        const matchesName = model.name.toLowerCase().includes(q);
        const matchesId = model.id.toLowerCase().includes(q);
        const matchesProvider = model.providerId.toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesProvider) return false;
      }

      // Filter by provider
      if (filters.providerId && model.providerId !== filters.providerId) {
        return false;
      }

      // Filter local / cloud
      if (filters.localOnly && !model.local) return false;
      if (filters.cloudOnly && model.local) return false;

      // Filter by capability
      if (filters.capabilities) {
        if (filters.capabilities.toolCalling && !model.capabilities.toolCalling) return false;
        if (filters.capabilities.vision && !model.capabilities.vision) return false;
        if (filters.capabilities.reasoning && !model.capabilities.reasoning) return false;
        if (filters.capabilities.codeGeneration && !model.capabilities.codeGeneration) return false;
      }

      // Filter favorites
      if (filters.favoriteOnly && !this.favoriteModelIds.has(`${model.providerId}:${model.id}`)) {
        return false;
      }

      return true;
    });
  }

  public markRecent(modelKey: string): void {
    this.recentModelIds = [modelKey, ...this.recentModelIds.filter(id => id !== modelKey)].slice(0, 10);
  }

  public getRecentModels(): AIModel[] {
    return this.recentModelIds
      .map(id => this.getModel(id))
      .filter((m): m is AIModel => m !== undefined);
  }

  public toggleFavorite(modelKey: string): boolean {
    if (this.favoriteModelIds.has(modelKey)) {
      this.favoriteModelIds.delete(modelKey);
      return false;
    } else {
      this.favoriteModelIds.add(modelKey);
      return true;
    }
  }

  public isFavorite(modelKey: string): boolean {
    return this.favoriteModelIds.has(modelKey);
  }
}
