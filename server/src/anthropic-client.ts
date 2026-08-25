import { Anthropic } from '@anthropic-ai/sdk';

export interface MessageStreamEvent {
  type: string;
  index?: number;
  delta?: { type: string; text?: string };
  content_block?: { type: string; id?: string; name?: string; input?: unknown };
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicMessageParam {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamMessageRequest {
  model: string;
  maxTokens: number;
  system?: string;
  messages: AnthropicMessageParam[];
}

export interface StreamMessageHandlers {
  onText?: (text: string) => void;
  onToolUse?: (block: ToolUseBlock) => void;
}

export interface StreamMessageResult {
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}

export interface Logger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

/** Minimal slice of the Anthropic SDK client this wrapper depends on. */
export interface AnthropicSdkClient {
  messages: {
    stream: (params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: AnthropicMessageParam[];
    }) => AsyncIterable<MessageStreamEvent> & {
      finalMessage: () => Promise<{
        id: string;
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
        content: unknown[];
      }>;
    };
  };
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
}

export interface AnthropicClientDeps {
  sdkClient: AnthropicSdkClient;
  logger: Logger;
  retry?: RetryConfig;
}

const DEFAULT_RETRY: RetryConfig = { maxRetries: 2, baseDelayMs: 500 };

/** HTTP statuses the Anthropic API returns for transient failures — safe to retry with backoff. */
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 529]);

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  return status !== undefined && RETRYABLE_STATUSES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Server-side wrapper around the Anthropic Messages API (Epic 0.9). Streams
 * text and tool_use blocks to the caller, retries transient failures with
 * exponential backoff, and logs token usage per request.
 */
export function createAnthropicClient(deps: AnthropicClientDeps) {
  const { sdkClient, logger } = deps;
  const retry = deps.retry ?? DEFAULT_RETRY;

  async function streamMessage(
    request: StreamMessageRequest,
    handlers: StreamMessageHandlers,
  ): Promise<StreamMessageResult> {
    let attempt = 0;
    for (;;) {
      try {
        const stream = sdkClient.messages.stream({
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            handlers.onText?.(event.delta.text ?? '');
          } else if (
            event.type === 'content_block_start' &&
            event.content_block?.type === 'tool_use'
          ) {
            const block = event.content_block;
            handlers.onToolUse?.({
              type: 'tool_use',
              id: block.id ?? '',
              name: block.name ?? '',
              input: block.input,
            });
          }
        }

        const final = await stream.finalMessage();
        logger.info(
          {
            messageId: final.id,
            model: request.model,
            inputTokens: final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
            stopReason: final.stop_reason,
          },
          'anthropic message completed',
        );
        return {
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          stopReason: final.stop_reason,
        };
      } catch (err) {
        if (isRetryable(err) && attempt < retry.maxRetries) {
          const delay = retry.baseDelayMs * 2 ** attempt;
          logger.warn(
            { attempt, delay, error: err instanceof Error ? err.message : String(err) },
            'retrying transient anthropic api failure',
          );
          attempt++;
          await sleep(delay);
          continue;
        }
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          'anthropic api request failed',
        );
        throw err;
      }
    }
  }

  return { streamMessage };
}

/** Builds the real Anthropic SDK client from the server's API key. */
export function createSdkClient(apiKey: string): AnthropicSdkClient {
  return new Anthropic({ apiKey }) as unknown as AnthropicSdkClient;
}
