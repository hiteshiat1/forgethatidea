import { describe, it, expect } from 'vitest';
import { createInMemoryManifestStore } from './manifest-store.js';
import { MANIFEST_SCHEMA_VERSION, type BuildManifest } from '@forge/shared';

const baseManifest: BuildManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  productName: 'HabitLoop',
  icp: 'people building daily habits',
  entities: [{ name: 'Habit', fields: [{ name: 'title', type: 'string' }] }],
  screens: [{ name: 'Habit list', purpose: 'see all habits' }],
  roles: ['user'],
  keyActions: ['create habit'],
  branding: { accentColor: '#2E7D32', tone: 'encouraging' },
  references: { researchCardIds: [] },
};

describe('createInMemoryManifestStore', () => {
  it('returns null for a session with no manifest yet', async () => {
    const store = createInMemoryManifestStore();
    await expect(store.getLatest('session-1')).resolves.toBeNull();
  });

  it('creates version 1 on the first write', async () => {
    const store = createInMemoryManifestStore();
    const saved = await store.save('session-1', baseManifest);
    expect(saved.version).toBe(1);
    expect(saved.data).toEqual(baseManifest);
  });

  it('increments the version on each subsequent write, keeping prior versions', async () => {
    const store = createInMemoryManifestStore();
    await store.save('session-1', baseManifest);
    const v2 = await store.save('session-1', { ...baseManifest, productName: 'HabitLoop v2' });

    expect(v2.version).toBe(2);
    const history = await store.listVersions('session-1');
    expect(history.map((h) => h.version)).toEqual([1, 2]);
    expect(history[0]!.data).toMatchObject({ productName: 'HabitLoop' });
    expect(history[1]!.data).toMatchObject({ productName: 'HabitLoop v2' });
  });

  it('getLatest returns the most recently saved version', async () => {
    const store = createInMemoryManifestStore();
    await store.save('session-1', baseManifest);
    await store.save('session-1', { ...baseManifest, productName: 'v2' });
    const v3 = await store.save('session-1', { ...baseManifest, productName: 'v3' });

    const latest = await store.getLatest('session-1');
    expect(latest).toEqual(v3);
  });

  it('keeps sessions independent', async () => {
    const store = createInMemoryManifestStore();
    await store.save('session-1', baseManifest);
    await expect(store.getLatest('session-2')).resolves.toBeNull();
  });
});
