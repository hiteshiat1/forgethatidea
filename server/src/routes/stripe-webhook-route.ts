import { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  verifyStripeWebhook,
  isWebhookVerificationFailure,
  type StripeWebhookVerifier,
} from '../stripe-webhook.js';

/**
 * Stripe webhook route (Epic 6.2's "webhook endpoint receives events"):
 * registers its own raw-body content-type parser scoped to this route only
 * — signature verification needs the exact bytes Stripe signed, and the
 * app's default JSON parser would re-serialize the body and break that
 * match. Never touches Fastify's global parser, so every other route's
 * normal JSON parsing is unaffected.
 *
 * Idempotent event processing (dedup by event id, applying the entitlement
 * change) is Epic 6.3's job (#99) — this route's only responsibility is
 * "reject anything that isn't a genuinely Stripe-signed payload."
 */
export function registerStripeWebhookRoutes(
  app: FastifyInstance,
  verifier: StripeWebhookVerifier,
  webhookSecret: string,
) {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req: FastifyRequest, body: string, done: (err: Error | null, body?: string) => void) => {
      done(null, body);
    },
  );

  app.post('/api/webhooks/stripe', async (request, reply) => {
    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string' || signature.length === 0) {
      return reply.status(400).send({ error: 'missing_signature' });
    }

    const payload = request.body as string;
    const result = verifyStripeWebhook(verifier, payload, signature, webhookSecret);

    if (isWebhookVerificationFailure(result)) {
      request.log.warn({ details: result.details }, 'rejected stripe webhook: invalid signature');
      return reply.status(400).send({ error: 'invalid_signature' });
    }

    return reply.status(200).send({ received: true });
  });
}
