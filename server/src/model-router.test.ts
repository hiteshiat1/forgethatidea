import { describe, it, expect, vi } from 'vitest';
import {
  createModelRouter,
  resolveTaskRoute,
  createUnconfiguredProviderClient,
  type TaskRegistry,
  type PricingTable,
} from './model-router.js';

const TASK_REGISTRY: TaskRegistry = {
  'agent-loop': { provider: 'anthropic', model: 'claude-opus-5', fallbacks: ['openai'] },
  'vision-analysis': { provider: 'gemini', model: 'gemini-3-pro', fallbacks: [] },
  'cost-research': { provider: 'openai', model: 'gpt-5', fallbacks: ['anthropic', 'gemini'] },
};

const PRICING: PricingTable = {
  anthropic: { inputCentsPerMillion: 500, outputCentsPerMillion: 2500 },
  openai: { inputCentsPerMillion: 250, outputCentsPerMillion: 1000 },
  gemini: { inputCentsPerMillion: 125, outputCentsPerMillion: 500 },
};

const FALLBACK_MODEL: Record<'anthropic' | 'openai' | 'gemini', string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5',
  gemini: 'gemini-3-pro',
};

function silentLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
}

describe('resolveTaskRoute', () => {
  it('returns the task-type default provider and model when no override is given', () => {
    const route = resolveTaskRoute(TASK_REGISTRY, 'agent-loop');
    expect(route).toEqual({ provider: 'anthropic', model: 'claude-opus-5' });
  });

  it('applies a session override over the task-type default', () => {
    const route = resolveTaskRoute(TASK_REGISTRY, 'agent-loop', {
      provider: 'openai',
      model: 'gpt-5',
    });
    expect(route).toEqual({ provider: 'openai', model: 'gpt-5' });
  });

  it('throws for an unknown task type', () => {
    expect(() => resolveTaskRoute(TASK_REGISTRY, 'unknown-task' as never)).toThrow(
      /unknown task type/i,
    );
  });
});

describe('createModelRouter', () => {
  it('calls the resolved provider client and returns normalized usage', async () => {
    const anthropic = {
      streamMessage: vi
        .fn()
        .mockResolvedValue({ inputTokens: 1000, outputTokens: 500, stopReason: 'end_turn' }),
    };
    const openai = { streamMessage: vi.fn() };
    const gemini = { streamMessage: vi.fn() };
    const router = createModelRouter({
      clients: { anthropic, openai, gemini },
      taskRegistry: TASK_REGISTRY,
      pricing: PRICING,
      fallbackModel: FALLBACK_MODEL,
      logger: silentLogger(),
    });

    const result = await router.streamMessage(
      'agent-loop',
      { maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      {},
    );

    expect(anthropic.streamMessage).toHaveBeenCalledTimes(1);
    expect(openai.streamMessage).not.toHaveBeenCalled();
    expect(result.usage).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5',
      inputTokens: 1000,
      outputTokens: 500,
      // 1000 * 500/1e6 + 500 * 2500/1e6 = 0.5 + 1.25 = 1.75 cents
      costCents: 1.75,
    });
  });

  it('routes to the session-overridden provider instead of the task default', async () => {
    const anthropic = { streamMessage: vi.fn() };
    const openai = {
      streamMessage: vi
        .fn()
        .mockResolvedValue({ inputTokens: 10, outputTokens: 10, stopReason: 'stop' }),
    };
    const gemini = { streamMessage: vi.fn() };
    const router = createModelRouter({
      clients: { anthropic, openai, gemini },
      taskRegistry: TASK_REGISTRY,
      pricing: PRICING,
      fallbackModel: FALLBACK_MODEL,
      logger: silentLogger(),
    });

    await router.streamMessage(
      'agent-loop',
      { maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      {},
      { provider: 'openai', model: 'gpt-5' },
    );

    expect(openai.streamMessage).toHaveBeenCalledTimes(1);
    expect(anthropic.streamMessage).not.toHaveBeenCalled();
  });

  it('falls back to the next configured provider when the primary fails with a retryable error', async () => {
    const retryableErr = Object.assign(new Error('overloaded'), { status: 529 });
    const anthropic = { streamMessage: vi.fn().mockRejectedValue(retryableErr) };
    const openai = {
      streamMessage: vi
        .fn()
        .mockResolvedValue({ inputTokens: 5, outputTokens: 5, stopReason: 'stop' }),
    };
    const gemini = { streamMessage: vi.fn() };
    const router = createModelRouter({
      clients: { anthropic, openai, gemini },
      taskRegistry: TASK_REGISTRY,
      pricing: PRICING,
      fallbackModel: FALLBACK_MODEL,
      logger: silentLogger(),
    });

    const result = await router.streamMessage(
      'agent-loop',
      { maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      {},
    );

    expect(anthropic.streamMessage).toHaveBeenCalledTimes(1);
    expect(openai.streamMessage).toHaveBeenCalledTimes(1);
    expect(result.usage.provider).toBe('openai');
  });

  it('does not fall back on a non-retryable error', async () => {
    const nonRetryableErr = Object.assign(new Error('bad request'), { status: 400 });
    const anthropic = { streamMessage: vi.fn().mockRejectedValue(nonRetryableErr) };
    const openai = { streamMessage: vi.fn() };
    const gemini = { streamMessage: vi.fn() };
    const router = createModelRouter({
      clients: { anthropic, openai, gemini },
      taskRegistry: TASK_REGISTRY,
      pricing: PRICING,
      fallbackModel: FALLBACK_MODEL,
      logger: silentLogger(),
    });

    await expect(
      router.streamMessage(
        'agent-loop',
        { maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
        {},
      ),
    ).rejects.toThrow('bad request');
    expect(openai.streamMessage).not.toHaveBeenCalled();
  });

  it('throws after exhausting the entire fallback chain', async () => {
    const retryableErr = Object.assign(new Error('overloaded'), { status: 529 });
    const openai = { streamMessage: vi.fn().mockRejectedValue(retryableErr) };
    const anthropic = { streamMessage: vi.fn().mockRejectedValue(retryableErr) };
    const gemini = { streamMessage: vi.fn().mockRejectedValue(retryableErr) };
    const router = createModelRouter({
      clients: { anthropic, openai, gemini },
      taskRegistry: TASK_REGISTRY,
      pricing: PRICING,
      fallbackModel: FALLBACK_MODEL,
      logger: silentLogger(),
    });

    await expect(
      router.streamMessage(
        'cost-research',
        { maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
        {},
      ),
    ).rejects.toThrow('overloaded');

    expect(openai.streamMessage).toHaveBeenCalledTimes(1);
    expect(anthropic.streamMessage).toHaveBeenCalledTimes(1);
    expect(gemini.streamMessage).toHaveBeenCalledTimes(1);
  });

  it('normalizes usage consistently across all three providers', async () => {
    const anthropic = {
      streamMessage: vi
        .fn()
        .mockResolvedValue({ inputTokens: 2_000_000, outputTokens: 0, stopReason: 'end_turn' }),
    };
    const openai = {
      streamMessage: vi
        .fn()
        .mockResolvedValue({ inputTokens: 2_000_000, outputTokens: 0, stopReason: 'stop' }),
    };
    const gemini = {
      streamMessage: vi
        .fn()
        .mockResolvedValue({ inputTokens: 2_000_000, outputTokens: 0, stopReason: 'STOP' }),
    };
    const router = createModelRouter({
      clients: { anthropic, openai, gemini },
      taskRegistry: TASK_REGISTRY,
      pricing: PRICING,
      fallbackModel: FALLBACK_MODEL,
      logger: silentLogger(),
    });

    const anthropicResult = await router.streamMessage(
      'agent-loop',
      { maxTokens: 1, messages: [] },
      {},
    );
    const openaiResult = await router.streamMessage(
      'cost-research',
      { maxTokens: 1, messages: [] },
      {},
    );
    const geminiResult = await router.streamMessage(
      'vision-analysis',
      { maxTokens: 1, messages: [] },
      {},
    );

    // 2M input tokens * pricePerMillion, output 0.
    expect(anthropicResult.usage.costCents).toBe(1000); // 2 * 500
    expect(openaiResult.usage.costCents).toBe(500); // 2 * 250
    expect(geminiResult.usage.costCents).toBe(250); // 2 * 125
  });

  it('surfaces a clear error when a task routes to an unconfigured provider', async () => {
    const anthropic = {
      streamMessage: vi
        .fn()
        .mockResolvedValue({ inputTokens: 1, outputTokens: 1, stopReason: 'end_turn' }),
    };
    const router = createModelRouter({
      clients: {
        anthropic,
        openai: createUnconfiguredProviderClient('openai'),
        gemini: createUnconfiguredProviderClient('gemini'),
      },
      taskRegistry: TASK_REGISTRY,
      pricing: PRICING,
      fallbackModel: FALLBACK_MODEL,
      logger: silentLogger(),
    });

    await expect(
      router.streamMessage('vision-analysis', { maxTokens: 100, messages: [] }, {}),
    ).rejects.toThrow(/gemini.*not configured/i);
  });
});
