import { describe, it, expect } from 'vitest';
import { createPhaseTransitionTool } from './phase-transition-tool.js';
import { createInMemorySessionStore } from './session-store.js';

describe('transition_phase', () => {
  it('advances the session to the next phase and reports the event', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    const events: unknown[] = [];
    const tool = createPhaseTransitionTool({
      store,
      sessionId: session.id,
      onEvent: (e) => events.push(e),
    });

    const result = await tool.transition_phase({ to: 'sources' });

    expect(result).toMatchObject({ ok: true, phase: 'sources' });
    const updated = await store.get(session.id);
    expect(updated!.phase).toBe('sources');
    expect(events).toEqual([{ type: 'phase_changed', from: 'onboarding', to: 'sources' }]);
  });

  it('rejects an illegal (skip-ahead) transition without changing the phase or emitting an event', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    const events: unknown[] = [];
    const tool = createPhaseTransitionTool({
      store,
      sessionId: session.id,
      onEvent: (e) => events.push(e),
    });

    const result = await tool.transition_phase({ to: 'planning' });

    expect(result).toMatchObject({ ok: false, error: 'illegal_phase_transition' });
    const updated = await store.get(session.id);
    expect(updated!.phase).toBe('onboarding');
    expect(events).toEqual([]);
  });

  it('rejects a transition blocked by a phase gate without changing the phase', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    await store.update(session.id, { phase: 'sources' });
    await store.update(session.id, { phase: 'brainstorm' });
    await store.update(session.id, { phase: 'planning' });
    const events: unknown[] = [];
    const tool = createPhaseTransitionTool({
      store,
      sessionId: session.id,
      onEvent: (e) => events.push(e),
    });

    const result = await tool.transition_phase({ to: 'build' });

    expect(result).toMatchObject({ ok: false, error: 'phase_gate_not_satisfied' });
    const updated = await store.get(session.id);
    expect(updated!.phase).toBe('planning');
    expect(events).toEqual([]);
  });

  it('allows entering build once the required cards are locked', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    await store.update(session.id, { phase: 'sources' });
    await store.update(session.id, { phase: 'brainstorm' });
    await store.update(session.id, {
      phase: 'planning',
      cards: ['options', 'architecture', 'cost', 'marketing'].map((type) => ({
        id: `${type}-1`,
        type,
        status: 'locked',
      })),
    });
    const events: unknown[] = [];
    const tool = createPhaseTransitionTool({
      store,
      sessionId: session.id,
      onEvent: (e) => events.push(e),
    });

    const result = await tool.transition_phase({ to: 'build' });

    expect(result).toMatchObject({ ok: true, phase: 'build' });
    expect(events).toEqual([{ type: 'phase_changed', from: 'planning', to: 'build' }]);
  });

  it('returns an error for a nonexistent session', async () => {
    const store = createInMemorySessionStore();
    const events: unknown[] = [];
    const tool = createPhaseTransitionTool({
      store,
      sessionId: 'nonexistent',
      onEvent: (e) => events.push(e),
    });

    const result = await tool.transition_phase({ to: 'sources' });
    expect(result).toEqual({ ok: false, error: 'session_not_found' });
  });

  it('rejects malformed input safely', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    const tool = createPhaseTransitionTool({ store, sessionId: session.id, onEvent: () => {} });

    const result = await tool.transition_phase({ to: 'not-a-real-phase' });
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
  });
});
