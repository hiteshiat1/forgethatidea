import { PHASES, type Phase } from '@forge/shared';

/**
 * Server-authoritative phase state machine (Epic 2.1). Declares which
 * transitions are structurally legal — advancing exactly one step along the
 * ordered `PHASES` list (shared/src/phases.ts). This is the *shape* of legal
 * movement; the *content* gates (what conversation/manifest state must be
 * true before a given transition is allowed) are enforced separately by the
 * phase gate layer (#29), which calls `canTransition` first and then applies
 * its own rule on top.
 */

const PHASE_INDEX: Record<Phase, number> = Object.fromEntries(
  PHASES.map((phase, i) => [phase, i]),
) as Record<Phase, number>;

/** True only for a forward, single-step move along the ordered phase list. */
export function canTransition(from: Phase, to: Phase): boolean {
  return PHASE_INDEX[to] === PHASE_INDEX[from] + 1;
}

export class IllegalTransitionError extends Error {
  readonly from: Phase;
  readonly to: Phase;

  constructor(from: Phase, to: Phase) {
    super(`Illegal phase transition: "${from}" -> "${to}".`);
    this.name = 'IllegalTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** Returns `to` if the transition is legal, otherwise throws IllegalTransitionError. */
export function transition(from: Phase, to: Phase): Phase {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}
