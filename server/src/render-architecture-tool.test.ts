import { describe, it, expect } from 'vitest';
import { createRenderArchitectureTool } from './render-architecture-tool.js';
import { createInMemorySessionStore } from './session-store.js';

const VALID_INPUT = {
  summary: 'Your app has a screen where users log habits, and a place that remembers them.',
  components: [
    { name: 'Habit Tracker App', description: 'What the user sees and taps on their phone' },
    { name: 'Habit Storage', description: 'Where completed habits are remembered' },
  ],
  connections: [{ from: 'Habit Tracker App', to: 'Habit Storage', label: 'saves habit check-ins' }],
};

function buildDeps() {
  const sessionStore = createInMemorySessionStore();
  const events: unknown[] = [];
  return { sessionStore, events, onEvent: (event: unknown) => events.push(event) };
}

const TECHNICAL_JARGON = [
  'API',
  'database',
  'server',
  'backend',
  'frontend',
  'REST',
  'endpoint',
  'microservice',
  'container',
  'kubernetes',
];

describe('render_architecture tool (#45)', () => {
  it('rejects a component description containing technical jargon', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderArchitectureTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    for (const term of TECHNICAL_JARGON.slice(0, 3)) {
      const result = await tool.render_architecture({
        ...VALID_INPUT,
        components: [{ name: 'X', description: `Runs on a ${term} somewhere` }],
      });
      expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    }
  });

  it('rejects a plain-language summary containing technical jargon', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderArchitectureTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_architecture({
      ...VALID_INPUT,
      summary: 'The frontend talks to the backend API.',
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects fewer than 1 component', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderArchitectureTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_architecture({ ...VALID_INPUT, components: [] });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects a connection referencing an unknown component', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderArchitectureTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_architecture({
      ...VALID_INPUT,
      connections: [{ from: 'Nonexistent', to: 'Habit Storage', label: 'x' }],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('saves valid architecture as a new draft card and emits a card_emitted event', async () => {
    const { sessionStore, onEvent, events } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderArchitectureTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.render_architecture(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.card.type).toBe('architecture');
    expect(result.card.status).toBe('draft');
    expect(result.card.content).toMatchObject(VALID_INPUT);

    const updated = await sessionStore.get(session.id);
    expect(updated!.cards).toEqual([result.card]);
    expect(events).toEqual([
      { type: 'card_emitted', cardId: result.card.id, cardType: 'architecture' },
    ]);
  });

  it('replaces an existing architecture card rather than appending a second one', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderArchitectureTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    await tool.render_architecture(VALID_INPUT);
    const revised = { ...VALID_INPUT, summary: VALID_INPUT.summary + ' Updated.' };
    await tool.render_architecture(revised);

    const updated = await sessionStore.get(session.id);
    expect(updated!.cards).toHaveLength(1);
    expect((updated!.cards[0] as { content: { summary: string } }).content.summary).toBe(
      revised.summary,
    );
  });

  it('404s (session_not_found) for a nonexistent session', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const tool = createRenderArchitectureTool({
      store: sessionStore,
      sessionId: 'nonexistent',
      onEvent,
    });

    const result = await tool.render_architecture(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, error: 'session_not_found' });
  });
});

describe('lock_architecture tool (#45)', () => {
  it('locks the architecture card', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderArchitectureTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });
    await tool.render_architecture(VALID_INPUT);

    const result = await tool.lock_architecture({});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.card.status).toBe('locked');
  });

  it('fails when no architecture card exists yet', async () => {
    const { sessionStore, onEvent } = buildDeps();
    const session = await sessionStore.create('user-1');
    const tool = createRenderArchitectureTool({
      store: sessionStore,
      sessionId: session.id,
      onEvent,
    });

    const result = await tool.lock_architecture({});

    expect(result).toMatchObject({ ok: false, error: 'no_architecture_card' });
  });
});
