import { getActiveAppArtifact } from './artifact-versioning.js';
import {
  runDiffEdit,
  isDiffEditFailure,
  type DiffEditAnthropicClient,
} from './refinement-diff-edit.js';
import {
  recordRefinementRound,
  isRefinementFailure,
  type RefinementLimits,
} from './refinement-tracker.js';
import type { SessionStore } from './session-store.js';
import type { ArtifactStore } from './artifact-store.js';

export interface RefineAppOrchestratorDeps {
  sessionStore: SessionStore;
  artifactStore: ArtifactStore;
  anthropicClient: DiffEditAnthropicClient;
  refinementLimits: RefinementLimits;
  model?: string;
  maxTokens?: number;
  maxRepairRounds?: number;
}

export interface RefineAppSuccess {
  ok: true;
  code: string;
  version: number;
  revertedToOriginal: boolean;
  rounds: number;
}

export interface RefineAppFailure {
  ok: false;
  error: 'session_not_found' | 'no_build_to_refine' | 'refinement_limit_reached' | 'edit_failed';
  reason?: string;
}

export type RefineAppResult = RefineAppSuccess | RefineAppFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isRefineAppFailure(result: RefineAppResult): result is RefineAppFailure {
  return result.ok === false;
}

/**
 * Refine-app orchestrator (Epic 4.15, wiring the diff-edit pipeline into
 * one real operation): checks the refinement round limit (#38's
 * refinement-tracker.ts — "app" kind), reads the session's active app
 * artifact (#74), runs a targeted diff-edit (not full regeneration) against
 * it, and saves the result as a new versioned artifact, marking it active.
 * "No dead-end states": every failure mode resolves to a typed
 * `RefineAppFailure`, never a thrown error reaching the HTTP layer.
 */
export function createRefineAppOrchestrator(deps: RefineAppOrchestratorDeps) {
  const { sessionStore, artifactStore, anthropicClient, refinementLimits } = deps;

  async function handleRefine(sessionId: string, changeRequest: string): Promise<RefineAppResult> {
    const session = await sessionStore.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const activeArtifact = await getActiveAppArtifact({ sessionStore, artifactStore, sessionId });
    if (!activeArtifact) {
      return { ok: false, error: 'no_build_to_refine' };
    }

    const roundResult = await recordRefinementRound(
      sessionStore,
      sessionId,
      'app',
      refinementLimits,
    );
    if (isRefinementFailure(roundResult)) {
      if (roundResult.error === 'session_not_found') {
        return { ok: false, error: 'session_not_found' };
      }
      return { ok: false, error: 'refinement_limit_reached' };
    }

    const { code: currentCode } = activeArtifact.content as { code: string };
    const editResult = await runDiffEdit({
      currentCode,
      changeRequest,
      anthropicClient,
      model: deps.model,
      maxTokens: deps.maxTokens,
      maxRepairRounds: deps.maxRepairRounds,
    });

    if (isDiffEditFailure(editResult)) {
      return { ok: false, error: 'edit_failed' };
    }

    const saved = await artifactStore.save(sessionId, 'app', {
      manifestId: activeArtifact.manifestId,
      content: { code: editResult.code },
    });
    await sessionStore.update(sessionId, { activeAppVersion: saved.version });

    return {
      ok: true,
      code: editResult.code,
      version: saved.version,
      revertedToOriginal: editResult.revertedToOriginal,
      rounds: roundResult.rounds,
    };
  }

  return { handleRefine };
}
