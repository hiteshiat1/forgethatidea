import type { BuildManifest } from '@forge/shared';
import type { SessionStore } from './session-store.js';
import type { ManifestStore, ManifestVersion } from './manifest-store.js';

export interface ManifestFreezeDeps {
  sessionStore: SessionStore;
  manifestStore: ManifestStore;
  sessionId: string;
}

export interface FreezeManifestSuccess {
  ok: true;
  frozenVersion: number;
}

export interface FreezeManifestFailure {
  ok: false;
  error: 'session_not_found' | 'no_manifest_to_freeze';
}

export type FreezeManifestResult = FreezeManifestSuccess | FreezeManifestFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this exact pattern has hit a Vercel-only build failure multiple times this
 * project (Vercel's separately-invoked, non-Turbo-cached tsc pass doesn't
 * always narrow a discriminated union the same way local tsc does, even on
 * an identical TypeScript version). Sidesteps the whole class of issue.
 */
export function isFreezeManifestFailure(
  result: FreezeManifestResult,
): result is FreezeManifestFailure {
  return result.ok === false;
}

/**
 * Locked-manifest freeze (Epic 3.8): on confirm, records which manifest
 * version is the immutable build input — the build pipeline (Epic 4) reads
 * only this, never the live/latest manifest, so a manifest edit made after
 * a build was requested can never silently change what gets generated.
 * Re-freezing (e.g. re-confirming after editing and regenerating) simply
 * points the frozen version at whatever is latest at that moment; it never
 * mutates a manifest version in place — every version, frozen or not,
 * stays in `ManifestStore`'s permanent audit trail.
 */
export async function freezeManifest(deps: ManifestFreezeDeps): Promise<FreezeManifestResult> {
  const { sessionStore, manifestStore, sessionId } = deps;

  const session = await sessionStore.get(sessionId);
  if (!session) {
    return { ok: false, error: 'session_not_found' };
  }

  const latest = await manifestStore.getLatest(sessionId);
  if (!latest) {
    return { ok: false, error: 'no_manifest_to_freeze' };
  }

  await sessionStore.update(sessionId, { frozenManifestVersion: latest.version });
  return { ok: true, frozenVersion: latest.version };
}

/**
 * Reads the frozen manifest snapshot a build should use — never the latest.
 * Returns `null` if the session doesn't exist, nothing has been frozen yet,
 * or (should never happen outside data corruption) the frozen version was
 * somehow removed from the manifest store's history.
 */
export async function getFrozenManifest(
  deps: ManifestFreezeDeps,
): Promise<(ManifestVersion & { data: BuildManifest }) | null> {
  const { sessionStore, manifestStore, sessionId } = deps;

  const session = await sessionStore.get(sessionId);
  if (!session || session.frozenManifestVersion === null) {
    return null;
  }

  const versions = await manifestStore.listVersions(sessionId);
  return versions.find((v) => v.version === session.frozenManifestVersion) ?? null;
}
