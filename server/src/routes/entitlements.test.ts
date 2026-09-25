import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAuthRoutes } from './auth.js';
import { registerEntitlementsRoutes } from './entitlements.js';
import { createInMemoryAuthStore } from '../auth/auth-store.js';
import { createEntitlementsService, createInMemoryEntitlementStore } from '../entitlements.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  const authStore = createInMemoryAuthStore();
  const entitlementStore = createInMemoryEntitlementStore();
  const entitlements = createEntitlementsService({ store: entitlementStore });

  registerAuthRoutes(app, authStore);
  registerEntitlementsRoutes(app, authStore, entitlements);

  await app.ready();
  return { app, entitlements };
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
  return { cookie: extractCookie(res), userId: res.json().id as string };
}

describe('entitlements route (#101)', () => {
  it('requires authentication', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/api/entitlements' });

    expect(res.statusCode).toBe(401);
  });

  it('returns an empty list for a user who owns nothing', async () => {
    const { app } = await buildTestApp();
    const { cookie: authCookie } = await signUpAndGetCookie(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/entitlements',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ owned: [] });
  });

  it('reflects a tier granted after the user last checked, without needing a new session', async () => {
    const { app, entitlements } = await buildTestApp();
    const { cookie: authCookie, userId } = await signUpAndGetCookie(app);

    const before = await app.inject({
      method: 'GET',
      url: '/api/entitlements',
      headers: { cookie: authCookie },
    });
    expect(before.json()).toEqual({ owned: [] });

    await entitlements.grant(userId, 'spec-pack', { source: 'purchase', reference: 'cs_1' });

    const after = await app.inject({
      method: 'GET',
      url: '/api/entitlements',
      headers: { cookie: authCookie },
    });
    expect(after.json()).toEqual({ owned: ['spec-pack'] });
  });

  it('only reports entitlements for the requesting user, never another account', async () => {
    const { app, entitlements } = await buildTestApp();
    const { cookie: authCookie } = await signUpAndGetCookie(app);

    await entitlements.grant('someone-elses-user-id', 'spec-pack', {
      source: 'purchase',
      reference: 'cs_1',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/entitlements',
      headers: { cookie: authCookie },
    });

    expect(res.json()).toEqual({ owned: [] });
  });
});
