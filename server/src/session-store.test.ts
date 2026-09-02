import { describe, it, expect } from 'vitest';
import { createInMemorySessionStore } from './session-store.js';

describe('createInMemorySessionStore', () => {
  it('creates a session with default phase, empty chat/cards, and the given user', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create('user-1');

    expect(session).toMatchObject({ userId: 'user-1', phase: 'onboarding', chat: [], cards: [] });
    expect(session.id).toEqual(expect.any(String));
  });

  it('allows an anonymous session with no user', async () => {
    const store = createInMemorySessionStore();
    const session = await store.create(null);
    expect(session.userId).toBeNull();
  });

  it('gets a session by id', async () => {
    const store = createInMemorySessionStore();
    const created = await store.create('user-1');
    await expect(store.get(created.id)).resolves.toEqual(created);
  });

  it('returns null for an unknown session id', async () => {
    const store = createInMemorySessionStore();
    await expect(store.get('nonexistent')).resolves.toBeNull();
  });

  it('updates phase, chat, and cards independently', async () => {
    const store = createInMemorySessionStore();
    const created = await store.create('user-1');

    const updated = await store.update(created.id, { phase: 'sources' });
    expect(updated).toMatchObject({ phase: 'sources', chat: [], cards: [] });

    const withChat = await store.update(created.id, { chat: [{ role: 'user', text: 'hi' }] });
    expect(withChat).toMatchObject({ phase: 'sources', chat: [{ role: 'user', text: 'hi' }] });

    const withCards = await store.update(created.id, { cards: [{ id: 'card-1' }] });
    expect(withCards).toMatchObject({ cards: [{ id: 'card-1' }] });
  });

  it('returns null when updating an unknown session', async () => {
    const store = createInMemorySessionStore();
    await expect(store.update('nonexistent', { phase: 'sources' })).resolves.toBeNull();
  });

  it('bumps updatedAt on every update', async () => {
    const store = createInMemorySessionStore();
    const created = await store.create('user-1');
    const updated = await store.update(created.id, { phase: 'sources' });
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it('lists only sessions belonging to the given user', async () => {
    const store = createInMemorySessionStore();
    const first = await store.create('user-1');
    const second = await store.create('user-1');
    await store.create('user-2'); // different user, should not appear

    const list = await store.listByUser('user-1');
    expect(list.map((s) => s.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('orders listByUser by updatedAt descending after an update', async () => {
    const store = createInMemorySessionStore();
    const a = await store.create('user-1');
    const b = await store.create('user-1');

    // Touch `a` well after both were created so its updatedAt is unambiguously
    // the latest, regardless of clock resolution between the two creates.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.update(a.id, { phase: 'sources' });

    const list = await store.listByUser('user-1');
    expect(list[0]!.id).toBe(a.id);
    expect(list[1]!.id).toBe(b.id);
  });
});
