import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './agent-orchestrator.js';
import { createInMemorySessionStore } from './session-store.js';
import { createInMemoryManifestStore } from './manifest-store.js';
import { createCostGuard, createInMemoryCostGuardStore } from './cost-guard.js';
import type {
  AnthropicMessageParam,
  StreamMessageRequest,
  StreamMessageResult,
} from './anthropic-client.js';
import type { BuildManifest } from '@forge/shared';

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/**
 * Scripted fake Anthropic client, keyed by whether a tool_result for a given
 * `toolUseId` is already present in the incoming messages. This mirrors how
 * a real model behaves within one `handleTurn` call: call a tool, see its
 * result, then either call another tool or produce final text — and the
 * system prompt stays fixed for the whole turn (it's built once from the
 * phase at turn start), so scripting purely off `system` text would loop
 * forever on a phase transition that only takes effect on the *next* turn.
 */
function hasToolResultFor(messages: AnthropicMessageParam[], toolUseId: string): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((b) => b.type === 'tool_result' && b.tool_use_id === toolUseId),
  );
}

function scriptedByRequest(
  script: Array<{
    when: (req: StreamMessageRequest) => boolean;
    respond: StreamMessageResult;
  }>,
) {
  const messagesReceived: AnthropicMessageParam[][] = [];
  const streamMessage = vi.fn(async (req: StreamMessageRequest) => {
    messagesReceived.push(req.messages);
    const match = script.find((entry) => entry.when(req));
    if (!match) {
      throw new Error(
        `scriptedByRequest: no matching script entry. messages=${JSON.stringify(req.messages)}`,
      );
    }
    return match.respond;
  });
  return { streamMessage, messagesReceived };
}

const FULL_MANIFEST: BuildManifest = {
  schemaVersion: 1,
  productName: 'Habit Tracker',
  icp: 'People building daily habits who want gentle accountability.',
  entities: [{ name: 'Habit', fields: [{ name: 'title', type: 'string' }] }],
  screens: [{ name: 'Dashboard', purpose: 'See today’s habits' }],
  roles: ['user'],
  keyActions: ['Mark a habit complete'],
  branding: { accentColor: '#2E7D32', tone: 'calm and encouraging' },
  references: { researchCardIds: [] },
};

describe('end-to-end agent integration test (#43)', () => {
  it('drives a full happy-path session from onboarding through to the refine phase, with manifest/gate assertions at each transition', async () => {
    const sessionStore = createInMemorySessionStore();
    const manifestStore = createInMemoryManifestStore();
    const costGuardStore = createInMemoryCostGuardStore();
    const costGuard = createCostGuard({
      store: costGuardStore,
      sessionCapCents: 100_000,
      userDailyCapCents: 100_000,
      warnRatio: 0.8,
      logger: silentLogger(),
    });

    const session = await sessionStore.create('user-1');
    const userId = 'user-1';

    // --- Turn 1: onboarding -> sources ---
    const client1 = scriptedByRequest([
      {
        when: (req) => !hasToolResultFor(req.messages, 'toolu_1'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'tool_use',
          content: [
            { type: 'tool_use', id: 'toolu_1', name: 'transition_phase', input: { to: 'sources' } },
          ],
        },
      },
      {
        when: (req) => hasToolResultFor(req.messages, 'toolu_1'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'end_turn',
          content: [{ type: 'text', text: "Great, let's talk sources." }],
        },
      },
    ]);
    const orchestrator1 = createAgentOrchestrator({
      sessionStore,
      manifestStore,
      costGuard,
      anthropicClient: client1,
      maxToolRounds: 5,
    });

    expect((await sessionStore.get(session.id))?.phase).toBe('onboarding');
    let result = await orchestrator1.handleTurn(
      session.id,
      userId,
      'I want to build a habit tracker.',
    );
    expect(result).toMatchObject({
      ok: true,
      events: [{ type: 'phase_changed', from: 'onboarding', to: 'sources' }],
    });
    expect((await sessionStore.get(session.id))?.phase).toBe('sources');

    // --- Turn 2: sources -> brainstorm (declines sources, then transitions) ---
    const client2 = scriptedByRequest([
      {
        when: (req) => !hasToolResultFor(req.messages, 'toolu_2'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'tool_use',
          content: [{ type: 'tool_use', id: 'toolu_2', name: 'decline_sources', input: {} }],
        },
      },
      {
        when: (req) =>
          hasToolResultFor(req.messages, 'toolu_2') && !hasToolResultFor(req.messages, 'toolu_3'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_3',
              name: 'transition_phase',
              input: { to: 'brainstorm' },
            },
          ],
        },
      },
      {
        when: (req) => hasToolResultFor(req.messages, 'toolu_3'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'end_turn',
          content: [
            { type: 'text', text: 'Noted — no sources to ground on. On to brainstorming.' },
          ],
        },
      },
    ]);
    const orchestrator2 = createAgentOrchestrator({
      sessionStore,
      manifestStore,
      costGuard,
      anthropicClient: client2,
      maxToolRounds: 5,
    });

    result = await orchestrator2.handleTurn(session.id, userId, 'I have no competitors to share.');
    expect(result).toMatchObject({
      ok: true,
      events: [{ type: 'phase_changed', from: 'sources', to: 'brainstorm' }],
    });
    const sessionAfterSources = await sessionStore.get(session.id);
    expect(sessionAfterSources?.phase).toBe('brainstorm');
    expect(sessionAfterSources?.sourcesIntake).toMatchObject({ declined: true });

    // --- Turn 3: brainstorm -> planning (writes the manifest, then transitions) ---
    const client3 = scriptedByRequest([
      {
        when: (req) => !hasToolResultFor(req.messages, 'toolu_4'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_4',
              name: 'update_manifest',
              input: { patch: FULL_MANIFEST },
            },
          ],
        },
      },
      {
        when: (req) =>
          hasToolResultFor(req.messages, 'toolu_4') && !hasToolResultFor(req.messages, 'toolu_5'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_5',
              name: 'transition_phase',
              input: { to: 'planning' },
            },
          ],
        },
      },
      {
        when: (req) => hasToolResultFor(req.messages, 'toolu_5'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Manifest drafted — moving to planning.' }],
        },
      },
    ]);
    const orchestrator3 = createAgentOrchestrator({
      sessionStore,
      manifestStore,
      costGuard,
      anthropicClient: client3,
      maxToolRounds: 5,
    });

    result = await orchestrator3.handleTurn(session.id, userId, "Here's my full plan for the app.");
    expect(result).toMatchObject({
      ok: true,
      events: [{ type: 'phase_changed', from: 'brainstorm', to: 'planning' }],
    });
    expect((await sessionStore.get(session.id))?.phase).toBe('planning');
    const manifestAfterBrainstorm = await manifestStore.getLatest(session.id);
    expect(manifestAfterBrainstorm?.data).toMatchObject({ productName: 'Habit Tracker' });

    // --- Turn 4: planning recap via summarize_manifest (no phase change) ---
    const client4 = scriptedByRequest([
      {
        when: (req) => !hasToolResultFor(req.messages, 'toolu_6'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'tool_use',
          content: [{ type: 'tool_use', id: 'toolu_6', name: 'summarize_manifest', input: {} }],
        },
      },
      {
        when: (req) => hasToolResultFor(req.messages, 'toolu_6'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Here is the current plan.' }],
        },
      },
    ]);
    const orchestrator4 = createAgentOrchestrator({
      sessionStore,
      manifestStore,
      costGuard,
      anthropicClient: client4,
      maxToolRounds: 5,
    });

    result = await orchestrator4.handleTurn(session.id, userId, 'what do we have so far?');
    expect(result).toMatchObject({ ok: true, reply: 'Here is the current plan.', events: [] });
    expect((await sessionStore.get(session.id))?.phase).toBe('planning');

    // --- Turn 5: planning -> build attempt fails: gate not satisfied (no cards locked yet) ---
    const client5 = scriptedByRequest([
      {
        when: (req) => !hasToolResultFor(req.messages, 'toolu_7'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'tool_use',
          content: [
            { type: 'tool_use', id: 'toolu_7', name: 'transition_phase', input: { to: 'build' } },
          ],
        },
      },
      {
        when: (req) => hasToolResultFor(req.messages, 'toolu_7'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'end_turn',
          content: [
            { type: 'text', text: "The plan isn't ready to build yet — a few things are missing." },
          ],
        },
      },
    ]);
    const orchestrator5 = createAgentOrchestrator({
      sessionStore,
      manifestStore,
      costGuard,
      anthropicClient: client5,
      maxToolRounds: 5,
    });

    result = await orchestrator5.handleTurn(session.id, userId, 'ready to build now');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toEqual([]); // gate blocked the transition -> no phase_changed event
    }
    expect((await sessionStore.get(session.id))?.phase).toBe('planning'); // unchanged

    // --- Lock all four required cards, then retry the same transition ---
    await sessionStore.update(session.id, {
      cards: [
        { id: 'c1', type: 'options', status: 'locked' },
        { id: 'c2', type: 'architecture', status: 'locked' },
        { id: 'c3', type: 'cost', status: 'locked' },
        { id: 'c4', type: 'marketing', status: 'locked' },
      ],
    });

    // --- Turn 6: planning -> build (gate now satisfied) ---
    const client6 = scriptedByRequest([
      {
        when: (req) => !hasToolResultFor(req.messages, 'toolu_8'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'tool_use',
          content: [
            { type: 'tool_use', id: 'toolu_8', name: 'transition_phase', input: { to: 'build' } },
          ],
        },
      },
      {
        when: (req) => hasToolResultFor(req.messages, 'toolu_8'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'Locked in — moving to build.' }],
        },
      },
    ]);
    const orchestrator6 = createAgentOrchestrator({
      sessionStore,
      manifestStore,
      costGuard,
      anthropicClient: client6,
      maxToolRounds: 5,
    });

    result = await orchestrator6.handleTurn(
      session.id,
      userId,
      'ready to build now, cards are locked',
    );
    expect(result).toMatchObject({
      ok: true,
      reply: 'Locked in — moving to build.',
      events: [{ type: 'phase_changed', from: 'planning', to: 'build' }],
    });
    expect((await sessionStore.get(session.id))?.phase).toBe('build');

    // --- Turn 7: build -> refine (single forward step, always legal once in build) ---
    const client7 = scriptedByRequest([
      {
        when: (req) => !hasToolResultFor(req.messages, 'toolu_9'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'tool_use',
          content: [
            { type: 'tool_use', id: 'toolu_9', name: 'transition_phase', input: { to: 'refine' } },
          ],
        },
      },
      {
        when: (req) => hasToolResultFor(req.messages, 'toolu_9'),
        respond: {
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'end_turn',
          content: [{ type: 'text', text: 'App built — you can now request refinements.' }],
        },
      },
    ]);
    const orchestrator7 = createAgentOrchestrator({
      sessionStore,
      manifestStore,
      costGuard,
      anthropicClient: client7,
      maxToolRounds: 5,
    });

    result = await orchestrator7.handleTurn(session.id, userId, 'looks great, ship it');
    expect(result).toMatchObject({
      ok: true,
      reply: 'App built — you can now request refinements.',
      events: [{ type: 'phase_changed', from: 'build', to: 'refine' }],
    });
    expect((await sessionStore.get(session.id))?.phase).toBe('refine');

    // Manifest remains intact and authoritative throughout — never reset by any transition.
    const finalManifest = await manifestStore.getLatest(session.id);
    expect(finalManifest?.data).toMatchObject({ productName: 'Habit Tracker' });
  });
});
