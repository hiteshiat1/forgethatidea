import { describe, it, expect } from 'vitest';
import { createRenderCostTableTool } from './render-cost-table-tool.js';
import { createInMemorySessionStore } from './session-store.js';

const VALID_INPUT = {
  scales: [
    {
      label: '100 users',
      lineItems: [
        {
          name: 'Hosting',
          monthlyCostCents: 2000,
          assumption: 'Vercel Pro, well within included bandwidth at this scale',
          sourceUrl: 'https://vercel.com/pricing',
        },
        {
          name: 'Database',
          monthlyCostCents: 0,
          assumption: 'Supabase free tier covers 100 users comfortably',
          sourceUrl: 'https://supabase.com/pricing',
        },
      ],
    },
    {
      label: '1,000 users',
      lineItems: [
        {
          name: 'Hosting',
          monthlyCostCents: 2000,
          assumption: 'Vercel Pro still covers this at 1k users',
          sourceUrl: 'https://vercel.com/pricing',
        },
        {
          name: 'Database',
          monthlyCostCents: 2500,
          assumption: 'Upgrades to Supabase Pro at this scale',
          sourceUrl: 'https://supabase.com/pricing',
        },
      ],
    },
  ],
};

function buildDeps() {
  const sessionStore = createInMemorySessionStore();
  const events: unknown[] = [];
  return { sessionStore, events, onEvent: (event: unknown) => events.push(event) };
}

describe('render_cost_table tool (#47)', () => {
  it('rejects a line item with no sourceUrl', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderCostTableTool({ store: sessionStore, sessionId: session.id, onEvent });

    const result = await tool.render_cost_table({
      scales: [
        {
          label: '100 users',
          lineItems: [
            { name: 'Hosting', monthlyCostCents: 2000, assumption: 'a guess', sourceUrl: '' },
          ],
        },
      ],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects a line item missing an assumption', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderCostTableTool({ store: sessionStore, sessionId: session.id, onEvent });

    const result = await tool.render_cost_table({
      scales: [
        {
          label: '100 users',
          lineItems: [
            {
              name: 'Hosting',
              monthlyCostCents: 2000,
              assumption: '',
              sourceUrl: 'https://vercel.com/pricing',
            },
          ],
        },
      ],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects a negative monthlyCostCents', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderCostTableTool({ store: sessionStore, sessionId: session.id, onEvent });

    const result = await tool.render_cost_table({
      scales: [
        {
          label: '100 users',
          lineItems: [
            {
              name: 'Hosting',
              monthlyCostCents: -100,
              assumption: 'x',
              sourceUrl: 'https://vercel.com/pricing',
            },
          ],
        },
      ],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects fewer than 1 scale', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderCostTableTool({ store: sessionStore, sessionId: session.id, onEvent });

    const result = await tool.render_cost_table({ scales: [] });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects a scale with no line items', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderCostTableTool({ store: sessionStore, sessionId: session.id, onEvent });

    const result = await tool.render_cost_table({
      scales: [{ label: '100 users', lineItems: [] }],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('saves valid cost table, computing monthly/yearly totals per scale', async () => {
    const { sessionStore, onEvent, events } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderCostTableTool({ store: sessionStore, sessionId: session.id, onEvent });

    const result = await tool.render_cost_table(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.card.type).toBe('cost');
    expect(result.card.status).toBe('draft');
    expect(result.card.content.scales[0]!.totalMonthlyCostCents).toBe(2000);
    expect(result.card.content.scales[0]!.totalYearlyCostCents).toBe(2000 * 12);
    expect(result.card.content.scales[1]!.totalMonthlyCostCents).toBe(4500);
    expect(result.card.content.scales[1]!.totalYearlyCostCents).toBe(4500 * 12);

    const updated = await sessionStore.get(session.id);
    expect(updated!.cards).toEqual([result.card]);
    expect(events).toEqual([{ type: 'card_emitted', cardId: result.card.id, cardType: 'cost' }]);
  });

  it('replaces an existing cost card rather than appending a second one', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderCostTableTool({ store: sessionStore, sessionId: session.id, onEvent });

    await tool.render_cost_table(VALID_INPUT);
    const revised = {
      scales: [{ ...VALID_INPUT.scales[0]!, label: '100 users (revised)' }],
    };
    await tool.render_cost_table(revised);

    const updated = await sessionStore.get(session.id);
    expect(updated!.cards).toHaveLength(1);
    expect(
      (updated!.cards[0] as { content: { scales: { label: string }[] } }).content.scales[0]!.label,
    ).toBe('100 users (revised)');
  });

  it('404s (session_not_found) for a nonexistent session', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const tool = createRenderCostTableTool({
      store: sessionStore,
      sessionId: 'nonexistent',
      onEvent,
    });

    const result = await tool.render_cost_table(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, error: 'session_not_found' });
  });
});

describe('lock_cost_table tool (#47)', () => {
  it('locks the cost card', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderCostTableTool({ store: sessionStore, sessionId: session.id, onEvent });
    await tool.render_cost_table(VALID_INPUT);

    const result = await tool.lock_cost_table({});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.card.status).toBe('locked');
  });

  it('fails when no cost card exists yet', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderCostTableTool({ store: sessionStore, sessionId: session.id, onEvent });

    const result = await tool.lock_cost_table({});

    expect(result).toMatchObject({ ok: false, error: 'no_cost_card' });
  });
});
