import { describe, it, expect, vi } from 'vitest';
import { createManifestTools } from './manifest-tools.js';
import { createInMemoryManifestStore } from './manifest-store.js';
import { createToolDispatcher } from './tool-dispatch.js';
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

describe('get_manifest', () => {
  it('returns null when no manifest exists yet for the session', async () => {
    const store = createInMemoryManifestStore();
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    const result = await tools.get_manifest({});
    expect(result).toEqual({ manifest: null, version: null });
  });

  it('returns the latest manifest and version', async () => {
    const store = createInMemoryManifestStore();
    await store.save('session-1', baseManifest);
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    const result = await tools.get_manifest({});
    expect(result).toEqual({ manifest: baseManifest, version: 1 });
  });
});

describe('update_manifest', () => {
  it('creates the manifest from a full payload when none exists yet', async () => {
    const store = createInMemoryManifestStore();
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    const result = await tools.update_manifest({ patch: baseManifest });
    expect(result).toMatchObject({ ok: true, version: 1 });

    const latest = await store.getLatest('session-1');
    expect(latest!.data).toEqual(baseManifest);
  });

  it('merges a partial update into the existing manifest safely', async () => {
    const store = createInMemoryManifestStore();
    await store.save('session-1', baseManifest);
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    const result = await tools.update_manifest({
      patch: { productName: 'HabitLoop Pro', keyActions: ['create habit', 'archive habit'] },
    });

    expect(result.ok).toBe(true);
    const latest = await store.getLatest('session-1');
    expect(latest!.data).toMatchObject({
      productName: 'HabitLoop Pro',
      keyActions: ['create habit', 'archive habit'],
      // Untouched fields survive the merge.
      icp: baseManifest.icp,
      entities: baseManifest.entities,
    });
    expect(latest!.version).toBe(2);
  });

  it('rejects a partial update with no existing manifest to merge into', async () => {
    const store = createInMemoryManifestStore();
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    const result = await tools.update_manifest({ patch: { productName: 'Solo field' } });
    expect(result).toMatchObject({ ok: false, error: 'no_manifest_to_merge_into' });
  });

  it('rejects an update that produces an invalid merged manifest, without persisting it', async () => {
    const store = createInMemoryManifestStore();
    await store.save('session-1', baseManifest);
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    const result = await tools.update_manifest({ patch: { roles: [] } });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error === 'validation_failed') {
      expect(result.details).toEqual(expect.arrayContaining([expect.stringContaining('roles')]));
    } else {
      expect.unreachable('expected validation_failed');
    }

    const latest = await store.getLatest('session-1');
    expect(latest!.version).toBe(1); // unchanged
  });

  it('does array replacement rather than array merging for list fields', async () => {
    const store = createInMemoryManifestStore();
    await store.save('session-1', baseManifest);
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    await tools.update_manifest({ patch: { roles: ['admin'] } });

    const latest = await store.getLatest('session-1');
    expect(latest!.data.roles).toEqual(['admin']);
  });

  it('deep-merges nested objects like branding rather than replacing them wholesale', async () => {
    const store = createInMemoryManifestStore();
    await store.save('session-1', baseManifest);
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    await tools.update_manifest({ patch: { branding: { tone: 'bold' } } as never });

    const latest = await store.getLatest('session-1');
    expect(latest!.data.branding).toEqual({
      accentColor: baseManifest.branding.accentColor,
      tone: 'bold',
    });
  });
});

describe('registration with the tool dispatcher (#31)', () => {
  it('is callable as get_manifest/update_manifest tools through createToolDispatcher', async () => {
    const store = createInMemoryManifestStore();
    const tools = createManifestTools({ store, sessionId: 'session-1' });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const dispatcher = createToolDispatcher({
      tools: { get_manifest: tools.get_manifest, update_manifest: tools.update_manifest },
      logger,
    });

    const createResult = await dispatcher.dispatch({
      type: 'tool_use',
      id: 'call-1',
      name: 'update_manifest',
      input: { patch: baseManifest },
    });
    expect(createResult).toMatchObject({ toolUseId: 'call-1', isError: false });

    const readResult = await dispatcher.dispatch({
      type: 'tool_use',
      id: 'call-2',
      name: 'get_manifest',
      input: {},
    });
    expect(readResult).toMatchObject({
      toolUseId: 'call-2',
      isError: false,
      content: { manifest: baseManifest, version: 1 },
    });
  });
});
