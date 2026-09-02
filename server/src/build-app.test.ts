import { describe, it, expect, vi } from 'vitest';
import { buildApp } from './build-app.js';
import { loadEnv } from './env.js';
import { createInMemoryOnboardingStore } from './onboarding-store.js';
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
