import type { MessageContentBlock, StreamMessageRequest } from './anthropic-client.js';

export interface SingleChangeVerdict {
  isSingleChange: true;
}

export interface MultiChangeVerdict {
  isSingleChange: false;
  detectedChanges: string[];
}

export type ScopeVerdict = SingleChangeVerdict | MultiChangeVerdict;

export interface ScopeCheckFailure {
  ok: false;
  error: 'invalid_json' | 'invalid_shape';
}

export type ScopeCheckResult = ScopeVerdict | ScopeCheckFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isScopeCheckFailure(result: ScopeCheckResult): result is ScopeCheckFailure {
  return 'ok' in result && result.ok === false;
}

/**
 * Explicit type guard rather than relying on inline `.isSingleChange`
 * narrowing — this pattern has caused a Vercel-only build failure multiple
 * times this project even when local tsc is clean on the same TypeScript
 * version.
 */
export function isMultiChangeVerdict(verdict: ScopeVerdict): verdict is MultiChangeVerdict {
  return verdict.isSingleChange === false;
}

/**
 * Composes the scope-check prompt (Epic 5.7): detects a "mega-prompt" —
 * several genuinely distinct changes bundled into one request to get more
 * value out of a single refinement round — so the user can be asked
 * whether to proceed as one round or split into separate ones, rather than
 * silently either rejecting the request or letting it consume just one
 * round for several changes' worth of edits. Judged by the model rather
 * than a length/keyword heuristic, since a single detailed change and a
 * bundle of several small ones can be the same length.
 */
export function buildScopeCheckPrompt(changeRequest: string): string {
  return `
Judge whether this refinement change request describes one single, coherent change, or several genuinely separate changes bundled together.

Change request: ${changeRequest}

Respond with ONLY a single JSON object:
{ "isSingleChange": true } if it's one change (however detailed).
{ "isSingleChange": false, "detectedChanges": ["...", "...", ...] } if it bundles two or more separate changes — list each one as its own short phrase.
No prose, no markdown code fences.
`.trim();
}

/** Parses and validates the model's scope-check JSON response. Never throws on malformed input. */
export function parseScopeCheckResponse(json: string): ScopeCheckResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (typeof parsed !== 'object' || parsed === null || !('isSingleChange' in parsed)) {
    return { ok: false, error: 'invalid_shape' };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.isSingleChange === true) {
    return { isSingleChange: true };
  }

  if (obj.isSingleChange === false) {
    if (
      !Array.isArray(obj.detectedChanges) ||
      obj.detectedChanges.length < 2 ||
      !obj.detectedChanges.every((c) => typeof c === 'string' && c.trim())
    ) {
      return { ok: false, error: 'invalid_shape' };
    }
    return { isSingleChange: false, detectedChanges: obj.detectedChanges };
  }

  return { ok: false, error: 'invalid_shape' };
}

export interface ScopeCheckAnthropicClient {
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

export interface CheckRequestScopeInput {
  changeRequest: string;
  anthropicClient: ScopeCheckAnthropicClient;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TOKENS = 256;

/**
 * Detects a "mega-prompt" bundling several distinct changes into one round
 * (Epic 5.7). Defaults to `isSingleChange: true` on any model error or
 * malformed response — a scope-checker outage should never block a normal,
 * genuinely single-change refinement from proceeding.
 */
export async function checkRequestScope(input: CheckRequestScopeInput): Promise<ScopeVerdict> {
  const { changeRequest, anthropicClient } = input;
  const model = input.model ?? DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const prompt = buildScopeCheckPrompt(changeRequest);

  let result;
  try {
    result = await anthropicClient.streamMessage(
      { model, maxTokens, messages: [{ role: 'user', content: prompt }] },
      {},
    );
  } catch {
    return { isSingleChange: true };
  }

  const text = result.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const parsed = parseScopeCheckResponse(text);
  if (isScopeCheckFailure(parsed)) {
    return { isSingleChange: true };
  }
  return parsed;
}
