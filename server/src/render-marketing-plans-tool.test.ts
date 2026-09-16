import { describe, it, expect } from 'vitest';
import { createRenderMarketingPlansTool } from './render-marketing-plans-tool.js';
import { createInMemorySessionStore } from './session-store.js';

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

function buildDeps() {
  const sessionStore = createInMemorySessionStore();
  const events: unknown[] = [];
  return { sessionStore, events, onEvent: (event: unknown) => events.push(event) };
}

describe('render_marketing_plans tool (#48)', () => {
  it('rejects fewer than 3 plans', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_marketing_plans({ plans: VALID_INPUT.plans.slice(0, 2) });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects more than 3 plans', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_marketing_plans({
      plans: [...VALID_INPUT.plans, { ...VALID_PLAN, name: 'Fourth' }],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects a plan missing one of icp/gtm/seo/ads', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const { seo: _seo, ...missingSeo } = VALID_PLAN;
    const result = await tool.render_marketing_plans({
      plans: [missingSeo, VALID_INPUT.plans[1]!, VALID_INPUT.plans[2]!],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects a plan with no competitors', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_marketing_plans({
      plans: [{ ...VALID_PLAN, competitors: [] }, VALID_INPUT.plans[1]!, VALID_INPUT.plans[2]!],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('saves exactly 3 plans as a new draft card and emits a card_emitted event', async () => {
    const { sessionStore, onEvent, events } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_marketing_plans(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.card.type).toBe('marketing');
    expect(result.card.status).toBe('draft');
    expect(result.card.content).toMatchObject({ plans: VALID_INPUT.plans, selectedIndex: null });

    const updated = await sessionStore.get(session.id);
    expect(updated!.cards).toEqual([result.card]);
    expect(events).toEqual([
      { type: 'card_emitted', cardId: result.card.id, cardType: 'marketing' },
    ]);
  });

  it('replaces an existing marketing card rather than appending a second one', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    await tool.render_marketing_plans(VALID_INPUT);
    const relabeled = {
      plans: VALID_INPUT.plans.map((p) => ({ ...p, name: `${p.name} v2` })),
    };
    await tool.render_marketing_plans(relabeled);

    const updated = await sessionStore.get(session.id);
    expect(updated!.cards).toHaveLength(1);
    expect(
      (updated!.cards[0] as { content: { plans: { name: string }[] } }).content.plans[0]!.name,
    ).toBe('Community-led growth v2');
  });

  it('moves the card to refined status on re-render (chat-based refinement, #49)', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const first = await tool.render_marketing_plans(VALID_INPUT);
    expect(first.ok && first.card.status).toBe('draft');

    const second = await tool.render_marketing_plans({
      plans: VALID_INPUT.plans.map((p) => ({ ...p, name: `${p.name} v2` })),
    });
    expect(second.ok && second.card.status).toBe('refined');
  });

  it('404s (session_not_found) for a nonexistent session', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: 'nonexistent',
      onEvent,
    });

    const result = await tool.render_marketing_plans(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, error: 'session_not_found' });
  });
});

describe('select_marketing_plan tool (#48)', () => {
  it('locks the marketing card and records the selected index', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });
    await tool.render_marketing_plans(VALID_INPUT);

    const result = await tool.select_marketing_plan({ index: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.card.status).toBe('locked');
    expect(result.card.content).toMatchObject({ selectedIndex: 2 });
  });

  it('rejects an out-of-range index', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });
    await tool.render_marketing_plans(VALID_INPUT);

    const result = await tool.select_marketing_plan({ index: 5 });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('fails when no marketing card exists yet', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderMarketingPlansTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.select_marketing_plan({ index: 0 });

    expect(result).toMatchObject({ ok: false, error: 'no_marketing_card' });
  });
});
