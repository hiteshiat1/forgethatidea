import { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  verifyStripeWebhook,
  isWebhookVerificationFailure,
  type StripeWebhookVerifier,
} from '../stripe-webhook.js';
import {
  isEventProcessingFailure,
  type createStripeEventProcessor,
} from '../stripe-event-processor.js';

/**
 * Stripe webhook route (Epic 6.2's "webhook endpoint receives events" +
 * Epic 6.3's idempotent processing, #99): registers its own raw-body
 * content-type parser scoped to this route only — signature verification
 * needs the exact bytes Stripe signed, and the app's default JSON parser
 * would re-serialize the body and break that match. Never touches
 * Fastify's global parser, so every other route's normal JSON parsing is
 * unaffected.
 *
 * A verified event is handed to the event processor (stripe-event-
 * processor.ts), which dedupes by event id and dispatches to a registered
 * handler — this route's own job stops at "reject anything that isn't a
 * genuinely Stripe-signed payload" and "500 without leaking a handler's
 * internal error to the caller" (the real detail still reaches
 * alertOnFailure/logs).
 */
export function registerStripeWebhookRoutes(
  app: FastifyInstance,
  verifier: StripeWebhookVerifier,
  webhookSecret: string,
  processor: ReturnType<typeof createStripeEventProcessor>,
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
    const verification = verifyStripeWebhook(verifier, payload, signature, webhookSecret);

    if (isWebhookVerificationFailure(verification)) {
      request.log.warn(
        { details: verification.details },
        'rejected stripe webhook: invalid signature',
      );
      return reply.status(400).send({ error: 'invalid_signature' });
    }

    const result = await processor.processEvent(verification.event);
    if (isEventProcessingFailure(result)) {
      request.log.error(
        {
          eventId: verification.event.id,
          eventType: verification.event.type,
          details: result.details,
        },
        'stripe webhook handler failed',
      );
      return reply.status(500).send({ error: 'handler_failed' });
    }

    return reply.status(200).send({ received: true });
  });
}
