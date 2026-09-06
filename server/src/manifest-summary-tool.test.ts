import { describe, expect, it } from 'vitest';
import { createManifestSummaryTool } from './manifest-summary-tool.js';
import { createInMemorySessionStore } from './session-store.js';
import { createInMemoryManifestStore } from './manifest-store.js';
import type { BuildManifest } from '@forge/shared';

const manifest: BuildManifest = {
  schemaVersion: 1,
  productName: 'Habit Tracker',
  icp: 'People building daily habits.',
  entities: [{ name: 'Habit', fields: [{ name: 'title', type: 'string' }] }],
  screens: [{ name: 'Dashboard', purpose: 'See habits' }],
  roles: ['user'],
  keyActions: ['Mark complete'],
  branding: { accentColor: '#2E7D32', tone: 'calm' },
  references: { researchCardIds: [] },
};

describe('createManifestSummaryTool (#41)', () => {
  it('returns a not-found result when the session does not exist', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const tool = createManifestSummaryTool({ sessionStore, manifestStore, sessionId: 'missing' });

    const result = await tool.summarize_manifest({});

    expect(result).toEqual({ ok: false, error: 'session_not_found' });
  });

  it('returns a no-manifest result when the session has no manifest yet', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const session = await sessionStore.create('user-1');
    const tool = createManifestSummaryTool({ sessionStore, manifestStore, sessionId: session.id });

    const result = await tool.summarize_manifest({});

    expect(result).toEqual({ ok: false, error: 'no_manifest_yet' });
  });

  it('returns the plain-language summary reflecting the latest manifest and cards', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const session = await sessionStore.create('user-1');
    await manifestStore.save(session.id, manifest);
    await sessionStore.update(session.id, {
      cards: [{ id: 'c1', type: 'cost', status: 'locked' }],
    });
    const tool = createManifestSummaryTool({ sessionStore, manifestStore, sessionId: session.id });

    const result = await tool.summarize_manifest({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('Habit Tracker');
      expect(result.summary).toContain('Cost estimate: ready');
    }
  });
});
