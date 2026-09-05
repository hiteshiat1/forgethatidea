import { describe, it, expect, vi } from 'vitest';
import { createAgentOrchestrator } from './agent-orchestrator.js';
import { createInMemorySessionStore } from './session-store.js';
import { createInMemoryManifestStore } from './manifest-store.js';
import { createCostGuard, createInMemoryCostGuardStore } from './cost-guard.js';
import type { AnthropicMessageParam, StreamMessageResult } from './anthropic-client.js';

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** A scripted fake Anthropic client — returns pre-programmed responses in sequence. */
function scriptedAnthropicClient(responses: StreamMessageResult[]) {
  let call = 0;
  const messagesReceived: AnthropicMessageParam[][] = [];
  const streamMessage = vi.fn(async (request: { messages: AnthropicMessageParam[] }) => {
    messagesReceived.push(request.messages);
    const response = responses[call];
    call++;
    if (!response) throw new Error('scriptedAnthropicClient: ran out of scripted responses');
    return response;
  });
  return { streamMessage, messagesReceived };
}

function buildDeps(anthropicClient: ReturnType<typeof scriptedAnthropicClient>) {
  const sessionStore = createInMemorySessionStore();
  const manifestStore = createInMemoryManifestStore();
  const costGuardStore = createInMemoryCostGuardStore();
  const costGuard = createCostGuard({
    store: costGuardStore,
    sessionCapCents: 1000,
    userDailyCapCents: 10000,
    warnRatio: 0.8,
    logger: silentLogger(),
  });

  return { sessionStore, manifestStore, costGuard, anthropicClient };
}

describe('createAgentOrchestrator', () => {
  it('sends the user message and returns the assistant text reply', async () => {
    const anthropicClient = scriptedAnthropicClient([
      {
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
        content: [{ type: 'text', text: "What's the idea?" }],
      },
    ]);
    const deps = buildDeps(anthropicClient);
    const session = await deps.sessionStore.create('user-1');
    const orchestrator = createAgentOrchestrator(deps);

    const result = await orchestrator.handleTurn(session.id, 'user-1', 'A habit tracker app.');

    expect(result).toMatchObject({ ok: true, reply: "What's the idea?" });
  });

  it('persists both the user message and the assistant reply to session chat', async () => {
    const anthropicClient = scriptedAnthropicClient([
      {
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
        content: [{ type: 'text', text: 'Tell me more.' }],
      },
    ]);
    const deps = buildDeps(anthropicClient);
    const session = await deps.sessionStore.create('user-1');
    const orchestrator = createAgentOrchestrator(deps);

    await orchestrator.handleTurn(session.id, 'user-1', 'A habit tracker app.');

    const updated = await deps.sessionStore.get(session.id);
    expect(updated!.chat).toEqual([
      expect.objectContaining({ role: 'user', text: 'A habit tracker app.' }),
      expect.objectContaining({ role: 'agent', text: 'Tell me more.' }),
    ]);
  });

  it('builds the system prompt from the session current phase', async () => {
    const anthropicClient = scriptedAnthropicClient([
      {
        inputTokens: 1,
        outputTokens: 1,
        stopReason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
      },
    ]);
    const deps = buildDeps(anthropicClient);
    const session = await deps.sessionStore.create('user-1');
    const orchestrator = createAgentOrchestrator(deps);

    await orchestrator.handleTurn(session.id, 'user-1', 'hello');

    expect(anthropicClient.streamMessage).toHaveBeenCalledWith(
      expect.objectContaining({ system: expect.stringContaining('onboarding') }),
      expect.anything(),
    );
  });

  it('dispatches a tool_use turn (update_manifest) and continues the conversation with the tool result', async () => {
    const anthropicClient = scriptedAnthropicClient([
      {
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'get_manifest',
            input: {},
          },
        ],
      },
      {
        inputTokens: 8,
        outputTokens: 4,
        stopReason: 'end_turn',
        content: [{ type: 'text', text: 'No manifest yet — got it.' }],
      },
    ]);
    const deps = buildDeps(anthropicClient);
    const session = await deps.sessionStore.create('user-1');
    const orchestrator = createAgentOrchestrator(deps);

    const result = await orchestrator.handleTurn(session.id, 'user-1', 'what do we have so far?');

    expect(result).toMatchObject({ ok: true, reply: 'No manifest yet — got it.' });
    expect(anthropicClient.streamMessage).toHaveBeenCalledTimes(2);

    // Second call's messages must include the tool_use + tool_result turn.
    const secondCallMessages = anthropicClient.messagesReceived[1]!;
    const assistantToolUseTurn = secondCallMessages.find(
      (m) => m.role === 'assistant' && Array.isArray(m.content),
    );
    expect(assistantToolUseTurn).toBeDefined();
    const toolResultTurn = secondCallMessages.find(
      (m) =>
        m.role === 'user' &&
        Array.isArray(m.content) &&
        m.content.some((b) => b.type === 'tool_result'),
    );
    expect(toolResultTurn).toBeDefined();
  });

  it('rejects the turn when the cost guard cap is already reached', async () => {
    const anthropicClient = scriptedAnthropicClient([]);
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const costGuardStore = createInMemoryCostGuardStore();
    await costGuardStore.recordSpend('will-be-session-1', 'user-1', 1000);
    const costGuard = createCostGuard({
      store: costGuardStore,
      sessionCapCents: 1000,
      userDailyCapCents: 10000,
      warnRatio: 0.8,
      logger: silentLogger(),
    });
    const session = await sessionStore.create('user-1');
    // Re-record spend under the real session id now that we have it.
    await costGuardStore.recordSpend(session.id, 'user-1', 1000);

    const orchestrator = createAgentOrchestrator({
      sessionStore,
      manifestStore,
      costGuard,
      anthropicClient,
    });

    const result = await orchestrator.handleTurn(session.id, 'user-1', 'hello');

    expect(result).toMatchObject({ ok: false, error: 'cost_cap_exceeded' });
    expect(anthropicClient.streamMessage).not.toHaveBeenCalled();
  });

  it('returns an error for a nonexistent session', async () => {
    const anthropicClient = scriptedAnthropicClient([]);
    const deps = buildDeps(anthropicClient);
    const orchestrator = createAgentOrchestrator(deps);

    const result = await orchestrator.handleTurn('nonexistent', 'user-1', 'hello');
    expect(result).toEqual({ ok: false, error: 'session_not_found' });
  });
});
