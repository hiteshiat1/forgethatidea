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
  | { ok: false; error: 'no_manifest_to_merge_into'; details: string[] }
  | { ok: false; error: 'validation_failed'; details: string[] }
  | { ok: false; error: 'invalid_input'; details: string[] };

interface UpdateManifestInput {
  patch: Partial<BuildManifest>;
}

/**
 * Checks the call shape itself (not the manifest content — validateManifest
 * covers that) and returns the specific reason it's malformed, or null when
 * it's fine. A real production bug traced back to the model repeatedly
 * calling update_manifest with `{}` (no `patch` key at all): the old check
 * only returned a bare `invalid_input` code with no detail, so the model
 * had nothing to correct course with and kept repeating the same broken
 * call every turn. Every other rejection branch in this function reports
 * specific `details`; this one now does too.
 */
function describeInputShapeProblem(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) {
    return 'Input must be an object of the form { patch: {...} }.';
  }
  if (!('patch' in input)) {
    return 'Missing required field "patch" — call update_manifest with { patch: {...} }, never with an empty object.';
  }
  const patch = (input as { patch: unknown }).patch;
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return '"patch" must be an object of manifest fields to set, not a string, array, or other value.';
  }
  return null;
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
    const shapeProblem = describeInputShapeProblem(rawInput);
    if (shapeProblem) {
      return { ok: false, error: 'invalid_input', details: [shapeProblem] };
    }
    const input = rawInput as UpdateManifestInput;
    const latest = await store.getLatest(sessionId);

    let merged: unknown;
    if (!latest) {
      // No existing manifest: the patch must stand alone as a full manifest.
      merged = input.patch;
      const validation = validateManifest(merged);
      if (!validation.ok) {
        // A patch this small being invalid on its own almost always means
        // the caller meant to merge into something that doesn't exist yet.
        // Surface the real validation errors (not just the generic error
        // code) so the caller — usually the agent, incrementally building
        // the manifest field-by-field — knows exactly what's still missing
        // rather than silently retrying the same rejected shape.
        return { ok: false, error: 'no_manifest_to_merge_into', details: validation.errors! };
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
