import { describe, expect, it } from 'vitest';
import { ARCHETYPES, chooseArchetype } from './archetype-catalog.js';
import type { BuildManifest } from '@forge/shared';

function manifest(overrides: Partial<BuildManifest> = {}): BuildManifest {
  return {
    schemaVersion: 1,
    productName: 'Test Product',
    icp: 'Someone',
    entities: [{ name: 'Thing', fields: [{ name: 'name', type: 'string' }] }],
    screens: [{ name: 'List', purpose: 'see things' }],
    roles: ['user'],
    keyActions: ['create thing'],
    branding: { accentColor: '#2E7D32', tone: 'calm' },
    references: { researchCardIds: [] },
    ...overrides,
  };
}

describe('ARCHETYPES catalog (#62)', () => {
  it('defines exactly 5 archetypes', () => {
    expect(Object.keys(ARCHETYPES)).toHaveLength(5);
  });

  it('defines the 5 archetypes the #27 spike validated', () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual([
      'booking-scheduler',
      'content-feed',
      'crud-tracker',
      'dashboard',
      'marketplace-listing',
    ]);
  });

  it('every archetype declares supported entity/screen/role ranges and an out-of-scope note', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      expect(archetype.minEntities).toBeGreaterThanOrEqual(1);
      expect(archetype.maxEntities).toBeGreaterThanOrEqual(archetype.minEntities);
      expect(archetype.minScreens).toBeGreaterThanOrEqual(1);
      expect(archetype.supportsMultipleRoles).toEqual(expect.any(Boolean));
      expect(archetype.outOfScope.length).toBeGreaterThan(0);
      expect(archetype.description.length).toBeGreaterThan(0);
    }
  });
});

describe('chooseArchetype (#62)', () => {
  it('maps a single-entity, single-role manifest to crud-tracker', () => {
    const result = chooseArchetype(manifest());
    expect(result.archetype).toBe('crud-tracker');
  });

  it('maps a two-role manifest with an "Offer"/"Listing"-shaped entity to marketplace-listing', () => {
    const result = chooseArchetype(
      manifest({
        roles: ['buyer', 'seller'],
        entities: [
          { name: 'Listing', fields: [{ name: 'price', type: 'number' }] },
          { name: 'Offer', fields: [{ name: 'amount', type: 'number' }] },
        ],
      }),
    );
    expect(result.archetype).toBe('marketplace-listing');
  });

  it('maps a manifest with a date-bearing entity and scheduling language to booking-scheduler', () => {
    const result = chooseArchetype(
      manifest({
        entities: [
          {
            name: 'Appointment',
            fields: [{ name: 'startTime', type: 'date' }],
          },
        ],
        keyActions: ['book an appointment', 'cancel booking'],
      }),
    );
    expect(result.archetype).toBe('booking-scheduler');
  });

  it('maps a many-entity, single-role manifest with multiple list screens to content-feed', () => {
    const result = chooseArchetype(
      manifest({
        entities: [{ name: 'Post', fields: [{ name: 'body', type: 'string' }] }],
        screens: [
          { name: 'Feed', purpose: 'browse recent posts' },
          { name: 'Post detail', purpose: 'read one post and its comments' },
        ],
        keyActions: ['create post', 'comment on post', 'like post'],
      }),
    );
    expect(result.archetype).toBe('content-feed');
  });

  it('maps a manifest with many small metric-shaped entities to dashboard', () => {
    const result = chooseArchetype(
      manifest({
        entities: [
          { name: 'Metric', fields: [{ name: 'value', type: 'number' }] },
          { name: 'Report', fields: [{ name: 'generatedAt', type: 'date' }] },
        ],
        screens: [{ name: 'Overview', purpose: 'see key metrics at a glance' }],
        keyActions: ['view metrics', 'export report'],
      }),
    );
    expect(result.archetype).toBe('dashboard');
  });

  it('always returns a best-fit choice — never fails to choose one of the 5 archetypes', () => {
    const result = chooseArchetype(manifest({ productName: 'Something Unusual' }));
    expect(Object.keys(ARCHETYPES)).toContain(result.archetype);
  });

  it('includes a human-readable reason for the choice', () => {
    const result = chooseArchetype(manifest());
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
