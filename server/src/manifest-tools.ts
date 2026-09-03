import { validateManifest, type BuildManifest } from '@forge/shared';
import type { ManifestStore } from './manifest-store.js';

export interface ManifestToolsDeps {
  store: ManifestStore;
  sessionId: string;
}

export interface GetManifestResult {
  manifest: BuildManifest | null;
  version: number | null;
}

export type UpdateManifestResult =
  | { ok: true; manifest: BuildManifest; version: number }
  | { ok: false; error: 'no_manifest_to_merge_into' }
  | { ok: false; error: 'validation_failed'; details: string[] }
  | { ok: false; error: 'invalid_input' };

interface UpdateManifestInput {
  patch: Partial<BuildManifest>;
}

function isUpdateManifestInput(input: unknown): input is UpdateManifestInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'patch' in input &&
    typeof (input as { patch: unknown }).patch === 'object' &&
    (input as { patch: unknown }).patch !== null
  );
}

/**
 * Deep-merges `patch` onto `base`: plain objects merge key-by-key
 * (recursively), everything else — including arrays — is replaced wholesale.
 * Arrays replace rather than concatenate/merge-by-index because there's no
 * safe general way to reconcile two entity/screen lists positionally; the
 * caller sends the array it wants, in full, when it wants to change one.
 */
function deepMerge<T>(base: T, patch: Partial<T>): T {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Manifest read/write tools (Epic 2.6) — the agent's interface to the build
 * manifest (#32) during the conversation. Registered in the tool dispatcher
 * (#31) as `get_manifest`/`update_manifest`.
 */
export function createManifestTools(deps: ManifestToolsDeps) {
  const { store, sessionId } = deps;

  async function get_manifest(_input: unknown): Promise<GetManifestResult> {
    const latest = await store.getLatest(sessionId);
    return { manifest: latest?.data ?? null, version: latest?.version ?? null };
  }

  /**
   * Applies `patch` to the current manifest and validates the result before
   * persisting — an invalid merge is rejected and never written, so a bad
   * partial update can't corrupt the stored manifest. Concurrent calls each
   * read-merge-validate-save independently; whichever save lands last wins
   * and every prior attempt stays in the version history (#32's
   * ManifestStore) as the audit trail — "concurrent writes last-write-wins
   * with audit".
   */
  async function update_manifest(rawInput: unknown): Promise<UpdateManifestResult> {
    if (!isUpdateManifestInput(rawInput)) {
      return { ok: false, error: 'invalid_input' };
    }
    const input = rawInput;
    const latest = await store.getLatest(sessionId);

    let merged: unknown;
    if (!latest) {
      // No existing manifest: the patch must stand alone as a full manifest.
      merged = input.patch;
      const validation = validateManifest(merged);
      if (!validation.ok) {
        // A patch this small being invalid on its own almost always means
        // the caller meant to merge into something that doesn't exist yet.
        return { ok: false, error: 'no_manifest_to_merge_into' };
      }
      const saved = await store.save(sessionId, validation.data!);
      return { ok: true, manifest: saved.data, version: saved.version };
    }

    merged = deepMerge(latest.data, input.patch);
    const validation = validateManifest(merged);
    if (!validation.ok) {
      return { ok: false, error: 'validation_failed', details: validation.errors! };
    }

    const saved = await store.save(sessionId, validation.data!);
    return { ok: true, manifest: saved.data, version: saved.version };
  }

  return { get_manifest, update_manifest };
}
