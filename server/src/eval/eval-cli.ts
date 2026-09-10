import { createAnthropicClient, createSdkClient } from '../anthropic-client.js';
import { FIXTURE_MANIFESTS } from './fixture-manifests.js';
import { runEval, isRegression } from './run-eval.js';

/**
 * Nightly eval CLI entrypoint (Epic 4.16): runs the real generation
 * pipeline against every fixture manifest and reports compile rate,
 * contract compliance, and archetype fit. Exits non-zero on a regression
 * (pass rate dropped below `EVAL_BASELINE_PASS_RATE`, default 0.8) so the
 * scheduled CI workflow (.github/workflows/nightly-eval.yml) can alert.
 *
 * Needs a real ANTHROPIC_API_KEY to do anything meaningful — skips
 * gracefully (exit 0, clearly logged) rather than failing the workflow
 * when one isn't configured, matching this codebase's "boot without a key"
 * convention used everywhere else a real API key is optional at startup.
 */
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('ANTHROPIC_API_KEY not set — skipping the generation quality eval.');
    process.exit(0);
  }

  const anthropicClient = createAnthropicClient({
    sdkClient: createSdkClient(apiKey),
    logger: {
      info: (obj, msg) => console.log(msg, obj),
      warn: (obj, msg) => console.warn(msg, obj),
      error: (obj, msg) => console.error(msg, obj),
    },
  });

  const baselinePassRate = Number(process.env.EVAL_BASELINE_PASS_RATE ?? '0.8');

  console.log(`Running generation quality eval against ${FIXTURE_MANIFESTS.length} fixtures...`);
  const report = await runEval({ fixtures: FIXTURE_MANIFESTS, anthropicClient });

  console.log('');
  console.log(
    `Pass rate: ${(report.passRate * 100).toFixed(1)}% (${report.passed}/${report.total})`,
  );
  console.log('');
  for (const result of report.results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    const detail = result.passed ? '' : ` — ${result.failureReason}`;
    console.log(`  [${status}] ${result.productName} (${result.archetype})${detail}`);
  }

  if (isRegression(report.passRate, baselinePassRate)) {
    console.error('');
    console.error(
      `REGRESSION: pass rate ${(report.passRate * 100).toFixed(1)}% is below the baseline ${(baselinePassRate * 100).toFixed(1)}%.`,
    );
    process.exit(1);
  }

  console.log('');
  console.log('No regression detected.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
