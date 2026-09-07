import { describe, it, expect } from 'vitest';
import { createInMemoryArtifactStore } from './artifact-store.js';

describe('createInMemoryArtifactStore', () => {
  it('returns null for a session with no artifact of that type yet', async () => {
    const store = createInMemoryArtifactStore();
    await expect(store.getLatest('session-1', 'app')).resolves.toBeNull();
  });

  it('creates version 1 on the first save', async () => {
    const store = createInMemoryArtifactStore();
    const saved = await store.save('session-1', 'app', {
      manifestId: 'manifest-1',
      content: { code: 'export default function App() {}' },
    });
    expect(saved.version).toBe(1);
    expect(saved.content).toEqual({ code: 'export default function App() {}' });
    expect(saved.manifestId).toBe('manifest-1');
  });

  it('increments the version on each subsequent save, keeping prior versions', async () => {
    const store = createInMemoryArtifactStore();
    await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'v1' } });
    const v2 = await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'v2' } });

    expect(v2.version).toBe(2);
    const history = await store.listVersions('session-1', 'app');
    expect(history.map((h) => h.version)).toEqual([1, 2]);
    expect(history[0]!.content).toEqual({ code: 'v1' });
    expect(history[1]!.content).toEqual({ code: 'v2' });
  });

  it('getLatest returns the most recently saved version', async () => {
    const store = createInMemoryArtifactStore();
    await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'v1' } });
    await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'v2' } });
    const v3 = await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'v3' } });

    const latest = await store.getLatest('session-1', 'app');
    expect(latest).toEqual(v3);
  });

  it('keeps sessions independent', async () => {
    const store = createInMemoryArtifactStore();
    await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'v1' } });
    await expect(store.getLatest('session-2', 'app')).resolves.toBeNull();
  });

  it('keeps artifact types independent within the same session', async () => {
    const store = createInMemoryArtifactStore();
    await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'app-v1' } });
    await expect(store.getLatest('session-1', 'spec-pack')).resolves.toBeNull();
  });

  it('getVersion retrieves a specific historical version by number', async () => {
    const store = createInMemoryArtifactStore();
    await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'v1' } });
    await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'v2' } });

    const v1 = await store.getVersion('session-1', 'app', 1);
    expect(v1?.content).toEqual({ code: 'v1' });
  });

  it('getVersion returns null for a nonexistent version', async () => {
    const store = createInMemoryArtifactStore();
    await store.save('session-1', 'app', { manifestId: 'm1', content: { code: 'v1' } });
    await expect(store.getVersion('session-1', 'app', 99)).resolves.toBeNull();
  });
});
