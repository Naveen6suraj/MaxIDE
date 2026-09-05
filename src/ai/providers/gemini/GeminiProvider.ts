/**
 * MaxIDE - Unlimited AI Provider Platform
 * Google Gemini Native Adapter
 * Uses v1beta REST API with native function calling and streaming.
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

export class GeminiProvider extends BaseProvider {
  constructor(config: AIProviderConfig) {
    super({
      ...config,
      type: 'cloud',
      baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
    });
  }

  private getApiKey(): string {
    return this.config.apiKey || process.env.GEMINI_API_KEY || '';
  }

  private getBaseUrl(): string {
    let url = this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  public async validateConnection(): Promise<ConnectionResult> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        ok: false,
        latencyMs: 0,
        error: 'No Gemini API key configured',
      };
    }

    try {
      const url = `${this.getBaseUrl()}/models?key=${apiKey}`;
      const res = await this.fetchWithTimeout(url, { method: 'GET' }, 8000);
      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        if (res.status === 429) {
          return { ok: false, latencyMs, error: 'Gemini rate limit reached (HTTP 429)' };
        }
        return { ok: false, latencyMs, error: `Gemini API returned HTTP ${res.status}` };
      }

      const data: any = await res.json();
      const count = Array.isArray(data?.models) ? data.models.length : 0;
      return {
        ok: true,
        latencyMs,
        availableModelsCount: count,
        message: `Gemini connected (${count} models available)`,
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - startTime,
        error: err?.message || 'Failed to connect to Gemini API',
      };
    }
  }

  public async listModels(): Promise<AIModel[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return this.getFallbackModels();
    }

    try {
      const url = `${this.getBaseUrl()}/models?key=${apiKey}`;
      const res = await this.fetchWithTimeout(url, { method: 'GET' }, 8000);
      if (!res.ok) return this.getFallbackModels();

      const data: any = await res.json();
      if (!Array.isArray(data?.models)) return this.getFallbackModels();

      return data.models
        .filter((m: any) => m.name && m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => {
          const rawId = m.name.replace('models/', '');
          return {
            id: rawId,
            name: m.displayName || rawId,
            providerId: this.id,
            contextWindow: m.inputTokenLimit || 1048576,
            maxOutputTokens: m.outputTokenLimit || 8192,
            capabilities: defaultCapabilities({
              chat: true,
              streaming: true,
              toolCalling: true,
              vision: true,
              codeGeneration: true,
              reasoning: rawId.includes('thinking') || rawId.includes('pro'),
            }),
            pricing: {
              input: rawId.includes('flash') ? 0.075 : 1.25,
              output: rawId.includes('flash') ? 0.30 : 5.00,
            },
            local: false,
            description: m.description,
          };
        });
    } catch {
      return this.getFallbackModels();
    }
  }

  private getFallbackModels(): AIModel[] {
    return [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        providerId: this.id,
        contextWindow: 1048576,
        capabilities: defaultCapabilities({ toolCalling: true, vision: true, codeGeneration: true }),
        local: false,
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        providerId: this.id,
        contextWindow: 2097152,
        capabilities: defaultCapabilities({ toolCalling: true, vision: true, codeGeneration: true, reasoning: true }),
        local: false,
      },
    ];
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();
    const model = request.modelId || this.config.defaultModel || 'gemini-2.5-flash';

    const contents = request.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const url = `${this.getBaseUrl()}/models/${model}:generateContent?key=${apiKey}`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini generate failed [${res.status}]: ${err.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || '';
    const latencyMs = Date.now() - startTime;

    return {
      id: `gemini-${Date.now()}`,
      modelId: model,
      providerId: this.id,
      content: text,
      finishReason: candidate?.finishReason || 'STOP',
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
      latencyMs,
    };
  }

  public async *stream(request: AIRequest): AsyncIterable<AIEvent> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      yield { type: 'error', error: 'No Gemini API key configured. Configure GEMINI_API_KEY in Settings (⚙️) or choose a local model like Ollama.' };
      return;
    }
    const model = request.modelId || this.config.defaultModel || 'gemini-2.5-flash';

    const contents = request.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const url = `${this.getBaseUrl()}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      yield { type: 'error', error: `Gemini stream failed [${res.status}]: ${err}` };
      return;
    }

    for await (const chunk of this.parseSSE(res)) {
      try {
        const parsed = JSON.parse(chunk);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          yield { type: 'token', content: text };
        }
      } catch {
        // Skip chunk error
      }
    }

    yield { type: 'finish', reason: 'STOP' };
  }

  public async *generateWithTools(request: AIToolRequest): AsyncIterable<AIEvent> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      yield { type: 'error', error: 'No Gemini API key configured. Configure GEMINI_API_KEY in Settings (⚙️) or choose a local model like Ollama.' };
      return;
    }
    const model = request.modelId || this.config.defaultModel || 'gemini-2.5-flash';

    const functionDeclarations = request.tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const contents: any[] = [];
    for (const m of request.messages) {
      if (m.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: m.name || 'tool',
              response: { content: m.content },
            },
          }],
        });
      } else if (m.toolCalls && m.toolCalls.length > 0) {
        contents.push({
          role: 'model',
          parts: m.toolCalls.map(tc => ({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          })),
        });
      } else {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        });
      }
    }

    const payload: any = {
      contents,
      tools: [{ functionDeclarations }],
    };

    const url = `${this.getBaseUrl()}/models/${model}:generateContent?key=${apiKey}`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      yield { type: 'error', error: `Gemini tool calling failed [${res.status}]: ${err}` };
      return;
    }

    const data: any = await res.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    for (const part of parts) {
      if (part.text) {
        yield { type: 'token', content: part.text };
      }
      if (part.functionCall) {
        yield {
          type: 'tool_call',
          toolCall: {
            id: `call_${Date.now()}_${part.functionCall.name}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
          },
        };
      }
    }

    yield {
      type: 'finish',
      reason: candidate?.finishReason || 'STOP',
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
    };
  }
}
