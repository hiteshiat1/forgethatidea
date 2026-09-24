import { describe, it, expect } from 'vitest';
import { createMarketingRefinementTool } from './marketing-refinement.js';
import { createInMemorySessionStore } from './session-store.js';
import { createRenderMarketingPlansTool } from './render-marketing-plans-tool.js';

const VALID_PLAN = {
  name: 'Community-led growth',
  icp: 'Solo founders validating a new app idea',
  gtm: 'Launch in indie-hacker communities and Product Hunt',
  seo: 'Long-tail content targeting "idea to app" search queries',
  ads: 'Small budget retargeting campaign on X/Twitter',
  competitors: ['Bubble', 'Lovable'],
};

const VALID_INPUT = {
  plans: [
    VALID_PLAN,
    { ...VALID_PLAN, name: 'Content & SEO first', competitors: ['Bubble', 'v0'] },
    { ...VALID_PLAN, name: 'Paid acquisition first', competitors: ['Lovable', 'v0'] },
  ],
};

async function buildDeps() {
  const sessionStore = createInMemorySessionStore();
  const session = await sessionStore.create('user-1');
  const events: unknown[] = [];
  const renderTool = createRenderMarketingPlansTool({
    store: sessionStore,
    sessionId: session.id,
    onEvent: (event) => events.push(event),
  });
  return { sessionStore, session, events, renderTool };
}

describe('marketing refinement round-gating (#88)', () => {
  it('during planning (pre-lock), re-rendering does not consume a refinement round', async () => {
    const { sessionStore, session, renderTool } = await buildDeps();
    await renderTool.render_marketing_plans(VALID_INPUT);
    await renderTool.select_marketing_plan({ index: 0 });

    const tool = createMarketingRefinementTool({
      store: sessionStore,
      sessionId: session.id,
      renderMarketingPlans: renderTool.render_marketing_plans,
      limits: { app: 2, marketing: 2 },
    });

    // Still in `planning` (default phase progression not advanced) — a
    // re-render here is normal plan iteration, not a "refinement round".
    const result = await tool.refine_marketing_plans(VALID_INPUT);
    expect(result.ok).toBe(true);

    const updated = await sessionStore.get(session.id);
    expect(updated!.marketingRefinementRounds).toBe(0);
  });

  it('during refine phase, re-rendering consumes a round and re-locks the card', async () => {
    const { sessionStore, session, renderTool } = await buildDeps();
    await renderTool.render_marketing_plans(VALID_INPUT);
    await renderTool.select_marketing_plan({ index: 0 });
    await sessionStore.update(session.id, { phase: 'refine' });

    const tool = createMarketingRefinementTool({
      store: sessionStore,
      sessionId: session.id,
      renderMarketingPlans: renderTool.render_marketing_plans,
      limits: { app: 2, marketing: 2 },
    });

    const updatedPlans = {
      plans: [{ ...VALID_PLAN, name: 'Revised angle' }, VALID_INPUT.plans[1], VALID_INPUT.plans[2]],
    };
    const result = await tool.refine_marketing_plans(updatedPlans);
    expect(result.ok).toBe(true);

    const session2 = await sessionStore.get(session.id);
    expect(session2!.marketingRefinementRounds).toBe(1);
    const card = (session2!.cards as { type: string; status: string }[]).find(
      (c) => c.type === 'marketing',
    );
    expect(card?.status).toBe('locked');
  });

  it('rejects with refinement_limit_reached once the marketing limit is hit', async () => {
    const { sessionStore, session, renderTool } = await buildDeps();
    await renderTool.render_marketing_plans(VALID_INPUT);
    await renderTool.select_marketing_plan({ index: 0 });
    await sessionStore.update(session.id, { phase: 'refine', marketingRefinementRounds: 2 });

    const tool = createMarketingRefinementTool({
      store: sessionStore,
      sessionId: session.id,
      renderMarketingPlans: renderTool.render_marketing_plans,
      limits: { app: 2, marketing: 2 },
    });

    const result = await tool.refine_marketing_plans(VALID_INPUT);
    expect(result).toMatchObject({ ok: false, error: 'refinement_limit_reached' });
  });
});
