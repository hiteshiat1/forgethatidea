import { type FastifyInstance } from 'fastify';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';
import { type ManifestStore } from '../manifest-store.js';
import { type ArtifactStore } from '../artifact-store.js';
import { getActiveAppArtifact } from '../artifact-versioning.js';
import { buildExportedFile, buildPlanSummary } from '../export-app.js';
import { emitAnalyticsEvent, type AnalyticsLogger } from '../analytics.js';
import type { RefinementLimits } from '../refinement-tracker.js';

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
  refinementLimits: RefinementLimits,
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
        fromGate: session.appRefinementRounds >= refinementLimits.app,
      });

      return reply
        .header('Content-Disposition', `attachment; filename="app-v${artifact.version}.jsx"`)
        .header('Content-Type', 'text/javascript; charset=utf-8')
        .status(200)
        .send(file);
    },
  );

  // Plan summary export (Epic 5.9): the free exit's second half — "app .jsx
  // + plan summary doc" — as its own downloadable document rather than
  // folded into the .jsx's comment header, since it's a different kind of
  // artifact (product plan, not run instructions). Deliberately independent
  // of whether a build has ever succeeded: only the frozen/latest manifest
  // is required, so a session that never got past planning can still export
  // its plan.
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/export/summary',
    { preHandler: auth },
    async (request, reply) => {
      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const manifest = await manifestStore.getLatest(request.params.id);
      if (!manifest) {
        return reply.status(409).send({ ok: false, error: 'no_plan_to_summarize' });
      }

      const summary = buildPlanSummary(manifest.data);

      return reply
        .header('Content-Disposition', `attachment; filename="plan-summary.txt"`)
        .header('Content-Type', 'text/plain; charset=utf-8')
        .status(200)
        .send(summary);
    },
  );
}
