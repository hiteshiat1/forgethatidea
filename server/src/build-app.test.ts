import { describe, it, expect } from 'vitest';
import { buildApp } from './build-app.js';
import { loadEnv } from './env.js';
import { createInMemoryOnboardingStore } from './onboarding-store.js';

const testEnv = () => loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const validResponses = {
  idea: 'A marketplace that matches retired tradespeople with weekend DIY projects.',
  industry: 'Home services',
  budget: '1k-10k',
  technicalLevel: 'non-technical',
  goal: 'Validate demand before spending on a real build.',
};

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
