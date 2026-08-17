export type Provider = 'anthropic' | 'openai' | 'gemini';

export interface TaskRoute {
  provider: Provider;
  model: string;
  /** Providers to try, in order, if the primary fails with a retryable error. */
  fallbacks: Provider[];
}

/** Maps task types (e.g. `agent-loop`, `vision-analysis`) to a default provider + model + fallback chain. */
export type TaskRegistry = Record<string, TaskRoute>;

export interface ProviderPricing {
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
}

/** Per-provider $/token pricing, in cents per million tokens. Plain data — update as provider pricing changes. */
export type PricingTable = Record<Provider, ProviderPricing>;

export interface RouteOverride {
  provider: Provider;
  model: string;
}

export interface ResolvedRoute {
  provider: Provider;
  model: string;
}

/** Resolves the provider+model for a task, applying override-then-default resolution. */
export function resolveTaskRoute(
  registry: TaskRegistry,
  taskType: string,
  override?: RouteOverride,
): ResolvedRoute {
  if (override) {
    return { provider: override.provider, model: override.model };
  }
  const route = registry[taskType];
  if (!route) {
    throw new Error(`unknown task type: ${taskType}`);
  }
  return { provider: route.provider, model: route.model };
}

export interface NormalizedUsage {
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

interface ProviderStreamMessageResult {
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

/**
 * Minimal shape every provider client must satisfy for the router to call it.
 * Method-shorthand form so provider clients with more specific `request`/
 * `handlers` parameter types satisfy it contravariantly.
 */
export interface RoutableClient {
  streamMessage(request: never, handlers: never): Promise<ProviderStreamMessageResult>;
}

export interface RouterClients {
  anthropic: RoutableClient;
  openai: RoutableClient;
  gemini: RoutableClient;
}

/**
 * Placeholder client for a provider with no API key configured. Throws
 * immediately and clearly rather than letting a missing client silently
 * reach the SDK layer. Not retryable — a missing key won't fix itself.
 */
export function createUnconfiguredProviderClient(provider: Provider): RoutableClient {
  return {
    streamMessage: () => Promise.reject(new Error(`provider "${provider}" is not configured`)),
  };
}

export interface Logger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface ModelRouterDeps {
  clients: RouterClients;
  taskRegistry: TaskRegistry;
  pricing: PricingTable;
  /** Model to use for a given provider when it's reached only via fallback (not the task's primary route). */
  fallbackModel: Record<Provider, string>;
  logger: Logger;
}

export interface StreamMessageResult {
  stopReason: string | null;
  usage: NormalizedUsage;
}

/**
 * Default task-type routing (Epic 0.9d). Plain data — extend as new task
 * types are added by the agent core (Epic 2) and planning tools (Epic 3).
 */
export const DEFAULT_TASK_REGISTRY: TaskRegistry = {
  'agent-loop': { provider: 'anthropic', model: 'claude-opus-5', fallbacks: ['openai'] },
  'vision-analysis': { provider: 'gemini', model: 'gemini-3-pro', fallbacks: [] },
  'cost-research': { provider: 'openai', model: 'gpt-5', fallbacks: ['anthropic'] },
  'marketing-plans': { provider: 'anthropic', model: 'claude-opus-5', fallbacks: ['openai'] },
};

/**
 * Default per-provider pricing, in cents per million tokens. Plain data —
 * update as provider pricing changes; never hardcode inline per call site.
 */
export const DEFAULT_PRICING: PricingTable = {
  anthropic: { inputCentsPerMillion: 500, outputCentsPerMillion: 2500 },
  openai: { inputCentsPerMillion: 250, outputCentsPerMillion: 1000 },
  gemini: { inputCentsPerMillion: 125, outputCentsPerMillion: 500 },
};

/** Model used for a provider when it's reached only via fallback, not a task's primary route. */
export const DEFAULT_FALLBACK_MODEL: Record<Provider, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5',
  gemini: 'gemini-3-pro',
};

const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 529]);

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  return status !== undefined && RETRYABLE_STATUSES.has(status);
}

function normalizeUsage(
  pricing: PricingTable,
  provider: Provider,
  model: string,
  result: ProviderStreamMessageResult,
): NormalizedUsage {
  const rates = pricing[provider];
  const costCents =
    (result.inputTokens / 1_000_000) * rates.inputCentsPerMillion +
    (result.outputTokens / 1_000_000) * rates.outputCentsPerMillion;
  return {
    provider,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costCents,
  };
}

/**
 * Multi-provider model router (Epic 0.9d). Single entry point the agent
 * orchestrator calls instead of talking to individual provider clients
 * directly. Resolves a task type to a provider+model (with session override),
 * dispatches to the matching client, retries against the task's configured
 * fallback chain on a retryable failure, and normalizes usage into a common
 * cost-in-cents figure so downstream cost guardrails work off one number
 * regardless of which provider served the request.
 */
export function createModelRouter(deps: ModelRouterDeps) {
  const { clients, taskRegistry, pricing, fallbackModel, logger } = deps;

  async function streamMessage(
    taskType: string,
    request: unknown,
    handlers: unknown,
    override?: RouteOverride,
  ): Promise<StreamMessageResult> {
    const route = resolveTaskRoute(taskRegistry, taskType, override);
    const taskRoute = taskRegistry[taskType];
    const fallbacks = override ? [] : (taskRoute?.fallbacks ?? []);
    const chain: Array<{ provider: Provider; model: string }> = [
      { provider: route.provider, model: route.model },
      ...fallbacks.map((provider) => ({ provider, model: fallbackModel[provider] })),
    ];

    let lastErr: unknown;
    for (const { provider, model } of chain) {
      try {
        const result = await clients[provider].streamMessage(request as never, handlers as never);
        return {
          stopReason: result.stopReason,
          usage: normalizeUsage(pricing, provider, model, result),
        };
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err)) {
          throw err;
        }
        logger.warn(
          { provider, taskType, error: err instanceof Error ? err.message : String(err) },
          'provider failed with retryable error, trying next in fallback chain',
        );
      }
    }

    logger.error(
      { taskType, error: lastErr instanceof Error ? lastErr.message : String(lastErr) },
      'model router exhausted fallback chain',
    );
    throw lastErr;
  }

  return { streamMessage };
}
