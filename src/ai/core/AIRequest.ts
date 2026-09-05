/**
 * MaxIDE - Unlimited AI Provider Platform
 * Request Objects
 */

import { Role, ToolCall } from './types.js';

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolParameterSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  description?: string;
  [key: string]: any;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface AIRequest {
  modelId?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  metadata?: Record<string, any>;
}

export interface AIToolRequest extends AIRequest {
  tools: ToolDefinition[];
  toolChoice?: 'auto' | 'required' | 'none' | { type: 'function'; function: { name: string } };
}
