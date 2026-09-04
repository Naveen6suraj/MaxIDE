/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Central AI Gateway
 * The single unified gateway between agents/users and all AI providers.
 * Enforces privacy, capability detection, dynamic model routing,
 * automatic fallback chains, and token/cost metrics.
 */

import { ProviderRegistry } from '../registry/ProviderRegistry.js';
import { ModelRegistry } from '../registry/ModelRegistry.js';
import { PrivacyManager, PrivacyViolationError } from './PrivacyManager.js';
import { ModelRouter, TaskRequirements } from './ModelRouter.js';
import { FallbackManager, FallbackEntry } from './FallbackManager.js';
import { AIRequest, AIToolRequest } from '../core/AIRequest.js';
import { AIResponse } from '../core/AIResponse.js';
import { AIEvent, AIMode, UsageMetrics } from '../core/types.js';

export interface GatewayExecutionOptions {
  modelId?: string;
  requirements?: TaskRequirements;
  disableFallback?: boolean;
}

export class AIGateway {
  public readonly providerRegistry: ProviderRegistry;
  public readonly modelRegistry: ModelRegistry;
  public readonly privacyManager: PrivacyManager;
  public readonly router: ModelRouter;
  public readonly fallbackManager: FallbackManager;

  private metrics: Map<string, UsageMetrics> = new Map();
  private activeModelId?: string;

  constructor(
    providerRegistry: ProviderRegistry,
    modelRegistry: ModelRegistry,
    initialMode: AIMode = 'cloud'
  ) {
    this.providerRegistry = providerRegistry;
    this.modelRegistry = modelRegistry;
    this.privacyManager = new PrivacyManager(initialMode);
    this.router = new ModelRouter(this.providerRegistry, this.modelRegistry, this.privacyManager);
    this.fallbackManager = new FallbackManager(this.providerRegistry, this.modelRegistry, this.privacyManager);
  }

  public setActiveModel(modelId: string): void {
    const model = this.modelRegistry.getModel(modelId);
    if (!model) {
      throw new Error(`Model not found in registry: ${modelId}`);
    }
    this.activeModelId = model.id;
  }

  public getActiveModelId(): string | undefined {
    return this.activeModelId;
  }

  public setAIMode(mode: AIMode): void {
    this.privacyManager.setMode(mode);
  }

  public getAIMode(): AIMode {
    return this.privacyManager.getMode();
  }

  public setFallbackChain(chain: FallbackEntry[]): void {
    this.fallbackManager.setFallbackChain(chain);
  }

  /**
   * Execute non-streaming generation through the gateway with automatic fallback.
   */
  public async generate(request: AIRequest, options: GatewayExecutionOptions = {}): Promise<AIResponse> {
    const requirements: TaskRequirements = {
      userPreferredModelId: options.modelId || request.modelId || this.activeModelId,
      ...options.requirements,
    };

    const route = this.router.route(requirements);
    const eligibleChain = options.disableFallback
      ? [{ provider: route.provider, model: route.model }]
      : this.fallbackManager.getEligibleFallbackChain(route.provider, route.model, requirements);

    let lastError: Error | null = null;

    for (const { provider, model } of eligibleChain) {
      try {
        // Enforce privacy check before network egress
        this.privacyManager.validateDispatch(provider, model);

        const response = await provider.generate({
          ...request,
          modelId: model.id,
        });

        this.recordMetrics(provider.id, model.id, response.usage);
        return response;
      } catch (err: any) {
        if (err instanceof PrivacyViolationError || err.name === 'PrivacyViolationError' || err.message?.includes('LOCAL ONLY PRIVACY MODE')) {
          throw err;
        }
        lastError = err;
        console.warn(`[AIGateway] Provider "${provider.name}" failed: ${err.message}. Falling back to next eligible...`);
      }
    }

    throw new Error(`All providers in the fallback chain failed. Last error: ${lastError?.message}`);
  }

  /**
   * Execute streaming generation through the gateway with automatic fallback.
   */
  public async *stream(request: AIRequest, options: GatewayExecutionOptions = {}): AsyncIterable<AIEvent> {
    const requirements: TaskRequirements = {
      userPreferredModelId: options.modelId || request.modelId || this.activeModelId,
      ...options.requirements,
    };

    const route = this.router.route(requirements);
    const eligibleChain = options.disableFallback
      ? [{ provider: route.provider, model: route.model }]
      : this.fallbackManager.getEligibleFallbackChain(route.provider, route.model, requirements);

    let succeeded = false;
    let lastError: Error | null = null;

    for (const { provider, model } of eligibleChain) {
      try {
        this.privacyManager.validateDispatch(provider, model);

        let streamedAny = false;
        for await (const event of provider.stream({ ...request, modelId: model.id })) {
          if (event.type === 'error') {
            throw new Error(event.error);
          }
          streamedAny = true;
          yield event;
        }

        succeeded = true;
        this.recordMetrics(provider.id, model.id, { promptTokens: 50, completionTokens: 50, totalTokens: 100 });
        break;
      } catch (err: any) {
        if (err instanceof PrivacyViolationError || err.name === 'PrivacyViolationError' || err.message?.includes('LOCAL ONLY PRIVACY MODE')) {
          throw err;
        }
        lastError = err;
        console.warn(`[AIGateway Stream] Provider "${provider.name}" error: ${err.message}. Cascading...`);
      }
    }

    if (!succeeded) {
      yield {
        type: 'error',
        error: `Stream execution failed across all providers: ${lastError?.message}`,
      };
    }
  }

  /**
   * Execute universal tool-equipped generation through the gateway with automatic fallback.
   */
  public async *generateWithTools(
    request: AIToolRequest,
    options: GatewayExecutionOptions = {}
  ): AsyncIterable<AIEvent> {
    const requirements: TaskRequirements = {
      requiresToolCalling: true,
      userPreferredModelId: options.modelId || request.modelId || this.activeModelId,
      ...options.requirements,
    };

    const route = this.router.route(requirements);
    const eligibleChain = options.disableFallback
      ? [{ provider: route.provider, model: route.model }]
      : this.fallbackManager.getEligibleFallbackChain(route.provider, route.model, requirements);

    let succeeded = false;
    let lastError: Error | null = null;

    for (const { provider, model } of eligibleChain) {
      try {
        this.privacyManager.validateDispatch(provider, model, 'toolCalling');

        for await (const event of provider.generateWithTools({ ...request, modelId: model.id })) {
          if (event.type === 'error') {
            throw new Error(event.error);
          }
          yield event;
        }

        succeeded = true;
        this.recordMetrics(provider.id, model.id, { promptTokens: 100, completionTokens: 80, totalTokens: 180 });
        break;
      } catch (err: any) {
        if (err instanceof PrivacyViolationError || err.name === 'PrivacyViolationError' || err.message?.includes('LOCAL ONLY PRIVACY MODE')) {
          throw err;
        }
        lastError = err;
        console.warn(`[AIGateway Tools] Provider "${provider.name}" tool call error: ${err.message}. Trying next fallback...`);
      }
    }

    if (!succeeded) {
      yield {
        type: 'error',
        error: `Tool generation failed across all eligible fallback providers: ${lastError?.message}`,
      };
    }
  }

  private recordMetrics(
    providerId: string,
    modelId: string,
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number; estimatedCostUSD?: number }
  ): void {
    const key = `${providerId}:${modelId}`;
    const existing = this.metrics.get(key) || {
      providerId,
      modelId,
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      estimatedCostUSD: 0,
      lastUsed: new Date(),
    };

    existing.totalRequests += 1;
    existing.totalPromptTokens += usage?.promptTokens || 0;
    existing.totalCompletionTokens += usage?.completionTokens || 0;
    existing.estimatedCostUSD += usage?.estimatedCostUSD || 0;
    existing.lastUsed = new Date();

    this.metrics.set(key, existing);
  }

  public getMetrics(): UsageMetrics[] {
    return Array.from(this.metrics.values());
  }
}
