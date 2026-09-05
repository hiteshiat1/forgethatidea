import { describe, it, expect } from 'vitest';
import { createSourcesTools } from './sources-tools.js';
import { createInMemorySessionStore } from './session-store.js';

describe('record_source', () => {
  it('adds a classified source to the session intake', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    const tools = createSourcesTools({ store, sessionId: session.id });

    const result = await tools.record_source({ input: 'https://competitor.com' });

    expect(result).toMatchObject({ ok: true });
    const updated = await store.get(session.id);
    expect(updated!.sourcesIntake.sources).toEqual([
      { type: 'link', value: 'https://competitor.com' },
    ]);
  });

  it('accumulates multiple sources across calls', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    const tools = createSourcesTools({ store, sessionId: session.id });

    await tools.record_source({ input: 'Notion' });
    await tools.record_source({ input: 'https://linear.app' });

    const updated = await store.get(session.id);
    expect(updated!.sourcesIntake.sources).toEqual([
      { type: 'text', value: 'Notion' },
      { type: 'link', value: 'https://linear.app' },
    ]);
  });

  it('returns an error for a nonexistent session', async () => {
    const store = createInMemorySessionStore();
    const tools = createSourcesTools({ store, sessionId: 'nonexistent' });

    const result = await tools.record_source({ input: 'Notion' });
    expect(result).toEqual({ ok: false, error: 'session_not_found' });
  });

  it('rejects malformed input safely', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    const tools = createSourcesTools({ store, sessionId: session.id });

    const result = await tools.record_source({ notInput: 'oops' });
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
  });
});

describe('decline_sources', () => {
  it('marks the intake as declined with no sources', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    const tools = createSourcesTools({ store, sessionId: session.id });

    const result = await tools.decline_sources({});

    expect(result).toMatchObject({ ok: true });
    const updated = await store.get(session.id);
    expect(updated!.sourcesIntake).toEqual({ sources: [], declined: true });
  });

  it('preserves any sources already recorded when declining further ones', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');
    const tools = createSourcesTools({ store, sessionId: session.id });

    await tools.record_source({ input: 'Notion' });
    await tools.decline_sources({});

    const updated = await store.get(session.id);
    expect(updated!.sourcesIntake).toEqual({
      sources: [{ type: 'text', value: 'Notion' }],
      declined: true,
    });
  });

  it('returns an error for a nonexistent session', async () => {
    const store = createInMemorySessionStore();
    const tools = createSourcesTools({ store, sessionId: 'nonexistent' });

    const result = await tools.decline_sources({});
    expect(result).toEqual({ ok: false, error: 'session_not_found' });
  });
});
