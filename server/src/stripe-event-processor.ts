import type { StripeWebhookEvent } from './stripe-webhook.js';

/**
 * Dedup ledger for already-processed Stripe event ids (Epic 6.3's
 * "idempotent handling, replay-safe") — Stripe's own webhook delivery is
 * at-least-once, so every handler downstream of this must never assume an
 * event id arrives exactly once. Same interface + swappable-implementation
 * pattern as AnalyticsStore/SessionStore.
 */
export interface ProcessedEventStore {
  wasProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
}

export function createInMemoryProcessedEventStore(): ProcessedEventStore {
  const seen = new Set<string>();
  return {
    async wasProcessed(eventId) {
      return seen.has(eventId);
    },
    async markProcessed(eventId) {
      seen.add(eventId);
    },
  };
}

export type StripeEventHandler = (object: Record<string, unknown>) => Promise<void>;

export interface EventFailureAlert {
  eventId: string;
  eventType: string;
  details: string;
}

export interface StripeEventProcessorDeps {
  store: ProcessedEventStore;
  /** One handler per Stripe event type this service cares about — an event type with no registered handler is a harmless no-op, not a failure (Stripe sends many event types no caller here needs). */
  handlers: Record<string, StripeEventHandler>;
  /** Called whenever a registered handler throws (#99's "failure alerts on unprocessed events") — e.g. paging, a Slack post, a metric increment. Never throws itself. */
  alertOnFailure: (alert: EventFailureAlert) => void;
}

export type EventProcessingResult =
  | { ok: true; alreadyProcessed: boolean }
  | { ok: false; error: 'handler_failed'; details: string };

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isEventProcessingFailure(
  result: EventProcessingResult,
): result is Extract<EventProcessingResult, { ok: false }> {
  return result.ok === false;
}

/**
 * Idempotent webhook event dispatch (Epic 6.3): the signature-verified
 * event (stripe-webhook.ts's verifyStripeWebhook, #98) is looked up in the
 * dedup store before its handler ever runs — a replayed event id is a
 * silent no-op rather than a second entitlement grant. An event is marked
 * processed only after its handler succeeds, so a handler failure leaves
 * the event eligible for Stripe's own automatic retry rather than being
 * dropped.
 */
export function createStripeEventProcessor(deps: StripeEventProcessorDeps) {
  const { store, handlers, alertOnFailure } = deps;

  async function processEvent(event: StripeWebhookEvent): Promise<EventProcessingResult> {
    if (await store.wasProcessed(event.id)) {
      return { ok: true, alreadyProcessed: true };
    }

    const handler = handlers[event.type];
    if (!handler) {
      return { ok: true, alreadyProcessed: false };
    }

    try {
      await handler(event.data.object);
      await store.markProcessed(event.id);
      return { ok: true, alreadyProcessed: false };
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      alertOnFailure({ eventId: event.id, eventType: event.type, details });
      return { ok: false, error: 'handler_failed', details };
    }
  }

  return { processEvent };
}
