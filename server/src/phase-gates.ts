import type { Phase } from '@forge/shared';

/**
 * Minimal shape of a canvas card as stored in `sessions.cards` (#22, JSONB).
 * Mirrors the client's CardStatus values (app/src/components/CanvasPane.tsx)
 * by convention — kept as a separate, server-side type rather than importing
 * from `@forge/app` (server must never depend on the frontend package). Once
 * the manifest schema (#32) formalizes card shapes, this can import from
 * there instead.
 */
export interface SessionCard {
  id: string;
  type: string;
  status: 'draft' | 'refined' | 'locked' | 'live';
}

export interface GateResult {
  passed: boolean;
  /** Required card types not yet present-and-locked. Empty when passed. */
  missing: string[];
}

/**
 * Card types required, all locked, before the `build` phase may start —
 * "all four cards locked before build" per the issue.
 */
const BUILD_GATE_REQUIRED_CARD_TYPES = ['options', 'architecture', 'cost', 'marketing'] as const;

/**
 * Phase gates (Epic 2.2): content rules layered on top of the structural
 * phase state machine (#28). `canTransition`/`transition` (#28) answer "is
 * this a legal *shape* of move"; `checkGate` answers "has enough real work
 * happened to justify entering `to`". Only phases with a defined rule here
 * are gated — everything else passes trivially until a future issue adds one.
 */
export function checkGate(to: Phase, cards: SessionCard[]): GateResult {
  if (to === 'build') {
    const missing = BUILD_GATE_REQUIRED_CARD_TYPES.filter(
      (type) => !cards.some((card) => card.type === type && card.status === 'locked'),
    );
    return { passed: missing.length === 0, missing };
  }

  return { passed: true, missing: [] };
}
