import type { SessionStore } from './session-store.js';
import type { SessionCard } from './phase-gates.js';
import {
  recordRefinementRound,
  isRefinementFailure,
  type RefinementLimits,
} from './refinement-tracker.js';
import type {
  RenderMarketingPlansResult,
  MarketingPlansCardContent,
} from './render-marketing-plans-tool.js';

const CARD_TYPE = 'marketing';

export type RefineMarketingPlansResult =
  | { ok: true; card: SessionCard & { content: MarketingPlansCardContent }; rounds: number }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'invalid_input' }
  | { ok: false; error: 'refinement_limit_reached'; rounds: number };

export interface MarketingRefinementToolDeps {
  store: SessionStore;
  sessionId: string;
  /** The existing render_marketing_plans tool (Epic 3.5) this wraps — never duplicates its render/validation logic. */
  renderMarketingPlans: (rawInput: unknown) => Promise<RenderMarketingPlansResult>;
  limits: RefinementLimits;
}

/** Explicit type guard, matching this codebase's established convention for discriminated results (see e.g. tool-dispatch.ts). */
export function isRefineMarketingFailure(
  result: RefineMarketingPlansResult,
): result is Extract<RefineMarketingPlansResult, { ok: false }> {
  return result.ok === false;
}

/**
 * Marketing refinement loop (Epic 5.4): applies the round-tracking and
 * re-lock behavior the marketing plan needs once it's already been locked
 * once, without duplicating render_marketing_plans's own render/validation
 * logic (Epic 3.5, render-marketing-plans-tool.ts) — this wraps that tool
 * rather than reimplementing it, since the "re-render replaces the card
 * in place" mechanism it already has is exactly what a marketing edit needs.
 *
 * Unlike app refinement (refine-app-orchestrator.ts), this needs no diff-
 * editing or intent parsing: the model already regenerates the full plan
 * content via render_marketing_plans, so refining is just "call that tool
 * again" — the only new behavior this adds is: only phases other than
 * `refine` are free re-renders (initial plan iteration before the first
 * lock, same as today), and once in `refine`, each re-render consumes a
 * tracked round (Epic 2.11's recordRefinementRound, shared with app
 * refinement) and re-locks the card afterward rather than leaving it
 * 'refined' — a locked marketing plan should stay locked once the user is
 * done adjusting it, whereas the pre-lock 'refined' state exists so the
 * canvas can show "still being iterated on" during initial planning.
 */
export function createMarketingRefinementTool(deps: MarketingRefinementToolDeps) {
  const { store, sessionId, renderMarketingPlans, limits } = deps;

  async function refine_marketing_plans(rawInput: unknown): Promise<RefineMarketingPlansResult> {
    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const isPostLockRefinement = session.phase === 'refine';

    if (isPostLockRefinement) {
      const roundResult = await recordRefinementRound(store, sessionId, 'marketing', limits);
      if (isRefinementFailure(roundResult)) {
        if (roundResult.error === 'session_not_found') {
          return { ok: false, error: 'session_not_found' };
        }
        return {
          ok: false,
          error: 'refinement_limit_reached',
          rounds: roundResult.rounds ?? limits.marketing,
        };
      }
    }

    const renderResult = await renderMarketingPlans(rawInput);
    if (!renderResult.ok) {
      // Explicit reconstruction rather than `return renderResult` — its type
      // (RenderMarketingPlansResult's failure variants) is structurally
      // similar to but not identical to RefineMarketingPlansResult's, and
      // returning it directly has caused a Vercel-only build failure here
      // even though local tsc accepted it (see CLAUDE.md's documented
      // narrowing-across-unions pattern).
      return { ok: false, error: renderResult.error };
    }

    if (!isPostLockRefinement) {
      return { ok: true, card: renderResult.card, rounds: session.marketingRefinementRounds };
    }

    // Re-lock after a post-lock refinement — the render tool itself always
    // moves a re-rendered card to 'refined' (correct for initial planning,
    // where the user hasn't locked yet), but once refinement rounds are in
    // play the plan was already locked before this edit and should return
    // to locked, not sit in the pre-lock 'refined' state.
    const refreshedSession = await store.get(sessionId);
    const cards = (refreshedSession!.cards as SessionCard[]).map((card) =>
      card.type === CARD_TYPE ? { ...card, status: 'locked' as const } : card,
    );
    await store.update(sessionId, { cards });

    const relockedCard = cards.find((c) => c.type === CARD_TYPE) as SessionCard & {
      content: MarketingPlansCardContent;
    };
    return {
      ok: true,
      card: relockedCard,
      rounds: refreshedSession!.marketingRefinementRounds,
    };
  }

  return { refine_marketing_plans };
}
