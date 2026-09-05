/**
 * MaxIDE - Unlimited AI Provider Platform
 * Groq Provider Adapter
 * Fast LPU inference using OpenAI-compatible endpoint with Groq defaults.
 */

import { OpenAICompatibleProvider } from '../openai-compatible/OpenAICompatibleProvider.js';
import { AIProviderConfig } from '../../core/AIProvider.js';
import { AIModel, defaultCapabilities } from '../../core/AIModel.js';

export class GroqProvider extends OpenAICompatibleProvider {
  constructor(config: AIProviderConfig) {
    super({
      ...config,
      type: 'cloud',
      baseUrl: config.baseUrl || 'https://api.groq.com/openai/v1',
      defaultModel: config.defaultModel || 'llama-3.3-70b-versatile',
    });
  }

  public override async listModels(): Promise<AIModel[]> {
    const models = await super.listModels();
    if (models.length > 0) {
      return models.map(m => ({
        ...m,
        pricing: { input: 0.59, output: 0.79 },
        description: `High-speed Groq LPU inference: ${m.name}`,
      }));
    }

    // Fallback Groq models if API key is not yet provided
    return [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        providerId: this.id,
        contextWindow: 128000,
        capabilities: defaultCapabilities({ toolCalling: true, codeGeneration: true }),
        pricing: { input: 0.59, output: 0.79 },
        local: false,
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        providerId: this.id,
        contextWindow: 128000,
        capabilities: defaultCapabilities({ toolCalling: true, codeGeneration: true }),
        pricing: { input: 0.05, output: 0.08 },
        local: false,
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        providerId: this.id,
        contextWindow: 32768,
        capabilities: defaultCapabilities({ toolCalling: true, codeGeneration: true }),
        pricing: { input: 0.24, output: 0.24 },
        local: false,
      },
    ];
  }
}
