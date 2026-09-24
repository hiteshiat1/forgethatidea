import { describe, it, expect } from 'vitest';
import { SPINE_MODULES } from './spine-modules.js';
import { assembleActiveModules } from './module-registry.js';
import type { SessionRecord } from '../session-store.js';
import type { AgentModule } from './module-types.js';

function fakeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1',
    userId: 'u1',
    phase: 'planning',
    chat: [],
    cards: [],
    brainstormFindings: {},
    sourcesIntake: { sources: [], declined: false },
    appRefinementRounds: 0,
    marketingRefinementRounds: 0,
    frozenManifestVersion: null,
    activeAppVersion: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SessionRecord;
}

describe('assembleActiveModules (module-registry refactor)', () => {
  it('includes exactly the spine module matching the session phase, from the real SPINE_MODULES list', () => {
    const session = fakeSession({ phase: 'planning' });
    const active = assembleActiveModules(SPINE_MODULES, session);

    expect(active.map((m) => m.id)).toEqual(['planning']);
  });

  it('includes every module whose isActive returns true, spine or otherwise', () => {
    const alwaysOn: AgentModule = {
      id: 'always-on-test-module',
      buildPrompt: () => 'extra guidance',
      getTools: () => ({ extra_tool: async () => ({ ok: true }) }),
      isActive: () => true,
    };
    const session = fakeSession({ phase: 'build' });
    const active = assembleActiveModules([...SPINE_MODULES, alwaysOn], session);

    expect(active.map((m) => m.id).sort()).toEqual(['always-on-test-module', 'build'].sort());
  });

  it('excludes modules whose isActive returns false', () => {
    const neverOn: AgentModule = {
      id: 'never-on-test-module',
      buildPrompt: () => '',
      getTools: () => ({}),
      isActive: () => false,
    };
    const session = fakeSession({ phase: 'refine' });
    const active = assembleActiveModules([...SPINE_MODULES, neverOn], session);

    expect(active.map((m) => m.id)).not.toContain('never-on-test-module');
  });
});
