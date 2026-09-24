import { describe, it, expect, vi } from 'vitest';
import {
  verifyStripeWebhook,
  isWebhookVerificationFailure,
  type StripeWebhookVerifier,
} from './stripe-webhook.js';

function fakeVerifier(overrides: Partial<StripeWebhookVerifier> = {}): StripeWebhookVerifier {
  return {
    constructEvent: vi.fn((_payload: string, _signature: string) => ({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1' } },
    })),
    ...overrides,
  };
}

describe('verifyStripeWebhook (#98)', () => {
  it('returns the parsed event when the signature is valid', () => {
    const verifier = fakeVerifier();

    const result = verifyStripeWebhook(verifier, 'raw-payload', 'sig-header', 'whsec_test');

    expect(result).toMatchObject({
      ok: true,
      event: { id: 'evt_test_1', type: 'checkout.session.completed' },
    });
    expect(verifier.constructEvent).toHaveBeenCalledWith('raw-payload', 'sig-header', 'whsec_test');
  });

  it('rejects with a typed failure when signature verification throws', () => {
    const verifier = fakeVerifier({
      constructEvent: vi.fn(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      }),
    });

    const result = verifyStripeWebhook(verifier, 'tampered-payload', 'bad-sig', 'whsec_test');

    expect(isWebhookVerificationFailure(result)).toBe(true);
    if (isWebhookVerificationFailure(result)) {
      expect(result.error).toBe('invalid_signature');
    }
  });
});
