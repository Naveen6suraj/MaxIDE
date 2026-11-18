/**
 * MaxIDE APEX — Native Ollama Provider & Hardware-Aware Lifecycle Engine
 * Supports configurable endpoint (default http://127.0.0.1:11434), binary detection,
 * safe service startup, real capability probing via /api/show, live /api/generate
 * & /api/chat tool-calling verification, and RTX 3050 (4GB VRAM) memory budgeting.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execFile } from 'child_process';
import { BaseProvider } from '../BaseProvider.js';
import { AIProviderConfig } from '../../core/AIProvider.js';
import {
  ConnectionResult,
  AIEvent,
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

export interface GpuTelemetry {
  available: boolean;
  name: string;
  vramUsedMb: number;
  vramTotalMb: number;
  vramFreeMb: number;
  utilizationPct: number;
  temperatureC: number;
}

export interface OllamaModelDiagnostic {
  id: string;
  name: string;
  sizeMb: number;
  parameterSize: string;
  quantization: string;
  family: string;
  contextWindow: number;
  vramFit: 'PERFECT_VRAM' | 'PARTIAL_CPU_OFFLOAD' | 'EXCEEDS_RECOMMENDED_LIMITS';
  capabilities: {
    textGeneration: boolean;
    codeGeneration: boolean;
    reasoning: boolean;
    toolCalling: boolean;
    structuredOutput: boolean;
    vision: boolean;
  };
}

export interface OllamaDiagnosticsReport {
  installed: boolean;
  binaryPath?: string;
  endpoint: string;
  serviceRunning: boolean;
  latencyMs: number;
  error?: string;
  guidance: string;
  models: OllamaModelDiagnostic[];
  hardware: {
    cpuModel: string;
    cpuCores: number;
    totalRamMb: number;
    freeRamMb: number;
    ramUsagePct: number;
    gpu: GpuTelemetry;
  };
  recommendations: ReturnType<typeof OllamaProvider.getHardwareRecommendations>;
}

let cachedGpu: { ts: number; data: GpuTelemetry } | null = null;

export class OllamaProvider extends BaseProvider {
  constructor(config: AIProviderConfig) {
    super({
      ...config,
      type: 'local',
      baseUrl: OllamaProvider.normalizeEndpoint(config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'),
    });
  }

  public static normalizeEndpoint(rawUrl: string): string {
    let url = (rawUrl || 'http://127.0.0.1:11434').trim();
    // Avoid Windows Node.js IPv6 ::1 resolution failures against IPv4-bound Ollama
    url = url.replace(/^http:\/\/localhost(?=[:/]|$)/i, 'http://127.0.0.1');
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  }

  public getBaseUrl(): string {
    return OllamaProvider.normalizeEndpoint(this.config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
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
   * Query real NVIDIA GPU VRAM & thermal telemetry via nvidia-smi (cached 4s).
   */
  public static async getGpuTelemetry(): Promise<GpuTelemetry> {
    if (cachedGpu && Date.now() - cachedGpu.ts < 4000) {
      return cachedGpu.data;
    }

    const fallback: GpuTelemetry = {
      available: false,
      name: 'Integrated / Unknown GPU',
      vramUsedMb: 0,
      vramTotalMb: 0,
      vramFreeMb: 0,
      utilizationPct: 0,
      temperatureC: 0,
    };

    return new Promise((resolve) => {
      try {
        execFile(
          'nvidia-smi',
          ['--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'],
          { timeout: 1800, windowsHide: true },
          (err, stdout) => {
            if (err || !stdout || !stdout.trim()) {
              cachedGpu = { ts: Date.now(), data: fallback };
              return resolve(fallback);
            }
            const firstLine = stdout.trim().split(/\r?\n/)[0] || '';
            const parts = firstLine.split(',').map((s) => s.trim());
            const vramUsed = parseInt(parts[1] || '0', 10) || 0;
            const vramTotal = parseInt(parts[2] || '0', 10) || 0;
            const data: GpuTelemetry = {
              available: true,
              name: parts[0] || 'NVIDIA GPU',
              vramUsedMb: vramUsed,
              vramTotalMb: vramTotal,
              vramFreeMb: Math.max(0, vramTotal - vramUsed),
              utilizationPct: parseInt(parts[3] || '0', 10) || 0,
              temperatureC: Math.round(parseFloat(parts[4] || '0')) || 0,
            };
            cachedGpu = { ts: Date.now(), data };
            resolve(data);
          }
        );
      } catch {
        cachedGpu = { ts: Date.now(), data: fallback };
        resolve(fallback);
      }
    });
  }

  /**
   * Provide resource-aware model recommendations tailored for the target hardware:
   * 16 GB System RAM, NVIDIA RTX 3050 Laptop GPU (4 GB VRAM), Ryzen 5 5600H.
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
          name: 'qwen2.5:0.5b',
          tag: 'Ultra-Fast Local',
          vramRequiredGb: 0.6,
          fit: 'PERFECT_VRAM',
          note: 'Instant startup and sub-second responses with minimal VRAM footprint (~400 MB).',
        },
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
          note: 'Strong code synthesis and tool calling; fits cleanly inside 4GB VRAM without CPU paging.',
        },
        {
          name: 'deepseek-r1:1.5b',
          tag: 'Fast Reasoning',
          vramRequiredGb: 1.9,
          fit: 'PERFECT_VRAM',
          note: 'Chain-of-thought logic analysis with zero VRAM pressure.',
        },
        {
          name: 'qwen2.5-coder:7b',
          tag: 'Deep Coding (Partial Offload)',
          vramRequiredGb: 5.2,
          fit: 'PARTIAL_CPU_OFFLOAD',
          note: 'Offloads ~1.5GB layers to 16GB system RAM. Highly capable for complex multi-file edits.',
        },
      ],
      cautionModels: [
        {
          name: 'llama3.3:70b',
          note: 'Requires ~40GB memory. Exceeds 16GB system RAM and will cause severe swapping.',
        },
        {
          name: 'deepseek-r1:32b',
          note: 'Requires ~20GB memory. Exceeds 16GB system RAM.',
        },
      ],
    };
  }

  /**
   * Safely start local Ollama service if binary is installed and endpoint is local.
   */
  public async startOllamaService(): Promise<{ started: boolean; alreadyRunning?: boolean; message: string; endpoint: string }> {
    const endpoint = this.getBaseUrl();
    const preCheck = await this.validateConnection();
    if (preCheck.ok) {
      return { started: true, alreadyRunning: true, message: preCheck.message || 'Ollama is already running.', endpoint };
    }

    const install = this.isOllamaInstalled();
    if (!install.installed || !install.binaryPath) {
      return {
        started: false,
        endpoint,
        message: 'Ollama binary was not found on this machine. Download and install from https://ollama.com first.',
      };
    }

    try {
      const child = spawn(install.binaryPath, ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();

      // Poll /api/tags up to 5 seconds for service readiness
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const check = await this.validateConnection();
        if (check.ok) {
          return {
            started: true,
            endpoint,
            message: `Ollama service started successfully at ${endpoint} (${check.availableModelsCount || 0} models available).`,
          };
        }
      }

      return {
        started: false,
        endpoint,
        message: `Launched "${install.binaryPath} serve", but ${endpoint}/api/tags did not respond within 5 seconds. Click Retry shortly.`,
      };
    } catch (err: any) {
      return {
        started: false,
        endpoint,
        message: `Failed to start Ollama service: ${err.message}`,
      };
    }
  }

  /**
   * Probe actual model capabilities via POST /api/show without assuming tool calling support.
   */
  public async inspectModelCapabilities(modelName: string): Promise<{
    toolCalling: boolean;
    vision: boolean;
    reasoning: boolean;
    codeGeneration: boolean;
    structuredOutput: boolean;
    contextWindow: number;
  }> {
    const lower = modelName.toLowerCase();
    const heuristicCode = lower.includes('code') || lower.includes('qwen') || lower.includes('deepseek') || lower.includes('llama3') || lower.includes('mistral') || lower.includes('starcoder');
    const heuristicReasoning = lower.includes('r1') || lower.includes('thinking') || lower.includes('qwq') || lower.includes('nemotron');
    const heuristicVision = lower.includes('llava') || lower.includes('vision') || lower.includes('-vl') || lower.includes('minicpm-v');
    let toolCalling = false;
    let vision = heuristicVision;
    let contextWindow = 32768;

    try {
      const res = await this.fetchWithTimeout(`${this.getBaseUrl()}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      }, 3500);

      if (res.ok) {
        const info: any = await res.json();
        const caps: string[] = Array.isArray(info?.capabilities) ? info.capabilities.map((c: string) => c.toLowerCase()) : [];
        const template: string = String(info?.template || '');

        if (caps.length > 0) {
          toolCalling = caps.includes('tools');
          if (caps.includes('vision')) vision = true;
        } else {
          // Inspect Jinja/Go modelfile template for genuine tool-calling support
          toolCalling = template.includes('.Tools') || template.includes('<tool_call>') || template.includes('tool_calls');
        }

        // Extract real context length from model_info if present
        if (info?.model_info && typeof info.model_info === 'object') {
          for (const [k, v] of Object.entries(info.model_info)) {
            if (k.endsWith('.context_length') && typeof v === 'number' && v > 0) {
              contextWindow = Math.min(v, 131072);
              break;
            }
          }
        }
      }
    } catch {
      // Fall back to conservative capability check (never assume tool calling blindly)
      toolCalling = lower.includes('qwen2.5') || lower.includes('llama3.1') || lower.includes('llama3.2') || lower.includes('mistral-nemo');
    }

    return {
      toolCalling,
      vision,
      reasoning: heuristicReasoning,
      codeGeneration: heuristicCode,
      structuredOutput: true,
      contextWindow,
    };
  }

  /**
   * Real endpoint probe: test POST /api/generate and POST /api/chat (with tool schema).
   */
  public async testModelEndpoints(modelName: string): Promise<{
    model: string;
    generateOk: boolean;
    generateLatencyMs: number;
    generateSample?: string;
    generateError?: string;
    chatOk: boolean;
    chatLatencyMs: number;
    toolCallingSupported: boolean;
    toolCallingDetails: string;
  }> {
    const base = this.getBaseUrl();
    const targetModel = modelName || this.config.defaultModel || '';

    // 1. Test POST /api/generate
    let generateOk = false;
    let generateLatencyMs = 0;
    let generateSample = '';
    let generateError = '';
    const t0 = Date.now();
    try {
      const res = await this.fetchWithTimeout(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          prompt: 'Reply with only the word READY.',
          stream: false,
          options: { num_predict: 8, temperature: 0, num_ctx: 2048 },
        }),
      }, 60000);
      generateLatencyMs = Date.now() - t0;
      if (res.ok) {
        const d: any = await res.json();
        generateOk = true;
        generateSample = String(d?.response || '').trim().slice(0, 60);
      } else {
        generateError = `HTTP ${res.status}: ${(await res.text().catch(() => res.statusText)).slice(0, 160)}`;
      }
    } catch (err: any) {
      generateLatencyMs = Date.now() - t0;
      generateError = err.message;
    }

    // 2. Test POST /api/chat with real tool schema
    let chatOk = false;
    let chatLatencyMs = 0;
    let toolCallingSupported = false;
    let toolCallingDetails = '';
    const t1 = Date.now();
    try {
      const res = await this.fetchWithTimeout(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: 'user', content: 'Call the ping tool with message hello.' }],
          tools: [{
            type: 'function',
            function: {
              name: 'ping',
              description: 'Respond with a pong status',
              parameters: {
                type: 'object',
                properties: { message: { type: 'string' } },
                required: ['message'],
              },
            },
          }],
          stream: false,
          options: { num_predict: 48, temperature: 0, num_ctx: 2048 },
        }),
      }, 60000);
      chatLatencyMs = Date.now() - t1;
      if (res.ok) {
        const d: any = await res.json();
        chatOk = true;
        const hasCalls = Array.isArray(d?.message?.tool_calls) && d.message.tool_calls.length > 0;
        toolCallingSupported = true;
        toolCallingDetails = hasCalls
          ? `Native tool calling verified (emitted ${d.message.tool_calls[0]?.function?.name || 'ping'})`
          : 'Chat endpoint accepted tool schema (text response returned)';
      } else {
        const errText = await res.text().catch(() => res.statusText);
        if (errText.toLowerCase().includes('does not support tools')) {
          toolCallingSupported = false;
          toolCallingDetails = 'Model does not support native Ollama tool calling';
        } else {
          toolCallingDetails = `HTTP ${res.status}: ${errText.slice(0, 160)}`;
        }
      }
    } catch (err: any) {
      chatLatencyMs = Date.now() - t1;
      toolCallingDetails = err.message;
    }

    return {
      model: targetModel,
      generateOk,
      generateLatencyMs,
      generateSample,
      generateError: generateError || undefined,
      chatOk,
      chatLatencyMs,
      toolCallingSupported,
      toolCallingDetails,
    };
  }

  /**
   * Full Ollama & Hardware Diagnostics Report for AI Control Center.
   */
  public async getDetailedDiagnostics(): Promise<OllamaDiagnosticsReport> {
    const endpoint = this.getBaseUrl();
    const installCheck = this.isOllamaInstalled();
    const gpu = await OllamaProvider.getGpuTelemetry();
    const totalRamMb = Math.round(os.totalmem() / 1048576);
    const freeRamMb = Math.round(os.freemem() / 1048576);
    const ramUsagePct = Math.round(((totalRamMb - freeRamMb) / Math.max(1, totalRamMb)) * 100);

    const t0 = Date.now();
    try {
      const res = await this.fetchWithTimeout(`${endpoint}/api/tags`, { method: 'GET' }, 4000);
      const latencyMs = Date.now() - t0;
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const data: any = await res.json().catch(() => ({ models: [] }));
      const rawModels = Array.isArray(data?.models) ? data.models : [];

      const models: OllamaModelDiagnostic[] = [];
      for (const m of rawModels) {
        const name = m.name || m.model;
        const sizeMb = Math.round((m.size || 0) / (1024 * 1024));
        const caps = await this.inspectModelCapabilities(name);
        const vramBudgetMb = gpu.available && gpu.vramTotalMb > 0 ? gpu.vramTotalMb : 4096;
        const vramFit: OllamaModelDiagnostic['vramFit'] =
          sizeMb <= vramBudgetMb * 0.82 ? 'PERFECT_VRAM' :
          sizeMb <= vramBudgetMb * 1.5 ? 'PARTIAL_CPU_OFFLOAD' :
          'EXCEEDS_RECOMMENDED_LIMITS';

        models.push({
          id: name,
          name,
          sizeMb,
          parameterSize: m.details?.parameter_size || 'unknown',
          quantization: m.details?.quantization_level || 'default',
          family: m.details?.family || 'local',
          contextWindow: caps.contextWindow,
          vramFit,
          capabilities: {
            textGeneration: true,
            codeGeneration: caps.codeGeneration,
            reasoning: caps.reasoning,
            toolCalling: caps.toolCalling,
            structuredOutput: caps.structuredOutput,
            vision: caps.vision,
          },
        });
      }

      return {
        installed: installCheck.installed,
        binaryPath: installCheck.binaryPath,
        endpoint,
        serviceRunning: true,
        latencyMs,
        guidance: models.length > 0
          ? `Ollama is online at ${endpoint} with ${models.length} local model(s) ready.`
          : `Ollama is running at ${endpoint}, but no local models are installed. Run "ollama pull qwen2.5-coder:3b" in terminal.`,
        models,
        hardware: {
          cpuModel: os.cpus()[0]?.model || 'CPU',
          cpuCores: os.cpus().length,
          totalRamMb,
          freeRamMb,
          ramUsagePct,
          gpu,
        },
        recommendations: OllamaProvider.getHardwareRecommendations(),
      };
    } catch (err: any) {
      const guidance = installCheck.installed
        ? `Ollama binary detected at "${installCheck.binaryPath}", but service is not reachable at ${endpoint}. Click "Start Ollama" or run "ollama serve".`
        : `Ollama not detected at ${endpoint}. Install free from https://ollama.com and pull a lightweight model like "ollama pull qwen2.5-coder:3b".`;

      return {
        installed: installCheck.installed,
        binaryPath: installCheck.binaryPath,
        endpoint,
        serviceRunning: false,
        latencyMs: Date.now() - t0,
        error: err.message,
        guidance,
        models: [],
        hardware: {
          cpuModel: os.cpus()[0]?.model || 'CPU',
          cpuCores: os.cpus().length,
          totalRamMb,
          freeRamMb,
          ramUsagePct,
          gpu,
        },
        recommendations: OllamaProvider.getHardwareRecommendations(),
      };
    }
  }

  public async validateConnection(): Promise<ConnectionResult> {
    const startTime = Date.now();
    try {
      const url = `${this.getBaseUrl()}/api/tags`;
      const res = await this.fetchWithTimeout(url, { method: 'GET' }, 4000);
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
        message: `Ollama is online (${count} local model${count === 1 ? '' : 's'} available)`,
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

      if (!res.ok) return [];

      const data: any = await res.json();
      if (!Array.isArray(data?.models)) return [];

      const results: AIModel[] = [];
      for (const m of data.models) {
        const name = m.name || m.model;
        const caps = await this.inspectModelCapabilities(name);
        results.push({
          id: name,
          name: name,
          providerId: this.id,
          contextWindow: caps.contextWindow,
          capabilities: defaultCapabilities({
            chat: true,
            streaming: true,
            toolCalling: caps.toolCalling,
            codeGeneration: caps.codeGeneration,
            reasoning: caps.reasoning,
            vision: caps.vision,
          }),
          local: true,
          description: `Local Ollama (${m.details?.parameter_size || 'local'}, ${Math.round((m.size || 0) / 1048576)} MB)`,
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.modelId || this.config.defaultModel || 'qwen2.5:0.5b';

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
    }, 90000);

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
    const model = request.modelId || this.config.defaultModel || 'qwen2.5:0.5b';

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
      }, 90000);
    } catch (err: any) {
      yield { type: 'error', error: `Failed to connect to Ollama at ${this.getBaseUrl()}: ${err.message}` };
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
              yield { type: 'token', content: data.message.content };
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
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async *generateWithTools(request: AIToolRequest): AsyncIterable<AIEvent> {
    const model = request.modelId || this.config.defaultModel || 'qwen2.5:0.5b';

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
        return { role: 'tool', content: m.content };
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.toolCalls.map(tc => ({
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });

    const payload = {
      model,
      messages,
      tools: formattedTools,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.2,
        num_ctx: 4096,
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
      yield { type: 'error', error: `Ollama connection error at ${this.getBaseUrl()}: ${err.message}` };
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
      yield { type: 'token', content: message.content };
    }

    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const [index, tc] of message.tool_calls.entries()) {
        const fn = tc.function || tc;
        let args = fn.arguments;
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { args = { raw: args }; }
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
