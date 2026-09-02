import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { z } from 'zod';
import { PHASES } from '@forge/shared';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';

const updateSchema = z.object({
  phase: z.enum(PHASES).optional(),
  chat: z.array(z.unknown()).optional(),
  cards: z.array(z.unknown()).optional(),
});

/**
 * Session persistence & resume routes (Epic 1.10). All routes require an
 * authenticated user (via requireAuth, Epic 0.8) so a session is always tied
 * to a real account — satisfies "session tied to authenticated user".
 */
export function registerSessionRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  store: SessionStore,
) {
  const auth = requireAuth(authStore);

  app.post(
    '/api/sessions',
    { preHandler: auth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await store.create(request.userId!);
      return reply.status(201).send(session);
    },
  );

  // Resume: latest session for the authenticated user, or null if they have
  // none yet. "Resume lands on correct phase" — the client reads `phase`
  // straight off this response and routes the UI accordingly.
  app.get(
    '/api/sessions/latest',
    { preHandler: auth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [latest] = await store.listByUser(request.userId!);
      return reply.status(200).send(latest ?? null);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: auth },
    async (request, reply) => {
      const session = await store.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }
      return reply.status(200).send(session);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: auth },
    async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_failed' });
      }

      const existing = await store.get(request.params.id);
      if (!existing || existing.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const updated = await store.update(request.params.id, parsed.data);
      return reply.status(200).send(updated);
    },
  );
}
