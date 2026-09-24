export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Thin wrapper over `stripe.webhooks.constructEvent` — swappable so
 * signature-verification call sites are unit-testable against a fake,
 * matching this codebase's established client-abstraction pattern (see
 * stripe-checkout.ts's StripeClient). The real implementation needs a live
 * STRIPE_WEBHOOK_SECRET to verify end-to-end against actual Stripe-signed
 * payloads.
 */
export interface StripeWebhookVerifier {
  constructEvent(payload: string, signature: string, secret: string): StripeWebhookEvent;
}

export type WebhookVerificationResult =
  | { ok: true; event: StripeWebhookEvent }
  | { ok: false; error: 'invalid_signature'; details: string };

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isWebhookVerificationFailure(
  result: WebhookVerificationResult,
): result is Extract<WebhookVerificationResult, { ok: false }> {
  return result.ok === false;
}

/**
 * Webhook signature verification (Epic 6.2's "webhook endpoint receives
 * events"): never trust an unsigned payload as a real Stripe event — this
 * is the boundary that keeps a POST to the webhook route from being usable
 * to fake a purchase. Idempotent processing of the verified event (dedup by
 * event id) is Epic 6.3's job (#99), not this function's.
 */
export function verifyStripeWebhook(
  verifier: StripeWebhookVerifier,
  payload: string,
  signature: string,
  secret: string,
): WebhookVerificationResult {
  try {
    const event = verifier.constructEvent(payload, signature, secret);
    return { ok: true, event };
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return { ok: false, error: 'invalid_signature', details };
  }
}
