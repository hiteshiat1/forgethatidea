import type { Phase } from '@forge/shared';

/**
 * Ordered events emitted during one agent turn (Epic 2.12) — phase changes
 * and card emissions, in the exact order they occurred, so the client can
 * update the phase rail and canvas correctly without racing each other.
 * Returned alongside the final reply in the turn response rather than
 * pushed over a separate streaming transport (no WebSocket/SSE exists
 * anywhere in this codebase yet) — see agent-orchestrator.ts for how these
 * are collected.
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
