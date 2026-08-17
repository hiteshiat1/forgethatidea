import { describe, it, expect, vi } from 'vitest';
import { createOpenAiClient, type ChatCompletionStreamEvent } from './openai-client.js';

/** Builds a fake SDK client whose `chat.completions.stream` yields the given events. */
function fakeSdkClient(
  events: ChatCompletionStreamEvent[],
  usage = { prompt_tokens: 10, completion_tokens: 5 },
) {
  return {
    chat: {
      completions: {
        stream: vi.fn(() => {
          async function* iterate() {
            for (const event of events) yield event;
          }
          return {
            [Symbol.asyncIterator]: iterate,
            finalChatCompletion: async () => ({
              id: 'chatcmpl_1',
              choices: [{ finish_reason: 'stop' }],
              usage,
            }),
          };
        }),
      },
    },
  };
}

describe('createOpenAiClient', () => {
  it('streams text deltas to the provided handler', async () => {
    const sdk = fakeSdkClient([
      { choices: [{ index: 0, delta: { content: 'Hel' } }] },
      { choices: [{ index: 0, delta: { content: 'lo' } }] },
    ]);
    const client = createOpenAiClient({ sdkClient: sdk as never, logger: silentLogger() });

    const chunks: string[] = [];
    await client.streamMessage(
      { model: 'gpt-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      { onText: (t) => chunks.push(t) },
    );

    expect(chunks.join('')).toBe('Hello');
  });

  it('surfaces tool_call blocks to the dispatcher via onToolUse', async () => {
    const sdk = fakeSdkClient([
      {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
                },
              ],
            },
          },
        ],
      },
    ]);
    const client = createOpenAiClient({ sdkClient: sdk as never, logger: silentLogger() });

    const toolUses: unknown[] = [];
    await client.streamMessage(
      { model: 'gpt-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      { onToolUse: (block) => toolUses.push(block) },
    );

    expect(toolUses).toEqual([
      { type: 'tool_use', id: 'call_1', name: 'get_weather', input: '{"city":"Paris"}' },
    ]);
  });

  it('logs token usage per request', async () => {
    const sdk = fakeSdkClient([], { prompt_tokens: 42, completion_tokens: 7 });
    const logger = silentLogger();
    const client = createOpenAiClient({ sdkClient: sdk as never, logger });

    await client.streamMessage(
      { model: 'gpt-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      {},
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 42, outputTokens: 7 }),
      expect.any(String),
    );
  });

  it('retries transient failures with backoff, then succeeds', async () => {
    let attempts = 0;
    const sdk = {
      chat: {
        completions: {
          stream: vi.fn(() => {
            attempts++;
            if (attempts < 3) {
              const err = new Error('rate limited') as Error & { status: number };
              err.status = 429;
              throw err;
            }
            async function* iterate() {
              yield { choices: [{ index: 0, delta: { content: 'ok' } }] };
            }
            return {
              [Symbol.asyncIterator]: iterate,
              finalChatCompletion: async () => ({
                id: 'chatcmpl_1',
                choices: [{ finish_reason: 'stop' }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
              }),
            };
          }),
        },
      },
    };
    const client = createOpenAiClient({
      sdkClient: sdk as never,
      logger: silentLogger(),
      retry: { maxRetries: 3, baseDelayMs: 0 },
    });

    const chunks: string[] = [];
    await client.streamMessage(
      { model: 'gpt-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      { onText: (t) => chunks.push(t) },
    );

    expect(attempts).toBe(3);
    expect(chunks.join('')).toBe('ok');
  });

  it('does not retry non-retryable errors', async () => {
    const sdk = {
      chat: {
        completions: {
          stream: vi.fn(() => {
            const err = new Error('bad request') as Error & { status: number };
            err.status = 400;
            throw err;
          }),
        },
      },
    };
    const client = createOpenAiClient({
      sdkClient: sdk as never,
      logger: silentLogger(),
      retry: { maxRetries: 3, baseDelayMs: 0 },
    });

    await expect(
      client.streamMessage(
        { model: 'gpt-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
        {},
      ),
    ).rejects.toThrow('bad request');
    expect(sdk.chat.completions.stream).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries on persistent transient failures', async () => {
    const sdk = {
      chat: {
        completions: {
          stream: vi.fn(() => {
            const err = new Error('server error') as Error & { status: number };
            err.status = 503;
            throw err;
          }),
        },
      },
    };
    const client = createOpenAiClient({
      sdkClient: sdk as never,
      logger: silentLogger(),
      retry: { maxRetries: 2, baseDelayMs: 0 },
    });

    await expect(
      client.streamMessage(
        { model: 'gpt-5', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
        {},
      ),
    ).rejects.toThrow('server error');
    expect(sdk.chat.completions.stream).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

function silentLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
}
