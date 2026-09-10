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
    const deps = await buildDeps(clientReturning(EDITED_CODE));
    const session = await deps.sessionStore.create('user-1');
    await deps.artifactStore.save(session.id, 'app', {
      manifestId: 'm1',
      content: { code: CURRENT_CODE },
    });
    await deps.sessionStore.update(session.id, { activeAppVersion: 1 });
    const orchestrator = createRefineAppOrchestrator(deps);

    const result = await orchestrator.handleRefine(session.id, 'Add a label.');

    expect(isRefineAppFailure(result)).toBe(false);
    if (!isRefineAppFailure(result)) {
      expect(result.code).toBe(EDITED_CODE);
      expect(result.version).toBe(2);
    }
    const updatedSession = await deps.sessionStore.get(session.id);
    expect(updatedSession?.activeAppVersion).toBe(2);
    expect(updatedSession?.appRefinementRounds).toBe(1);
  });

  it('rejects once the refinement round limit is reached', async () => {
    const deps = await buildDeps(clientReturning(EDITED_CODE));
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
});
