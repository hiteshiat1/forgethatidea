import { randomUUID } from 'node:crypto';
import type { SessionStore } from './session-store.js';
import type { SessionCard } from './phase-gates.js';
import type { TurnEvent } from './turn-events.js';

export interface ArchitectureComponent {
  name: string;
  description: string;
}

export interface ArchitectureConnection {
  from: string;
  to: string;
  label: string;
}

export interface ArchitectureCardContent {
  summary: string;
  components: ArchitectureComponent[];
  connections: ArchitectureConnection[];
}

export interface RenderArchitectureToolDeps {
  store: SessionStore;
  sessionId: string;
  /** Called with a card_emitted event immediately after a successful render. */
  onEvent: (event: TurnEvent) => void;
}

export type RenderArchitectureResult =
  | { ok: true; card: SessionCard & { content: ArchitectureCardContent } }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'invalid_input' };

export type LockArchitectureResult =
  | { ok: true; card: SessionCard & { content: ArchitectureCardContent } }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'no_architecture_card' };

const CARD_TYPE = 'architecture';

/**
 * Technical jargon disallowed in architecture text (Epic 3.2's "non-technical
 * labels enforced"). Deliberately a denylist of common backend/infra terms
 * rather than an allowlist of plain words — the target audience is a
 * non-technical founder, and "API"/"database"/"backend" are exactly the
 * words that make an architecture explanation feel opaque to them. Case
 * insensitive, matched as whole words so e.g. "restaurant" doesn't false-
 * positive on "REST".
 */
const TECHNICAL_JARGON = [
  'api',
  'database',
  'db',
  'server',
  'backend',
  'front-end',
  'frontend',
  'rest',
  'restful',
  'endpoint',
  'microservice',
  'container',
  'kubernetes',
  'docker',
  'sql',
  'nosql',
  'json',
  'http',
  'https',
  'crud',
  'orm',
  'middleware',
  'webhook',
];

function containsJargon(text: string): boolean {
  const lower = text.toLowerCase();
  return TECHNICAL_JARGON.some((term) => new RegExp(`\\b${term}\\b`).test(lower));
}

function isComponent(value: unknown): value is ArchitectureComponent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name: unknown }).name === 'string' &&
    (value as { name: string }).name.trim().length > 0 &&
    typeof (value as { description: unknown }).description === 'string' &&
    (value as { description: string }).description.trim().length > 0
  );
}

function isConnection(value: unknown): value is ArchitectureConnection {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { from: unknown }).from === 'string' &&
    typeof (value as { to: unknown }).to === 'string' &&
    typeof (value as { label: unknown }).label === 'string' &&
    (value as { label: string }).label.trim().length > 0
  );
}

function isRenderArchitectureInput(input: unknown): input is ArchitectureCardContent {
  if (typeof input !== 'object' || input === null) return false;
  const { summary, components, connections } = input as Record<string, unknown>;

  if (typeof summary !== 'string' || summary.trim().length === 0) return false;
  if (!Array.isArray(components) || components.length === 0) return false;
  if (!components.every(isComponent)) return false;
  if (!Array.isArray(connections) || !connections.every(isConnection)) return false;

  if (containsJargon(summary)) return false;
  if (components.some((c) => containsJargon(c.description) || containsJargon(c.name))) {
    return false;
  }

  const componentNames = new Set(components.map((c) => c.name));
  if (connections.some((c) => !componentNames.has(c.from) || !componentNames.has(c.to))) {
    return false;
  }

  return true;
}

/**
 * `render_architecture` + `lock_architecture` tools (Epic 3.2): the agent's
 * interface for presenting a plain-language system architecture (boxes and
 * arrows, described for a non-technical founder) and letting them lock it
 * in. Mirrors render-build-options-tool.ts's shape and storage approach —
 * card content on `sessions.cards`, re-render replaces in place.
 *
 * Non-technical enforcement (the issue's "non-technical labels enforced")
 * is a denylist check on the summary and every component's name/description
 * — see TECHNICAL_JARGON. Connections aren't checked for jargon since their
 * `label` is meant to describe the *action* ("saves habit check-ins"), and
 * `from`/`to` are just references to already-validated component names.
 */
export function createRenderArchitectureTool(deps: RenderArchitectureToolDeps) {
  const { store, sessionId, onEvent } = deps;

  async function render_architecture(rawInput: unknown): Promise<RenderArchitectureResult> {
    if (!isRenderArchitectureInput(rawInput)) {
      return { ok: false, error: 'invalid_input' };
    }

    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const existingCards = session.cards as SessionCard[];
    const existing = existingCards.find((c) => c.type === CARD_TYPE);
    const card: SessionCard & { content: ArchitectureCardContent } = {
      id: existing?.id ?? randomUUID(),
      type: CARD_TYPE,
      // First render is a fresh 'draft'; any later re-render (chat-based
      // refinement before locking, #49) moves it to 'refined'.
      status: existing ? 'refined' : 'draft',
      content: rawInput,
    };

    const cards = existing
      ? existingCards.map((c) => (c.type === CARD_TYPE ? card : c))
      : [...existingCards, card];

    await store.update(sessionId, { cards });
    onEvent({ type: 'card_emitted', cardId: card.id, cardType: CARD_TYPE });

    return { ok: true, card };
  }

  async function lock_architecture(_rawInput: unknown): Promise<LockArchitectureResult> {
    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const existingCards = session.cards as SessionCard[];
    const existing = existingCards.find((c) => c.type === CARD_TYPE) as
      | (SessionCard & { content: ArchitectureCardContent })
      | undefined;
    if (!existing) {
      return { ok: false, error: 'no_architecture_card' };
    }

    const card: SessionCard & { content: ArchitectureCardContent } = {
      ...existing,
      status: 'locked',
    };
    const cards = existingCards.map((c) => (c.type === CARD_TYPE ? card : c));
    await store.update(sessionId, { cards });

    return { ok: true, card };
  }

  return { render_architecture, lock_architecture };
}
