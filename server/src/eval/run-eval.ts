import type { Archetype, BuildManifest } from '@forge/shared';
import { compileGenerationSpec, isCompileSpecFailure } from '../generation-spec.js';
import { runAutoRepairLoop, isAutoRepairFailure } from '../auto-repair-loop.js';
import type { GenerationAnthropicClient } from '../generation-pipeline.js';

export interface EvalFixtureResult {
  productName: string;
  archetype: Archetype;
  passed: boolean;
  /** Present only when passed is false — the spec-compile error or the auto-repair loop's own error code. */
  failureReason?: string;
  repairRounds?: number;
}

export interface EvalReport {
  total: number;
  passed: number;
  passRate: number;
  results: EvalFixtureResult[];
}

export interface RunEvalInput {
  fixtures: BuildManifest[];
  anthropicClient: GenerationAnthropicClient;
  model?: string;
  maxTokens?: number;
  maxRepairRounds?: number;
}

/**
 * Generation quality eval harness (Epic 4.16): runs every fixture manifest
 * through the real pipeline — spec compile (#64) then generation with
 * auto-repair (#67, internally #65 generation + #66 validation) — and
 * scores compile rate and contract compliance directly (a fixture only
 * "passes" once it produces validation-clean code); archetype fit is
 * reported per-result so a regression specific to one archetype is visible
 * rather than only an aggregate number.
 */
export async function runEval(input: RunEvalInput): Promise<EvalReport> {
  const { fixtures, anthropicClient } = input;
  const results: EvalFixtureResult[] = [];

  for (const manifest of fixtures) {
    const specResult = compileGenerationSpec(manifest);
    if (isCompileSpecFailure(specResult)) {
      results.push({
        productName: manifest.productName,
        archetype: manifest.archetype ?? 'crud-tracker',
        passed: false,
        failureReason: `spec_compile_failed: ${specResult.details.join('; ')}`,
      });
      continue;
    }

    const repairResult = await runAutoRepairLoop({
      spec: specResult.spec,
      anthropicClient,
      model: input.model,
      maxTokens: input.maxTokens,
      maxRepairRounds: input.maxRepairRounds,
    });

    if (isAutoRepairFailure(repairResult)) {
      results.push({
        productName: manifest.productName,
        archetype: specResult.spec.archetype,
        passed: false,
        failureReason: repairResult.error,
        repairRounds: repairResult.repairRounds,
      });
      continue;
    }

    results.push({
      productName: manifest.productName,
      archetype: specResult.spec.archetype,
      passed: true,
      repairRounds: repairResult.repairRounds,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    passRate: results.length > 0 ? passed / results.length : 0,
    results,
  };
}

/** True when the current pass rate has dropped below the baseline — "regression alert when pass-rate drops" per the issue. */
export function isRegression(currentPassRate: number, baselinePassRate: number): boolean {
  return currentPassRate < baselinePassRate;
}
