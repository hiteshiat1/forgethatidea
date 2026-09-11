export interface RateLimitAllowed {
  allowed: true;
}

export interface RateLimitRejected {
  allowed: false;
  retryAfterMs: number;
}

export type RateLimitResult = RateLimitAllowed | RateLimitRejected;

/**
 * Explicit type guard rather than relying on inline `.allowed` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isRateLimitRejected(result: RateLimitResult): result is RateLimitRejected {
  return result.allowed === false;
}

export interface RefinementRateLimiterOptions {
  /** Minimum interval between two allowed refine-app calls on the same session. */
  cooldownMs: number;
}

/**
 * Session-scoped cooldown between refine-app calls (Epic 5.7's "rate
 * limiting per session") — distinct from the round limit (#85), which caps
 * total usage rather than request velocity. Catches rapid-fire/scripted
 * spam without affecting normal human typing-and-thinking pace between
 * refinements. Plain in-memory map is enough: this only needs to survive
 * for the lifetime of a single server process, not persist across restarts
 * or be shared across instances, since it's a UX-pacing guard rather than a
 * hard security boundary (the round limit and content-safety checks are
 * the actual boundaries).
 */
export type RefinementRateLimiter = ReturnType<typeof createRefinementRateLimiter>;

export function createRefinementRateLimiter(options: RefinementRateLimiterOptions) {
  const { cooldownMs } = options;
  const lastAllowedAt = new Map<string, number>();

  function check(sessionId: string): RateLimitResult {
    const now = Date.now();
    const last = lastAllowedAt.get(sessionId);

    if (last !== undefined && now - last < cooldownMs) {
      return { allowed: false, retryAfterMs: cooldownMs - (now - last) };
    }

    lastAllowedAt.set(sessionId, now);
    return { allowed: true };
  }

  return { check };
}
