import type { SessionStore } from './session-store.js';
import type { ManifestStore } from './manifest-store.js';
import type { SessionCard } from './phase-gates.js';
import { summarizeManifest } from './manifest-summary.js';

export interface ManifestSummaryToolDeps {
  sessionStore: SessionStore;
  manifestStore: ManifestStore;
  sessionId: string;
}

export type ManifestSummaryResult =
  | { ok: true; summary: string }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'no_manifest_yet' };

/**
 * `summarize_manifest` tool (Epic 2.14): lets the agent recap the current
 * build manifest in plain language at any point the user asks "what have we
 * got so far?" — reads the manifest (#32) and card statuses (#22/#29) fresh
 * each call so it always reflects the latest state.
 */
export function createManifestSummaryTool(deps: ManifestSummaryToolDeps) {
  const { sessionStore, manifestStore, sessionId } = deps;

  async function summarize_manifest(_input: unknown): Promise<ManifestSummaryResult> {
    const session = await sessionStore.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const latest = await manifestStore.getLatest(sessionId);
    const summary = summarizeManifest(latest?.data ?? null, session.cards as SessionCard[]);
    if (!summary) {
      return { ok: false, error: 'no_manifest_yet' };
    }

    return { ok: true, summary };
  }

  return { summarize_manifest };
}
