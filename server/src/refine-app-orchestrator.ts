import { getActiveAppArtifact } from './artifact-versioning.js';
import {
  runDiffEdit,
  isDiffEditFailure,
  type DiffEditAnthropicClient,
} from './refinement-diff-edit.js';
import { classifyRefinementMessage } from './refinement-round-classifier.js';
import { answerClarification } from './refinement-clarification.js';
import { parseChangeIntent, isAmbiguousIntent } from './refinement-intent-parser.js';
import { screenRequestForSafety, isUnsafeVerdict } from './refinement-request-safety.js';
import { checkRequestScope, isMultiChangeVerdict } from './refinement-scope-check.js';
import { type RefinementRateLimiter, isRateLimitRejected } from './refinement-rate-limiter.js';
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
  /** Session-scoped rapid-fire guard (Epic 5.7) — optional so existing tests/callers that don't care about rate limiting keep working unchanged. */
  rateLimiter?: RefinementRateLimiter;
  model?: string;
  maxTokens?: number;
  maxRepairRounds?: number;
}

export interface RefineAppChangeSuccess {
  ok: true;
  kind: 'change_request';
  code: string;
  version: number;
  revertedToOriginal: boolean;
  rounds: number;
}

/**
 * A clarifying question answered conversationally (Epic 5.1: "Clarifying
 * Q&A within a round is free") — no round consumed, no new artifact
 * version, code left untouched.
 */
export interface RefineAppClarificationSuccess {
  ok: true;
  kind: 'clarification';
  answer: string;
}

/**
 * A bundled "mega-prompt" request (Epic 5.7): the model detected several
 * genuinely separate changes in one request. Same free-pass semantics as
 * clarification/ambiguous-intent — no round consumed — so the user can
 * resend the changes one at a time without losing a round to a guess about
 * which of several changes to actually make.
 */
export interface RefineAppScopeConfirmationNeeded {
  ok: true;
  kind: 'scope_confirmation_needed';
  detectedChanges: string[];
}

export type RefineAppSuccess =
  | RefineAppChangeSuccess
  | RefineAppClarificationSuccess
  | RefineAppScopeConfirmationNeeded;

export interface RefineAppFailure {
  ok: false;
  error:
    | 'session_not_found'
    | 'no_build_to_refine'
    | 'refinement_limit_reached'
    | 'edit_failed'
    | 'rate_limited'
    | 'unsafe_request';
  reason?: string;
  /** Present only for `refinement_limit_reached` — lets the route emit a gate_shown analytics event (#87) without a second lookup. */
  rounds?: number;
  limit?: number;
  /** Present only for `rate_limited`. */
  retryAfterMs?: number;
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
  const { sessionStore, artifactStore, anthropicClient, refinementLimits, rateLimiter } = deps;

  async function handleRefine(sessionId: string, changeRequest: string): Promise<RefineAppResult> {
    // Rate limit first (Epic 5.7): zero-cost rejection, before any model
    // call, so a rapid-fire/scripted burst never even reaches the LLM-based
    // checks below. Distinct from the round limit (#85), which caps total
    // usage rather than request velocity.
    if (rateLimiter) {
      const rateResult = rateLimiter.check(sessionId);
      if (isRateLimitRejected(rateResult)) {
        return { ok: false, error: 'rate_limited', retryAfterMs: rateResult.retryAfterMs };
      }
    }

    const session = await sessionStore.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const activeArtifact = await getActiveAppArtifact({ sessionStore, artifactStore, sessionId });
    if (!activeArtifact) {
      return { ok: false, error: 'no_build_to_refine' };
    }

    const { code: currentCode } = activeArtifact.content as { code: string };

    // Screened before classification (Epic 5.7): an instruction-override or
    // prompt-extraction attempt shouldn't even be classified as a normal
    // change request or clarification — it's rejected outright, before any
    // round is charged.
    const safety = await screenRequestForSafety({
      changeRequest,
      anthropicClient,
      model: deps.model,
    });
    if (isUnsafeVerdict(safety)) {
      return { ok: false, error: 'unsafe_request', reason: safety.reason };
    }

    const classification = await classifyRefinementMessage({
      currentCode,
      message: changeRequest,
      anthropicClient,
      model: deps.model,
    });

    if (classification.kind === 'clarification') {
      const answer = await answerClarification({
        currentCode,
        question: changeRequest,
        anthropicClient,
        model: deps.model,
      });
      return { ok: true, kind: 'clarification', answer };
    }

    // Checked before the round is charged (Epic 5.7): a "mega-prompt"
    // bundling several distinct changes gets sent back for the user to
    // split up, rather than either rejecting it outright or letting it
    // consume a single round for several changes' worth of edits.
    const scope = await checkRequestScope({
      changeRequest,
      anthropicClient,
      model: deps.model,
    });
    if (isMultiChangeVerdict(scope)) {
      return {
        ok: true,
        kind: 'scope_confirmation_needed',
        detectedChanges: scope.detectedChanges,
      };
    }

    // Parsed before the round is charged (Epic 5.5): a genuinely ambiguous
    // change request gets one clarifying question back, same free-pass
    // semantics as #85's clarification path, rather than burning a round on
    // a guess the editor model would otherwise have to make.
    const intent = await parseChangeIntent({
      currentCode,
      changeRequest,
      anthropicClient,
      model: deps.model,
    });

    if (isAmbiguousIntent(intent)) {
      return { ok: true, kind: 'clarification', answer: intent.clarifyingQuestion };
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
      return {
        ok: false,
        error: 'refinement_limit_reached',
        rounds: roundResult.rounds,
        limit: refinementLimits.app,
      };
    }

    const editResult = await runDiffEdit({
      currentCode,
      changeRequest,
      anthropicClient,
      model: deps.model,
      maxTokens: deps.maxTokens,
      maxRepairRounds: deps.maxRepairRounds,
      intentContext: `target=${intent.target}, action=${intent.action} (${intent.summary})`,
    });

    if (isDiffEditFailure(editResult)) {
      return { ok: false, error: 'edit_failed' };
    }

    const saved = await artifactStore.save(sessionId, 'app', {
      manifestId: activeArtifact.manifestId,
      content: { code: editResult.code, changeSummary: changeRequest },
    });
    await sessionStore.update(sessionId, { activeAppVersion: saved.version });

    return {
      ok: true,
      kind: 'change_request',
      code: editResult.code,
      version: saved.version,
      revertedToOriginal: editResult.revertedToOriginal,
      rounds: roundResult.rounds,
    };
  }

  return { handleRefine };
}
