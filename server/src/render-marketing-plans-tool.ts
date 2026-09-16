import { randomUUID } from 'node:crypto';
import type { SessionStore } from './session-store.js';
import type { SessionCard } from './phase-gates.js';
import type { TurnEvent } from './turn-events.js';

export interface MarketingPlan {
  name: string;
  /** Ideal customer profile for this plan's angle. */
  icp: string;
  /** Go-to-market approach. */
  gtm: string;
  seo: string;
  ads: string;
  /** Real competitor names this plan positions against — grounds the plan rather than presenting a generic strategy (the issue's "referencing real competitors"). */
  competitors: string[];
}

export interface MarketingPlansCardContent {
  plans: MarketingPlan[];
  selectedIndex: number | null;
}

export interface RenderMarketingPlansToolDeps {
  store: SessionStore;
  sessionId: string;
  /** Called with a card_emitted event immediately after a successful render. */
  onEvent: (event: TurnEvent) => void;
}

export type RenderMarketingPlansResult =
  | { ok: true; card: SessionCard & { content: MarketingPlansCardContent } }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'invalid_input' };

export type SelectMarketingPlanResult =
  | { ok: true; card: SessionCard & { content: MarketingPlansCardContent } }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'invalid_input' }
  | { ok: false; error: 'no_marketing_card' };

const CARD_TYPE = 'marketing';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMarketingPlan(value: unknown): value is MarketingPlan {
  if (typeof value !== 'object' || value === null) return false;
  const { name, icp, gtm, seo, ads, competitors } = value as Record<string, unknown>;
  return (
    isNonEmptyString(name) &&
    isNonEmptyString(icp) &&
    isNonEmptyString(gtm) &&
    isNonEmptyString(seo) &&
    isNonEmptyString(ads) &&
    Array.isArray(competitors) &&
    competitors.length > 0 &&
    competitors.every(isNonEmptyString)
  );
}

function isRenderMarketingPlansInput(input: unknown): input is { plans: MarketingPlan[] } {
  if (typeof input !== 'object' || input === null || !('plans' in input)) return false;
  const plans = (input as { plans: unknown }).plans;
  return Array.isArray(plans) && plans.length === 3 && plans.every(isMarketingPlan);
}

function isSelectMarketingPlanInput(input: unknown): input is { index: number } {
  return (
    typeof input === 'object' &&
    input !== null &&
    'index' in input &&
    typeof (input as { index: unknown }).index === 'number' &&
    Number.isInteger((input as { index: number }).index)
  );
}

/**
 * `render_marketing_plans` + `select_marketing_plan` tools (Epic 3.5): the
 * agent's interface for presenting exactly 3 marketing plans, each covering
 * ICP/GTM/SEO/ads and referencing real competitors — the agent is expected
 * to have already grounded these via web_search before calling this (see
 * the honesty-rules system prompt section), but the tool itself only
 * enforces the structural contract (every plan needs all 4 angles plus at
 * least one named competitor); it can't verify a competitor name is real.
 *
 * Storage/re-render/lock behavior mirrors render-build-options-tool.ts.
 */
export function createRenderMarketingPlansTool(deps: RenderMarketingPlansToolDeps) {
  const { store, sessionId, onEvent } = deps;

  async function render_marketing_plans(rawInput: unknown): Promise<RenderMarketingPlansResult> {
    if (!isRenderMarketingPlansInput(rawInput)) {
      return { ok: false, error: 'invalid_input' };
    }

    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const existingCards = session.cards as SessionCard[];
    const existing = existingCards.find((c) => c.type === CARD_TYPE);
    const card: SessionCard & { content: MarketingPlansCardContent } = {
      id: existing?.id ?? randomUUID(),
      type: CARD_TYPE,
      // First render is a fresh 'draft'; any later re-render (chat-based
      // refinement before locking, #49) moves it to 'refined'.
      status: existing ? 'refined' : 'draft',
      content: { plans: rawInput.plans, selectedIndex: null },
    };

    const cards = existing
      ? existingCards.map((c) => (c.type === CARD_TYPE ? card : c))
      : [...existingCards, card];

    await store.update(sessionId, { cards });
    onEvent({ type: 'card_emitted', cardId: card.id, cardType: CARD_TYPE });

    return { ok: true, card };
  }

  async function select_marketing_plan(rawInput: unknown): Promise<SelectMarketingPlanResult> {
    if (!isSelectMarketingPlanInput(rawInput)) {
      return { ok: false, error: 'invalid_input' };
    }

    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const existingCards = session.cards as SessionCard[];
    const existing = existingCards.find((c) => c.type === CARD_TYPE) as
      | (SessionCard & { content: MarketingPlansCardContent })
      | undefined;
    if (!existing) {
      return { ok: false, error: 'no_marketing_card' };
    }

    if (rawInput.index < 0 || rawInput.index >= existing.content.plans.length) {
      return { ok: false, error: 'invalid_input' };
    }

    const card: SessionCard & { content: MarketingPlansCardContent } = {
      ...existing,
      status: 'locked',
      content: { ...existing.content, selectedIndex: rawInput.index },
    };

    const cards = existingCards.map((c) => (c.type === CARD_TYPE ? card : c));
    await store.update(sessionId, { cards });

    return { ok: true, card };
  }

  return { render_marketing_plans, select_marketing_plan };
}
