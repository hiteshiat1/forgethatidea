import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAuthRoutes } from './auth.js';
import { registerSessionRoutes } from './session.js';
import { createInMemoryAuthStore } from '../auth/auth-store.js';
import { createInMemorySessionStore } from '../session-store.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  const authStore = createInMemoryAuthStore();
  const sessionStore = createInMemorySessionStore();
  registerAuthRoutes(app, authStore);
  registerSessionRoutes(app, authStore, sessionStore);
  await app.ready();
  return { app, authStore, sessionStore };
}

function extractCookie(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const match = /^([^=]+=[^;]+)/.exec(String(raw));
  if (!match) throw new Error('no cookie in response');
  return match[1]!;
}

async function signUpAndGetCookie(app: Awaited<ReturnType<typeof buildTestApp>>['app']) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email: `u${Math.random()}@example.com`, password: 'correct horse battery staple' },
  });
  return extractCookie(res);
}

describe('POST /api/sessions', () => {
  it('rejects an anonymous request', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/sessions' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('creates a session tied to the authenticated user', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ phase: 'onboarding', chat: [], cards: [] });
    expect(body.userId).toEqual(expect.any(String));
    await app.close();
  });
});

describe('GET /api/sessions/latest', () => {
  it('returns null when the user has no sessions yet', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/latest',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    await app.close();
  });

  it('returns the correct phase to resume on', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });
    const sessionId = created.json().id;

    await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: authCookie },
      payload: { phase: 'sources' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/latest',
      headers: { cookie: authCookie },
    });

    expect(res.json()).toMatchObject({ id: sessionId, phase: 'sources' });
    await app.close();
  });
});

describe('GET /api/sessions/:id', () => {
  it('restores phase, chat, and cards for the owning user', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });
    const sessionId = created.json().id;

    await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: authCookie },
      payload: { phase: 'sources', chat: [{ role: 'user', text: 'hi' }], cards: [{ id: 'c1' }] },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      phase: 'sources',
      chat: [{ role: 'user', text: 'hi' }],
      cards: [{ id: 'c1' }],
    });
    await app.close();
  });

  it('404s when the session belongs to a different user', async () => {
    const { app } = await buildTestApp();
    const ownerCookie = await signUpAndGetCookie(app);
    const otherCookie = await signUpAndGetCookie(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: ownerCookie },
    });
    const sessionId = created.json().id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: otherCookie },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('404s for a nonexistent session', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/nonexistent',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /api/sessions/:id', () => {
  it('rejects an invalid phase value', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });
    const sessionId = created.json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: authCookie },
      payload: { phase: 'not-a-real-phase' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rejects skipping ahead more than one phase (phase state machine, #28)', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });
    const sessionId = created.json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: authCookie },
      payload: { phase: 'planning' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'illegal_phase_transition',
      from: 'onboarding',
      to: 'planning',
    });
    await app.close();
  });

  it('allows a legal single-step phase advance and persists it', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });
    const sessionId = created.json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: authCookie },
      payload: { phase: 'sources' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ phase: 'sources' });
    await app.close();
  });

  it('allows updating chat/cards without a phase change', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: authCookie },
    });
    const sessionId = created.json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: authCookie },
      payload: { chat: [{ role: 'user', text: 'hi' }] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ phase: 'onboarding', chat: [{ role: 'user', text: 'hi' }] });
    await app.close();
  });

  it("rejects patching another user's session", async () => {
    const { app } = await buildTestApp();
    const ownerCookie = await signUpAndGetCookie(app);
    const otherCookie = await signUpAndGetCookie(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: ownerCookie },
    });
    const sessionId = created.json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: otherCookie },
      payload: { phase: 'sources' },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
