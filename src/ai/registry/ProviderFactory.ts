/**
 * MaxIDE - Unlimited AI Provider Platform
 * Provider Factory
 * Dynamically instantiates provider adapters based on configuration.
 * Extensible: new provider adapters can be registered at runtime.
 */

import { AIProvider, AIProviderConfig } from '../core/AIProvider.js';
import { OpenAIProvider } from '../providers/openai/OpenAIProvider.js';
import { OpenAICompatibleProvider } from '../providers/openai-compatible/OpenAICompatibleProvider.js';
import { OllamaProvider } from '../providers/ollama/OllamaProvider.js';
import { GeminiProvider } from '../providers/gemini/GeminiProvider.js';
import { GroqProvider } from '../providers/groq/GroqProvider.js';
import { AnthropicProvider } from '../providers/anthropic/AnthropicProvider.js';
import { CustomMockProvider } from '../providers/custom/CustomMockProvider.js';

export type ProviderConstructor = (config: AIProviderConfig) => AIProvider;

export class ProviderFactory {
  private static adapterRegistry: Map<string, ProviderConstructor> = new Map();

  static {
    // Register built-in adapters
    this.registerAdapter('openai', (cfg) => new OpenAIProvider(cfg));
    this.registerAdapter('openai_compatible', (cfg) => new OpenAICompatibleProvider(cfg));
    this.registerAdapter('ollama', (cfg) => new OllamaProvider(cfg));
    this.registerAdapter('gemini', (cfg) => new GeminiProvider(cfg));
    this.registerAdapter('groq', (cfg) => new GroqProvider(cfg));
    this.registerAdapter('anthropic', (cfg) => new AnthropicProvider(cfg));
    this.registerAdapter('custom', (cfg) => {
      // If baseUrl is provided or not a mock, use OpenAICompatibleProvider
      if (cfg.baseUrl && (cfg.baseUrl.startsWith('http://') || cfg.baseUrl.startsWith('https://'))) {
        return new OpenAICompatibleProvider(cfg);
      }
      return new CustomMockProvider(cfg);
    });
    this.registerAdapter('mock', (cfg) => new CustomMockProvider(cfg));
  }

  /**
   * Register a new custom provider adapter class/factory at runtime.
   * Allows adding third-party or proprietary adapters without recompilation.
   */
  public static registerAdapter(apiType: string, constructor: ProviderConstructor): void {
    this.adapterRegistry.set(apiType.toLowerCase(), constructor);
  }

  /**
   * Create an AIProvider instance from configuration.
   */
  public static createProvider(config: AIProviderConfig): AIProvider {
    const apiType = (config.apiType || 'openai_compatible').toLowerCase();
    const constructor = this.adapterRegistry.get(apiType);

    if (constructor) {
      return constructor(config);
    }

    // Default fallback: generic OpenAI-compatible
    return new OpenAICompatibleProvider(config);
  }
}
