import { type FastifyInstance } from 'fastify';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';
import { type ManifestStore } from '../manifest-store.js';
import { type ArtifactStore } from '../artifact-store.js';
import { getActiveAppArtifact } from '../artifact-versioning.js';
import { buildExportedFile } from '../export-app.js';
import { emitAnalyticsEvent, type AnalyticsLogger } from '../analytics.js';

/**
 * App download/export route (Epic 4.14): downloads the session's active
 * build (#74's `activeAppVersion` — never just "latest", consistent with
 * how revert works) as a single .jsx file, wrapped with a comment-block
 * README (#75's own export-app.ts). Tracks an `app_exported` analytics
 * event on every successful download, per the issue's "export event
 * tracked" acceptance criterion.
 */
export function registerExportRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  sessionStore: SessionStore,
  manifestStore: ManifestStore,
  artifactStore: ArtifactStore,
  analyticsLogger: AnalyticsLogger,
) {
  const auth = requireAuth(authStore);

  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/export',
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
        return reply.status(409).send({ ok: false, error: 'no_build_to_export' });
      }

      const { code } = artifact.content as { code: string };
      const manifest = await manifestStore.getLatest(request.params.id);
      const productName = manifest?.data.productName ?? 'Your App';
      const file = buildExportedFile(code, productName);

      emitAnalyticsEvent(analyticsLogger, {
        type: 'app_exported',
        sessionId: request.params.id,
        version: artifact.version,
      });

      return reply
        .header('Content-Disposition', `attachment; filename="app-v${artifact.version}.jsx"`)
        .header('Content-Type', 'text/javascript; charset=utf-8')
        .status(200)
        .send(file);
    },
  );
}
