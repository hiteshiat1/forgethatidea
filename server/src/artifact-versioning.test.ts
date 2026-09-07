import { describe, expect, it } from 'vitest';
import {
  getActiveAppArtifact,
  revertToAppVersion,
  isArtifactVersioningFailure,
} from './artifact-versioning.js';
import { createInMemorySessionStore } from './session-store.js';
import { createInMemoryArtifactStore } from './artifact-store.js';

describe('getActiveAppArtifact (#74)', () => {
  it('returns null when no build has ever succeeded', async () => {
    const sessionStore = createInMemorySessionStore();
    const artifactStore = createInMemoryArtifactStore();
    const session = await sessionStore.create('user-1');

    const result = await getActiveAppArtifact({
      sessionStore,
      artifactStore,
      sessionId: session.id,
    });
    expect(result).toBeNull();
  });

  it('returns the active version even after a later build changes what is latest', async () => {
    const sessionStore = createInMemorySessionStore();
    const artifactStore = createInMemoryArtifactStore();
    const session = await sessionStore.create('user-1');
    await artifactStore.save(session.id, 'app', { manifestId: 'm1', content: { code: 'v1' } });
    await sessionStore.update(session.id, { activeAppVersion: 1 });
    await artifactStore.save(session.id, 'app', { manifestId: 'm1', content: { code: 'v2' } });

    const result = await getActiveAppArtifact({
      sessionStore,
      artifactStore,
      sessionId: session.id,
    });
    expect(result?.version).toBe(1);
    expect(result?.content).toEqual({ code: 'v1' });
  });
});

describe('revertToAppVersion (#74)', () => {
  it('rejects reverting when the session does not exist', async () => {
    const sessionStore = createInMemorySessionStore();
    const artifactStore = createInMemoryArtifactStore();

    const result = await revertToAppVersion({
      sessionStore,
      artifactStore,
      sessionId: 'missing',
      version: 1,
    });
    expect(isArtifactVersioningFailure(result)).toBe(true);
    if (isArtifactVersioningFailure(result)) {
      expect(result.error).toBe('session_not_found');
    }
  });

  it('rejects reverting to a version that does not exist', async () => {
    const sessionStore = createInMemorySessionStore();
    const artifactStore = createInMemoryArtifactStore();
    const session = await sessionStore.create('user-1');
    await artifactStore.save(session.id, 'app', { manifestId: 'm1', content: { code: 'v1' } });

    const result = await revertToAppVersion({
      sessionStore,
      artifactStore,
      sessionId: session.id,
      version: 99,
    });
    expect(isArtifactVersioningFailure(result)).toBe(true);
    if (isArtifactVersioningFailure(result)) {
      expect(result.error).toBe('version_not_found');
    }
  });

  it('repoints the active version without deleting or mutating any artifact row', async () => {
    const sessionStore = createInMemorySessionStore();
    const artifactStore = createInMemoryArtifactStore();
    const session = await sessionStore.create('user-1');
    await artifactStore.save(session.id, 'app', { manifestId: 'm1', content: { code: 'v1' } });
    await artifactStore.save(session.id, 'app', { manifestId: 'm1', content: { code: 'v2' } });
    await sessionStore.update(session.id, { activeAppVersion: 2 });

    const result = await revertToAppVersion({
      sessionStore,
      artifactStore,
      sessionId: session.id,
      version: 1,
    });

    expect(isArtifactVersioningFailure(result)).toBe(false);
    const updated = await sessionStore.get(session.id);
    expect(updated?.activeAppVersion).toBe(1);
    const history = await artifactStore.listVersions(session.id, 'app');
    expect(history).toHaveLength(2); // both versions still exist, untouched
    expect(history[1]!.content).toEqual({ code: 'v2' }); // latest build not deleted
  });
});
