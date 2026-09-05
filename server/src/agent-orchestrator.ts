import { randomUUID } from 'node:crypto';
import type {
  AnthropicMessageParam,
  MessageContentBlock,
  StreamMessageRequest,
} from './anthropic-client.js';
import { buildSystemPrompt } from './system-prompt.js';
import { createToolDispatcher, type ToolRegistry } from './tool-dispatch.js';
import { createManifestTools } from './manifest-tools.js';
import { createSourcesTools } from './sources-tools.js';
import type { SessionStore } from './session-store.js';
import type { ManifestStore } from './manifest-store.js';
import type { createCostGuard } from './cost-guard.js';
import { CostCapExceededError } from './cost-guard.js';
import { DEFAULT_PRICING, normalizeUsage } from './model-router.js';
import type { ChatMessage } from './chat-message.js';

export interface OrchestratorAnthropicClient {
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

export interface AgentOrchestratorDeps {
  sessionStore: SessionStore;
  manifestStore: ManifestStore;
  costGuard: ReturnType<typeof createCostGuard>;
  anthropicClient: OrchestratorAnthropicClient;
  /** Model used for the agent loop — defaults to the same model the task registry routes agent-loop to. */
  model?: string;
  maxTokens?: number;
  /** Extra tools beyond the built-in manifest tools (e.g. web_search) — merged in, manifest tools always win on name clash. */
  extraTools?: ToolRegistry;
  /** Max tool-call round-trips per turn before giving up rather than looping forever on a confused model. */
  maxToolRounds?: number;
}

export interface HandleTurnSuccess {
  ok: true;
  reply: string;
}

export interface HandleTurnFailure {
  ok: false;
  error: 'session_not_found' | 'cost_cap_exceeded';
  reason?: string;
}

export type HandleTurnResult = HandleTurnSuccess | HandleTurnFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing
 * of the union — a prior PR (#38's refinement-tracker.ts) hit a Vercel-only
 * build failure where that inline narrowing didn't hold in Vercel's
 * (separately-invoked, non-Turbo-cached) tsc pass even though it typechecked
 * fine locally. This sidesteps the whole class of issue.
 */
export function isHandleTurnFailure(result: HandleTurnResult): result is HandleTurnFailure {
  return result.ok === false;
}

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_MAX_TOOL_ROUNDS = 5;

const BUILT_IN_TOOL_SCHEMAS = {
  get_manifest: {
    description: 'Read the current build manifest for this session, if one exists yet.',
    inputSchema: { type: 'object', properties: {} },
  },
  update_manifest: {
    description:
      'Apply a partial update to the build manifest, merging it into whatever exists already.',
    inputSchema: {
      type: 'object',
      properties: { patch: { type: 'object' } },
      required: ['patch'],
    },
  },
  record_source: {
    description:
      'Record one competitor name, app, or reference link the user mentions during the sources phase.',
    inputSchema: {
      type: 'object',
      properties: { input: { type: 'string' } },
      required: ['input'],
    },
  },
  decline_sources: {
    description:
      'Record that the user has explicitly said they have no competitor/reference sources to share.',
    inputSchema: { type: 'object', properties: {} },
  },
} as const;

function toAnthropicMessages(chat: ChatMessage[]): AnthropicMessageParam[] {
  return chat.map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.text }));
}

/**
 * The agent orchestrator (Epic 2, the piece #34/#35/#39/#40/#43 all depend
 * on): ties the system prompt (#30), tool dispatcher (#31), manifest tools
 * (#33), and cost guardrails (#0.11) into one real conversational turn.
 *
 * One call to `handleTurn` = one full round: check the cost guard, build the
 * system prompt from the session's current phase, send the conversation
 * history + the new user message to the model with tools available, dispatch
 * any tool_use blocks the model asks for, feed the results back and let the
 * model continue (up to `maxToolRounds` round-trips) until it produces a
 * final text reply, then persist the user message + reply to session chat
 * and record the turn's cost.
 */
export function createAgentOrchestrator(deps: AgentOrchestratorDeps) {
  const { sessionStore, manifestStore, costGuard, anthropicClient } = deps;
  const model = deps.model ?? DEFAULT_MODEL;
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxToolRounds = deps.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;

  async function handleTurn(
    sessionId: string,
    userId: string,
    userMessage: string,
  ): Promise<HandleTurnResult> {
    const session = await sessionStore.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    try {
      await costGuard.checkBeforeCall({ sessionId, userId });
    } catch (err) {
      if (err instanceof CostCapExceededError) {
        return { ok: false, error: 'cost_cap_exceeded', reason: err.reason };
      }
      throw err;
    }

    const manifestTools = createManifestTools({ store: manifestStore, sessionId });
    const sourcesTools = createSourcesTools({ store: sessionStore, sessionId });
    const toolRegistry: ToolRegistry = {
      get_manifest: manifestTools.get_manifest,
      update_manifest: manifestTools.update_manifest,
      record_source: sourcesTools.record_source,
      decline_sources: sourcesTools.decline_sources,
      ...deps.extraTools,
    };
    const dispatcher = createToolDispatcher({ tools: toolRegistry, logger: silentLogger() });

    const system = buildSystemPrompt({ phase: session.phase });
    const messages: AnthropicMessageParam[] = [
      ...toAnthropicMessages(session.chat as ChatMessage[]),
      { role: 'user', content: userMessage },
    ];

    const tools = Object.keys(toolRegistry).map((name) => ({
      name,
      description:
        BUILT_IN_TOOL_SCHEMAS[name as keyof typeof BUILT_IN_TOOL_SCHEMAS]?.description ??
        `Tool: ${name}`,
      inputSchema: BUILT_IN_TOOL_SCHEMAS[name as keyof typeof BUILT_IN_TOOL_SCHEMAS]
        ?.inputSchema ?? {
        type: 'object',
      },
    }));

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalText = '';

    for (let round = 0; round <= maxToolRounds; round++) {
      const result = await anthropicClient.streamMessage(
        { model, maxTokens, system, messages, tools },
        {},
      );
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;

      const toolUseBlocks = result.content.filter((b) => b.type === 'tool_use');
      if (toolUseBlocks.length === 0) {
        finalText = result.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('');
        break;
      }

      messages.push({ role: 'assistant', content: result.content });

      const toolResults = await Promise.all(
        toolUseBlocks.map((block) => dispatcher.dispatch(block)),
      );
      messages.push({
        role: 'user',
        content: toolResults.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.toolUseId,
          content: JSON.stringify(r.content),
          is_error: r.isError,
        })),
      });

      if (round === maxToolRounds) {
        finalText =
          "I ran into trouble finishing that — let's try a different approach. Could you rephrase what you'd like?";
      }
    }

    const costCents = normalizeUsage(DEFAULT_PRICING, 'anthropic', model, {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      stopReason: null,
    }).costCents;
    await costGuard.recordUsage({ sessionId, userId }, costCents);

    const newChat: ChatMessage[] = [
      ...(session.chat as ChatMessage[]),
      { id: randomUUID(), role: 'user', text: userMessage },
      { id: randomUUID(), role: 'agent', text: finalText },
    ];
    await sessionStore.update(sessionId, { chat: newChat });

    return { ok: true, reply: finalText };
  }

  return { handleTurn };
}

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}
