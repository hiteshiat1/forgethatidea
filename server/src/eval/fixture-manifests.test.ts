import { describe, expect, it } from 'vitest';
import { validateManifest, type Archetype } from '@forge/shared';
import { FIXTURE_MANIFESTS } from './fixture-manifests.js';

describe('FIXTURE_MANIFESTS (#77)', () => {
  it('has at least 10 fixtures', () => {
    expect(FIXTURE_MANIFESTS.length).toBeGreaterThanOrEqual(10);
  });

  it('every fixture is a valid BuildManifest', () => {
    for (const fixture of FIXTURE_MANIFESTS) {
      const result = validateManifest(fixture);
      expect(result.ok, `${fixture.productName}: ${result.errors?.join('; ')}`).toBe(true);
    }
  });

  it('covers all 5 archetypes', () => {
    const archetypes = new Set(FIXTURE_MANIFESTS.map((m) => m.archetype));
    const expected: Archetype[] = [
      'crud-tracker',
      'marketplace-listing',
      'booking-scheduler',
      'content-feed',
      'dashboard',
    ];
    for (const archetype of expected) {
      expect(archetypes.has(archetype)).toBe(true);
    }
  });

  it('every fixture explicitly records its archetype', () => {
    for (const fixture of FIXTURE_MANIFESTS) {
      expect(fixture.archetype).toBeDefined();
    }
  });
});
