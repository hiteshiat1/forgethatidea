import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerStripeWebhookRoutes } from './stripe-webhook-route.js';
import type { StripeWebhookVerifier } from '../stripe-webhook.js';
import {
  createStripeEventProcessor,
  createInMemoryProcessedEventStore,
} from '../stripe-event-processor.js';

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

function buildProcessor(handler = vi.fn(async () => {})) {
  const store = createInMemoryProcessedEventStore();
  const alertOnFailure = vi.fn();
  const processor = createStripeEventProcessor({
    store,
    handlers: { 'checkout.session.completed': handler },
    alertOnFailure,
  });
  return { processor, handler, alertOnFailure };
}

async function buildTestApp(
  verifier: StripeWebhookVerifier = fakeVerifier(),
  processor = buildProcessor().processor,
) {
  const app = Fastify({ logger: false });
  registerStripeWebhookRoutes(app, verifier, 'whsec_test', processor);
  await app.ready();
  return { app };
}

describe('stripe webhook route (#98, #99)', () => {
  it('accepts a validly-signed event and dispatches it to the processor', async () => {
    const { processor, handler } = buildProcessor();
    const { app } = await buildTestApp(fakeVerifier(), processor);

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 'sig-header', 'content-type': 'application/json' },
      payload: '{"id":"evt_test_1"}',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('is idempotent across repeated deliveries of the same event id', async () => {
    const { processor, handler } = buildProcessor();
    const { app } = await buildTestApp(fakeVerifier(), processor);

    await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 'sig-header', 'content-type': 'application/json' },
      payload: '{"id":"evt_test_1"}',
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 'sig-header', 'content-type': 'application/json' },
      payload: '{"id":"evt_test_1"}',
    });

    expect(replay.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
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

  it('returns 500 when a registered handler fails, without a client-facing detail leak', async () => {
    const { processor } = buildProcessor(
      vi.fn(async () => {
        throw new Error('entitlement grant failed: db unreachable');
      }),
    );
    const { app } = await buildTestApp(fakeVerifier(), processor);

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 'sig-header', 'content-type': 'application/json' },
      payload: '{"id":"evt_test_1"}',
    });

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('db unreachable');
  });
});
