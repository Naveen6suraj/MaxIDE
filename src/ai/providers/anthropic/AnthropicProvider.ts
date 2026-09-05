/**
 * MaxIDE - Unlimited AI Provider Platform
 * Anthropic Claude Native Adapter
 * Uses Claude Messages API (/v1/messages) with tool calling and streaming.
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

export class AnthropicProvider extends BaseProvider {
  constructor(config: AIProviderConfig) {
    super({
      ...config,
      type: 'cloud',
      baseUrl: config.baseUrl || 'https://api.anthropic.com/v1',
      defaultModel: config.defaultModel || 'claude-3-5-sonnet-20241022',
    });
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    const key = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      headers['x-api-key'] = key;
    }
    return headers;
  }

  public async validateConnection(): Promise<ConnectionResult> {
    const startTime = Date.now();
    const key = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return { ok: false, latencyMs: 0, error: 'No Anthropic API key provided' };
    }

    try {
      // Test with minimal request
      const res = await this.fetchWithTimeout(`${this.config.baseUrl || 'https://api.anthropic.com/v1'}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.defaultModel || 'claude-3-5-haiku-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      }, 8000);

      const latencyMs = Date.now() - startTime;
      if (res.ok || res.status === 200) {
        return { ok: true, latencyMs, message: 'Anthropic Claude connected' };
      }
      return { ok: false, latencyMs, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - startTime, error: err?.message };
    }
  }

  public async listModels(): Promise<AIModel[]> {
    return [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        providerId: this.id,
        contextWindow: 200000,
        capabilities: defaultCapabilities({ toolCalling: true, vision: true, codeGeneration: true, reasoning: true }),
        pricing: { input: 3.00, output: 15.00 },
        local: false,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        providerId: this.id,
        contextWindow: 200000,
        capabilities: defaultCapabilities({ toolCalling: true, vision: true, codeGeneration: true }),
        pricing: { input: 0.80, output: 4.00 },
        local: false,
      },
    ];
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.modelId || this.config.defaultModel || 'claude-3-5-sonnet-20241022';

    const systemMsg = request.messages.find(m => m.role === 'system');
    const userMsgs = request.messages.filter(m => m.role !== 'system');

    const payload: any = {
      model,
      max_tokens: request.maxTokens || 4096,
      messages: userMsgs.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
    };
    if (systemMsg) payload.system = systemMsg.content;

    const res = await this.fetchWithTimeout(`${this.config.baseUrl || 'https://api.anthropic.com/v1'}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error [${res.status}]: ${err.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const textPart = data.content?.find((c: any) => c.type === 'text')?.text || '';

    return {
      id: data.id,
      modelId: model,
      providerId: this.id,
      content: textPart,
      finishReason: data.stop_reason || 'end_turn',
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      latencyMs: Date.now() - startTime,
    };
  }

  public async *stream(request: AIRequest): AsyncIterable<AIEvent> {
    const model = request.modelId || this.config.defaultModel || 'claude-3-5-sonnet-20241022';
    const systemMsg = request.messages.find(m => m.role === 'system');
    const userMsgs = request.messages.filter(m => m.role !== 'system');

    const payload: any = {
      model,
      max_tokens: request.maxTokens || 4096,
      messages: userMsgs.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      stream: true,
    };
    if (systemMsg) payload.system = systemMsg.content;

    const res = await this.fetchWithTimeout(`${this.config.baseUrl || 'https://api.anthropic.com/v1'}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      yield { type: 'error', error: `Anthropic stream error: ${err}` };
      return;
    }

    for await (const chunk of this.parseSSE(res)) {
      try {
        const parsed = JSON.parse(chunk);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          yield { type: 'token', content: parsed.delta.text };
        }
      } catch {
        // Skip
      }
    }
    yield { type: 'finish', reason: 'end_turn' };
  }

  public async *generateWithTools(request: AIToolRequest): AsyncIterable<AIEvent> {
    const model = request.modelId || this.config.defaultModel || 'claude-3-5-sonnet-20241022';
    const tools = request.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const systemMsg = request.messages.find(m => m.role === 'system');
    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'tool') {
          return {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: m.toolCallId || 'tool_default',
              content: m.content,
            }],
          };
        }
        if (m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'assistant',
            content: m.toolCalls.map(tc => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            })),
          };
        }
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        };
      });

    const payload: any = {
      model,
      max_tokens: request.maxTokens || 4096,
      messages,
      tools,
    };
    if (systemMsg) payload.system = systemMsg.content;

    const res = await this.fetchWithTimeout(`${this.config.baseUrl || 'https://api.anthropic.com/v1'}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      yield { type: 'error', error: `Anthropic tool call failed: ${err}` };
      return;
    }

    const data: any = await res.json();
    for (const block of data.content || []) {
      if (block.type === 'text') {
        yield { type: 'token', content: block.text };
      } else if (block.type === 'tool_use') {
        yield {
          type: 'tool_call',
          toolCall: {
            id: block.id,
            name: block.name,
            arguments: block.input || {},
          },
        };
      }
    }

    yield {
      type: 'finish',
      reason: data.stop_reason || 'tool_use',
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }
}
