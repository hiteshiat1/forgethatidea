import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRefinementRateLimiter } from './refinement-rate-limiter.js';

describe('createRefinementRateLimiter (#91)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first refinement call for a session', () => {
    const limiter = createRefinementRateLimiter({ cooldownMs: 3000 });
    const result = limiter.check('session-1');
    expect(result.allowed).toBe(true);
  });

  it('rejects a second call within the cooldown window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = createRefinementRateLimiter({ cooldownMs: 3000 });

    limiter.check('session-1');
    vi.setSystemTime(1000);
    const result = limiter.check('session-1');

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBe(2000);
    }
  });

  it('allows a call once the cooldown has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = createRefinementRateLimiter({ cooldownMs: 3000 });

    limiter.check('session-1');
    vi.setSystemTime(3000);
    const result = limiter.check('session-1');

    expect(result.allowed).toBe(true);
  });

  it('tracks each session independently', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = createRefinementRateLimiter({ cooldownMs: 3000 });

    limiter.check('session-1');
    const result = limiter.check('session-2');

    expect(result.allowed).toBe(true);
  });

  it('only starts the cooldown on an allowed call, not a rejected one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = createRefinementRateLimiter({ cooldownMs: 3000 });

    limiter.check('session-1'); // allowed, t=0
    vi.setSystemTime(1000);
    limiter.check('session-1'); // rejected, t=1000 — must not reset the window
    vi.setSystemTime(3000);
    const result = limiter.check('session-1'); // 3000ms since the allowed call at t=0

    expect(result.allowed).toBe(true);
  });
});
