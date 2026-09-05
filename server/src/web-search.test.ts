import { describe, it, expect, vi } from 'vitest';
import {
  createWebSearchTool,
  createUnconfiguredWebSearchClient,
  type WebSearchClient,
} from './web-search.js';

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function fakeClient(results: Array<{ title: string; url: string; snippet: string }>) {
  const search = vi.fn(async () => results);
  return { search } satisfies WebSearchClient;
}

describe('createWebSearchTool', () => {
  it('returns ranked snippets + URLs from the underlying client', async () => {
    const results = [
      { title: 'Competitor A', url: 'https://a.example.com', snippet: 'A does X' },
      { title: 'Competitor B', url: 'https://b.example.com', snippet: 'B does Y' },
    ];
    const client = fakeClient(results);
    const tool = createWebSearchTool({ client, logger: silentLogger() });

    const response = await tool.web_search({ query: 'habit tracker competitors' });
    expect(response).toEqual({ results });
    expect(client.search).toHaveBeenCalledWith('habit tracker competitors');
  });

  it('caches identical queries within the TTL, without calling the client again', async () => {
    const client = fakeClient([{ title: 'A', url: 'https://a.example.com', snippet: 'x' }]);
    const tool = createWebSearchTool({ client, logger: silentLogger(), cacheTtlMs: 60_000 });

    await tool.web_search({ query: 'same query' });
    await tool.web_search({ query: 'same query' });

    expect(client.search).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after the cache TTL expires', async () => {
    vi.useFakeTimers();
    const client = fakeClient([{ title: 'A', url: 'https://a.example.com', snippet: 'x' }]);
    const tool = createWebSearchTool({ client, logger: silentLogger(), cacheTtlMs: 1000 });

    await tool.web_search({ query: 'same query' });
    vi.advanceTimersByTime(1001);
    await tool.web_search({ query: 'same query' });

    expect(client.search).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('caches case/whitespace-insensitively so trivially different queries still hit cache', async () => {
    const client = fakeClient([{ title: 'A', url: 'https://a.example.com', snippet: 'x' }]);
    const tool = createWebSearchTool({ client, logger: silentLogger() });

    await tool.web_search({ query: 'Habit Tracker' });
    await tool.web_search({ query: '  habit tracker  ' });

    expect(client.search).toHaveBeenCalledTimes(1);
  });

  it('rate-limits after exceeding the configured call budget within a window', async () => {
    const client = fakeClient([{ title: 'A', url: 'https://a.example.com', snippet: 'x' }]);
    const tool = createWebSearchTool({
      client,
      logger: silentLogger(),
      rateLimit: { maxCalls: 2, windowMs: 60_000 },
    });

    await tool.web_search({ query: 'q1' });
    await tool.web_search({ query: 'q2' });
    const result = await tool.web_search({ query: 'q3' });

    expect(result).toMatchObject({ error: 'rate_limited' });
  });

  it('does not count a cache hit against the rate limit budget', async () => {
    const client = fakeClient([{ title: 'A', url: 'https://a.example.com', snippet: 'x' }]);
    const tool = createWebSearchTool({
      client,
      logger: silentLogger(),
      rateLimit: { maxCalls: 1, windowMs: 60_000 },
    });

    await tool.web_search({ query: 'same' });
    const result = await tool.web_search({ query: 'same' }); // cache hit, not a new call

    expect(result).toEqual({ results: expect.any(Array) });
  });

  it('rejects malformed input safely', async () => {
    const client = fakeClient([]);
    const tool = createWebSearchTool({ client, logger: silentLogger() });

    const result = await tool.web_search({ notQuery: 'oops' });
    expect(result).toMatchObject({ error: 'invalid_input' });
  });
});

describe('createUnconfiguredWebSearchClient', () => {
  it('rejects clearly when no API key is configured', async () => {
    const client = createUnconfiguredWebSearchClient();
    await expect(client.search('anything')).rejects.toThrow(/not configured/);
  });
});
