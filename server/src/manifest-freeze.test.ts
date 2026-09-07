import { describe, expect, it } from 'vitest';
import { freezeManifest, getFrozenManifest } from './manifest-freeze.js';
import { createInMemorySessionStore } from './session-store.js';
import { createInMemoryManifestStore } from './manifest-store.js';
import type { BuildManifest } from '@forge/shared';

function manifest(overrides: Partial<BuildManifest> = {}): BuildManifest {
  return {
    schemaVersion: 1,
    productName: 'Habit Tracker',
    icp: 'People building daily habits.',
    entities: [{ name: 'Habit', fields: [{ name: 'title', type: 'string' }] }],
    screens: [{ name: 'Dashboard', purpose: 'See habits' }],
    roles: ['user'],
    keyActions: ['Mark complete'],
    branding: { accentColor: '#2E7D32', tone: 'calm' },
    references: { researchCardIds: [] },
    ...overrides,
  };
}

describe('freezeManifest (#61)', () => {
  it('rejects freezing when the session does not exist', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();

    const result = await freezeManifest({ sessionStore, manifestStore, sessionId: 'missing' });

    expect(result).toEqual({ ok: false, error: 'session_not_found' });
  });

  it('rejects freezing when no manifest has been written yet', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const session = await sessionStore.create('user-1');

    const result = await freezeManifest({ sessionStore, manifestStore, sessionId: session.id });

    expect(result).toEqual({ ok: false, error: 'no_manifest_to_freeze' });
  });

  it('freezes the current latest manifest version onto the session', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const session = await sessionStore.create('user-1');
    await manifestStore.save(session.id, manifest());
    await manifestStore.save(session.id, manifest({ productName: 'Habit Tracker v2' }));

    const result = await freezeManifest({ sessionStore, manifestStore, sessionId: session.id });

    expect(result).toMatchObject({ ok: true, frozenVersion: 2 });
    const updated = await sessionStore.get(session.id);
    expect(updated?.frozenManifestVersion).toBe(2);
  });

  it('is idempotent: freezing again after a new manifest write re-freezes to the newer version', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const session = await sessionStore.create('user-1');
    await manifestStore.save(session.id, manifest());
    await freezeManifest({ sessionStore, manifestStore, sessionId: session.id });

    await manifestStore.save(session.id, manifest({ productName: 'v2' }));
    const result = await freezeManifest({ sessionStore, manifestStore, sessionId: session.id });

    expect(result).toMatchObject({ ok: true, frozenVersion: 2 });
  });
});

describe('getFrozenManifest (#61)', () => {
  it('returns null when nothing has been frozen yet', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const session = await sessionStore.create('user-1');
    await manifestStore.save(session.id, manifest());

    const result = await getFrozenManifest({ sessionStore, manifestStore, sessionId: session.id });

    expect(result).toBeNull();
  });

  it('returns the frozen version even after later manifest writes change the latest', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const session = await sessionStore.create('user-1');
    await manifestStore.save(session.id, manifest({ productName: 'frozen one' }));
    await freezeManifest({ sessionStore, manifestStore, sessionId: session.id });

    // Post-freeze edits create a new version but must never mutate what a build reads.
    await manifestStore.save(session.id, manifest({ productName: 'edited after freeze' }));

    const result = await getFrozenManifest({ sessionStore, manifestStore, sessionId: session.id });

    expect(result?.version).toBe(1);
    expect(result?.data.productName).toBe('frozen one');
  });

  it('returns null for a nonexistent session', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();

    const result = await getFrozenManifest({ sessionStore, manifestStore, sessionId: 'missing' });

    expect(result).toBeNull();
  });
});
