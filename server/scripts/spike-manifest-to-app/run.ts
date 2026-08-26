import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createAnthropicClient, createSdkClient } from '../../src/anthropic-client.js';
import { FIXTURES, type SpikeManifest } from './manifest-fixtures.js';
import { templatedPrompt, openEndedPrompt } from './prompts.js';
import { checkCompiles, checkContract } from './checks.js';

/**
 * SPIKE (#27) runner — manifest -> mocked app generator reliability test.
 * Throwaway script: run with `pnpm --filter @forge/server exec tsx
 * scripts/spike-manifest-to-app/run.ts`. Requires ANTHROPIC_API_KEY.
 *
 * Generates ATTEMPTS_PER_IDEA apps per archetype per strategy (templated vs
 * open-ended), checks each for compile validity + output-contract
 * compliance, and writes a findings table + raw outputs to ./results/.
 */

const ATTEMPTS_PER_IDEA = 3;
const MODEL = 'claude-opus-5';
const RESULTS_DIR = path.join(import.meta.dirname, 'results');

type Strategy = 'templated' | 'open-ended';

interface AttemptResult {
  archetype: string;
  strategy: Strategy;
  attempt: number;
  compiles: boolean;
  compileErrors: string[];
  contractOk: boolean;
  contractViolations: string[];
  outputPath: string;
}

function extractCode(rawText: string): string {
  // Strip markdown code fences if the model wrapped the output despite instructions.
  const fenced = rawText.match(/```(?:tsx|jsx|typescript|javascript)?\n([\s\S]*?)```/);
  return (fenced ? fenced[1] : rawText).trim();
}

async function generateOne(
  client: ReturnType<typeof createAnthropicClient>,
  manifest: SpikeManifest,
  strategy: Strategy,
  attempt: number,
): Promise<AttemptResult> {
  const prompt = strategy === 'templated' ? templatedPrompt(manifest) : openEndedPrompt(manifest);

  let text = '';
  await client.streamMessage(
    { model: MODEL, maxTokens: 8000, messages: [{ role: 'user', content: prompt }] },
    { onText: (chunk) => (text += chunk) },
  );

  const code = extractCode(text);
  const compileResult = await checkCompiles(code);
  const contractResult = checkContract(code);

  const outputPath = path.join(
    RESULTS_DIR,
    `${manifest.archetype}--${strategy}--attempt${attempt}.tsx`,
  );
  await writeFile(outputPath, code, 'utf-8');

  return {
    archetype: manifest.archetype,
    strategy,
    attempt,
    compiles: compileResult.ok,
    compileErrors: compileResult.errors,
    contractOk: contractResult.ok,
    contractViolations: contractResult.violations,
    outputPath,
  };
}

function summarize(results: AttemptResult[]): string {
  const lines: string[] = [];
  lines.push('# Manifest → App Generator Spike — Results\n');
  lines.push(`Model: ${MODEL} | Attempts per idea: ${ATTEMPTS_PER_IDEA}\n`);

  lines.push('## Pass rate by strategy × archetype\n');
  lines.push('| Archetype | Strategy | Compiles | Contract OK | Both |');
  lines.push('|---|---|---|---|---|');

  for (const strategy of ['templated', 'open-ended'] as const) {
    for (const fixture of FIXTURES) {
      const rows = results.filter(
        (r) => r.archetype === fixture.archetype && r.strategy === strategy,
      );
      const compiles = rows.filter((r) => r.compiles).length;
      const contract = rows.filter((r) => r.contractOk).length;
      const both = rows.filter((r) => r.compiles && r.contractOk).length;
      lines.push(
        `| ${fixture.archetype} | ${strategy} | ${compiles}/${rows.length} | ${contract}/${rows.length} | ${both}/${rows.length} |`,
      );
    }
  }

  lines.push('\n## Overall\n');
  for (const strategy of ['templated', 'open-ended'] as const) {
    const rows = results.filter((r) => r.strategy === strategy);
    const both = rows.filter((r) => r.compiles && r.contractOk).length;
    lines.push(`- **${strategy}**: ${both}/${rows.length} passed both checks`);
  }

  lines.push('\n## Failure details\n');
  for (const r of results) {
    if (r.compiles && r.contractOk) continue;
    lines.push(`### ${r.archetype} / ${r.strategy} / attempt ${r.attempt}`);
    if (!r.compiles) lines.push(`- Compile errors: ${r.compileErrors.join('; ')}`);
    if (!r.contractOk) lines.push(`- Contract violations: ${r.contractViolations.join('; ')}`);
    lines.push(`- Output: \`${path.relative(process.cwd(), r.outputPath)}\`\n`);
  }

  return lines.join('\n');
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is required to run this spike.');
    process.exit(1);
  }

  await mkdir(RESULTS_DIR, { recursive: true });

  const client = createAnthropicClient({
    sdkClient: createSdkClient(apiKey),
    logger: {
      info: () => {},
      warn: (obj, msg) => console.warn(msg, obj),
      error: (obj, msg) => console.error(msg, obj),
    },
  });

  const results: AttemptResult[] = [];
  const total = FIXTURES.length * 2 * ATTEMPTS_PER_IDEA;
  let done = 0;

  for (const strategy of ['templated', 'open-ended'] as const) {
    for (const fixture of FIXTURES) {
      for (let attempt = 1; attempt <= ATTEMPTS_PER_IDEA; attempt++) {
        process.stdout.write(
          `[${++done}/${total}] ${fixture.archetype} / ${strategy} / ${attempt}... `,
        );
        try {
          const result = await generateOne(client, fixture, strategy, attempt);
          results.push(result);
          console.log(result.compiles && result.contractOk ? 'PASS' : 'FAIL');
        } catch (err) {
          console.log('ERROR', err instanceof Error ? err.message : err);
          results.push({
            archetype: fixture.archetype,
            strategy,
            attempt,
            compiles: false,
            compileErrors: [err instanceof Error ? err.message : String(err)],
            contractOk: false,
            contractViolations: [],
            outputPath: '',
          });
        }
      }
    }
  }

  const summary = summarize(results);
  const summaryPath = path.join(RESULTS_DIR, 'SUMMARY.md');
  await writeFile(summaryPath, summary, 'utf-8');
  console.log(`\nDone. Summary written to ${summaryPath}`);
}

main();
