import type { Phase } from '@forge/shared';

/**
 * Frontend mirror of the server's TurnEvent (server/src/turn-events.ts) —
 * kept as a separate type rather than a shared import (server and app don't
 * share runtime code, only @forge/shared). Ordered phase/card events
 * returned alongside a turn's reply, applied in order so the phase rail and
 * canvas update correctly without racing each other — "ordering guaranteed"
 * per Epic 2.12.
 */
export interface PhaseChangedEvent {
  type: 'phase_changed';
  from: Phase;
  to: Phase;
}

export interface CardEmittedEvent {
  type: 'card_emitted';
  cardId: string;
  cardType: string;
}

export type TurnEvent = PhaseChangedEvent | CardEmittedEvent;

export interface TurnEventState {
  phase: Phase;
  /**
   * IDs of cards emitted so far, in emission order. Tracks presence/order
   * only — real card *content* (title, status, body) comes from the render
   * tools Epic 3 adds (render_build_options, etc., not yet built); this is
   * ready to hold that content once those tools exist without changing the
   * reducer's contract.
   */
  cardIds: string[];
}

/**
 * Applies one ordered batch of TurnEvents to phase/canvas state — the
 * client-side half of Epic 2.12. Pure and side-effect-free so it's testable
 * without a real backend connection, and safe to call repeatedly as more
 * turns' events arrive.
 */
export function applyTurnEvents(state: TurnEventState, events: TurnEvent[]): TurnEventState {
  return events.reduce((acc, event) => {
    if (event.type === 'phase_changed') {
      return { ...acc, phase: event.to };
    }
    return { ...acc, cardIds: [...acc.cardIds, event.cardId] };
  }, state);
}
