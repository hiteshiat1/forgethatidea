import { type FastifyInstance } from 'fastify';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import type { createEntitlementsService } from '../entitlements.js';

/**
 * Entitlements read route (Epic 6.5's "unlock applies without refresh"):
 * lets the frontend re-check what the authenticated user owns after
 * returning from a Stripe checkout, without needing a full page reload or
 * a fresh session fetch — the client polls/refetches this on the checkout
 * return page and reflects the unlock as soon as the webhook (#99) has
 * granted it (#100).
 */
export function registerEntitlementsRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  entitlements: ReturnType<typeof createEntitlementsService>,
) {
  const auth = requireAuth(authStore);

  app.get('/api/entitlements', { preHandler: auth }, async (request, reply) => {
    const owned = await entitlements.listEntitlements(request.userId!);
    return reply.status(200).send({ owned });
  });
}
