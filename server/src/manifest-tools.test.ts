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
  it('rejects a call missing the required patch field with a diagnostic detail, not a bare code', async () => {
    // Regression coverage for a real production bug: the model repeatedly
    // called update_manifest with an empty object ({}), no `patch` key at
    // all — a genuine malformed tool call, not a manifest-shape problem.
    // The old `invalid_input` branch returned no `details` at all (unlike
    // every other rejection branch), so the model had nothing to learn
    // from and just kept repeating the same broken call turn after turn.
    const store = createInMemoryManifestStore();
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    const result = await tools.update_manifest({});
    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    if (!result.ok && result.error === 'invalid_input') {
      expect(result.details.join(' ')).toMatch(/patch/i);
    }
  });

  it('rejects a call whose patch field is not an object with a diagnostic detail', async () => {
    const store = createInMemoryManifestStore();
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    const result = await tools.update_manifest({ patch: 'not an object' });
    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    if (!result.ok && result.error === 'invalid_input') {
      expect(result.details.join(' ')).toMatch(/patch/i);
    }
  });

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

  it('rejects a partial update with no existing manifest to merge into, and surfaces which fields are actually missing/invalid', async () => {
    const store = createInMemoryManifestStore();
    const tools = createManifestTools({ store, sessionId: 'session-1' });

    const result = await tools.update_manifest({ patch: { productName: 'Solo field' } });

    expect(result).toMatchObject({ ok: false, error: 'no_manifest_to_merge_into' });
    // Real validation detail, not a silent/opaque rejection — the model
    // (or a human caller) needs to know exactly what's still missing to
    // build a valid first manifest, since incremental single-field patches
    // are otherwise indistinguishable from "wrong input entirely".
    if (result.ok || result.error !== 'no_manifest_to_merge_into') {
      throw new Error('expected no_manifest_to_merge_into');
    }
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.details.some((d) => d.includes('icp'))).toBe(true);
    expect(result.details.some((d) => d.includes('entities'))).toBe(true);
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
