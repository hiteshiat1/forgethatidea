import { describe, it, expect, vi } from 'vitest';
import {
  createStripeEventProcessor,
  createInMemoryProcessedEventStore,
  isEventProcessingFailure,
} from './stripe-event-processor.js';
import type { StripeWebhookEvent } from './stripe-webhook.js';

function event(overrides: Partial<StripeWebhookEvent> = {}): StripeWebhookEvent {
  return {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1' } },
    ...overrides,
  };
}

describe('stripe event processor (#99)', () => {
  it('dispatches an event to its registered handler exactly once', async () => {
    const store = createInMemoryProcessedEventStore();
    const handler = vi.fn(async () => {});
    const alertOnFailure = vi.fn();
    const processor = createStripeEventProcessor({
      store,
      handlers: { 'checkout.session.completed': handler },
      alertOnFailure,
    });

    const result = await processor.processEvent(event());

    expect(result).toEqual({ ok: true, alreadyProcessed: false });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event().data.object);
    expect(alertOnFailure).not.toHaveBeenCalled();
  });

  it('is idempotent — replaying the same event id does not re-invoke the handler', async () => {
    const store = createInMemoryProcessedEventStore();
    const handler = vi.fn(async () => {});
    const processor = createStripeEventProcessor({
      store,
      handlers: { 'checkout.session.completed': handler },
      alertOnFailure: vi.fn(),
    });

    const first = await processor.processEvent(event());
    const replay = await processor.processEvent(event());

    expect(first).toEqual({ ok: true, alreadyProcessed: false });
    expect(replay).toEqual({ ok: true, alreadyProcessed: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('treats an unrecognized event type as a harmless no-op, not a failure', async () => {
    const store = createInMemoryProcessedEventStore();
    const alertOnFailure = vi.fn();
    const processor = createStripeEventProcessor({
      store,
      handlers: { 'checkout.session.completed': vi.fn() },
      alertOnFailure,
    });

    const result = await processor.processEvent(event({ type: 'customer.updated' }));

    expect(result).toEqual({ ok: true, alreadyProcessed: false });
    expect(alertOnFailure).not.toHaveBeenCalled();
  });

  it('alerts and returns a typed failure when a handler throws, without marking the event processed', async () => {
    const store = createInMemoryProcessedEventStore();
    const alertOnFailure = vi.fn();
    const handler = vi.fn(async () => {
      throw new Error('entitlement grant failed: db unreachable');
    });
    const processor = createStripeEventProcessor({
      store,
      handlers: { 'checkout.session.completed': handler },
      alertOnFailure,
    });

    const result = await processor.processEvent(event());

    expect(isEventProcessingFailure(result)).toBe(true);
    if (isEventProcessingFailure(result)) {
      expect(result.error).toBe('handler_failed');
      expect(result.details).toContain('entitlement grant failed');
    }
    expect(alertOnFailure).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt_1', eventType: 'checkout.session.completed' }),
    );

    // Not marked processed — a retry (Stripe's own webhook retry behavior)
    // must be able to try the handler again rather than silently dropping
    // an event whose handler failed.
    const retry = await processor.processEvent(event());
    expect(handler).toHaveBeenCalledTimes(2);
    expect(isEventProcessingFailure(retry)).toBe(true);
  });
});

describe('createInMemoryProcessedEventStore (#99)', () => {
  it('reports an event id as unprocessed until markProcessed is called', async () => {
    const store = createInMemoryProcessedEventStore();

    expect(await store.wasProcessed('evt_1')).toBe(false);
    await store.markProcessed('evt_1');
    expect(await store.wasProcessed('evt_1')).toBe(true);
  });
});
