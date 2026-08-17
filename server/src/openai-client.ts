import OpenAI from 'openai';

export interface ChatCompletionStreamEvent {
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: string;
}

export interface OpenAiMessageParam {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamMessageRequest {
  model: string;
  maxTokens: number;
  system?: string;
  messages: OpenAiMessageParam[];
}

export interface StreamMessageHandlers {
  onText?: (text: string) => void;
  onToolUse?: (block: ToolUseBlock) => void;
}

export interface StreamMessageResult {
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export interface Logger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

/** Minimal slice of the OpenAI SDK client this wrapper depends on. */
export interface OpenAiSdkClient {
  chat: {
    completions: {
      stream: (params: {
        model: string;
        max_tokens: number;
        messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
      }) => AsyncIterable<ChatCompletionStreamEvent> & {
        finalChatCompletion: () => Promise<{
          id: string;
          choices: Array<{ finish_reason: string | null }>;
          usage: { prompt_tokens: number; completion_tokens: number };
        }>;
      };
    };
  };
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
}

export interface OpenAiClientDeps {
  sdkClient: OpenAiSdkClient;
  logger: Logger;
  retry?: RetryConfig;
}

const DEFAULT_RETRY: RetryConfig = { maxRetries: 2, baseDelayMs: 500 };

/** HTTP statuses the OpenAI API returns for transient failures — safe to retry with backoff. */
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 529]);

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  return status !== undefined && RETRYABLE_STATUSES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Server-side wrapper around the OpenAI API (Epic 0.9b). Mirrors the shape of
 * the Anthropic client wrapper (#9): streams text and tool-call blocks to the
 * caller, retries transient failures with exponential backoff, and logs
 * token usage per request. Usage normalization across providers happens in
 * the model router (0.9d), not here.
 */
export function createOpenAiClient(deps: OpenAiClientDeps) {
  const { sdkClient, logger } = deps;
  const retry = deps.retry ?? DEFAULT_RETRY;

  async function streamMessage(
    request: StreamMessageRequest,
    handlers: StreamMessageHandlers,
  ): Promise<StreamMessageResult> {
    let attempt = 0;
    for (;;) {
      try {
        const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> =
          request.system
            ? [{ role: 'system', content: request.system }, ...request.messages]
            : request.messages;

        const stream = sdkClient.chat.completions.stream({
          model: request.model,
          max_tokens: request.maxTokens,
          messages,
        });

        for await (const event of stream) {
          const delta = event.choices[0]?.delta;
          if (delta?.content) {
            handlers.onText?.(delta.content);
          }
          for (const toolCall of delta?.tool_calls ?? []) {
            if (toolCall.id && toolCall.function?.name) {
              handlers.onToolUse?.({
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.function.name,
                input: toolCall.function.arguments ?? '',
              });
            }
          }
        }

        const final = await stream.finalChatCompletion();
        logger.info(
          {
            messageId: final.id,
            model: request.model,
            inputTokens: final.usage.prompt_tokens,
            outputTokens: final.usage.completion_tokens,
            stopReason: final.choices[0]?.finish_reason ?? null,
          },
          'openai chat completion completed',
        );
        return {
          inputTokens: final.usage.prompt_tokens,
          outputTokens: final.usage.completion_tokens,
          stopReason: final.choices[0]?.finish_reason ?? null,
        };
      } catch (err) {
        if (isRetryable(err) && attempt < retry.maxRetries) {
          const delay = retry.baseDelayMs * 2 ** attempt;
          logger.warn(
            { attempt, delay, error: err instanceof Error ? err.message : String(err) },
            'retrying transient openai api failure',
          );
          attempt++;
          await sleep(delay);
          continue;
        }
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          'openai api request failed',
        );
        throw err;
      }
    }
  }

  return { streamMessage };
}

/** Builds the real OpenAI SDK client from the server's API key. */
export function createSdkClient(apiKey: string): OpenAiSdkClient {
  return new OpenAI({ apiKey }) as unknown as OpenAiSdkClient;
}
