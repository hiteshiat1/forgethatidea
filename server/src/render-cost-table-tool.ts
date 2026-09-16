import { randomUUID } from 'node:crypto';
import type { SessionStore } from './session-store.js';
import type { SessionCard } from './phase-gates.js';
import type { TurnEvent } from './turn-events.js';

export interface CostLineItem {
  name: string;
  monthlyCostCents: number;
  /** Why this figure — grounds the number rather than presenting a bare price. */
  assumption: string;
  /** The page this figure was sourced from — every line item must carry one (the issue's "no invented prices"). */
  sourceUrl: string;
}

export interface CostScaleInput {
  /** Plain label for this scale point, e.g. "100 users" or "1,000 users". */
  label: string;
  lineItems: CostLineItem[];
}

export interface CostScale extends CostScaleInput {
  totalMonthlyCostCents: number;
  totalYearlyCostCents: number;
}

export interface CostTableCardContent {
  scales: CostScale[];
}

export interface RenderCostTableToolDeps {
  store: SessionStore;
  sessionId: string;
  /** Called with a card_emitted event immediately after a successful render. */
  onEvent: (event: TurnEvent) => void;
}

export type RenderCostTableResult =
  | { ok: true; card: SessionCard & { content: CostTableCardContent } }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'invalid_input' };

export type LockCostTableResult =
  | { ok: true; card: SessionCard & { content: CostTableCardContent } }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'no_cost_card' };

const CARD_TYPE = 'cost';

function isLineItem(value: unknown): value is CostLineItem {
  if (typeof value !== 'object' || value === null) return false;
  const { name, monthlyCostCents, assumption, sourceUrl } = value as Record<string, unknown>;
  return (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    typeof monthlyCostCents === 'number' &&
    Number.isFinite(monthlyCostCents) &&
    monthlyCostCents >= 0 &&
    typeof assumption === 'string' &&
    assumption.trim().length > 0 &&
    typeof sourceUrl === 'string' &&
    sourceUrl.trim().length > 0
  );
}

function isScaleInput(value: unknown): value is CostScaleInput {
  if (typeof value !== 'object' || value === null) return false;
  const { label, lineItems } = value as Record<string, unknown>;
  return (
    typeof label === 'string' &&
    label.trim().length > 0 &&
    Array.isArray(lineItems) &&
    lineItems.length > 0 &&
    lineItems.every(isLineItem)
  );
}

function isRenderCostTableInput(input: unknown): input is { scales: CostScaleInput[] } {
  if (typeof input !== 'object' || input === null || !('scales' in input)) return false;
  const scales = (input as { scales: unknown }).scales;
  return Array.isArray(scales) && scales.length > 0 && scales.every(isScaleInput);
}

function withTotals(scale: CostScaleInput): CostScale {
  const totalMonthlyCostCents = scale.lineItems.reduce(
    (sum, item) => sum + item.monthlyCostCents,
    0,
  );
  return {
    ...scale,
    totalMonthlyCostCents,
    totalYearlyCostCents: totalMonthlyCostCents * 12,
  };
}

/**
 * `render_cost_table` + `lock_cost_table` tools (Epic 3.4): line-item
 * monthly/yearly cost estimates across one or more usage scales (the
 * issue's "scale toggle", e.g. 100 vs 1,000 users) — the agent supplies a
 * full set of sourced line items per scale directly rather than the tool
 * deriving other scale points from a formula, since there's no real,
 * sourced scaling formula to apply generically across providers (see
 * pricing-catalog.ts, #46, for where the agent should ground these
 * figures). Every line item requires both an `assumption` (why this
 * number) and a `sourceUrl` (where it came from) — enforced here as a hard
 * validation failure, not just prompt guidance, satisfying the issue's
 * "no invented prices" as an actual invariant rather than a suggestion.
 *
 * Storage/re-render/lock behavior mirrors render-build-options-tool.ts and
 * render-architecture-tool.ts.
 */
export function createRenderCostTableTool(deps: RenderCostTableToolDeps) {
  const { store, sessionId, onEvent } = deps;

  async function render_cost_table(rawInput: unknown): Promise<RenderCostTableResult> {
    if (!isRenderCostTableInput(rawInput)) {
      return { ok: false, error: 'invalid_input' };
    }

    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const content: CostTableCardContent = { scales: rawInput.scales.map(withTotals) };
    const existingCards = session.cards as SessionCard[];
    const existing = existingCards.find((c) => c.type === CARD_TYPE);
    const card: SessionCard & { content: CostTableCardContent } = {
      id: existing?.id ?? randomUUID(),
      type: CARD_TYPE,
      status: 'draft',
      content,
    };

    const cards = existing
      ? existingCards.map((c) => (c.type === CARD_TYPE ? card : c))
      : [...existingCards, card];

    await store.update(sessionId, { cards });
    onEvent({ type: 'card_emitted', cardId: card.id, cardType: CARD_TYPE });

    return { ok: true, card };
  }

  async function lock_cost_table(_rawInput: unknown): Promise<LockCostTableResult> {
    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const existingCards = session.cards as SessionCard[];
    const existing = existingCards.find((c) => c.type === CARD_TYPE) as
      | (SessionCard & { content: CostTableCardContent })
      | undefined;
    if (!existing) {
      return { ok: false, error: 'no_cost_card' };
    }

    const card: SessionCard & { content: CostTableCardContent } = {
      ...existing,
      status: 'locked',
    };
    const cards = existingCards.map((c) => (c.type === CARD_TYPE ? card : c));
    await store.update(sessionId, { cards });

    return { ok: true, card };
  }

  return { render_cost_table, lock_cost_table };
}
