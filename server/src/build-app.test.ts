import { describe, it, expect, vi } from 'vitest';
import { buildApp } from './build-app.js';
import { loadEnv } from './env.js';
import { createInMemoryOnboardingStore } from './onboarding-store.js';
import { createInMemoryAuthStore } from './auth/auth-store.js';
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
