/**
 * MaxIDE - Unlimited AI Provider Platform
 * Custom Mock Provider
 * High-fidelity deterministic provider for test suites, offline simulation,
 * fallback testing, and tool verification.
 */

import { BaseProvider } from '../BaseProvider.js';
import { AIProviderConfig } from '../../core/AIProvider.js';
import {
  ConnectionResult,
  AIEvent,
  ToolCall,
} from '../../core/types.js';
import { AIModel, defaultCapabilities } from '../../core/AIModel.js';
import { AIRequest, AIToolRequest } from '../../core/AIRequest.js';
import { AIResponse } from '../../core/AIResponse.js';

export interface MockBehavior {
  shouldFail?: boolean;
  failureError?: string;
  latencyMs?: number;
  fixedResponse?: string;
  models?: AIModel[];
  toolCallSequence?: Array<{ name: string; arguments: Record<string, any> }>;
}

export class CustomMockProvider extends BaseProvider {
  public mockBehavior: MockBehavior;

  constructor(config: AIProviderConfig, mockBehavior?: MockBehavior) {
    super(config);
    this.mockBehavior = mockBehavior || {};
  }

  public setBehavior(behavior: Partial<MockBehavior>): void {
    this.mockBehavior = { ...this.mockBehavior, ...behavior };
  }

  public async validateConnection(): Promise<ConnectionResult> {
    if (this.mockBehavior.latencyMs) {
      await new Promise(r => setTimeout(r, this.mockBehavior.latencyMs));
    }

    if (this.mockBehavior.shouldFail) {
      return {
        ok: false,
        latencyMs: this.mockBehavior.latencyMs || 50,
        error: this.mockBehavior.failureError || 'Mock connection error: Server unavailable',
      };
    }

    const models = await this.listModels();
    return {
      ok: true,
      latencyMs: this.mockBehavior.latencyMs || 15,
      availableModelsCount: models.length,
      message: `${this.name} online (${models.length} models)`,
    };
  }

  public async listModels(): Promise<AIModel[]> {
    if (this.mockBehavior.models && this.mockBehavior.models.length > 0) {
      return this.mockBehavior.models;
    }

    const isLocal = this.type === 'local';
    return [
      {
        id: this.config.defaultModel || `${this.id}-model-default`,
        name: `${this.name} Default Model`,
        providerId: this.id,
        contextWindow: 65536,
        capabilities: defaultCapabilities({
          toolCalling: true,
          codeGeneration: true,
          reasoning: true,
        }),
        local: isLocal,
        description: `Custom model served by ${this.name}`,
      },
    ];
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    if (this.mockBehavior.shouldFail) {
      throw new Error(this.mockBehavior.failureError || `${this.name} request failed: Simulated Outage`);
    }

    const text = this.mockBehavior.fixedResponse ||
      `Response from ${this.name} (${request.modelId || 'default'}): Processed ${request.messages.length} messages.`;

    return {
      id: `mock-resp-${Date.now()}`,
      modelId: request.modelId || this.config.defaultModel || 'mock-model',
      providerId: this.id,
      content: text,
      finishReason: 'stop',
      usage: {
        promptTokens: 40,
        completionTokens: 25,
        totalTokens: 65,
      },
      latencyMs: this.mockBehavior.latencyMs || 20,
    };
  }

  public async *stream(request: AIRequest): AsyncIterable<AIEvent> {
    if (this.mockBehavior.shouldFail) {
      yield {
        type: 'error',
        error: this.mockBehavior.failureError || `${this.name} streaming failed: Simulated Outage`,
      };
      return;
    }

    const fullText = this.mockBehavior.fixedResponse || `Response from ${this.name} for task.`;
    const tokens = fullText.split(' ');

    for (const token of tokens) {
      yield { type: 'token', content: token + ' ' };
    }

    yield {
      type: 'finish',
      reason: 'stop',
      usage: { promptTokens: 30, completionTokens: tokens.length, totalTokens: 30 + tokens.length },
    };
  }

  public async *generateWithTools(request: AIToolRequest): AsyncIterable<AIEvent> {
    if (this.mockBehavior.shouldFail) {
      yield {
        type: 'error',
        error: this.mockBehavior.failureError || `${this.name} tool execution failed: Provider Down`,
      };
      return;
    }

    // Check if previous turn has a tool result
    const lastMessage = request.messages[request.messages.length - 1];
    const hasToolResult = lastMessage?.role === 'tool';

    if (hasToolResult) {
      // Complete after tool execution
      yield {
        type: 'token',
        content: `I have processed the tool result. Task completed successfully with ${this.name}.`,
      };
      yield {
        type: 'finish',
        reason: 'stop',
      };
      return;
    }

    // Check if we have a defined tool call sequence or trigger tool
    if (this.mockBehavior.toolCallSequence && this.mockBehavior.toolCallSequence.length > 0) {
      const tc = this.mockBehavior.toolCallSequence[0];
      yield {
        type: 'token',
        content: `Executing ${tc.name} using ${this.name}...`,
      };
      yield {
        type: 'tool_call',
        toolCall: {
          id: `call_${Date.now()}_1`,
          name: tc.name,
          arguments: tc.arguments,
        },
      };
      yield { type: 'finish', reason: 'tool_calls' };
      return;
    }

    // Default intelligent tool calling behavior for test requests
    const userPrompt = request.messages.find(m => m.role === 'user')?.content.toLowerCase() || '';

    if (userPrompt.includes('file') || userPrompt.includes('create') || userPrompt.includes('write')) {
      yield {
        type: 'token',
        content: 'I will write the required file to the workspace.\n',
      };
      yield {
        type: 'tool_call',
        toolCall: {
          id: `call_${Date.now()}_write`,
          name: 'writeFile',
          arguments: {
            path: 'output.txt',
            content: 'Task completed by MaxIDE AI Gateway.\nProvider: ' + this.name,
          },
        },
      };
      yield { type: 'finish', reason: 'tool_calls' };
      return;
    }

    if (userPrompt.includes('read') || userPrompt.includes('inspect')) {
      yield {
        type: 'token',
        content: 'Inspecting the workspace directory...\n',
      };
      yield {
        type: 'tool_call',
        toolCall: {
          id: `call_${Date.now()}_list`,
          name: 'listDir',
          arguments: { path: '.' },
        },
      };
      yield { type: 'finish', reason: 'tool_calls' };
      return;
    }

    // Otherwise standard token stream
    yield {
      type: 'token',
      content: `Completed response from ${this.name} for: "${userPrompt.slice(0, 60)}"`,
    };
    yield { type: 'finish', reason: 'stop' };
  }
}
