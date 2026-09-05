import type { SessionStore } from './session-store.js';

export type RefinementKind = 'app' | 'marketing';

export interface RefinementLimits {
  app: number;
  marketing: number;
}

export type RecordRefinementRoundResult =
  | { ok: true; rounds: number; limitReached: boolean }
  | { ok: false; error: 'refinement_limit_reached'; kind: RefinementKind; rounds: number }
  | { ok: false; error: 'session_not_found' };

const COUNTER_FIELD: Record<RefinementKind, 'appRefinementRounds' | 'marketingRefinementRounds'> = {
  app: 'appRefinementRounds',
  marketing: 'marketingRefinementRounds',
};

const LIMIT_FIELD: Record<RefinementKind, keyof RefinementLimits> = {
  app: 'app',
  marketing: 'marketing',
};

/**
 * Refinement round tracking (Epic 2.11): counts a "round" as one change
 * request -> re-emit cycle, tracked independently for the app vs marketing
 * deliverables since a real pricing model (Epic 9/11, not yet built) will
 * very likely price them differently. Rejects recording a round once the
 * free-tier limit is already reached — "limit reached triggers gate
 * signal" — rather than silently incrementing past it.
 */
export async function recordRefinementRound(
  store: SessionStore,
  sessionId: string,
  kind: RefinementKind,
  limits: RefinementLimits,
): Promise<RecordRefinementRoundResult> {
  const session = await store.get(sessionId);
  if (!session) {
    return { ok: false, error: 'session_not_found' };
  }

  const field = COUNTER_FIELD[kind];
  const limit = limits[LIMIT_FIELD[kind]];
  const current = session[field];

  if (current >= limit) {
    return { ok: false, error: 'refinement_limit_reached', kind, rounds: current };
  }

  const rounds = current + 1;
  await store.update(sessionId, { [field]: rounds });

  return { ok: true, rounds, limitReached: rounds >= limit };
}
