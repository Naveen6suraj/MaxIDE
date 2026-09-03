/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Response Objects
 */

import { ToolCall } from './types.js';

export interface AIResponseUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUSD?: number;
}

export interface AIResponse {
  id: string;
  modelId: string;
  providerId: string;
  content: string;
  toolCalls?: ToolCall[];
  finishReason: string;
  usage?: AIResponseUsage;
  latencyMs?: number;
}
