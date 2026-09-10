import type { MessageContentBlock, StreamMessageRequest } from './anthropic-client.js';
import type { GenerationSpec } from './generation-spec.js';

export interface ScreeningDecision {
  allowed: boolean;
  /** Required when allowed is false — a clear, kind reason to show the user (Epic 4.17's "clear, kind refusal UX"). */
  reason?: string;
}

export interface ScreeningSuccess {
  ok: true;
  decision: ScreeningDecision;
}

export interface ScreeningFailure {
  ok: false;
  error: 'invalid_json' | 'invalid_shape';
}

export type ScreeningResult = ScreeningSuccess | ScreeningFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isScreeningFailure(result: ScreeningResult): result is ScreeningFailure {
  return result.ok === false;
}

/**
 * Composes the content-safety screening prompt (Epic 4.17): asks the model
 * to judge the manifest's actual intent — harmful, deceptive, or
 * IP-infringing — rather than pattern-matching keywords, which would be
 * both trivially bypassable and prone to false positives on legitimate
 * ideas that happen to mention a sensitive word in an innocuous context.
 */
export function buildScreeningPrompt(spec: GenerationSpec): string {
  const entitiesBlock = spec.entities.map((e) => `- ${e.name}`).join('\n');
  const screensBlock = spec.screens.map((s) => `- ${s.name}: ${s.purpose}`).join('\n');

  return `
Evaluate whether this app idea is safe to generate. Screen for:
- Harmful content: apps designed to facilitate violence, self-harm, illegal weapons/drugs, or other serious real-world harm.
- Deceptive content: apps designed to scam, phish, impersonate a real person/organization, or spread misinformation as if it were fact.
- IP-infringing content: apps that exist specifically to clone or impersonate a real, identifiable commercial product/brand rather than building something original inspired by a category.

App idea:
Product name: ${spec.productName}
Built for: ${spec.icp}
Entities:
${entitiesBlock}
Screens:
${screensBlock}
Key actions: ${spec.keyActions.join(', ')}

Most ideas are fine — only block on a genuine, clear violation of the categories above, not on borderline or ambiguous cases.

Respond with ONLY a single JSON object: { "allowed": true } if safe, or { "allowed": false, "reason": "<a short, kind, specific explanation the user will see>" } if not. No prose, no markdown code fences.
`.trim();
}

/**
 * Parses and validates a model's screening JSON response. Never throws on
 * malformed input; requires a `reason` whenever `allowed` is false, since
 * a refusal with no reason can't satisfy "clear, kind refusal UX".
 */
export function parseScreeningResponse(json: string): ScreeningResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (typeof parsed !== 'object' || parsed === null || !('allowed' in parsed)) {
    return { ok: false, error: 'invalid_shape' };
  }

  const { allowed, reason } = parsed as { allowed: unknown; reason?: unknown };
  if (typeof allowed !== 'boolean') {
    return { ok: false, error: 'invalid_shape' };
  }
  if (!allowed && (typeof reason !== 'string' || !reason.trim())) {
    return { ok: false, error: 'invalid_shape' };
  }

  return {
    ok: true,
    decision: allowed ? { allowed: true } : { allowed: false, reason: reason as string },
  };
}

export interface ScreeningAnthropicClient {
  streamMessage(
    request: StreamMessageRequest,
    handlers: { onText?: (text: string) => void },
  ): Promise<{
    inputTokens: number;
    outputTokens: number;
    stopReason: string;
    content: MessageContentBlock[];
  }>;
}

export interface ScreenManifestInput {
  spec: GenerationSpec;
  anthropicClient: ScreeningAnthropicClient;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TOKENS = 512;

/**
 * Content safety screening (Epic 4.17): a dedicated model call judging the
 * manifest's actual intent before generation runs — "pre-generation manifest
 * screening" per the issue. Fails open (allowed: true) on a model-call
 * failure or a malformed response, rather than blocking every build when
 * the screener itself is unavailable: this is one layer among several
 * (the codegen contract's honesty rules, the static validation gate, #66)
 * rather than the only safeguard, so an outage here shouldn't remove all
 * protection along with it — consistent with the orchestrator's "no
 * dead-end states" discipline used throughout this project.
 */
export async function screenManifestForSafety(
  input: ScreenManifestInput,
): Promise<ScreeningSuccess> {
  const { spec, anthropicClient } = input;
  const model = input.model ?? DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const prompt = buildScreeningPrompt(spec);

  let result;
  try {
    result = await anthropicClient.streamMessage(
      { model, maxTokens, messages: [{ role: 'user', content: prompt }] },
      {},
    );
  } catch {
    return {
      ok: true,
      decision: { allowed: true, reason: 'Screening unavailable — allowed by default.' },
    };
  }

  const text = result.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const parsed = parseScreeningResponse(text);
  if (isScreeningFailure(parsed)) {
    return {
      ok: true,
      decision: { allowed: true, reason: 'Screening unavailable — allowed by default.' },
    };
  }
  return parsed;
}
