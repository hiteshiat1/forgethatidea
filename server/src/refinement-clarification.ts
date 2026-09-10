import type { MessageContentBlock, StreamMessageRequest } from './anthropic-client.js';

export interface ClarificationAnthropicClient {
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

export interface AnswerClarificationInput {
  currentCode: string;
  question: string;
  anthropicClient: ClarificationAnthropicClient;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TOKENS = 1024;
const FALLBACK_ANSWER =
  "I couldn't answer that just now — could you try asking again, or rephrase your question?";

/**
 * Answers a clarifying question about the current app (Epic 5.1's "free"
 * side of a round) without touching the code at all — a plain
 * conversational reply, never a diff-edit. "No dead-end states": a
 * model-call failure returns a graceful fallback message rather than
 * throwing, so a free clarification can never crash the request.
 */
export async function answerClarification(input: AnswerClarificationInput): Promise<string> {
  const { currentCode, question, anthropicClient } = input;
  const model = input.model ?? DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;

  const prompt = `
The user has a question about their existing app — answer it plainly, in a sentence or two. Do not propose or make any code changes; this is a question, not a change request.

Current app:
\`\`\`
${currentCode}
\`\`\`

Question: ${question}
`.trim();

  let result;
  try {
    result = await anthropicClient.streamMessage(
      { model, maxTokens, messages: [{ role: 'user', content: prompt }] },
      {},
    );
  } catch {
    return FALLBACK_ANSWER;
  }

  const text = result.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return text.trim() || FALLBACK_ANSWER;
}
