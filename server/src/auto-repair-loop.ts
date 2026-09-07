import {
  runGenerationPipeline,
  isGenerationFailure,
  type GenerationAnthropicClient,
} from './generation-pipeline.js';
import { validateGeneratedCode } from './generation-validation.js';
import type { GenerationSpec } from './generation-spec.js';

const DEFAULT_MAX_REPAIR_ROUNDS = 2;

export interface AutoRepairLoopInput {
  spec: GenerationSpec;
  anthropicClient: GenerationAnthropicClient;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Max repair attempts after the initial generation before giving up — "max N repair rounds (configurable)" per the issue. */
  maxRepairRounds?: number;
  onProgress?: (text: string) => void;
}

export interface AutoRepairSuccess {
  ok: true;
  code: string;
  /** How many repair rounds it took beyond the initial attempt — 0 means it validated cleanly first try. Tracked as a generation-quality metric. */
  repairRounds: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface AutoRepairFailure {
  ok: false;
  error: 'generation_failed' | 'validation_failed_after_repairs';
  repairRounds: number;
  /** The exact validation errors from the final attempt, when the failure was validation-related. */
  lastErrors?: string[];
}

export type AutoRepairResult = AutoRepairSuccess | AutoRepairFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isAutoRepairFailure(result: AutoRepairResult): result is AutoRepairFailure {
  return result.ok === false;
}

/**
 * Auto-repair loop (Epic 4.6): ties the generation pipeline (#65) and static
 * validation gate (#66) together — generate, validate, and if validation
 * fails, feed the exact errors plus the failed code back to the model for a
 * bounded number of repair attempts (`maxRepairRounds`, default 2) before
 * surfacing a graceful terminal failure rather than ever showing a user a
 * raw compile error or forbidden-API violation.
 *
 * "No dead-end states": a model-call failure (network error, timeout) ends
 * the loop immediately with `generation_failed` rather than burning repair
 * rounds retrying a request that isn't a validation problem at all — those
 * are the generation pipeline's own retry/timeout concerns (#65), not this
 * loop's. Repair round count is always reported, on both success and
 * terminal failure, as the quality metric the issue calls for.
 */
export async function runAutoRepairLoop(input: AutoRepairLoopInput): Promise<AutoRepairResult> {
  const maxRepairRounds = input.maxRepairRounds ?? DEFAULT_MAX_REPAIR_ROUNDS;

  let repairContext: { previousCode: string; errors: string[] } | undefined;

  for (let round = 0; round <= maxRepairRounds; round++) {
    const generation = await runGenerationPipeline({
      spec: input.spec,
      anthropicClient: input.anthropicClient,
      model: input.model,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      onProgress: input.onProgress,
      repairContext,
    });

    if (isGenerationFailure(generation)) {
      return { ok: false, error: 'generation_failed', repairRounds: round };
    }

    const validation = await validateGeneratedCode(generation.code);
    if (validation.ok) {
      return {
        ok: true,
        code: generation.code,
        repairRounds: round,
        inputTokens: generation.inputTokens,
        outputTokens: generation.outputTokens,
        costCents: generation.costCents,
      };
    }

    if (round === maxRepairRounds) {
      return {
        ok: false,
        error: 'validation_failed_after_repairs',
        repairRounds: round,
        lastErrors: validation.errors,
      };
    }

    repairContext = { previousCode: generation.code, errors: validation.errors };
  }

  // Unreachable — the loop always returns within its bounds — but keeps the
  // function's return type total rather than relying on control-flow
  // analysis across the for loop.
  return { ok: false, error: 'validation_failed_after_repairs', repairRounds: maxRepairRounds };
}
