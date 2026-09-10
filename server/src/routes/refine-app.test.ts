import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAuthRoutes } from './auth.js';
import { registerSessionRoutes } from './session.js';
import { registerRefineAppRoutes } from './refine-app.js';
import { createInMemoryAuthStore } from '../auth/auth-store.js';
import { createInMemorySessionStore } from '../session-store.js';
import { createInMemoryArtifactStore } from '../artifact-store.js';
import { createRefineAppOrchestrator } from '../refine-app-orchestrator.js';

const EDITED_CODE = 'export default function App() { return <div>Edited</div>; }';

function clientReturning(code: string) {
  return {
    streamMessage: vi.fn(async (_req: unknown, handlers: { onText?: (t: string) => void }) => {
      handlers.onText?.(code);
      return {
        inputTokens: 10,
        outputTokens: 20,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: code }],
      };
    }),
  };
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  const authStore = createInMemoryAuthStore();
  const sessionStore = createInMemorySessionStore();
  const artifactStore = createInMemoryArtifactStore();
  const anthropicClient = clientReturning(EDITED_CODE);
  const orchestrator = createRefineAppOrchestrator({
    sessionStore,
    artifactStore,
    anthropicClient,
    refinementLimits: { app: 3, marketing: 3 },
  });

  registerAuthRoutes(app, authStore);
  registerSessionRoutes(app, authStore, sessionStore, { app: 3, marketing: 3 });
  registerRefineAppRoutes(app, authStore, sessionStore, orchestrator);
  await app.ready();
  return { app, sessionStore, artifactStore };
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

async function createSessionAs(
  app: Awaited<ReturnType<typeof buildTestApp>>['app'],
  authCookie: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: { cookie: authCookie },
  });
  return res.json().id;
}

describe('POST /api/sessions/:id/refine-app', () => {
  it('rejects an anonymous request', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/whatever/refine-app',
      payload: { changeRequest: 'Add a label.' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an empty change request', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const sessionId = await createSessionAs(app, authCookie);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/refine-app`,
      headers: { cookie: authCookie },
      payload: { changeRequest: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s for a nonexistent session', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/nonexistent/refine-app',
      headers: { cookie: authCookie },
      payload: { changeRequest: 'Add a label.' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when there is no build to refine yet', async () => {
    const { app } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const sessionId = await createSessionAs(app, authCookie);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/refine-app`,
      headers: { cookie: authCookie },
      payload: { changeRequest: 'Add a label.' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ ok: false, error: 'no_build_to_refine' });
  });

  it('applies the edit and returns the new code', async () => {
    const { app, sessionStore, artifactStore } = await buildTestApp();
    const authCookie = await signUpAndGetCookie(app);
    const sessionId = await createSessionAs(app, authCookie);
    await artifactStore.save(sessionId, 'app', { manifestId: 'm1', content: { code: 'old code' } });
    await sessionStore.update(sessionId, { activeAppVersion: 1 });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/refine-app`,
      headers: { cookie: authCookie },
      payload: { changeRequest: 'Add a label.' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, code: EDITED_CODE, version: 2 });
  });
});
