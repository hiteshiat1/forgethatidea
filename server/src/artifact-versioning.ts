import type { SessionStore } from './session-store.js';
import type { ArtifactStore, ArtifactVersion } from './artifact-store.js';

export interface ArtifactVersioningDeps {
  sessionStore: SessionStore;
  artifactStore: ArtifactStore;
  sessionId: string;
}

/**
 * Reads whichever `app` artifact version is currently active for a session
 * (Epic 4.13) — never just "the latest", since a revert can point the
 * active version somewhere earlier while newer builds still exist in
 * history. Returns `null` until a build has ever succeeded.
 */
export async function getActiveAppArtifact(
  deps: ArtifactVersioningDeps,
): Promise<ArtifactVersion | null> {
  const { sessionStore, artifactStore, sessionId } = deps;

  const session = await sessionStore.get(sessionId);
  if (!session || session.activeAppVersion === null) {
    return null;
  }

  return artifactStore.getVersion(sessionId, 'app', session.activeAppVersion);
}

export interface RevertToAppVersionInput extends ArtifactVersioningDeps {
  version: number;
}

export interface RevertToAppVersionSuccess {
  ok: true;
  version: number;
}

export interface RevertToAppVersionFailure {
  ok: false;
  error: 'session_not_found' | 'version_not_found';
}

export type RevertToAppVersionResult = RevertToAppVersionSuccess | RevertToAppVersionFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isArtifactVersioningFailure(
  result: RevertToAppVersionResult,
): result is RevertToAppVersionFailure {
  return result.ok === false;
}

/**
 * "User can revert to a previous build" (Epic 4.13's acceptance criteria) —
 * repoints `sessions.activeAppVersion` at an earlier version rather than
 * deleting or reordering any artifact row, so every build's history stays
 * intact and a later re-revert forward is always possible.
 */
export async function revertToAppVersion(
  input: RevertToAppVersionInput,
): Promise<RevertToAppVersionResult> {
  const { sessionStore, artifactStore, sessionId, version } = input;

  const session = await sessionStore.get(sessionId);
  if (!session) {
    return { ok: false, error: 'session_not_found' };
  }

  const target = await artifactStore.getVersion(sessionId, 'app', version);
  if (!target) {
    return { ok: false, error: 'version_not_found' };
  }

  await sessionStore.update(sessionId, { activeAppVersion: version });
  return { ok: true, version };
}
