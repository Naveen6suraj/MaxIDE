/**
 * MaxIDE - Unlimited AI Provider Platform
 * Core Types & Enums
 */

export type ProviderType = 'cloud' | 'local' | 'remote_self_hosted' | 'custom';

export type AIMode = 'cloud' | 'local' | 'hybrid';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any> | string;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: any;
  isError?: boolean;
}

export interface ConnectionResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
  availableModelsCount?: number;
  error?: string;
}

export type AIEventType = 'token' | 'tool_call' | 'finish' | 'error';

export interface TokenEvent {
  type: 'token';
  content: string;
}

export interface ToolCallEvent {
  type: 'tool_call';
  toolCall: ToolCall;
}

export interface FinishEvent {
  type: 'finish';
  reason: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ErrorEvent {
  type: 'error';
  error: string;
}

export type AIEvent = TokenEvent | ToolCallEvent | FinishEvent | ErrorEvent;

export interface ProviderHealth {
  providerId: string;
  providerName: string;
  type: ProviderType;
  status: 'online' | 'offline' | 'rate_limited' | 'error';
  latencyMs: number;
  lastChecked: Date;
  availableModelsCount: number;
  lastError?: string;
}

export interface UsageMetrics {
  providerId: string;
  modelId: string;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  estimatedCostUSD: number;
  lastUsed: Date;
}
