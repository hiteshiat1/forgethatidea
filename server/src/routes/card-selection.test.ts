import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAuthRoutes } from './auth.js';
import { registerCardSelectionRoutes } from './card-selection.js';
import { createInMemoryAuthStore } from '../auth/auth-store.js';
import { createInMemorySessionStore } from '../session-store.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  const authStore = createInMemoryAuthStore();
  const sessionStore = createInMemorySessionStore();
  registerAuthRoutes(app, authStore);
  registerCardSelectionRoutes(app, authStore, sessionStore);
  await app.ready();
  return { app, sessionStore };
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

describe('POST /api/sessions/:id/cards/options/select (#44)', () => {
  it('rejects an anonymous request', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/whatever/cards/options/select',
      payload: { index: 0 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('404s for a session belonging to a different user', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const session = await sessionStore.create('someone-else');

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/options/select`,
      headers: { cookie: authCookie },
      payload: { index: 0 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('400s when no options card exists yet', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const userId = res.json().id;
    const session = await sessionStore.create(userId);

    const selectRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/options/select`,
      headers: { cookie: authCookie },
      payload: { index: 0 },
    });
    expect(selectRes.statusCode).toBe(400);
    expect(selectRes.json()).toEqual({ ok: false, error: 'no_options_card' });
  });

  it('locks the option at the given index', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const userId = meRes.json().id;
    const session = await sessionStore.create(userId);
    await sessionStore.update(session.id, {
      cards: [
        {
          id: 'options-1',
          type: 'options',
          status: 'draft',
          content: {
            options: [
              { name: 'A', summary: 'a' },
              { name: 'B', summary: 'b' },
            ],
            selectedIndex: null,
          },
        },
      ],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/options/select`,
      headers: { cookie: authCookie },
      payload: { index: 1 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, card: { status: 'locked' } });
    const updated = await sessionStore.get(session.id);
    const card = updated!.cards[0] as { content: { selectedIndex: number } };
    expect(card.content.selectedIndex).toBe(1);
  });

  it('400s for an out-of-range index', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const userId = meRes.json().id;
    const session = await sessionStore.create(userId);
    await sessionStore.update(session.id, {
      cards: [
        {
          id: 'options-1',
          type: 'options',
          status: 'draft',
          content: { options: [{ name: 'A', summary: 'a' }], selectedIndex: null },
        },
      ],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/options/select`,
      headers: { cookie: authCookie },
      payload: { index: 9 },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/sessions/:id/cards/architecture/lock (#45)', () => {
  it('rejects an anonymous request', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/whatever/cards/architecture/lock',
    });
    expect(res.statusCode).toBe(401);
  });

  it('404s for a session belonging to a different user', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const session = await sessionStore.create('someone-else');

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/architecture/lock`,
      headers: { cookie: authCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('400s when no architecture card exists yet', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const session = await sessionStore.create(meRes.json().id);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/architecture/lock`,
      headers: { cookie: authCookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ ok: false, error: 'no_architecture_card' });
  });

  it('locks the architecture card', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const session = await sessionStore.create(meRes.json().id);
    await sessionStore.update(session.id, {
      cards: [
        {
          id: 'arch-1',
          type: 'architecture',
          status: 'draft',
          content: { summary: 'plain summary', components: [], connections: [] },
        },
      ],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/architecture/lock`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, card: { status: 'locked' } });
  });
});

describe('POST /api/sessions/:id/cards/cost/lock (#47)', () => {
  it('rejects an anonymous request', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/whatever/cards/cost/lock',
    });
    expect(res.statusCode).toBe(401);
  });

  it('404s for a session belonging to a different user', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const session = await sessionStore.create('someone-else');

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/cost/lock`,
      headers: { cookie: authCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('400s when no cost card exists yet', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const session = await sessionStore.create(meRes.json().id);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/cost/lock`,
      headers: { cookie: authCookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ ok: false, error: 'no_cost_card' });
  });

  it('locks the cost card', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const session = await sessionStore.create(meRes.json().id);
    await sessionStore.update(session.id, {
      cards: [
        {
          id: 'cost-1',
          type: 'cost',
          status: 'draft',
          content: { scales: [] },
        },
      ],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/cost/lock`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, card: { status: 'locked' } });
  });
});

describe('POST /api/sessions/:id/cards/marketing/select (#48)', () => {
  it('rejects an anonymous request', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/whatever/cards/marketing/select',
      payload: { index: 0 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('404s for a session belonging to a different user', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const session = await sessionStore.create('someone-else');

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/marketing/select`,
      headers: { cookie: authCookie },
      payload: { index: 0 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('400s when no marketing card exists yet', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const session = await sessionStore.create(meRes.json().id);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/marketing/select`,
      headers: { cookie: authCookie },
      payload: { index: 0 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ ok: false, error: 'no_marketing_card' });
  });

  it('locks the plan at the given index', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const session = await sessionStore.create(meRes.json().id);
    await sessionStore.update(session.id, {
      cards: [
        {
          id: 'marketing-1',
          type: 'marketing',
          status: 'draft',
          content: {
            plans: [
              { name: 'A', icp: 'x', gtm: 'x', seo: 'x', ads: 'x', competitors: ['Acme'] },
              { name: 'B', icp: 'x', gtm: 'x', seo: 'x', ads: 'x', competitors: ['Acme'] },
            ],
            selectedIndex: null,
          },
        },
      ],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/marketing/select`,
      headers: { cookie: authCookie },
      payload: { index: 1 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, card: { status: 'locked' } });
    const updated = await sessionStore.get(session.id);
    const card = updated!.cards[0] as { content: { selectedIndex: number } };
    expect(card.content.selectedIndex).toBe(1);
  });

  it('400s for an out-of-range index', async () => {
    const { app, sessionStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    const session = await sessionStore.create(meRes.json().id);
    await sessionStore.update(session.id, {
      cards: [
        {
          id: 'marketing-1',
          type: 'marketing',
          status: 'draft',
          content: {
            plans: [{ name: 'A', icp: 'x', gtm: 'x', seo: 'x', ads: 'x', competitors: ['Acme'] }],
            selectedIndex: null,
          },
        },
      ],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/cards/marketing/select`,
      headers: { cookie: authCookie },
      payload: { index: 9 },
    });

    expect(res.statusCode).toBe(400);
  });
});
