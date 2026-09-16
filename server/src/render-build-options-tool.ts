import { randomUUID } from 'node:crypto';
import type { SessionStore } from './session-store.js';
import type { SessionCard } from './phase-gates.js';
import type { TurnEvent } from './turn-events.js';

export interface BuildOption {
  name: string;
  summary: string;
}

export interface BuildOptionsCardContent {
  options: BuildOption[];
  selectedIndex: number | null;
}

export interface RenderBuildOptionsToolDeps {
  store: SessionStore;
  sessionId: string;
  /** Called with a card_emitted event immediately after a successful render. */
  onEvent: (event: TurnEvent) => void;
}

export type RenderBuildOptionsResult =
  | { ok: true; card: SessionCard & { content: BuildOptionsCardContent } }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'invalid_input' };

export type SelectBuildOptionResult =
  | { ok: true; card: SessionCard & { content: BuildOptionsCardContent } }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'invalid_input' }
  | { ok: false; error: 'no_options_card' };

const CARD_TYPE = 'options';

function isBuildOption(value: unknown): value is BuildOption {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name: unknown }).name === 'string' &&
    (value as { name: string }).name.trim().length > 0 &&
    typeof (value as { summary: unknown }).summary === 'string' &&
    (value as { summary: string }).summary.trim().length > 0
  );
}

function isRenderBuildOptionsInput(input: unknown): input is { options: BuildOption[] } {
  if (typeof input !== 'object' || input === null || !('options' in input)) return false;
  const options = (input as { options: unknown }).options;
  return Array.isArray(options) && options.length === 3 && options.every(isBuildOption);
}

function isSelectBuildOptionInput(input: unknown): input is { index: number } {
  return (
    typeof input === 'object' &&
    input !== null &&
    'index' in input &&
    typeof (input as { index: unknown }).index === 'number' &&
    Number.isInteger((input as { index: number }).index)
  );
}

/**
 * `render_build_options` + `select_build_option` tools (Epic 3.1): the
 * agent's interface for presenting exactly 3 structured build-direction
 * options and letting the user lock one in. Card content lives directly on
 * `sessions.cards` (mirroring the SessionCard shape phase-gates.ts already
 * defines) rather than a separate store, since the client already receives
 * the full session (including `cards`) on every `GET /api/sessions/:id` —
 * no new route needed to get this content to the UI.
 *
 * Re-rendering (calling render_build_options again on a session that
 * already has an options card) replaces that card in place rather than
 * appending a second one — an options card is a single evolving draft, not
 * a history of alternatives.
 */
export function createRenderBuildOptionsTool(deps: RenderBuildOptionsToolDeps) {
  const { store, sessionId, onEvent } = deps;

  async function render_build_options(rawInput: unknown): Promise<RenderBuildOptionsResult> {
    if (!isRenderBuildOptionsInput(rawInput)) {
      return { ok: false, error: 'invalid_input' };
    }

    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const existingCards = session.cards as SessionCard[];
    const existing = existingCards.find((c) => c.type === CARD_TYPE);
    const card: SessionCard & { content: BuildOptionsCardContent } = {
      id: existing?.id ?? randomUUID(),
      type: CARD_TYPE,
      // First render is a fresh 'draft'; any later re-render (the user
      // asked for changes in chat before locking, #49's refinement loop)
      // moves it to 'refined' so the UI reflects it's been iterated on.
      status: existing ? 'refined' : 'draft',
      content: { options: rawInput.options, selectedIndex: null },
    };

    const cards = existing
      ? existingCards.map((c) => (c.type === CARD_TYPE ? card : c))
      : [...existingCards, card];

    await store.update(sessionId, { cards });
    onEvent({ type: 'card_emitted', cardId: card.id, cardType: CARD_TYPE });

    return { ok: true, card };
  }

  async function select_build_option(rawInput: unknown): Promise<SelectBuildOptionResult> {
    if (!isSelectBuildOptionInput(rawInput)) {
      return { ok: false, error: 'invalid_input' };
    }

    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const existingCards = session.cards as SessionCard[];
    const existing = existingCards.find((c) => c.type === CARD_TYPE) as
      | (SessionCard & { content: BuildOptionsCardContent })
      | undefined;
    if (!existing) {
      return { ok: false, error: 'no_options_card' };
    }

    if (rawInput.index < 0 || rawInput.index >= existing.content.options.length) {
      return { ok: false, error: 'invalid_input' };
    }

    const card: SessionCard & { content: BuildOptionsCardContent } = {
      ...existing,
      status: 'locked',
      content: { ...existing.content, selectedIndex: rawInput.index },
    };

    const cards = existingCards.map((c) => (c.type === CARD_TYPE ? card : c));
    await store.update(sessionId, { cards });

    return { ok: true, card };
  }

  return { render_build_options, select_build_option };
}
