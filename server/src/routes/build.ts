import { type FastifyInstance } from 'fastify';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';
import {
  isBuildFailure,
  type BuildFailure,
  type createBuildOrchestrator,
} from '../build-orchestrator.js';

const ERROR_STATUS: Record<BuildFailure['error'], number> = {
  session_not_found: 404,
  manifest_not_frozen: 409,
  cost_cap_exceeded: 429,
  content_blocked: 422,
  build_failed: 502,
};

/**
 * Build route (Epic 4, wiring the generation pipeline #61-67/#74 into a
 * real HTTP entry point): the session must already be frozen into the
 * `build` phase (#61 — entering that phase is what freezes the manifest)
 * before a build can run; this route is auth + ownership + delegating the
 * real work to the build orchestrator, same shape as agent.ts's message
 * route.
 */
export function registerBuildRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  sessionStore: SessionStore,
  orchestrator: ReturnType<typeof createBuildOrchestrator>,
) {
  const auth = requireAuth(authStore);

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/build',
    { preHandler: auth },
    async (request, reply) => {
      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const result = await orchestrator.handleBuild(request.params.id, request.userId!);

      if (isBuildFailure(result)) {
        return reply.status(ERROR_STATUS[result.error]).send(result);
      }

      return reply.status(200).send(result);
    },
  );
}
