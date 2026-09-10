import { describe, it, expect, vi } from 'vitest';
import { createBuildOrchestrator, isBuildFailure } from './build-orchestrator.js';
import { createInMemorySessionStore } from './session-store.js';
import { createInMemoryManifestStore } from './manifest-store.js';
import { createInMemoryArtifactStore } from './artifact-store.js';
import { createCostGuard, createInMemoryCostGuardStore } from './cost-guard.js';
import type { StreamMessageRequest } from './anthropic-client.js';
import type { BuildManifest } from '@forge/shared';

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const VALID_CODE = 'export default function App() { return null; }';

function manifest(): BuildManifest {
  return {
    schemaVersion: 1,
    productName: 'HabitLoop',
    icp: 'people building daily habits',
    entities: [{ name: 'Habit', fields: [{ name: 'title', type: 'string' }] }],
    screens: [{ name: 'Habit list', purpose: 'see all habits' }],
    roles: ['user'],
    keyActions: ['create habit'],
    branding: { accentColor: '#2E7D32', tone: 'encouraging' },
    references: { researchCardIds: [] },
    archetype: 'crud-tracker',
  };
}

function clientReturning(code: string) {
  return {
    streamMessage: vi.fn(async (_req: unknown, handlers: { onText?: (t: string) => void }) => {
      handlers.onText?.(code);
      return {
        inputTokens: 100,
        outputTokens: 200,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: code }],
      };
    }),
  };
}

/** Returns `screeningText` for the safety-screening call (spotted by asking for JSON), and `code` for every other call. */
function clientWithScreening(screeningText: string, code: string) {
  return {
    streamMessage: vi.fn(async (req: StreamMessageRequest) => {
      const isScreeningCall = req.messages.some(
        (m) => typeof m.content === 'string' && m.content.includes('Screen for'),
      );
      const text = isScreeningCall ? screeningText : code;
      return {
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text }],
      };
    }),
  };
}

async function buildDeps(
  anthropicClient: ReturnType<typeof clientReturning> | ReturnType<typeof clientWithScreening>,
) {
  const sessionStore = createInMemorySessionStore();
  const manifestStore = createInMemoryManifestStore();
  const artifactStore = createInMemoryArtifactStore();
  const costGuardStore = createInMemoryCostGuardStore();
  const costGuard = createCostGuard({
    store: costGuardStore,
    sessionCapCents: 100_000,
    userDailyCapCents: 100_000,
    warnRatio: 0.8,
    logger: silentLogger(),
  });
  return { sessionStore, manifestStore, artifactStore, costGuard, anthropicClient };
}

describe('createBuildOrchestrator (#75)', () => {
  it('rejects when the session does not exist', async () => {
    const deps = await buildDeps(clientReturning(VALID_CODE));
    const orchestrator = createBuildOrchestrator(deps);

    const result = await orchestrator.handleBuild('missing', 'user-1');

    expect(isBuildFailure(result)).toBe(true);
    if (isBuildFailure(result)) {
      expect(result.error).toBe('session_not_found');
    }
  });

  it('rejects when the session has not been frozen (not yet in/through the build phase)', async () => {
    const deps = await buildDeps(clientReturning(VALID_CODE));
    const session = await deps.sessionStore.create('user-1');
    await deps.manifestStore.save(session.id, manifest());
    const orchestrator = createBuildOrchestrator(deps);

    const result = await orchestrator.handleBuild(session.id, 'user-1');

    expect(isBuildFailure(result)).toBe(true);
    if (isBuildFailure(result)) {
      expect(result.error).toBe('manifest_not_frozen');
    }
  });

  it('builds successfully from a frozen manifest, saving a versioned artifact and setting it active', async () => {
    const deps = await buildDeps(clientReturning(VALID_CODE));
    const session = await deps.sessionStore.create('user-1');
    await deps.manifestStore.save(session.id, manifest());
    await deps.sessionStore.update(session.id, { frozenManifestVersion: 1, phase: 'build' });
    const orchestrator = createBuildOrchestrator(deps);

    const result = await orchestrator.handleBuild(session.id, 'user-1');

    expect(isBuildFailure(result)).toBe(false);
    if (!isBuildFailure(result)) {
      expect(result.code).toBe(VALID_CODE);
      expect(result.version).toBe(1);
    }
    const updatedSession = await deps.sessionStore.get(session.id);
    expect(updatedSession?.activeAppVersion).toBe(1);
    const artifact = await deps.artifactStore.getVersion(session.id, 'app', 1);
    expect(artifact?.content).toMatchObject({ code: VALID_CODE });
  });

  it('links the saved artifact to the frozen manifest version', async () => {
    const deps = await buildDeps(clientReturning(VALID_CODE));
    const session = await deps.sessionStore.create('user-1');
    await deps.manifestStore.save(session.id, manifest());
    await deps.manifestStore.save(session.id, { ...manifest(), productName: 'v2' });
    await deps.sessionStore.update(session.id, { frozenManifestVersion: 1, phase: 'build' });
    const orchestrator = createBuildOrchestrator(deps);

    const result = await orchestrator.handleBuild(session.id, 'user-1');

    expect(isBuildFailure(result)).toBe(false);
    const artifact = await deps.artifactStore.getVersion(session.id, 'app', 1);
    const manifestVersion = await deps.manifestStore.getLatest(session.id);
    // frozen version 1, not the later unfrozen v2 edit
    expect(artifact?.manifestId).not.toBe(manifestVersion?.id);
  });

  it('propagates a generation/validation failure as a typed build_failed result', async () => {
    const deps = await buildDeps(
      clientReturning('localStorage.setItem("x","1"); function App(){}'),
    );
    const session = await deps.sessionStore.create('user-1');
    await deps.manifestStore.save(session.id, manifest());
    await deps.sessionStore.update(session.id, { frozenManifestVersion: 1, phase: 'build' });
    const orchestrator = createBuildOrchestrator({ ...deps, maxRepairRounds: 0 });

    const result = await orchestrator.handleBuild(session.id, 'user-1');

    expect(isBuildFailure(result)).toBe(true);
    if (isBuildFailure(result)) {
      expect(result.error).toBe('build_failed');
    }
  });

  it('rejects when the session cost cap is already reached', async () => {
    const deps = await buildDeps(clientReturning(VALID_CODE));
    const session = await deps.sessionStore.create('user-1');
    await deps.manifestStore.save(session.id, manifest());
    await deps.sessionStore.update(session.id, { frozenManifestVersion: 1, phase: 'build' });
    const cappedCostGuardStore = createInMemoryCostGuardStore();
    await cappedCostGuardStore.recordSpend(session.id, 'user-1', 1000);
    const cappedCostGuard = createCostGuard({
      store: cappedCostGuardStore,
      sessionCapCents: 1000,
      userDailyCapCents: 100_000,
      warnRatio: 0.8,
      logger: silentLogger(),
    });
    const orchestrator = createBuildOrchestrator({ ...deps, costGuard: cappedCostGuard });

    const result = await orchestrator.handleBuild(session.id, 'user-1');

    expect(isBuildFailure(result)).toBe(true);
    if (isBuildFailure(result)) {
      expect(result.error).toBe('cost_cap_exceeded');
    }
  });

  it('blocks the build when content safety screening returns a not-allowed decision (#78)', async () => {
    const client = clientWithScreening(
      JSON.stringify({ allowed: false, reason: 'Requests a scam-facilitation tool.' }),
      VALID_CODE,
    );
    const deps = await buildDeps(client);
    const session = await deps.sessionStore.create('user-1');
    await deps.manifestStore.save(session.id, manifest());
    await deps.sessionStore.update(session.id, { frozenManifestVersion: 1, phase: 'build' });
    const orchestrator = createBuildOrchestrator(deps);

    const result = await orchestrator.handleBuild(session.id, 'user-1');

    expect(isBuildFailure(result)).toBe(true);
    if (isBuildFailure(result)) {
      expect(result.error).toBe('content_blocked');
      expect(result.reason).toContain('scam');
    }
  });

  it('logs the screening decision via analyticsLogger (#78)', async () => {
    const client = clientWithScreening(JSON.stringify({ allowed: true }), VALID_CODE);
    const deps = await buildDeps(client);
    const session = await deps.sessionStore.create('user-1');
    await deps.manifestStore.save(session.id, manifest());
    await deps.sessionStore.update(session.id, { frozenManifestVersion: 1, phase: 'build' });
    const analyticsLogger = { info: vi.fn() };
    const orchestrator = createBuildOrchestrator({ ...deps, analyticsLogger });

    await orchestrator.handleBuild(session.id, 'user-1');

    expect(analyticsLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        analytics_event: true,
        type: 'content_screened',
        sessionId: session.id,
        allowed: true,
      }),
      'analytics.content_screened',
    );
  });

  it('proceeds with the build when screening is allowed', async () => {
    const client = clientWithScreening(JSON.stringify({ allowed: true }), VALID_CODE);
    const deps = await buildDeps(client);
    const session = await deps.sessionStore.create('user-1');
    await deps.manifestStore.save(session.id, manifest());
    await deps.sessionStore.update(session.id, { frozenManifestVersion: 1, phase: 'build' });
    const orchestrator = createBuildOrchestrator(deps);

    const result = await orchestrator.handleBuild(session.id, 'user-1');

    expect(isBuildFailure(result)).toBe(false);
    if (!isBuildFailure(result)) {
      expect(result.code).toBe(VALID_CODE);
    }
  });
});
