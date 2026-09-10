import type { MessageContentBlock, StreamMessageRequest } from './anthropic-client.js';

export interface UnambiguousIntent {
  ambiguous: false;
  target: string;
  action: string;
  summary: string;
}

export interface AmbiguousIntent {
  ambiguous: true;
  clarifyingQuestion: string;
}

export type ChangeIntent = UnambiguousIntent | AmbiguousIntent;

export interface IntentParseFailure {
  ok: false;
  error: 'invalid_json' | 'invalid_shape';
}

export type IntentParseResult = ChangeIntent | IntentParseFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isIntentParseFailure(result: IntentParseResult): result is IntentParseFailure {
  return 'ok' in result && result.ok === false;
}

/**
 * Explicit type guard rather than relying on inline `.ambiguous` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isAmbiguousIntent(intent: ChangeIntent): intent is AmbiguousIntent {
  return intent.ambiguous === true;
}

/**
 * Composes the request-parsing prompt (Epic 5.5): turns a free-text change
 * request into a structured edit intent (what's changing, and where) that
 * gets passed to the diff-edit pipeline (#76) alongside the raw request, so
 * the editor model has an explicit target/action pair rather than having to
 * re-derive intent from prose on every retry. When the request is
 * genuinely underspecified — "add a status field" with no indication of
 * which entity — the model is asked to say so with exactly one clarifying
 * question, rather than guessing and burning a round on the wrong edit.
 */
export function buildIntentParsePrompt(currentCode: string, changeRequest: string): string {
  return `
Parse this change request against the current app into a structured edit intent.

If the request is clear enough to act on, identify:
- "target": what part of the app it affects (a component, field, entity, or screen name).
- "action": the kind of change (e.g. "style", "add_field", "remove_field", "add_entity", "layout", "copy", "behavior").
- "summary": a one-sentence restatement of the concrete edit to make.

If the request is genuinely ambiguous — it could reasonably mean more than one thing given the current app, or it's missing information needed to act (e.g. "add a status field" with several entities and no indication which one) — do not guess. Instead ask exactly one clarifying question that would resolve the ambiguity.

Current app:
\`\`\`
${currentCode}
\`\`\`

Change request: ${changeRequest}

Respond with ONLY a single JSON object, one of:
{ "ambiguous": false, "target": "...", "action": "...", "summary": "..." }
{ "ambiguous": true, "clarifyingQuestion": "..." }
No prose, no markdown code fences.
`.trim();
}

/** Parses and validates the model's intent JSON response. Never throws on malformed input. */
export function parseIntentResponse(json: string): IntentParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (typeof parsed !== 'object' || parsed === null || !('ambiguous' in parsed)) {
    return { ok: false, error: 'invalid_shape' };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.ambiguous === true) {
    if (typeof obj.clarifyingQuestion !== 'string' || !obj.clarifyingQuestion.trim()) {
      return { ok: false, error: 'invalid_shape' };
    }
    return { ambiguous: true, clarifyingQuestion: obj.clarifyingQuestion };
  }

  if (obj.ambiguous === false) {
    if (
      typeof obj.target !== 'string' ||
      !obj.target.trim() ||
      typeof obj.action !== 'string' ||
      !obj.action.trim() ||
      typeof obj.summary !== 'string' ||
      !obj.summary.trim()
    ) {
      return { ok: false, error: 'invalid_shape' };
    }
    return { ambiguous: false, target: obj.target, action: obj.action, summary: obj.summary };
  }

  return { ok: false, error: 'invalid_shape' };
}

export interface IntentParserAnthropicClient {
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

export interface ParseChangeIntentInput {
  currentCode: string;
  changeRequest: string;
  anthropicClient: IntentParserAnthropicClient;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TOKENS = 256;

/**
 * Parses a change request into a structured intent (Epic 5.5). Fails toward
 * "unambiguous, act on the raw request" on any model error or malformed
 * response — a parser outage must never block the diff-edit pipeline (#76)
 * from running; it just loses the extra structure and falls back to the
 * same behavior as before this parser existed.
 */
export async function parseChangeIntent(input: ParseChangeIntentInput): Promise<ChangeIntent> {
  const { currentCode, changeRequest, anthropicClient } = input;
  const model = input.model ?? DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const prompt = buildIntentParsePrompt(currentCode, changeRequest);

  const fallback: UnambiguousIntent = {
    ambiguous: false,
    target: 'unspecified',
    action: 'unspecified',
    summary: changeRequest,
  };

  let result;
  try {
    result = await anthropicClient.streamMessage(
      { model, maxTokens, messages: [{ role: 'user', content: prompt }] },
      {},
    );
  } catch {
    return fallback;
  }

  const text = result.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const parsed = parseIntentResponse(text);
  if (isIntentParseFailure(parsed)) {
    return fallback;
  }
  return parsed;
}
