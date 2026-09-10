import { describe, it, expect, vi } from 'vitest';
import { createRefineAppOrchestrator, isRefineAppFailure } from './refine-app-orchestrator.js';
import { createInMemorySessionStore } from './session-store.js';
import { createInMemoryArtifactStore } from './artifact-store.js';

const CURRENT_CODE = 'export default function App() { return null; }';
const EDITED_CODE = 'export default function App() { return <div>Edited</div>; }';

function clientReturning(code: string) {
  return {
    streamMessage: vi.fn(async (_req: unknown, handlers: { onText?: (t: string) => void }) => {
      handlers.onText?.(code);
      return {
        inputTokens: 10,
        outputTokens: 20,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: code }],
      };
    }),
  };
}

/**
 * A single client whose responses depend on call order: the first call
 * (classification) gets `classificationText`, the second (either the
 * diff-edit or the clarification answer) gets `secondText`.
 */
function sequencedClient(classificationText: string, secondText: string) {
  let call = 0;
  return {
    streamMessage: vi.fn(async (_req: unknown, handlers: { onText?: (t: string) => void }) => {
      call += 1;
      const text = call === 1 ? classificationText : secondText;
      handlers.onText?.(text);
      return {
        inputTokens: 10,
        outputTokens: 20,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text }],
      };
    }),
  };
}

async function buildDeps(anthropicClient: ReturnType<typeof clientReturning>) {
  const sessionStore = createInMemorySessionStore();
  const artifactStore = createInMemoryArtifactStore();
  return {
    sessionStore,
    artifactStore,
    anthropicClient,
    refinementLimits: { app: 3, marketing: 3 },
  };
}

describe('createRefineAppOrchestrator (#76)', () => {
  it('rejects when the session does not exist', async () => {
    const deps = await buildDeps(clientReturning(EDITED_CODE));
    const orchestrator = createRefineAppOrchestrator(deps);

    const result = await orchestrator.handleRefine('missing', 'Add a label.');

    expect(isRefineAppFailure(result)).toBe(true);
    if (isRefineAppFailure(result)) {
      expect(result.error).toBe('session_not_found');
    }
  });

  it('rejects when there is no active build to refine yet', async () => {
    const deps = await buildDeps(clientReturning(EDITED_CODE));
    const session = await deps.sessionStore.create('user-1');
    const orchestrator = createRefineAppOrchestrator(deps);

    const result = await orchestrator.handleRefine(session.id, 'Add a label.');

    expect(isRefineAppFailure(result)).toBe(true);
    if (isRefineAppFailure(result)) {
      expect(result.error).toBe('no_build_to_refine');
    }
  });

  it('applies the edit, saves a new artifact version, and updates the active version', async () => {
    const deps = await buildDeps(
      sequencedClient(JSON.stringify({ kind: 'change_request' }), EDITED_CODE),
    );
    const session = await deps.sessionStore.create('user-1');
    await deps.artifactStore.save(session.id, 'app', {
      manifestId: 'm1',
      content: { code: CURRENT_CODE },
    });
    await deps.sessionStore.update(session.id, { activeAppVersion: 1 });
    const orchestrator = createRefineAppOrchestrator(deps);

    const result = await orchestrator.handleRefine(session.id, 'Add a label.');

    expect(isRefineAppFailure(result)).toBe(false);
    if (!isRefineAppFailure(result) && result.kind === 'change_request') {
      expect(result.code).toBe(EDITED_CODE);
      expect(result.version).toBe(2);
    }
    const updatedSession = await deps.sessionStore.get(session.id);
    expect(updatedSession?.activeAppVersion).toBe(2);
    expect(updatedSession?.appRefinementRounds).toBe(1);
  });

  it('rejects once the refinement round limit is reached', async () => {
    const deps = await buildDeps(
      sequencedClient(JSON.stringify({ kind: 'change_request' }), EDITED_CODE),
    );
    const session = await deps.sessionStore.create('user-1');
    await deps.artifactStore.save(session.id, 'app', {
      manifestId: 'm1',
      content: { code: CURRENT_CODE },
    });
    await deps.sessionStore.update(session.id, { activeAppVersion: 1, appRefinementRounds: 3 });
    const orchestrator = createRefineAppOrchestrator(deps);

    const result = await orchestrator.handleRefine(session.id, 'Add a label.');

    expect(isRefineAppFailure(result)).toBe(true);
    if (isRefineAppFailure(result)) {
      expect(result.error).toBe('refinement_limit_reached');
    }
  });

  it('answers a clarifying question for free — no round consumed, no new artifact version (#85)', async () => {
    const deps = await buildDeps(
      sequencedClient(JSON.stringify({ kind: 'clarification' }), 'The label shows the item name.'),
    );
    const session = await deps.sessionStore.create('user-1');
    await deps.artifactStore.save(session.id, 'app', {
      manifestId: 'm1',
      content: { code: CURRENT_CODE },
    });
    await deps.sessionStore.update(session.id, { activeAppVersion: 1 });
    const orchestrator = createRefineAppOrchestrator(deps);

    const result = await orchestrator.handleRefine(session.id, 'What does the label show?');

    expect(isRefineAppFailure(result)).toBe(false);
    if (!isRefineAppFailure(result)) {
      expect(result.kind).toBe('clarification');
      if (result.kind === 'clarification') {
        expect(result.answer).toBe('The label shows the item name.');
      }
    }
    const updatedSession = await deps.sessionStore.get(session.id);
    expect(updatedSession?.activeAppVersion).toBe(1);
    expect(updatedSession?.appRefinementRounds).toBe(0);
  });

  it('still enforces the round limit for change requests even after a free clarification', async () => {
    const deps = await buildDeps(
      sequencedClient(JSON.stringify({ kind: 'clarification' }), 'Because of the sort order.'),
    );
    const session = await deps.sessionStore.create('user-1');
    await deps.artifactStore.save(session.id, 'app', {
      manifestId: 'm1',
      content: { code: CURRENT_CODE },
    });
    await deps.sessionStore.update(session.id, { activeAppVersion: 1, appRefinementRounds: 3 });
    const orchestrator = createRefineAppOrchestrator(deps);

    const result = await orchestrator.handleRefine(session.id, 'Why is it sorted this way?');

    expect(isRefineAppFailure(result)).toBe(false);
    if (!isRefineAppFailure(result)) {
      expect(result.kind).toBe('clarification');
    }
  });
});
