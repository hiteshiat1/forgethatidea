import { describe, it, expect, vi } from 'vitest';
import { createGeminiClient, type GenerateContentStreamChunk } from './gemini-client.js';

/** Builds a fake SDK client whose `generateContentStream` yields the given chunks. */
function fakeSdkClient(
  chunks: GenerateContentStreamChunk[],
  usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 5 },
) {
  async function* iterate() {
    for (const chunk of chunks) yield chunk;
  }
  return {
    models: {
      generateContentStream: vi.fn(async () => iterate()),
    },
    __lastUsage: usageMetadata,
  };
}

describe('createGeminiClient', () => {
  it('streams text deltas to the provided handler', async () => {
    const sdk = fakeSdkClient([
      { candidates: [{ content: { parts: [{ text: 'Hel' }] }, finishReason: undefined }] },
      {
        candidates: [{ content: { parts: [{ text: 'lo' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      },
    ]);
    const client = createGeminiClient({ sdkClient: sdk as never, logger: silentLogger() });

    const chunks: string[] = [];
    await client.streamMessage(
      { model: 'gemini-3-pro', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      { onText: (t) => chunks.push(t) },
    );

    expect(chunks.join('')).toBe('Hello');
  });

  it('surfaces functionCall parts to the dispatcher via onToolUse', async () => {
    const sdk = fakeSdkClient([
      {
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: 'get_weather', args: { city: 'Paris' } } }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      },
    ]);
    const client = createGeminiClient({ sdkClient: sdk as never, logger: silentLogger() });

    const toolUses: unknown[] = [];
    await client.streamMessage(
      { model: 'gemini-3-pro', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      { onToolUse: (block) => toolUses.push(block) },
    );

    expect(toolUses).toEqual([
      { type: 'tool_use', id: 'get_weather', name: 'get_weather', input: { city: 'Paris' } },
    ]);
  });

  it('logs token usage per request', async () => {
    const sdk = fakeSdkClient([
      {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 7 },
      },
    ]);
    const logger = silentLogger();
    const client = createGeminiClient({ sdkClient: sdk as never, logger });

    await client.streamMessage(
      { model: 'gemini-3-pro', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      {},
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 42, outputTokens: 7 }),
      expect.any(String),
    );
  });

  it('resolves with usage and stop reason for the caller', async () => {
    const sdk = fakeSdkClient([
      {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 7 },
      },
    ]);
    const client = createGeminiClient({ sdkClient: sdk as never, logger: silentLogger() });

    const result = await client.streamMessage(
      { model: 'gemini-3-pro', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      {},
    );

    expect(result).toEqual({ inputTokens: 42, outputTokens: 7, stopReason: 'STOP' });
  });

  it('supports image/multimodal input in the request shape', async () => {
    const sdk = fakeSdkClient([
      {
        candidates: [{ content: { parts: [{ text: 'a cat' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      },
    ]);
    const client = createGeminiClient({ sdkClient: sdk as never, logger: silentLogger() });

    await client.streamMessage(
      {
        model: 'gemini-3-pro',
        maxTokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              { type: 'image', mimeType: 'image/png', data: 'base64data' },
            ],
          },
        ],
      },
      {},
    );

    const generateContentStream = sdk.models.generateContentStream as unknown as {
      mock: { calls: Array<[{ contents: Array<{ parts: unknown[] }> }]> };
    };
    const callArgs = generateContentStream.mock.calls[0]?.[0];
    expect(callArgs?.contents[0]?.parts).toEqual([
      { text: 'What is in this image?' },
      { inlineData: { mimeType: 'image/png', data: 'base64data' } },
    ]);
  });

  it('retries transient failures with backoff, then succeeds', async () => {
    let attempts = 0;
    const sdk = {
      models: {
        generateContentStream: vi.fn(async () => {
          attempts++;
          if (attempts < 3) {
            const err = new Error('overloaded') as Error & { status: number };
            err.status = 503;
            throw err;
          }
          async function* iterate() {
            yield {
              candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
              usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
            };
          }
          return iterate();
        }),
      },
    };
    const client = createGeminiClient({
      sdkClient: sdk as never,
      logger: silentLogger(),
      retry: { maxRetries: 3, baseDelayMs: 0 },
    });

    const chunks: string[] = [];
    await client.streamMessage(
      { model: 'gemini-3-pro', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
      { onText: (t) => chunks.push(t) },
    );

    expect(attempts).toBe(3);
    expect(chunks.join('')).toBe('ok');
  });

  it('does not retry non-retryable errors', async () => {
    const sdk = {
      models: {
        generateContentStream: vi.fn(async () => {
          const err = new Error('bad request') as Error & { status: number };
          err.status = 400;
          throw err;
        }),
      },
    };
    const client = createGeminiClient({
      sdkClient: sdk as never,
      logger: silentLogger(),
      retry: { maxRetries: 3, baseDelayMs: 0 },
    });

    await expect(
      client.streamMessage(
        { model: 'gemini-3-pro', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
        {},
      ),
    ).rejects.toThrow('bad request');
    expect(sdk.models.generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries on persistent transient failures', async () => {
    const sdk = {
      models: {
        generateContentStream: vi.fn(async () => {
          const err = new Error('overloaded') as Error & { status: number };
          err.status = 503;
          throw err;
        }),
      },
    };
    const client = createGeminiClient({
      sdkClient: sdk as never,
      logger: silentLogger(),
      retry: { maxRetries: 2, baseDelayMs: 0 },
    });

    await expect(
      client.streamMessage(
        { model: 'gemini-3-pro', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] },
        {},
      ),
    ).rejects.toThrow('overloaded');
    expect(sdk.models.generateContentStream).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

function silentLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
}
