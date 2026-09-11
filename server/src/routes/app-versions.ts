import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';
import { type ArtifactStore } from '../artifact-store.js';
import { revertToAppVersion, isArtifactVersioningFailure } from '../artifact-versioning.js';

const versionParamSchema = z.object({
  id: z.string(),
  version: z.coerce.number().int().positive(),
});

/**
 * Version list + revert routes (Epic 5.6): lets the UI show every app build
 * with its timestamp and change summary (#90's "version list with
 * timestamps + change summary"), and one-click revert to an earlier one.
 * Reverting only repoints `activeAppVersion` (artifact-versioning.ts,
 * #74/#76) — never deletes or reorders artifact rows, so a later re-revert
 * forward stays possible, and it never touches the refinement round
 * counter ("doesn't consume a round" per the issue).
 */
export function registerAppVersionsRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  sessionStore: SessionStore,
  artifactStore: ArtifactStore,
) {
  const auth = requireAuth(authStore);

  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/app/versions',
    { preHandler: auth },
    async (request, reply) => {
      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const versions = await artifactStore.listVersions(request.params.id, 'app');
      const sorted = [...versions].sort((a, b) => b.version - a.version);

      return reply.status(200).send({
        activeVersion: session.activeAppVersion,
        versions: sorted.map((artifact) => {
          const { changeSummary } = artifact.content as { changeSummary?: string };
          return {
            version: artifact.version,
            createdAt: artifact.createdAt,
            changeSummary: changeSummary ?? '',
          };
        }),
      });
    },
  );

  app.post<{ Params: { id: string; version: string } }>(
    '/api/sessions/:id/app/versions/:version/revert',
    { preHandler: auth },
    async (request, reply) => {
      const parsed = versionParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_failed' });
      }

      const session = await sessionStore.get(parsed.data.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const result = await revertToAppVersion({
        sessionStore,
        artifactStore,
        sessionId: parsed.data.id,
        version: parsed.data.version,
      });

      if (isArtifactVersioningFailure(result)) {
        return reply.status(404).send({ ok: false, error: result.error });
      }

      const artifact = await artifactStore.getVersion(parsed.data.id, 'app', result.version);
      const { code } = artifact!.content as { code: string };

      return reply.status(200).send({ ok: true, version: result.version, code });
    },
  );
}
