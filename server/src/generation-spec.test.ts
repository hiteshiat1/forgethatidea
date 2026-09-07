import { describe, expect, it } from 'vitest';
import { compileGenerationSpec, isCompileSpecFailure } from './generation-spec.js';
import { ARCHETYPES } from './archetype-catalog.js';
import type { Archetype, BuildManifest } from '@forge/shared';

function manifest(overrides: Partial<BuildManifest> = {}): BuildManifest {
  return {
    schemaVersion: 1,
    productName: 'HabitLoop',
    icp: 'people building daily habits',
    entities: [
      {
        name: 'Habit',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'streak', type: 'number' },
        ],
      },
    ],
    screens: [{ name: 'Habit list', purpose: 'see all habits' }],
    roles: ['user'],
    keyActions: ['create habit', 'log completion'],
    branding: { accentColor: '#2E7D32', tone: 'encouraging' },
    references: { researchCardIds: [] },
    ...overrides,
  };
}

describe('compileGenerationSpec (#64)', () => {
  it('rejects an incomplete manifest before compiling', () => {
    const result = compileGenerationSpec({ productName: '' } as unknown as BuildManifest);
    expect(isCompileSpecFailure(result)).toBe(true);
    if (isCompileSpecFailure(result)) {
      expect(result.error).toBe('incomplete_manifest');
    }
  });

  it('compiles a complete manifest into a spec with archetype, entities, screens, branding', () => {
    const result = compileGenerationSpec(manifest());
    expect(isCompileSpecFailure(result)).toBe(false);
    if (!isCompileSpecFailure(result)) {
      expect(result.spec.archetype).toBe('crud-tracker');
      expect(result.spec.productName).toBe('HabitLoop');
      expect(result.spec.entities).toEqual([
        {
          name: 'Habit',
          fields: [
            { name: 'title', type: 'string' },
            { name: 'streak', type: 'number' },
          ],
        },
      ]);
      expect(result.spec.screens).toEqual([{ name: 'Habit list', purpose: 'see all habits' }]);
      expect(result.spec.branding).toEqual({ accentColor: '#2E7D32', tone: 'encouraging' });
    }
  });

  it('uses the manifest-recorded archetype when present, without re-deriving it', () => {
    const result = compileGenerationSpec(manifest({ archetype: 'dashboard' }));
    expect(isCompileSpecFailure(result)).toBe(false);
    if (!isCompileSpecFailure(result)) {
      expect(result.spec.archetype).toBe('dashboard');
    }
  });

  it('is a pure function: the same manifest compiles to a deep-equal spec every time', () => {
    const m = manifest();
    const first = compileGenerationSpec(m);
    const second = compileGenerationSpec(m);
    expect(first).toEqual(second);
  });

  it('never includes references (research/cost/marketing card pointers) in the spec — out of scope for generation', () => {
    const result = compileGenerationSpec(
      manifest({ references: { researchCardIds: ['r1'], costCardId: 'c1' } }),
    );
    if (!isCompileSpecFailure(result)) {
      expect(result.spec).not.toHaveProperty('references');
    }
  });

  it('bounds spec size: truncates an excessive number of entities/screens rather than growing unbounded', () => {
    const manyEntities = Array.from({ length: 50 }, (_, i) => ({
      name: `Entity${i}`,
      fields: [{ name: 'value', type: 'string' as const }],
    }));
    const result = compileGenerationSpec(manifest({ entities: manyEntities }));
    if (!isCompileSpecFailure(result)) {
      expect(result.spec.entities.length).toBeLessThan(50);
    }
  });

  for (const archetype of Object.keys(ARCHETYPES) as Archetype[]) {
    it(`compiles successfully for the ${archetype} archetype`, () => {
      const result = compileGenerationSpec(manifest({ archetype }));
      expect(isCompileSpecFailure(result)).toBe(false);
      if (!isCompileSpecFailure(result)) {
        expect(result.spec.archetype).toBe(archetype);
      }
    });
  }
});
