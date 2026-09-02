import { describe, it, expect } from 'vitest';
import { createInMemoryAuthStore } from './auth-store.js';

describe('createInMemoryAuthStore', () => {
  it('creates and finds a user by email', async () => {
    const store = createInMemoryAuthStore();
    const created = await store.createUser('a@example.com', 'hash123');
    const found = await store.findUserByEmail('a@example.com');
    expect(found).toEqual(created);
  });

  it('returns null for an unknown email', async () => {
    const store = createInMemoryAuthStore();
    expect(await store.findUserByEmail('nobody@example.com')).toBeNull();
  });

  it('rejects creating a user with a duplicate email', async () => {
    const store = createInMemoryAuthStore();
    await store.createUser('dup@example.com', 'hash1');
    await expect(store.createUser('dup@example.com', 'hash2')).rejects.toThrow();
  });

  it('creates a session and finds it while valid', async () => {
    const store = createInMemoryAuthStore();
    const user = await store.createUser('a@example.com', 'hash');
    const future = new Date(Date.now() + 60_000);
    await store.createSession(user.id, 'tokenhash1', future);

    const found = await store.findValidSessionByTokenHash('tokenhash1');
    expect(found).toMatchObject({ userId: user.id, tokenHash: 'tokenhash1' });
  });

  it('does not return an expired session', async () => {
    const store = createInMemoryAuthStore();
    const user = await store.createUser('a@example.com', 'hash');
    const past = new Date(Date.now() - 1000);
    await store.createSession(user.id, 'expiredtoken', past);

    expect(await store.findValidSessionByTokenHash('expiredtoken')).toBeNull();
  });

  it('returns null for an unknown token hash', async () => {
    const store = createInMemoryAuthStore();
    expect(await store.findValidSessionByTokenHash('nonexistent')).toBeNull();
  });

  it('deletes a session so it can no longer be found', async () => {
    const store = createInMemoryAuthStore();
    const user = await store.createUser('a@example.com', 'hash');
    const future = new Date(Date.now() + 60_000);
    await store.createSession(user.id, 'tokenhash1', future);

    await store.deleteSession('tokenhash1');
    expect(await store.findValidSessionByTokenHash('tokenhash1')).toBeNull();
  });
});
