/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Dynamic Provider Registry
 * Manages runtime provider lifecycle, health checks, persistence, and additions.
 */

import fs from 'fs';
import path from 'path';
import { AIProvider, AIProviderConfig } from '../core/AIProvider.js';
import { ProviderFactory } from './ProviderFactory.js';
import { ProviderHealth, ConnectionResult } from '../core/types.js';

export class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();
  private healthCache: Map<string, ProviderHealth> = new Map();
  private storagePath?: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath;
    if (this.storagePath && fs.existsSync(this.storagePath)) {
      this.loadFromStorage();
    }
  }

  /**
   * Register a new or existing provider.
   * If an existing provider with the same ID exists, it is replaced and updated.
   */
  public registerProvider(config: AIProviderConfig, instance?: AIProvider): AIProvider {
    const provider = instance || ProviderFactory.createProvider(config);
    this.providers.set(provider.id, provider);
    this.saveToStorage();
    return provider;
  }

  public getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  public getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  public getActiveProviders(): AIProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isEnabled);
  }

  public removeProvider(id: string): boolean {
    const deleted = this.providers.delete(id);
    this.healthCache.delete(id);
    this.saveToStorage();
    return deleted;
  }

  public setProviderEnabled(id: string, isEnabled: boolean): boolean {
    const provider = this.providers.get(id);
    if (provider) {
      provider.isEnabled = isEnabled;
      provider.updateConfig({ isEnabled });
      this.saveToStorage();
      return true;
    }
    return false;
  }

  /**
   * Run health check for a single provider.
   */
  public async checkProviderHealth(id: string): Promise<ProviderHealth> {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Provider not found: ${id}`);
    }

    if (!provider.isEnabled) {
      const health: ProviderHealth = {
        providerId: provider.id,
        providerName: provider.name,
        type: provider.type,
        status: 'offline',
        latencyMs: 0,
        lastChecked: new Date(),
        availableModelsCount: 0,
        lastError: 'Provider is disabled in settings',
      };
      this.healthCache.set(id, health);
      return health;
    }

    try {
      const result: ConnectionResult = await provider.validateConnection();
      let status: 'online' | 'offline' | 'rate_limited' | 'error' = result.ok ? 'online' : 'offline';
      if (result.error?.includes('429') || result.error?.includes('rate limit')) {
        status = 'rate_limited';
      }

      const health: ProviderHealth = {
        providerId: provider.id,
        providerName: provider.name,
        type: provider.type,
        status,
        latencyMs: result.latencyMs || 0,
        lastChecked: new Date(),
        availableModelsCount: result.availableModelsCount || 0,
        lastError: result.error,
      };

      this.healthCache.set(id, health);
      return health;
    } catch (err: any) {
      const health: ProviderHealth = {
        providerId: provider.id,
        providerName: provider.name,
        type: provider.type,
        status: 'error',
        latencyMs: 0,
        lastChecked: new Date(),
        availableModelsCount: 0,
        lastError: err.message,
      };
      this.healthCache.set(id, health);
      return health;
    }
  }

  /**
   * Run health checks across all configured providers concurrently.
   */
  public async checkAllHealth(): Promise<ProviderHealth[]> {
    const promises = Array.from(this.providers.keys()).map(id => this.checkProviderHealth(id));
    return Promise.all(promises);
  }

  public getCachedHealth(id: string): ProviderHealth | undefined {
    return this.healthCache.get(id);
  }

  public getAllCachedHealth(): ProviderHealth[] {
    return Array.from(this.healthCache.values());
  }

  private saveToStorage(): void {
    if (!this.storagePath) return;
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const configs = Array.from(this.providers.values()).map(p => p.config);
      fs.writeFileSync(this.storagePath, JSON.stringify(configs, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist provider registry:', err);
    }
  }

  private loadFromStorage(): void {
    if (!this.storagePath) return;
    try {
      const data = fs.readFileSync(this.storagePath, 'utf8');
      const configs: AIProviderConfig[] = JSON.parse(data);
      for (const cfg of configs) {
        this.registerProvider(cfg);
      }
    } catch (err) {
      console.error('Failed to load provider registry:', err);
    }
  }
}
