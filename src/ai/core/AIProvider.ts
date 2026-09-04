/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Universal Provider Adapter Interface
 */

import { ProviderType, ConnectionResult, AIEvent } from './types.js';
import { AIModel } from './AIModel.js';
import { AIRequest, AIToolRequest } from './AIRequest.js';
import { AIResponse } from './AIResponse.js';

export interface AIProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiType: 'openai' | 'openai_compatible' | 'ollama' | 'gemini' | 'groq' | 'anthropic' | 'custom';
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  organizationId?: string;
  projectId?: string;
  headers?: Record<string, string>;
  isEnabled: boolean;
  isLocal?: boolean;
  customSettings?: Record<string, any>;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;
  readonly config: AIProviderConfig;
  isEnabled: boolean;

  /**
   * Validate connection to the provider and check responsiveness.
   */
  validateConnection(): Promise<ConnectionResult>;

  /**
   * Dynamically query and return the list of models supported by this provider.
   */
  listModels(): Promise<AIModel[]>;

  /**
   * Execute a standard text completion / chat request.
   */
  generate(request: AIRequest): Promise<AIResponse>;

  /**
   * Stream tokens and events for standard completion.
   */
  stream(request: AIRequest): AsyncIterable<AIEvent>;

  /**
   * Execute streaming generation equipped with tools (universal tool calling).
   */
  generateWithTools(request: AIToolRequest): AsyncIterable<AIEvent>;

  /**
   * Update runtime configuration dynamically.
   */
  updateConfig(updates: Partial<AIProviderConfig>): void;
}
