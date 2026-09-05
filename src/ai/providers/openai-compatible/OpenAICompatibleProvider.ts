/**
 * MaxIDE - Unlimited AI Provider Platform
 * OpenAI-Compatible Generic Adapter
 * Supports: LM Studio, vLLM, LocalAI, OpenRouter, Cerebras, Together,
 * Nemotron endpoints, custom self-hosted endpoints, enterprise gateways.
 */

import { BaseProvider } from '../BaseProvider.js';
import {
  AIProviderConfig,
} from '../../core/AIProvider.js';
import {
  ConnectionResult,
  AIEvent,
  ToolCall,
} from '../../core/types.js';
import { AIModel, defaultCapabilities } from '../../core/AIModel.js';
import { AIRequest, AIToolRequest } from '../../core/AIRequest.js';
import { AIResponse } from '../../core/AIResponse.js';

export class OpenAICompatibleProvider extends BaseProvider {
  constructor(config: AIProviderConfig) {
    super({
      ...config,
      type: config.type || (config.baseUrl?.includes('localhost') || config.baseUrl?.includes('127.0.0.1') ? 'local' : 'cloud'),
    });
  }

  private getBaseUrl(): string {
    let url = this.config.baseUrl || 'https://api.openai.com/v1';
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey && this.config.apiKey.trim().length > 0) {
      headers['Authorization'] = `Bearer ${this.config.apiKey.trim()}`;
    }
    if (this.config.organizationId) {
      headers['OpenAI-Organization'] = this.config.organizationId;
    }
    if (this.config.projectId) {
      headers['OpenAI-Project'] = this.config.projectId;
    }
    return headers;
  }

  public async validateConnection(): Promise<ConnectionResult> {
    const startTime = Date.now();
    try {
      const url = `${this.getBaseUrl()}/models`;
      const res = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      }, 8000);

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        // Some servers don't support GET /models but work for /chat/completions
        if (res.status === 404 || res.status === 405) {
          return {
            ok: true,
            latencyMs,
            message: `Endpoint responded (${res.status}), models endpoint unavailable.`,
          };
        }
        const errorText = await res.text().catch(() => res.statusText);
        return {
          ok: false,
          latencyMs,
          error: `HTTP ${res.status}: ${errorText.slice(0, 150)}`,
        };
      }

      const data: any = await res.json().catch(() => null);
      const modelCount = Array.isArray(data?.data) ? data.data.length : 0;

      return {
        ok: true,
        latencyMs,
        availableModelsCount: modelCount,
        message: `Connected successfully (${modelCount} models found)`,
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - startTime,
        error: err?.message || 'Connection failed or timed out',
      };
    }
  }

  public async listModels(): Promise<AIModel[]> {
    try {
      const url = `${this.getBaseUrl()}/models`;
      const res = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      }, 10000);

      if (!res.ok) {
        if (this.config.defaultModel) {
          return [this.createFallbackModel(this.config.defaultModel)];
        }
        return [];
      }

      const json: any = await res.json();
      const rawList = Array.isArray(json?.data) ? json.data : [];

      const isLocal = this.type === 'local' ||
        this.getBaseUrl().includes('localhost') ||
        this.getBaseUrl().includes('127.0.0.1');

      return rawList.map((m: any) => {
        const id = typeof m === 'string' ? m : m.id || m.name || 'unknown';
        const isNemotron = id.toLowerCase().includes('nemotron');
        const isCodeModel = id.toLowerCase().includes('code') || id.toLowerCase().includes('coder');

        return {
          id,
          name: m.name || id,
          providerId: this.id,
          contextWindow: m.context_length || (isNemotron ? 131072 : 32768),
          capabilities: defaultCapabilities({
            toolCalling: true,
            codeGeneration: true,
            reasoning: isNemotron || id.toLowerCase().includes('r1') || id.toLowerCase().includes('reasoning'),
            vision: id.toLowerCase().includes('vision') || id.toLowerCase().includes('vl'),
          }),
          local: isLocal,
          description: `Provided by ${this.name}`,
        };
      });
    } catch {
      if (this.config.defaultModel) {
        return [this.createFallbackModel(this.config.defaultModel)];
      }
      return [];
    }
  }

  private createFallbackModel(modelId: string): AIModel {
    return {
      id: modelId,
      name: modelId,
      providerId: this.id,
      contextWindow: 32768,
      capabilities: defaultCapabilities({
        toolCalling: true,
        codeGeneration: true,
      }),
      local: this.type === 'local',
      description: `Configured default model for ${this.name}`,
    };
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.modelId || this.config.defaultModel || 'gpt-4o-mini';

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        name: m.name,
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stop: request.stop,
    };

    const res = await this.fetchWithTimeout(`${this.getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI-compatible request failed [${res.status}]: ${err.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    const latencyMs = Date.now() - startTime;

    return {
      id: data.id || `resp-${Date.now()}`,
      modelId: data.model || model,
      providerId: this.id,
      content: choice?.message?.content || '',
      finishReason: choice?.finish_reason || 'stop',
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      latencyMs,
    };
  }

  public async *stream(request: AIRequest): AsyncIterable<AIEvent> {
    const model = request.modelId || this.config.defaultModel || 'gpt-4o-mini';

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        name: m.name,
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stop: request.stop,
      stream: true,
    };

    const res = await this.fetchWithTimeout(`${this.getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      yield {
        type: 'error',
        error: `OpenAI-compatible stream error [${res.status}]: ${err.slice(0, 300)}`,
      };
      return;
    }

    let finishReason = 'stop';

    for await (const chunk of this.parseSSE(res)) {
      try {
        const parsed = JSON.parse(chunk);
        const delta = parsed.choices?.[0]?.delta;
        const reason = parsed.choices?.[0]?.finish_reason;

        if (delta?.content) {
          yield {
            type: 'token',
            content: delta.content,
          };
        }

        if (reason) {
          finishReason = reason;
        }
      } catch {
        // Skip malformed JSON
      }
    }

    yield {
      type: 'finish',
      reason: finishReason,
    };
  }

  public async *generateWithTools(request: AIToolRequest): AsyncIterable<AIEvent> {
    const model = request.modelId || this.config.defaultModel || 'gpt-4o-mini';

    const formattedTools = request.tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const formattedMessages = request.messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.toolCallId || 'call_default',
        };
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return {
        role: m.role,
        content: m.content,
        name: m.name,
      };
    });

    const payload: Record<string, any> = {
      model,
      messages: formattedMessages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens,
      stream: true,
    };

    if (formattedTools.length > 0) {
      payload.tools = formattedTools;
      if (request.toolChoice) {
        payload.tool_choice = request.toolChoice;
      }
    }

    const res = await this.fetchWithTimeout(`${this.getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      yield {
        type: 'error',
        error: `Tool generation failed [${res.status}]: ${err.slice(0, 300)}`,
      };
      return;
    }

    // Accumulate tool calls across chunks
    const pendingToolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
    let finishReason = 'stop';

    for await (const chunk of this.parseSSE(res)) {
      try {
        const parsed = JSON.parse(chunk);
        const choice = parsed.choices?.[0];
        const delta = choice?.delta;

        if (delta?.content) {
          yield {
            type: 'token',
            content: delta.content,
          };
        }

        if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            if (!pendingToolCalls.has(index)) {
              pendingToolCalls.set(index, {
                id: tc.id || `call_${Date.now()}_${index}`,
                name: tc.function?.name || '',
                args: tc.function?.arguments || '',
              });
            } else {
              const current = pendingToolCalls.get(index)!;
              if (tc.id) current.id = tc.id;
              if (tc.function?.name) current.name += tc.function.name;
              if (tc.function?.arguments) current.args += tc.function.arguments;
            }
          }
        }

        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
      } catch {
        // Skip malformed chunk
      }
    }

    // Emit accumulated tool calls
    for (const [, toolCall] of pendingToolCalls) {
      let parsedArgs: Record<string, any> = {};
      try {
        parsedArgs = JSON.parse(toolCall.args || '{}');
      } catch {
        parsedArgs = { raw: toolCall.args };
      }

      yield {
        type: 'tool_call',
        toolCall: {
          id: toolCall.id,
          name: toolCall.name,
          arguments: parsedArgs,
        },
      };
    }

    yield {
      type: 'finish',
      reason: pendingToolCalls.size > 0 ? 'tool_calls' : finishReason,
    };
  }
}
