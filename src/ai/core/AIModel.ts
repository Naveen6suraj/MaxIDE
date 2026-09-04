/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Universal Model Specification
 */

export interface AIModelCapabilities {
  chat: boolean;
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  codeGeneration: boolean;
  codeCompletion?: boolean;
  reasoning?: boolean;
}

export interface AIModelPricing {
  input?: number;   // Cost per 1M tokens in USD
  output?: number;  // Cost per 1M tokens in USD
}

export interface AIModel {
  id: string;
  name: string;
  providerId: string;

  contextWindow?: number;
  maxOutputTokens?: number;

  capabilities: AIModelCapabilities;

  pricing?: AIModelPricing;

  local?: boolean;
  description?: string;
  favorite?: boolean;
  isCustom?: boolean;
}

export function defaultCapabilities(overrides?: Partial<AIModelCapabilities>): AIModelCapabilities {
  return {
    chat: true,
    streaming: true,
    toolCalling: false,
    vision: false,
    codeGeneration: true,
    reasoning: false,
    ...overrides,
  };
}
