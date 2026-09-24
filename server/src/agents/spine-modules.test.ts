import { describe, it, expect } from 'vitest';
import { SPINE_MODULES } from './spine-modules.js';
import type { SessionRecord } from '../session-store.js';

function fakeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1',
    userId: 'u1',
    phase: 'onboarding',
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

describe('SPINE_MODULES (module-registry refactor)', () => {
  it('has exactly one module per real phase, keyed by phase id', () => {
    const ids = SPINE_MODULES.map((m) => m.id).sort();
    expect(ids).toEqual(
      ['onboarding', 'sources', 'brainstorm', 'planning', 'build', 'refine'].sort(),
    );
  });

  it('each spine module is active only for its own phase', () => {
    for (const module of SPINE_MODULES) {
      const activeSession = fakeSession({ phase: module.id as SessionRecord['phase'] });
      expect(module.isActive(activeSession)).toBe(true);

      for (const other of SPINE_MODULES) {
        if (other.id === module.id) continue;
        const otherSession = fakeSession({ phase: other.id as SessionRecord['phase'] });
        expect(module.isActive(otherSession)).toBe(false);
      }
    }
  });

  it('the brainstorm module alone carries the stopping rule text', () => {
    const brainstorm = SPINE_MODULES.find((m) => m.id === 'brainstorm')!;
    const prompt = brainstorm.buildPrompt(fakeSession({ phase: 'brainstorm' }));
    expect(prompt.toLowerCase()).toMatch(/stop|enough options|three|3-5|converge/);

    for (const module of SPINE_MODULES) {
      if (module.id === 'brainstorm') continue;
      const other = module.buildPrompt(fakeSession({ phase: module.id as SessionRecord['phase'] }));
      expect(other.toLowerCase()).not.toMatch(/brainstorm stopping rule/);
    }
  });

  it('the planning module carries the honesty-critical guidance for architecture/cost/marketing', () => {
    const planning = SPINE_MODULES.find((m) => m.id === 'planning')!;
    const prompt = planning.buildPrompt(fakeSession({ phase: 'planning' }));
    expect(prompt).toMatch(/render_architecture/);
    expect(prompt).toMatch(/render_cost_table/);
    expect(prompt).toMatch(/render_marketing_plans/);
  });
});
