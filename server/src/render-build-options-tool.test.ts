import { describe, it, expect } from 'vitest';
import { createRenderBuildOptionsTool } from './render-build-options-tool.js';
import { createInMemorySessionStore } from './session-store.js';

const THREE_OPTIONS = [
  { name: 'Habit Streaks', summary: 'Simple daily check-ins with streak tracking.' },
  { name: 'Habit Coach', summary: 'AI nudges and reminders tuned to your schedule.' },
  { name: 'Habit Circles', summary: 'Small accountability groups sharing progress.' },
];

function buildDeps() {
  const sessionStore = createInMemorySessionStore();
  const events: unknown[] = [];
  return { sessionStore, events, onEvent: (event: unknown) => events.push(event) };
}

describe('render_build_options tool (#44)', () => {
  it('rejects fewer than 3 options', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_build_options({ options: THREE_OPTIONS.slice(0, 2) });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects more than 3 options', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_build_options({
      options: [...THREE_OPTIONS, { name: 'Fourth', summary: 'extra' }],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects an option missing a name or summary', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_build_options({
      options: [{ name: 'Only Name' }, ...THREE_OPTIONS.slice(0, 2)],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('saves exactly 3 options as a new draft card and emits a card_emitted event', async () => {
    const { sessionStore, onEvent, events } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_build_options({ options: THREE_OPTIONS });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.card.type).toBe('options');
    expect(result.card.status).toBe('draft');
    expect(result.card.content).toMatchObject({ options: THREE_OPTIONS, selectedIndex: null });

    const updated = await sessionStore.get(session.id);
    expect(updated!.cards).toEqual([result.card]);
    expect(events).toEqual([{ type: 'card_emitted', cardId: result.card.id, cardType: 'options' }]);
  });

  it('replaces an existing options card (re-render) rather than appending a second one', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    await tool.render_build_options({ options: THREE_OPTIONS });
    const relabeled = THREE_OPTIONS.map((o) => ({ ...o, name: `${o.name} v2` }));
    await tool.render_build_options({ options: relabeled });

    const updated = await sessionStore.get(session.id);
    expect(updated!.cards).toHaveLength(1);
    expect((updated!.cards[0] as { content: { options: unknown } }).content.options).toEqual(
      relabeled,
    );
  });

  it('moves the card to refined status on re-render (chat-based refinement, #49)', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const first = await tool.render_build_options({ options: THREE_OPTIONS });
    expect(first.ok && first.card.status).toBe('draft');

    const second = await tool.render_build_options({
      options: THREE_OPTIONS.map((o) => ({ ...o, name: `${o.name} v2` })),
    });
    expect(second.ok && second.card.status).toBe('refined');
  });

  it('preserves other card types already on the session', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    await sessionStore.update(session.id, {
      cards: [{ id: 'cost-1', type: 'cost', status: 'draft' }],
    });
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    await tool.render_build_options({ options: THREE_OPTIONS });

    const updated = await sessionStore.get(session.id);
    const types = (updated!.cards as { type: string }[]).map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(['cost', 'options']));
  });

  it('404s (session_not_found) for a nonexistent session', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: 'nonexistent',
      onEvent,
    });

    const result = await tool.render_build_options({ options: THREE_OPTIONS });

    expect(result).toMatchObject({ ok: false, error: 'session_not_found' });
  });
});

describe('select_build_option tool (#44)', () => {
  it('locks the options card and records the selected index', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });
    await tool.render_build_options({ options: THREE_OPTIONS });

    const result = await tool.select_build_option({ index: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.card.status).toBe('locked');
    expect(result.card.content).toMatchObject({ selectedIndex: 1 });
  });

  it('rejects an out-of-range index', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });
    await tool.render_build_options({ options: THREE_OPTIONS });

    const result = await tool.select_build_option({ index: 5 });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('fails when no options card exists yet', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderBuildOptionsTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.select_build_option({ index: 0 });

    expect(result).toMatchObject({ ok: false, error: 'no_options_card' });
  });
});
