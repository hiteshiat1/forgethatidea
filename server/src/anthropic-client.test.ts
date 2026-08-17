import { describe, it, expect, vi } from 'vitest';
import { createAnthropicClient, type MessageStreamEvent } from './anthropic-client.js';

/** Builds a fake SDK client whose `messages.stream` yields the given events. */
function fakeSdkClient(
  events: MessageStreamEvent[],
  usage = { input_tokens: 10, output_tokens: 5 },
) {
  return {
    messages: {
      stream: vi.fn(() => {
        async function* iterate() {
          for (const event of events) yield event;
        }
        return {
          [Symbol.asyncIterator]: iterate,
          finalMessage: async () => ({
            id: 'msg_1',
            stop_reason: 'end_turn',
            usage,
            content: [],
          }),
        };
      }),
    },
  };
}

describe('createAnthropicClient', () => {
  it('streams text deltas to the provided handler', async () => {
    const sdk = fakeSdkClient([
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } },
    ]);
    const client = createAnthropicClient({ sdkClient: sdk as never, logger: silentLogger() });

    const chunks: string[] = [];
    await client.streamMessage(
      { model: 'claude-opus-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      { onText: (t) => chunks.push(t) },
    );

    expect(chunks.join('')).toBe('Hello');
  });

  it('surfaces tool_use blocks to the dispatcher via onToolUse', async () => {
    const sdk = fakeSdkClient([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: {} },
      },
    ]);
    const client = createAnthropicClient({ sdkClient: sdk as never, logger: silentLogger() });

    const toolUses: unknown[] = [];
    await client.streamMessage(
      { model: 'claude-opus-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      { onToolUse: (block) => toolUses.push(block) },
    );

    expect(toolUses).toEqual([{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: {} }]);
  });

  it('logs token usage per request', async () => {
    const sdk = fakeSdkClient([], { input_tokens: 42, output_tokens: 7 });
    const logger = silentLogger();
    const client = createAnthropicClient({ sdkClient: sdk as never, logger });

    await client.streamMessage(
      { model: 'claude-opus-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      {},
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 42, outputTokens: 7 }),
      expect.any(String),
    );
  });

  it('resolves with usage and stop reason for the caller', async () => {
    const sdk = fakeSdkClient([], { input_tokens: 42, output_tokens: 7 });
    const client = createAnthropicClient({ sdkClient: sdk as never, logger: silentLogger() });

    const result = await client.streamMessage(
      { model: 'claude-opus-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      {},
    );

    expect(result).toEqual({ inputTokens: 42, outputTokens: 7, stopReason: 'end_turn' });
  });

  it('retries transient failures with backoff, then succeeds', async () => {
    let attempts = 0;
    const sdk = {
      messages: {
        stream: vi.fn(() => {
          attempts++;
          if (attempts < 3) {
            const err = new Error('overloaded') as Error & { status: number };
            err.status = 529;
            throw err;
          }
          async function* iterate() {
            yield {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'ok' },
            };
          }
          return {
            [Symbol.asyncIterator]: iterate,
            finalMessage: async () => ({
              id: 'msg_1',
              stop_reason: 'end_turn',
              usage: { input_tokens: 1, output_tokens: 1 },
              content: [],
            }),
          };
        }),
      },
    };
    const client = createAnthropicClient({
      sdkClient: sdk as never,
      logger: silentLogger(),
      retry: { maxRetries: 3, baseDelayMs: 0 },
    });

    const chunks: string[] = [];
    await client.streamMessage(
      { model: 'claude-opus-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      { onText: (t) => chunks.push(t) },
    );

    expect(attempts).toBe(3);
    expect(chunks.join('')).toBe('ok');
  });

  it('does not retry non-retryable errors', async () => {
    const sdk = {
      messages: {
        stream: vi.fn(() => {
          const err = new Error('bad request') as Error & { status: number };
          err.status = 400;
          throw err;
        }),
      },
    };
    const client = createAnthropicClient({
      sdkClient: sdk as never,
      logger: silentLogger(),
      retry: { maxRetries: 3, baseDelayMs: 0 },
    });

    await expect(
      client.streamMessage(
        { model: 'claude-opus-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
        {},
      ),
    ).rejects.toThrow('bad request');
    expect(sdk.messages.stream).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries on persistent transient failures', async () => {
    const sdk = {
      messages: {
        stream: vi.fn(() => {
          const err = new Error('overloaded') as Error & { status: number };
          err.status = 529;
          throw err;
        }),
      },
    };
    const client = createAnthropicClient({
      sdkClient: sdk as never,
      logger: silentLogger(),
      retry: { maxRetries: 2, baseDelayMs: 0 },
    });

    await expect(
      client.streamMessage(
        { model: 'claude-opus-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
        {},
      ),
    ).rejects.toThrow('overloaded');
    expect(sdk.messages.stream).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

function silentLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
}
