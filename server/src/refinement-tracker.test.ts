import { describe, it, expect } from 'vitest';
import { recordRefinementRound } from './refinement-tracker.js';
import { createInMemorySessionStore } from './session-store.js';

const limits = { app: 3, marketing: 3 };

describe('recordRefinementRound', () => {
  it('increments the app counter for an app round, leaving marketing untouched', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');

    const result = await recordRefinementRound(store, session.id, 'app', limits);

    expect(result).toMatchObject({ ok: true, rounds: 1, limitReached: false });
    const updated = await store.get(session.id);
    expect(updated).toMatchObject({ appRefinementRounds: 1, marketingRefinementRounds: 0 });
  });

  it('increments the marketing counter for a marketing round, leaving app untouched', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');

    await recordRefinementRound(store, session.id, 'marketing', limits);

    const updated = await store.get(session.id);
    expect(updated).toMatchObject({ appRefinementRounds: 0, marketingRefinementRounds: 1 });
  });

  it('tracks app and marketing rounds independently across multiple calls', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');

    await recordRefinementRound(store, session.id, 'app', limits);
    await recordRefinementRound(store, session.id, 'app', limits);
    await recordRefinementRound(store, session.id, 'marketing', limits);

    const updated = await store.get(session.id);
    expect(updated).toMatchObject({ appRefinementRounds: 2, marketingRefinementRounds: 1 });
  });

  it('signals limitReached once the round count reaches the limit', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');

    await recordRefinementRound(store, session.id, 'app', limits);
    await recordRefinementRound(store, session.id, 'app', limits);
    const third = await recordRefinementRound(store, session.id, 'app', limits);

    expect(third).toMatchObject({ ok: true, rounds: 3, limitReached: true });
  });

  it('rejects recording a round once the limit is already reached (gate signal)', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');

    await recordRefinementRound(store, session.id, 'app', limits);
    await recordRefinementRound(store, session.id, 'app', limits);
    await recordRefinementRound(store, session.id, 'app', limits);
    const fourth = await recordRefinementRound(store, session.id, 'app', limits);

    expect(fourth).toEqual({
      ok: false,
      error: 'refinement_limit_reached',
      kind: 'app',
      rounds: 3,
    });

    // Rejected attempt must not have incremented the counter further.
    const updated = await store.get(session.id);
    expect(updated!.appRefinementRounds).toBe(3);
  });

  it('returns an error for a nonexistent session', async () => {
    const store = createInMemorySessionStore();
    const result = await recordRefinementRound(store, 'nonexistent', 'app', limits);
    expect(result).toEqual({ ok: false, error: 'session_not_found' });
  });
});
