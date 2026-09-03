import type { ToolUseBlock } from './anthropic-client.js';

export type ToolHandler = (input: unknown) => Promise<unknown>;

export type ToolRegistry = Record<string, ToolHandler>;

export interface ToolResult {
  toolUseId: string;
  isError: boolean;
  content: unknown;
}

export interface Logger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface ToolDispatcherDeps {
  tools: ToolRegistry;
  logger: Logger;
}

/**
 * Tool-call dispatch loop (Epic 2.4): the orchestrator's bridge between a
 * model's `tool_use` blocks and the server-side handlers that satisfy them.
 * Maps tool name -> handler, executes it, and normalizes both an unknown
 * tool name and a handler that throws into a safe `ToolResult` rather than
 * letting either crash the agent loop — "unknown/invalid tool calls handled
 * safely".
 */
export function createToolDispatcher(deps: ToolDispatcherDeps) {
  const { tools, logger } = deps;
  const pending: Promise<ToolResult>[] = [];

  async function dispatch(block: ToolUseBlock): Promise<ToolResult> {
    const handler = tools[block.name];
    if (!handler) {
      logger.warn({ toolUseId: block.id, tool: block.name }, 'unknown tool requested by model');
      return {
        toolUseId: block.id,
        isError: true,
        content: { error: 'unknown_tool', tool: block.name },
      };
    }

    try {
      const content = await handler(block.input);
      return { toolUseId: block.id, isError: false, content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ toolUseId: block.id, tool: block.name, error: message }, 'tool handler threw');
      return {
        toolUseId: block.id,
        isError: true,
        content: { error: 'tool_execution_failed', message },
      };
    }
  }

  /**
   * Returns a callback suitable for `StreamMessageHandlers.onToolUse` — each
   * tool_use block the model streams is dispatched immediately (dispatch
   * order preserved via a promise queue), and results are collected for
   * `drain()` to return once the model's turn finishes. This is how tool
   * results get "streamed back into the conversation": the caller awaits
   * `drain()` after the stream ends, then sends the results back as the next
   * turn's tool_result content blocks.
   */
  function createOnToolUseHandler(): (block: ToolUseBlock) => void {
    return (block: ToolUseBlock) => {
      pending.push(dispatch(block));
    };
  }

  async function drain(): Promise<ToolResult[]> {
    const results = await Promise.all(pending);
    pending.length = 0;
    return results;
  }

  return { dispatch, createOnToolUseHandler, drain };
}
