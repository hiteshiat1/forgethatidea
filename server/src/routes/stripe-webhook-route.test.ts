import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerStripeWebhookRoutes } from './stripe-webhook-route.js';
import type { StripeWebhookVerifier } from '../stripe-webhook.js';

function fakeVerifier(overrides: Partial<StripeWebhookVerifier> = {}): StripeWebhookVerifier {
  return {
    constructEvent: vi.fn(() => ({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1' } },
    })),
    ...overrides,
  };
}

async function buildTestApp(verifier: StripeWebhookVerifier = fakeVerifier()) {
  const app = Fastify({ logger: false });
  registerStripeWebhookRoutes(app, verifier, 'whsec_test');
  await app.ready();
  return { app };
}

describe('stripe webhook route (#98)', () => {
  it('accepts a validly-signed event', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 'sig-header', 'content-type': 'application/json' },
      payload: '{"id":"evt_test_1"}',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true });
  });

  it('rejects a request with a missing signature header', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: '{"id":"evt_test_1"}',
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects a request with an invalid signature', async () => {
    const verifier = fakeVerifier({
      constructEvent: vi.fn(() => {
        throw new Error('signature mismatch');
      }),
    });
    const { app } = await buildTestApp(verifier);

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 'bad-sig', 'content-type': 'application/json' },
      payload: '{"id":"evt_test_1"}',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_signature' });
  });
});
