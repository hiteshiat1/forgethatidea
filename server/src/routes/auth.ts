import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateSessionToken, hashSessionToken } from '../auth/session-token.js';
import { type AuthStore } from '../auth/auth-store.js';

export const SESSION_COOKIE_NAME = 'forge_session';

/** How long a session stays valid after sign-in/sign-up, absent activity. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Password must be at least 10 characters.'),
});

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expires: expiresAt,
  });
}

async function issueSession(store: AuthStore, userId: string, reply: FastifyReply) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await store.createSession(userId, hashSessionToken(token), expiresAt);
  setSessionCookie(reply, token, expiresAt);
}

/**
 * Auth routes (Epic 0.8): minimal real auth for Forge itself (not the mocked
 * apps it generates) — email/password sign-up and sign-in, httpOnly session
 * cookies backed by the auth_sessions table, sign-out revokes the session.
 */
export function registerAuthRoutes(app: FastifyInstance, store: AuthStore) {
  app.post('/api/auth/signup', async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_failed' });
    }
    const { email, password } = parsed.data;

    const existing = await store.findUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: 'email_already_registered' });
    }

    const passwordHash = await hashPassword(password);
    const user = await store.createUser(email, passwordHash);
    await issueSession(store, user.id, reply);

    return reply.status(201).send({ id: user.id, email: user.email });
  });

  app.post('/api/auth/signin', async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_failed' });
    }
    const { email, password } = parsed.data;

    const user = await store.findUserByEmail(email);
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      // Same error for "no such user" and "wrong password" — don't leak which.
      return reply.status(401).send({ error: 'invalid_credentials' });
    }

    await issueSession(store, user.id, reply);
    return reply.status(200).send({ id: user.id, email: user.email });
  });

  app.post('/api/auth/signout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      await store.deleteSession(hashSessionToken(token));
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.status(204).send();
  });
}

/**
 * Fastify preHandler that rejects anonymous requests. On success, sets
 * `request.userId` for downstream handlers.
 */
export function requireAuth(store: AuthStore) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }

    const session = await store.findValidSessionByTokenHash(hashSessionToken(token));
    if (!session) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }

    request.userId = session.userId;
  };
}
