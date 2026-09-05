/**
 * MaxIDE - Unlimited AI Provider Platform
 * Base Provider Implementation
 */

import {
  AIProvider,
  AIProviderConfig,
} from '../core/AIProvider.js';
import {
  ProviderType,
  ConnectionResult,
  AIEvent,
} from '../core/types.js';
import { AIModel } from '../core/AIModel.js';
import { AIRequest, AIToolRequest } from '../core/AIRequest.js';
import { AIResponse } from '../core/AIResponse.js';

export abstract class BaseProvider implements AIProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly type: ProviderType;
  public config: AIProviderConfig;
  public isEnabled: boolean;

  constructor(config: AIProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.config = { ...config };
    this.isEnabled = config.isEnabled ?? true;
  }

  public updateConfig(updates: Partial<AIProviderConfig>): void {
    this.config = { ...this.config, ...updates };
    if (updates.isEnabled !== undefined) {
      this.isEnabled = updates.isEnabled;
    }
  }

  abstract validateConnection(): Promise<ConnectionResult>;
  abstract listModels(): Promise<AIModel[]>;
  abstract generate(request: AIRequest): Promise<AIResponse>;
  abstract stream(request: AIRequest): AsyncIterable<AIEvent>;
  abstract generateWithTools(request: AIToolRequest): AsyncIterable<AIEvent>;

  /**
   * Helper: Secure HTTP fetch with timeout and headers
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(options.headers || {});
      if (this.config.headers) {
        for (const [k, v] of Object.entries(this.config.headers)) {
          headers.set(k, v);
        }
      }

      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Helper: Parse Server-Sent Events stream
   */
  protected async *parseSSE(response: Response): AsyncIterable<string> {
    if (!response.body) {
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6).trim();
            if (data === '[DONE]') return;
            yield data;
          }
        }
      }

      if (buffer.trim().startsWith('data: ')) {
        const data = buffer.trim().slice(6).trim();
        if (data !== '[DONE]') {
          yield data;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
