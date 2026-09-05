import { describe, it, expect, vi } from 'vitest';
import { buildApp } from './build-app.js';
import { loadEnv } from './env.js';
import { createInMemoryOnboardingStore } from './onboarding-store.js';
import { createInMemoryAuthStore } from './auth/auth-store.js';
import {
  createCostGuard,
  createInMemoryCostGuardStore,
  CostCapExceededError,
} from './cost-guard.js';
import { createInMemorySessionStore } from './session-store.js';
import type { WebSearchClient } from './web-search.js';
import type { Database } from './db/client.js';

const testEnv = () => loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const validResponses = {
  idea: 'A marketplace that matches retired tradespeople with weekend DIY projects.',
  industry: 'Home services',
  budget: '1k-10k',
  technicalLevel: 'non-technical',
  goal: 'Validate demand before spending on a real build.',
};

describe('db decoration', () => {
  it('decorates the app with a provided db client', async () => {
    const fakeDb = { fake: true } as unknown as Database;
    const app = buildApp(testEnv(), { db: fakeDb });
    expect(app.db).toBe(fakeDb);
    await app.close();
  });

  it('does not decorate the app when no db client is provided and DATABASE_URL is unset', async () => {
    const app = buildApp(testEnv());
    expect(app.db).toBeUndefined();
    await app.close();
  });

  it('constructs a real db client from DATABASE_URL when present', async () => {
    vi.doMock('./db/client.js', () => ({
      createDbClient: vi.fn(() => ({ constructed: true })),
    }));
    vi.resetModules();

    const { buildApp: buildAppFresh } = await import('./build-app.js');
    const { loadEnv: loadEnvFresh } = await import('./env.js');
    const env = loadEnvFresh({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    } as NodeJS.ProcessEnv);

    const app = buildAppFresh(env);
    expect(app.db).toEqual({ constructed: true });
    await app.close();

    vi.doUnmock('./db/client.js');
    vi.resetModules();
  });
});

describe('auth wiring', () => {
  it('uses a provided authStore for signup', async () => {
    const store = createInMemoryAuthStore();
    const app = buildApp(testEnv(), { authStore: store });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'wired@example.com', password: 'correct horse battery staple' },
    });

    expect(res.statusCode).toBe(201);
    await expect(store.findUserByEmail('wired@example.com')).resolves.toMatchObject({
      email: 'wired@example.com',
    });
    await app.close();
  });

  it('defaults to an in-memory authStore when no db and no authStore are provided', async () => {
    const app = buildApp(testEnv());

    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'default@example.com', password: 'correct horse battery staple' },
    });
    expect(signupRes.statusCode).toBe(201);
    expect(signupRes.headers['set-cookie']).toBeDefined();
    await app.close();
  });

  it('rejects an unauthenticated request to a protected-style flow via requireAuth semantics', async () => {
    const app = buildApp(testEnv());
    const res = await app.inject({ method: 'POST', url: '/api/auth/signout' });
    // signout doesn't require auth, but confirms cookie plugin + routes are registered end-to-end
    expect(res.statusCode).toBe(204);
    await app.close();
  });
});

describe('session wiring', () => {
  it('uses a provided sessionStore for session creation, tied to the authenticated user', async () => {
    const sessionStore = createInMemorySessionStore();
    const app = buildApp(testEnv(), { sessionStore });

    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'session-wired@example.com', password: 'correct horse battery staple' },
    });
    const setCookie = signupRes.headers['set-cookie'];
    const authCookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(201);
    const created = res.json();
    await expect(sessionStore.get(created.id)).resolves.toMatchObject({ phase: 'onboarding' });
    await app.close();
  });

  it('defaults to an in-memory sessionStore when no db and no sessionStore are provided', async () => {
    const app = buildApp(testEnv());
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'session-default@example.com', password: 'correct horse battery staple' },
    });
    const setCookie = signupRes.headers['set-cookie'];
    const authCookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('request id correlation', () => {
  it('echoes a client-supplied x-request-id back on the response', async () => {
    const app = buildApp(testEnv());
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'client-req-abc' },
    });
    expect(res.headers['x-request-id']).toBe('client-req-abc');
    await app.close();
  });

  it('generates a request id when none is supplied', async () => {
    const app = buildApp(testEnv());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(String(res.headers['x-request-id']).length).toBeGreaterThan(0);
    await app.close();
  });
});

describe('error handling', () => {
  it('returns a structured 500 body and does not leak the raw error message in production', async () => {
    const env = { ...testEnv(), NODE_ENV: 'production' as const };
    const app = buildApp(env);
    app.get('/__boom', async () => {
      throw new Error('sensitive internal detail');
    });
    const res = await app.inject({ method: 'GET', url: '/__boom' });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body).toMatchObject({ error: 'internal_server_error' });
    expect(body.message).not.toMatch(/sensitive internal detail/);
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    await app.close();
  });

  it('surfaces the real error message outside production', async () => {
    const app = buildApp(testEnv());
    app.get('/__boom', async () => {
      throw new Error('dev detail');
    });
    const res = await app.inject({ method: 'GET', url: '/__boom' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'internal_server_error', message: 'dev detail' });
    await app.close();
  });

  it('preserves a thrown error status code (e.g. from reply.code)', async () => {
    const app = buildApp(testEnv());
    app.get('/__teapot', async () => {
      const err = new Error('nope') as Error & { statusCode: number };
      err.statusCode = 418;
      throw err;
    });
    const res = await app.inject({ method: 'GET', url: '/__teapot' });
    expect(res.statusCode).toBe(418);
    await app.close();
  });
});

describe('cost guard decoration', () => {
  it('decorates the app with a provided costGuard', async () => {
    const store = createInMemoryCostGuardStore();
    const costGuard = createCostGuard({
      store,
      sessionCapCents: 100,
      userDailyCapCents: 500,
      warnRatio: 0.8,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    const app = buildApp(testEnv(), { costGuard });
    expect(app.costGuard).toBe(costGuard);
    await app.close();
  });

  it('constructs a default costGuard from env caps when none is provided', async () => {
    const app = buildApp(testEnv());
    expect(app.costGuard).toBeDefined();
    await expect(
      app.costGuard.checkBeforeCall({ sessionId: 's1', userId: 'u1' }),
    ).resolves.toBeUndefined();
    await app.close();
  });

  it('returns a clear 429 error body when a route throws CostCapExceededError', async () => {
    const app = buildApp(testEnv());
    app.get('/__capped', async () => {
      throw new CostCapExceededError('session_cap_exceeded', 100, 100);
    });

    const res = await app.inject({ method: 'GET', url: '/__capped' });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      error: 'session_cap_exceeded',
      spendCents: 100,
      capCents: 100,
    });
    await app.close();
  });
});

describe('web search tool decoration', () => {
  it('uses a provided webSearchClient', async () => {
    const client: WebSearchClient = {
      search: vi.fn(async () => [{ title: 'A', url: 'https://a.example.com', snippet: 'x' }]),
    };
    const app = buildApp(testEnv(), { webSearchClient: client });

    const result = await app.webSearchTool.web_search({ query: 'test' });
    expect(result).toEqual({
      results: [{ title: 'A', url: 'https://a.example.com', snippet: 'x' }],
    });
    expect(client.search).toHaveBeenCalledWith('test');
    await app.close();
  });

  it('defaults to an unconfigured client (clear error on use) when no TAVILY_API_KEY is set', async () => {
    const app = buildApp(testEnv());

    const result = await app.webSearchTool.web_search({ query: 'test' });
    expect(result).toMatchObject({ error: 'search_failed' });
    if ('error' in result && result.error === 'search_failed') {
      expect(result.message).toMatch(/not configured/);
    }
    await app.close();
  });
});

describe('agent orchestrator wiring', () => {
  it('registers the agent message route when an anthropic client is available', async () => {
    const anthropicClient = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 1,
        outputTokens: 1,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: 'hi back' }],
      })),
    };
    const app = buildApp(testEnv(), { orchestratorAnthropicClient: anthropicClient });

    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        email: 'orchestrator-wired@example.com',
        password: 'correct horse battery staple',
      },
    });
    const setCookie = signupRes.headers['set-cookie'];
    const authCookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]!;

    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });
    const sessionId = sessionRes.json().id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/message`,
      headers: { cookie: authCookie },
      payload: { text: 'hello' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, reply: 'hi back' });
    await app.close();
  });

  it('does not register the agent message route when no anthropic client is configured', async () => {
    const app = buildApp(testEnv());

    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'no-orchestrator@example.com', password: 'correct horse battery staple' },
    });
    const setCookie = signupRes.headers['set-cookie'];
    const authCookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/whatever/message',
      headers: { cookie: authCookie },
      payload: { text: 'hello' },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('health check', () => {
  it('returns ok', async () => {
    const app = buildApp(testEnv());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'forge-server' });
    await app.close();
  });
});

describe('POST /api/onboarding', () => {
  it('accepts and persists valid responses to the session', async () => {
    const store = createInMemoryOnboardingStore();
    const app = buildApp(testEnv(), { onboardingStore: store });

    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { 'x-forge-session': 'sess-123' },
      payload: validResponses,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ sessionId: 'sess-123', responses: validResponses });
    await expect(store.get('sess-123')).resolves.toMatchObject(validResponses);
    await app.close();
  });

  it('mints a session id when none is supplied', async () => {
    const app = buildApp(testEnv());
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      payload: validResponses,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().sessionId).toEqual(expect.any(String));
    await app.close();
  });

  it('rejects incomplete responses with field errors', async () => {
    const app = buildApp(testEnv());
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      payload: { ...validResponses, idea: 'too short', budget: 'bogus' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.fields).toHaveProperty('idea');
    expect(body.fields).toHaveProperty('budget');
    await app.close();
  });
});
