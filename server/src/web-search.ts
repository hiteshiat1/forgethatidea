export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchClient {
  /** Returns results ranked by relevance, best first. */
  search(query: string): Promise<WebSearchResult[]>;
}

export interface Logger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface RateLimitConfig {
  maxCalls: number;
  windowMs: number;
}

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes — market research doesn't go stale by the second.
const DEFAULT_RATE_LIMIT: RateLimitConfig = { maxCalls: 20, windowMs: 60 * 1000 };

export interface WebSearchToolDeps {
  client: WebSearchClient;
  logger: Logger;
  cacheTtlMs?: number;
  rateLimit?: RateLimitConfig;
}

export type WebSearchResponse =
  | { results: WebSearchResult[] }
  | { error: 'invalid_input' }
  | { error: 'rate_limited' }
  | { error: 'search_failed'; message: string };

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function isWebSearchInput(input: unknown): input is { query: string } {
  return (
    typeof input === 'object' &&
    input !== null &&
    'query' in input &&
    typeof (input as { query: unknown }).query === 'string' &&
    (input as { query: string }).query.trim().length > 0
  );
}

/**
 * Web search / research tool (Epic 2.9): live search for competitor and
 * market research, registered in the tool dispatcher (#31) as `web_search`.
 * Results are cached per normalized query (case/whitespace-insensitive) to
 * avoid re-paying for an identical lookup within the TTL, and rate-limited
 * per process to keep a runaway agent loop from exhausting the search
 * provider's quota — "rate-limited and cached". Attaching results to a
 * manifest's research references is the caller's job (via update_manifest's
 * `references.researchCardIds`, #33) once it turns a search into a card;
 * this tool only searches.
 */
export function createWebSearchTool(deps: WebSearchToolDeps) {
  const { client, logger } = deps;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const rateLimit = deps.rateLimit ?? DEFAULT_RATE_LIMIT;

  const cache = new Map<string, { results: WebSearchResult[]; expiresAt: number }>();
  const callTimestamps: number[] = [];

  function isRateLimited(): boolean {
    const now = Date.now();
    while (callTimestamps.length > 0 && now - callTimestamps[0]! > rateLimit.windowMs) {
      callTimestamps.shift();
    }
    return callTimestamps.length >= rateLimit.maxCalls;
  }

  async function web_search(rawInput: unknown): Promise<WebSearchResponse> {
    if (!isWebSearchInput(rawInput)) {
      return { error: 'invalid_input' };
    }

    const key = normalizeQuery(rawInput.query);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { results: cached.results };
    }

    if (isRateLimited()) {
      logger.warn({ query: key }, 'web search rate limit exceeded');
      return { error: 'rate_limited' };
    }

    callTimestamps.push(Date.now());

    try {
      const results = await client.search(rawInput.query);
      cache.set(key, { results, expiresAt: Date.now() + cacheTtlMs });
      return { results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ query: key, error: message }, 'web search failed');
      return { error: 'search_failed', message };
    }
  }

  return { web_search };
}

/** Placeholder client for when no search API key is configured. */
export function createUnconfiguredWebSearchClient(): WebSearchClient {
  return {
    search: () =>
      Promise.reject(new Error('web search is not configured (missing TAVILY_API_KEY)')),
  };
}

interface TavilySearchResponse {
  results: Array<{ title: string; url: string; content: string }>;
}

/**
 * Minimal slice of the global `fetch` Response this client depends on.
 * Typed explicitly (rather than relying on the ambient global `Response`
 * type resolving from @types/node/lib.dom in every build environment) since
 * that resolution proved inconsistent between local and Vercel builds —
 * this makes the dependency exact and portable regardless of tsconfig lib
 * settings.
 */
interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

/**
 * Real client backed by Tavily's search API — chosen because it returns
 * clean ranked snippets + URLs directly (no HTML scraping needed), which
 * matches this tool's "returns ranked snippets + URLs" contract with no
 * extra normalization work.
 */
export function createTavilyWebSearchClient(apiKey: string): WebSearchClient {
  return {
    async search(query) {
      const res: FetchResponse = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
      });

      if (!res.ok) {
        throw new Error(`Tavily search failed: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as TavilySearchResponse;
      return data.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
    },
  };
}
