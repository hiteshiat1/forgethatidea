import { getFrozenManifest } from './manifest-freeze.js';
import { compileGenerationSpec, isCompileSpecFailure } from './generation-spec.js';
import { runAutoRepairLoop, isAutoRepairFailure } from './auto-repair-loop.js';
import { screenManifestForSafety } from './content-safety-screen.js';
import { CostCapExceededError } from './cost-guard.js';
import { normalizeUsage, DEFAULT_PRICING } from './model-router.js';
import { emitAnalyticsEvent, type AnalyticsLogger } from './analytics.js';
import type { SessionStore } from './session-store.js';
import type { ManifestStore } from './manifest-store.js';
import type { ArtifactStore } from './artifact-store.js';
import type { createCostGuard } from './cost-guard.js';
import type { GenerationAnthropicClient } from './generation-pipeline.js';

export interface BuildOrchestratorDeps {
  sessionStore: SessionStore;
  manifestStore: ManifestStore;
  artifactStore: ArtifactStore;
  costGuard: ReturnType<typeof createCostGuard>;
  anthropicClient: GenerationAnthropicClient;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  maxRepairRounds?: number;
  onProgress?: (text: string) => void;
  /** Content safety screening decisions logged here (Epic 4.17's "screening decisions logged"). Defaults to a no-op. */
  analyticsLogger?: AnalyticsLogger;
}

export interface BuildSuccess {
  ok: true;
  code: string;
  version: number;
  repairRounds: number;
}

export interface BuildFailure {
  ok: false;
  error:
    | 'session_not_found'
    | 'manifest_not_frozen'
    | 'cost_cap_exceeded'
    | 'content_blocked'
    | 'build_failed';
  reason?: string;
}

export type BuildResult = BuildSuccess | BuildFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isBuildFailure(result: BuildResult): result is BuildFailure {
  return result.ok === false;
}

/**
 * Build orchestrator (Epic 4, wiring #61-67 + #74 into one real operation):
 * the first place the full generation pipeline actually runs end to end.
 * One call to `handleBuild` = read the frozen manifest snapshot (#61,
 * never the live/latest one — a build always reads exactly what was
 * confirmed) -> compile it into a bounded generation spec (#64) -> run
 * generation with auto-repair (#67, which internally does generation #65
 * and validation #66) -> save the result as a new versioned artifact (#74)
 * and mark it the session's active build.
 *
 * "No dead-end states" per the agent orchestrator's established pattern
 * (#40): every failure mode resolves to a typed `BuildFailure`, never a
 * thrown error reaching the HTTP layer.
 */
export function createBuildOrchestrator(deps: BuildOrchestratorDeps) {
  const { sessionStore, manifestStore, artifactStore, costGuard, anthropicClient } = deps;
  const analyticsLogger = deps.analyticsLogger ?? { info: () => {} };

  async function handleBuild(sessionId: string, userId: string): Promise<BuildResult> {
    const session = await sessionStore.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    if (session.frozenManifestVersion === null) {
      return { ok: false, error: 'manifest_not_frozen' };
    }

    try {
      await costGuard.checkBeforeCall({ sessionId, userId });
    } catch (err) {
      if (err instanceof CostCapExceededError) {
        return { ok: false, error: 'cost_cap_exceeded', reason: err.reason };
      }
      throw err;
    }

    const frozenManifest = await getFrozenManifest({ sessionStore, manifestStore, sessionId });
    if (!frozenManifest) {
      // The version pointer exists but the row it points to is gone —
      // shouldn't happen outside data corruption, but a real, typed outcome
      // rather than a null-pointer crash if it ever does.
      return { ok: false, error: 'manifest_not_frozen' };
    }

    const specResult = compileGenerationSpec(frozenManifest.data);
    if (isCompileSpecFailure(specResult)) {
      return { ok: false, error: 'build_failed', reason: specResult.details.join('; ') };
    }

    // Content safety screening (Epic 4.17): a real judgment pass on the
    // manifest's actual intent, run before any generation happens.
    // screenManifestForSafety always resolves ok: true — it fails open
    // internally on its own errors (see content-safety-screen.ts), so a
    // screener outage never blocks the build; only a genuine "not allowed"
    // decision does.
    const screening = await screenManifestForSafety({ spec: specResult.spec, anthropicClient });
    emitAnalyticsEvent(analyticsLogger, {
      type: 'content_screened',
      sessionId,
      allowed: screening.decision.allowed,
    });
    if (!screening.decision.allowed) {
      return { ok: false, error: 'content_blocked', reason: screening.decision.reason };
    }

    const repairResult = await runAutoRepairLoop({
      spec: specResult.spec,
      anthropicClient,
      model: deps.model,
      maxTokens: deps.maxTokens,
      timeoutMs: deps.timeoutMs,
      maxRepairRounds: deps.maxRepairRounds,
      onProgress: deps.onProgress,
    });

    if (isAutoRepairFailure(repairResult)) {
      return { ok: false, error: 'build_failed', reason: repairResult.error };
    }

    const costCents = normalizeUsage(DEFAULT_PRICING, 'anthropic', deps.model ?? 'claude-opus-5', {
      inputTokens: repairResult.inputTokens,
      outputTokens: repairResult.outputTokens,
      stopReason: null,
    }).costCents;
    await costGuard.recordUsage({ sessionId, userId }, costCents);

    const saved = await artifactStore.save(sessionId, 'app', {
      manifestId: frozenManifest.id,
      content: { code: repairResult.code },
    });
    await sessionStore.update(sessionId, { activeAppVersion: saved.version });

    return {
      ok: true,
      code: repairResult.code,
      version: saved.version,
      repairRounds: repairResult.repairRounds,
    };
  }

  return { handleBuild };
}
