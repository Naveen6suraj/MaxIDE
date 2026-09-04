/**
 * MaxIDE - Unlimited AI Provider Platform
 * OpenAI Provider Adapter
 * Native OpenAI integration with GPT-4o, GPT-4o-mini, o1, o3-mini, and custom OpenAI models.
 */

import { OpenAICompatibleProvider } from '../openai-compatible/OpenAICompatibleProvider.js';
import { AIProviderConfig } from '../../core/AIProvider.js';
import { AIModel, defaultCapabilities } from '../../core/AIModel.js';
import { ConnectionResult } from '../../core/types.js';

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: AIProviderConfig) {
    super({
      ...config,
      type: 'cloud',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      apiKey: config.apiKey || process.env.OPENAI_API_KEY || '',
      defaultModel: config.defaultModel || 'gpt-4o',
    });
  }

  public override async validateConnection(): Promise<ConnectionResult> {
    const key = this.config.apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      return {
        ok: false,
        latencyMs: 0,
        error: 'OpenAI API key is not configured. Add your key in Settings or set OPENAI_API_KEY.',
      };
    }
    return super.validateConnection();
  }

  public override async listModels(): Promise<AIModel[]> {
    const key = this.config.apiKey || process.env.OPENAI_API_KEY;
    if (key) {
      try {
        const models = await super.listModels();
        if (models.length > 0) {
          // Filter to relevant chat / coding / reasoning models
          const filtered = models.filter((m) => {
            const id = m.id.toLowerCase();
            return (
              id.startsWith('gpt-4') ||
              id.startsWith('gpt-3.5') ||
              id.startsWith('o1') ||
              id.startsWith('o3') ||
              id.startsWith('chatgpt')
            );
          });
          if (filtered.length > 0) {
            return filtered.map((m) => {
              const id = m.id.toLowerCase();
              const isReasoning = id.includes('o1') || id.includes('o3');
              return {
                ...m,
                capabilities: defaultCapabilities({
                  chat: true,
                  streaming: true,
                  toolCalling: true,
                  vision: id.includes('4o') || id.includes('vision'),
                  codeGeneration: true,
                  reasoning: isReasoning,
                }),
                pricing: id.includes('mini')
                  ? { input: 0.15, output: 0.60 }
                  : { input: 2.50, output: 10.00 },
                local: false,
              };
            });
          }
        }
      } catch {
        // Fall back to default catalog
      }
    }

    return this.getDefaultModels();
  }

  public getDefaultModels(): AIModel[] {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o (Omni)',
        providerId: this.id,
        contextWindow: 128000,
        capabilities: defaultCapabilities({
          chat: true,
          streaming: true,
          toolCalling: true,
          vision: true,
          codeGeneration: true,
          reasoning: true,
        }),
        pricing: { input: 2.50, output: 10.00 },
        local: false,
        description: 'OpenAI flagship model with high intelligence and vision',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        providerId: this.id,
        contextWindow: 128000,
        capabilities: defaultCapabilities({
          chat: true,
          streaming: true,
          toolCalling: true,
          vision: true,
          codeGeneration: true,
        }),
        pricing: { input: 0.15, output: 0.60 },
        local: false,
        description: 'Fast, affordable model for everyday coding and conversations',
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        providerId: this.id,
        contextWindow: 200000,
        capabilities: defaultCapabilities({
          chat: true,
          streaming: true,
          toolCalling: true,
          codeGeneration: true,
          reasoning: true,
        }),
        pricing: { input: 1.10, output: 4.40 },
        local: false,
        description: 'Specialized reasoning model optimized for deep coding and math',
      },
      {
        id: 'o1',
        name: 'o1',
        providerId: this.id,
        contextWindow: 200000,
        capabilities: defaultCapabilities({
          chat: true,
          streaming: true,
          toolCalling: true,
          codeGeneration: true,
          reasoning: true,
        }),
        pricing: { input: 15.00, output: 60.00 },
        local: false,
        description: 'OpenAI premier deep reasoning and architecture model',
      },
    ];
  }
}
