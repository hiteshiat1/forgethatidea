import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';
import {
  isRefineAppFailure,
  type RefineAppFailure,
  type createRefineAppOrchestrator,
} from '../refine-app-orchestrator.js';

const refineAppSchema = z.object({
  changeRequest: z.string().trim().min(1),
});

const ERROR_STATUS: Record<RefineAppFailure['error'], number> = {
  session_not_found: 404,
  no_build_to_refine: 409,
  refinement_limit_reached: 429,
  edit_failed: 502,
};

/**
 * Refine-app route (Epic 4.15, wiring the diff-edit pipeline into a real
 * HTTP entry point): applies a targeted edit to the session's active build,
 * same auth + ownership + delegate-to-orchestrator shape as build.ts.
 */
export function registerRefineAppRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  sessionStore: SessionStore,
  orchestrator: ReturnType<typeof createRefineAppOrchestrator>,
) {
  const auth = requireAuth(authStore);

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/refine-app',
    { preHandler: auth },
    async (request, reply) => {
      const parsed = refineAppSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_failed' });
      }

      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const result = await orchestrator.handleRefine(request.params.id, parsed.data.changeRequest);

      if (isRefineAppFailure(result)) {
        return reply.status(ERROR_STATUS[result.error]).send(result);
      }

      return reply.status(200).send(result);
    },
  );
}
