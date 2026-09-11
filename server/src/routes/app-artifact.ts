import { type FastifyInstance } from 'fastify';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';
import { type ArtifactStore } from '../artifact-store.js';
import { getActiveAppArtifact } from '../artifact-versioning.js';

/**
 * Active app artifact route (Epic 5.10): returns the session's current
 * build as plain JSON `{ code, version }` — the piece "session resume"
 * (#22/#85) was missing. A resumed session's `phase`/refinement counters
 * already restore correctly (they ride on the session object itself), but
 * the rendered app lived only in `BuildPanel`'s local React state, so a
 * page reload after a real build had no way to get the code back short of
 * triggering a brand new build. This route lets the frontend fetch the
 * existing artifact directly, once, on mount.
 */
export function registerAppArtifactRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  sessionStore: SessionStore,
  artifactStore: ArtifactStore,
) {
  const auth = requireAuth(authStore);

  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/app',
    { preHandler: auth },
    async (request, reply) => {
      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const artifact = await getActiveAppArtifact({
        sessionStore,
        artifactStore,
        sessionId: request.params.id,
      });
      if (!artifact) {
        return reply.status(409).send({ ok: false, error: 'no_build_to_resume' });
      }

      const { code } = artifact.content as { code: string };
      return reply.status(200).send({ ok: true, code, version: artifact.version });
    },
  );
}
