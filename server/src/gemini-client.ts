import { GoogleGenAI } from '@google/genai';

export interface GenerateContentStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name: string; args: Record<string, unknown> };
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type GeminiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string };

export interface GeminiMessageParam {
  role: 'user' | 'assistant';
  content: string | GeminiContentPart[];
}

export interface StreamMessageRequest {
  model: string;
  maxTokens: number;
  system?: string;
  messages: GeminiMessageParam[];
}

export interface StreamMessageHandlers {
  onText?: (text: string) => void;
  onToolUse?: (block: ToolUseBlock) => void;
}

export interface Logger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Minimal slice of the Gemini SDK client this wrapper depends on. */
export interface GeminiSdkClient {
  models: {
    generateContentStream: (params: {
      model: string;
      contents: GeminiContent[];
      config?: { systemInstruction?: string; maxOutputTokens?: number };
    }) => Promise<AsyncIterable<GenerateContentStreamChunk>>;
  };
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
}

export interface GeminiClientDeps {
  sdkClient: GeminiSdkClient;
  logger: Logger;
  retry?: RetryConfig;
}

const DEFAULT_RETRY: RetryConfig = { maxRetries: 2, baseDelayMs: 500 };

/** HTTP statuses the Gemini API returns for transient failures — safe to retry with backoff. */
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 529]);

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  return status !== undefined && RETRYABLE_STATUSES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toGeminiParts(content: GeminiMessageParam['content']): GeminiPart[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  return content.map((part) =>
    part.type === 'text'
      ? { text: part.text }
      : { inlineData: { mimeType: part.mimeType, data: part.data } },
  );
}

function toGeminiContents(messages: GeminiMessageParam[]): GeminiContent[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(message.content),
  }));
}

/**
 * Server-side wrapper around the Google Gemini API (Epic 0.9c). Mirrors the
 * shape of the Anthropic client wrapper (#9): streams text and function-call
 * parts to the caller, retries transient failures with exponential backoff,
 * and logs token usage per request. Supports image/multimodal input in the
 * request shape — the primary intended use for this provider. Usage
 * normalization across providers happens in the model router (0.9d), not here.
 */
export function createGeminiClient(deps: GeminiClientDeps) {
  const { sdkClient, logger } = deps;
  const retry = deps.retry ?? DEFAULT_RETRY;

  async function streamMessage(
    request: StreamMessageRequest,
    handlers: StreamMessageHandlers,
  ): Promise<void> {
    let attempt = 0;
    for (;;) {
      try {
        const stream = await sdkClient.models.generateContentStream({
          model: request.model,
          contents: toGeminiContents(request.messages),
          config: {
            systemInstruction: request.system,
            maxOutputTokens: request.maxTokens,
          },
        });

        let inputTokens = 0;
        let outputTokens = 0;
        let finishReason: string | undefined;

        for await (const chunk of stream) {
          const candidate = chunk.candidates?.[0];
          for (const part of candidate?.content?.parts ?? []) {
            if (part.text) {
              handlers.onText?.(part.text);
            }
            if (part.functionCall) {
              handlers.onToolUse?.({
                type: 'tool_use',
                id: part.functionCall.name,
                name: part.functionCall.name,
                input: part.functionCall.args,
              });
            }
          }
          if (candidate?.finishReason) {
            finishReason = candidate.finishReason;
          }
          if (chunk.usageMetadata) {
            inputTokens = chunk.usageMetadata.promptTokenCount;
            outputTokens = chunk.usageMetadata.candidatesTokenCount;
          }
        }

        logger.info(
          {
            model: request.model,
            inputTokens,
            outputTokens,
            stopReason: finishReason ?? null,
          },
          'gemini generateContent completed',
        );
        return;
      } catch (err) {
        if (isRetryable(err) && attempt < retry.maxRetries) {
          const delay = retry.baseDelayMs * 2 ** attempt;
          logger.warn(
            { attempt, delay, error: err instanceof Error ? err.message : String(err) },
            'retrying transient gemini api failure',
          );
          attempt++;
          await sleep(delay);
          continue;
        }
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          'gemini api request failed',
        );
        throw err;
      }
    }
  }

  return { streamMessage };
}

/** Builds the real Gemini SDK client from the server's API key. */
export function createSdkClient(apiKey: string): GeminiSdkClient {
  return new GoogleGenAI({ apiKey }) as unknown as GeminiSdkClient;
}
