import type { MessageContentBlock, StreamMessageRequest } from './anthropic-client.js';

export type RefinementMessageKind = 'change_request' | 'clarification';

export interface ClassificationSuccess {
  ok: true;
  kind: RefinementMessageKind;
}

export interface ClassificationFailure {
  ok: false;
  error: 'invalid_json' | 'invalid_shape';
}

export type ClassificationResult = ClassificationSuccess | ClassificationFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isClassificationFailure(
  result: ClassificationResult,
): result is ClassificationFailure {
  return result.ok === false;
}

/**
 * Composes the round-classification prompt (Epic 5.1): "a round = change
 * request -> re-emit. Clarifying Q&A within a round is free" per the issue.
 * Needs real judgment, not pattern matching — "Can you make the button
 * bigger?" is a real change request phrased as a question, and "Change the
 * reminder to send after work" has no question mark but might genuinely
 * need clarification about what "after work" means. The current app code
 * is included so the model can judge against what actually exists, not
 * just the message in isolation.
 */
export function buildClassificationPrompt(currentCode: string, message: string): string {
  return `
Classify this user message about their app as either:
- "change_request": the user wants something in the app changed, added, or removed — even if phrased as a question ("Can you make the button bigger?" is a change request).
- "clarification": the user is asking a question about what currently exists or how something works, without requesting any change — e.g. "What does this button do?" or "Why is the list sorted this way?".

Current app:
\`\`\`
${currentCode}
\`\`\`

User message: ${message}

Respond with ONLY a single JSON object: { "kind": "change_request" } or { "kind": "clarification" }. No prose, no markdown code fences.
`.trim();
}

/** Parses and validates the model's classification JSON response. Never throws on malformed input. */
export function parseClassificationResponse(json: string): ClassificationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (typeof parsed !== 'object' || parsed === null || !('kind' in parsed)) {
    return { ok: false, error: 'invalid_shape' };
  }

  const { kind } = parsed as { kind: unknown };
  if (kind !== 'change_request' && kind !== 'clarification') {
    return { ok: false, error: 'invalid_shape' };
  }

  return { ok: true, kind };
}

export interface ClassifierAnthropicClient {
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

export interface ClassifyRefinementMessageInput {
  currentCode: string;
  message: string;
  anthropicClient: ClassifierAnthropicClient;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TOKENS = 128;

/**
 * Round-boundary classifier (Epic 5.1): decides whether a refinement
 * message consumes a round (change_request) or is free (clarification).
 * Defaults to `change_request` on a model-call failure or a malformed
 * response — the opposite fail-direction from content-safety-screen.ts's
 * fail-open design, and deliberately so: failing toward "free" here would
 * let every classifier outage bypass round limits entirely, defeating
 * their purpose. Charging a round on an ambiguous outcome is the safe
 * default; the user can still ask for clarification in a way that reads
 * unambiguously as a question.
 */
export async function classifyRefinementMessage(
  input: ClassifyRefinementMessageInput,
): Promise<ClassificationSuccess> {
  const { currentCode, message, anthropicClient } = input;
  const model = input.model ?? DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const prompt = buildClassificationPrompt(currentCode, message);

  let result;
  try {
    result = await anthropicClient.streamMessage(
      { model, maxTokens, messages: [{ role: 'user', content: prompt }] },
      {},
    );
  } catch {
    return { ok: true, kind: 'change_request' };
  }

  const text = result.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const parsed = parseClassificationResponse(text);
  if (isClassificationFailure(parsed)) {
    return { ok: true, kind: 'change_request' };
  }
  return parsed;
}
