import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAuthRoutes, requireAuth, SESSION_COOKIE_NAME } from './auth.js';
import { createInMemoryAuthStore } from '../auth/auth-store.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  const store = createInMemoryAuthStore();
  registerAuthRoutes(app, store);

  // A protected route to exercise requireAuth against.
  app.get('/api/protected', { preHandler: requireAuth(store) }, async (request) => ({
    userId: request.userId,
  }));

  await app.ready();
  return { app, store };
}

function extractCookie(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const match = /^([^=]+=[^;]+)/.exec(String(raw));
  if (!match) throw new Error('no cookie in response');
  return match[1]!;
}

describe('POST /api/auth/signup', () => {
  it('creates a user and sets a session cookie', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'new@example.com', password: 'correct horse battery staple' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: 'new@example.com' });
    expect(res.headers['set-cookie']).toBeDefined();
    await app.close();
  });

  it('rejects a duplicate email', async () => {
    const { app } = await buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'dup@example.com', password: 'password123456' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'dup@example.com', password: 'different1234' },
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('rejects a short password', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'short@example.com', password: 'short' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rejects an invalid email', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'not-an-email', password: 'password123456' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /api/auth/signin', () => {
  it('signs in with correct credentials and sets a session cookie', async () => {
    const { app } = await buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'signin@example.com', password: 'correct horse battery staple' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signin',
      payload: { email: 'signin@example.com', password: 'correct horse battery staple' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
    await app.close();
  });

  it('rejects an unknown email', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signin',
      payload: { email: 'nobody@example.com', password: 'whatever12345' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects an incorrect password', async () => {
    const { app } = await buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'wrongpw@example.com', password: 'correct horse battery staple' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signin',
      payload: { email: 'wrongpw@example.com', password: 'totally wrong password' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('requireAuth', () => {
  it('rejects anonymous access to a protected route', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/protected' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('allows access with a valid session cookie', async () => {
    const { app } = await buildTestApp();
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'protected@example.com', password: 'correct horse battery staple' },
    });
    const sessionCookie = extractCookie(signupRes);

    const res = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ userId: expect.any(String) });
    await app.close();
  });

  it('rejects a bogus session cookie', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-real-token` },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects an expired session', async () => {
    const { app, store } = await buildTestApp();
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'expiring@example.com', password: 'correct horse battery staple' },
    });
    const cookieValue = extractCookie(signupRes);
    const token = cookieValue.split('=')[1]!;

    // Simulate expiry by deleting and re-creating the session with a past expiry.
    const { hashSessionToken } = await import('../auth/session-token.js');
    const tokenHash = hashSessionToken(decodeURIComponent(token));
    await store.deleteSession(tokenHash);
    const user = await store.findUserByEmail('expiring@example.com');
    await store.createSession(user!.id, tokenHash, new Date(Date.now() - 1000));

    const res = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { cookie: cookieValue },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /api/auth/signout', () => {
  it('invalidates the session so it can no longer be used', async () => {
    const { app } = await buildTestApp();
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'signout@example.com', password: 'correct horse battery staple' },
    });
    const sessionCookie = extractCookie(signupRes);

    const signoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/signout',
      headers: { cookie: sessionCookie },
    });
    expect(signoutRes.statusCode).toBe(204);

    const res = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
