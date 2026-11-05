/**
 * MaxIDE - Unlimited AI Provider Platform
 * First-Class Native Ollama Adapter
 * Dynamically discovers models via /api/tags, supports streaming & tool calling.
 * Handles offline state gracefully with retry capability.
 * Includes resource-aware recommendations tailored for Windows & RTX 3050 Laptop GPU (4GB VRAM).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
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

export interface HardwareRecommendation {
  name: string;
  tag: string;
  vramRequiredGb: number;
  fit: 'PERFECT_VRAM' | 'PARTIAL_CPU_OFFLOAD' | 'EXCEEDS_RECOMMENDED_LIMITS';
  note: string;
}

export class OllamaProvider extends BaseProvider {
  constructor(config: AIProviderConfig) {
    super({
      ...config,
      type: 'local',
      baseUrl: config.baseUrl || 'http://localhost:11434',
    });
  }

  private getBaseUrl(): string {
    let url = this.config.baseUrl || 'http://localhost:11434';
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  }

  /**
   * Detect whether the Ollama binary is installed on the host operating system.
   */
  public isOllamaInstalled(): { installed: boolean; binaryPath?: string } {
    if (process.platform === 'win32') {
      const candidates = [
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Ollama', 'ollama.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Ollama', 'ollama.exe'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return { installed: true, binaryPath: p };
        }
      }
    } else {
      const unixCandidates = ['/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/homebrew/bin/ollama'];
      for (const p of unixCandidates) {
        if (fs.existsSync(p)) {
          return { installed: true, binaryPath: p };
        }
      }
    }
    return { installed: false };
  }

  /**
   * Provide resource-aware model recommendations tailored for the target hardware:
   * 16 GB System RAM, NVIDIA RTX 3050 Laptop GPU (4 GB VRAM).
   */
  public static getHardwareRecommendations(): {
    targetGpuVramGb: number;
    targetSystemRamGb: number;
    recommendedModels: HardwareRecommendation[];
    cautionModels: Array<{ name: string; note: string }>;
  } {
    return {
      targetGpuVramGb: 4,
      targetSystemRamGb: 16,
      recommendedModels: [
        {
          name: 'qwen2.5-coder:1.5b',
          tag: 'Fast Coding',
          vramRequiredGb: 1.8,
          fit: 'PERFECT_VRAM',
          note: 'Runs completely in 4GB RTX 3050 VRAM at maximum generation speed.',
        },
        {
          name: 'qwen2.5-coder:3b',
          tag: 'Balanced Coding',
          vramRequiredGb: 2.8,
          fit: 'PERFECT_VRAM',
          note: 'Strong code synthesis, comfortably fits within 4GB VRAM without CPU paging.',
        },
        {
          name: 'deepseek-r1:1.5b',
          tag: 'Fast Reasoning',
          vramRequiredGb: 1.9,
          fit: 'PERFECT_VRAM',
          note: 'Instant chain-of-thought logic analysis with zero VRAM pressure.',
        },
        {
          name: 'nemotron-mini:4b',
          tag: 'Architecture & Instructions',
          vramRequiredGb: 3.2,
          fit: 'PERFECT_VRAM',
          note: 'Compact instruct model designed for laptop GPU deployment.',
        },
        {
          name: 'qwen2.5-coder:7b',
          tag: 'Deep Coding (Partial Offload)',
          vramRequiredGb: 5.2,
          fit: 'PARTIAL_CPU_OFFLOAD',
          note: 'Offloads ~1.5GB layers to 16GB system RAM. Highly capable, runs smoothly on 16GB RAM.',
        },
      ],
      cautionModels: [
        {
          name: 'llama3.3:70b',
          note: 'Requires ~40GB memory. Exceeds 16GB system RAM and will cause heavy swapping.',
        },
        {
          name: 'deepseek-r1:32b',
          note: 'Requires ~20GB memory. Exceeds 16GB system RAM.',
        },
      ],
    };
  }

  public async validateConnection(): Promise<ConnectionResult> {
    const startTime = Date.now();
    try {
      const url = `${this.getBaseUrl()}/api/tags`;
      const res = await this.fetchWithTimeout(url, {
        method: 'GET',
      }, 4000);

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        return {
          ok: false,
          latencyMs,
          error: `Ollama returned HTTP ${res.status}`,
        };
      }

      const data: any = await res.json().catch(() => ({ models: [] }));
      const count = Array.isArray(data?.models) ? data.models.length : 0;

      return {
        ok: true,
        latencyMs,
        availableModelsCount: count,
        message: `Ollama is online (${count} local models available)`,
      };
    } catch (err: any) {
      const installCheck = this.isOllamaInstalled();
      const guidance = installCheck.installed
        ? `Ollama binary was detected at "${installCheck.binaryPath}", but the service is currently stopped. Launch Ollama from the Windows Start Menu or execute 'ollama serve' in your terminal.`
        : `Ollama is not installed or unreachable at ${this.getBaseUrl()}. Install Ollama from https://ollama.com to unlock 100% free offline AI models.`;

      return {
        ok: false,
        latencyMs: Date.now() - startTime,
        error: `Ollama is offline or unreachable at ${this.getBaseUrl()}. ${guidance}`,
      };
    }
  }

  public async listModels(): Promise<AIModel[]> {
    try {
      const url = `${this.getBaseUrl()}/api/tags`;
      const res = await this.fetchWithTimeout(url, { method: 'GET' }, 5000);

      if (!res.ok) {
        return [];
      }

      const data: any = await res.json();
      if (!Array.isArray(data?.models)) {
        return [];
      }

      return data.models.map((m: any) => {
        const name = m.name || m.model;
        const lower = name.toLowerCase();

        const isCoder = lower.includes('code') || lower.includes('deepseek') || lower.includes('qwen');
        const isReasoning = lower.includes('r1') || lower.includes('thinking') || lower.includes('nemotron');
        const isVision = lower.includes('llava') || lower.includes('vision') || lower.includes('vl');

        return {
          id: name,
          name: name,
          providerId: this.id,
          contextWindow: m.details?.context_length || 32768,
          capabilities: defaultCapabilities({
            chat: true,
            streaming: true,
            toolCalling: true,
            codeGeneration: true,
            reasoning: isReasoning,
            vision: isVision,
          }),
          local: true,
          description: `Local Ollama model (${m.details?.parameter_size || 'local'})`,
        };
      });
    } catch {
      // Graceful failure - Ollama may be offline
      return [];
    }
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.modelId || this.config.defaultModel || 'llama3';

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens,
      },
    };

    const res = await this.fetchWithTimeout(`${this.getBaseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Ollama request failed [${res.status}]: ${err.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const latencyMs = Date.now() - startTime;

    return {
      id: `ollama-${Date.now()}`,
      modelId: model,
      providerId: this.id,
      content: data.message?.content || '',
      finishReason: data.done ? 'stop' : 'unknown',
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      latencyMs,
    };
  }

  public async *stream(request: AIRequest): AsyncIterable<AIEvent> {
    const model = request.modelId || this.config.defaultModel || 'llama3';

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens,
      },
    };

    let res: Response;
    try {
      res = await this.fetchWithTimeout(`${this.getBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      yield { type: 'error', error: `Failed to connect to Ollama: ${err.message}` };
      return;
    }

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      yield { type: 'error', error: `Ollama stream error [${res.status}]: ${err}` };
      return;
    }

    if (!res.body) return;
    const reader = res.body.getReader();
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
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.message?.content) {
              yield {
                type: 'token',
                content: data.message.content,
              };
            }
            if (data.done) {
              yield {
                type: 'finish',
                reason: 'stop',
                usage: {
                  promptTokens: data.prompt_eval_count,
                  completionTokens: data.eval_count,
                  totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
                },
              };
            }
          } catch {
            // Ignore parse errors on partial JSON chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async *generateWithTools(request: AIToolRequest): AsyncIterable<AIEvent> {
    const model = request.modelId || this.config.defaultModel || 'llama3';

    // Ollama supports OpenAI-compatible /v1/chat/completions or native /api/chat with tools
    const formattedTools = request.tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const messages = request.messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
        };
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.toolCalls.map(tc => ({
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

    const payload = {
      model,
      messages,
      tools: formattedTools,
      stream: false, // For tool calling in Ollama, stream: false ensures clean tool_calls extraction
      options: {
        temperature: request.temperature ?? 0.2,
      },
    };

    let res: Response;
    try {
      res = await this.fetchWithTimeout(`${this.getBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, 120000);
    } catch (err: any) {
      yield { type: 'error', error: `Ollama connection error: ${err.message}` };
      return;
    }

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      yield { type: 'error', error: `Ollama tool error [${res.status}]: ${err}` };
      return;
    }

    const data: any = await res.json();
    const message = data.message;

    if (message?.content) {
      yield {
        type: 'token',
        content: message.content,
      };
    }

    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const [index, tc] of message.tool_calls.entries()) {
        const fn = tc.function || tc;
        let args = fn.arguments;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            args = { raw: args };
          }
        }
        yield {
          type: 'tool_call',
          toolCall: {
            id: `call_${Date.now()}_${index}`,
            name: fn.name,
            arguments: args || {},
          },
        };
      }
    }

    yield {
      type: 'finish',
      reason: message?.tool_calls?.length ? 'tool_calls' : 'stop',
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }
}
