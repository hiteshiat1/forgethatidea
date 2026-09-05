import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';
import { isHandleTurnFailure, type createAgentOrchestrator } from '../agent-orchestrator.js';

const messageSchema = z.object({
  text: z.string().trim().min(1),
});

/**
 * Agent conversation route (Epic 2): the HTTP entry point for a turn — send
 * a user message, get the agent's reply. Delegates all the real work
 * (system prompt, tool calls, phase awareness, cost guard, persistence) to
 * the orchestrator; this route is just auth + ownership + input validation.
 */
export function registerAgentRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  sessionStore: SessionStore,
  orchestrator: ReturnType<typeof createAgentOrchestrator>,
) {
  const auth = requireAuth(authStore);

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/message',
    { preHandler: auth },
    async (request, reply) => {
      const parsed = messageSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_failed' });
      }

      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const result = await orchestrator.handleTurn(
        request.params.id,
        request.userId!,
        parsed.data.text,
      );

      if (isHandleTurnFailure(result)) {
        if (result.error === 'session_not_found') {
          return reply.status(404).send({ error: 'session_not_found' });
        }
        return reply.status(429).send(result);
      }

      return reply.status(200).send(result);
    },
  );
}
