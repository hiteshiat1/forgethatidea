import { describe, it, expect } from 'vitest';
import {
  buildManifestSchema,
  validateManifest,
  migrateManifest,
  MANIFEST_SCHEMA_VERSION,
  type BuildManifest,
} from '@forge/shared';

/**
 * Exercises the manifest schema (#32) against a real-shaped payload derived
 * from the #27 spike's `HabitLoop` fixture (crud-tracker archetype), plus
 * the validation/migration edge cases. Lives server-side since `@forge/shared`
 * has no test tooling of its own (same convention as onboarding.ts) — this
 * is genuine usage of the schema, not a stand-in for dedicated shared tests.
 */
const validManifest: BuildManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  productName: 'HabitLoop',
  icp: 'people building daily habits',
  entities: [
    {
      name: 'Habit',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'frequency', type: 'enum', enumValues: ['daily', 'weekly'] },
        { name: 'streak', type: 'number' },
        { name: 'active', type: 'boolean' },
      ],
    },
  ],
  screens: [
    { name: 'Habit list', purpose: 'see all habits and current streaks' },
    { name: 'Habit detail', purpose: 'edit a habit and log completion' },
  ],
  roles: ['user'],
  keyActions: ['create habit', 'log completion', 'edit habit', 'delete habit'],
  branding: { accentColor: '#2E7D32', tone: 'encouraging, minimal' },
  references: { researchCardIds: [], costCardId: undefined, marketingCardId: undefined },
};

describe('buildManifestSchema', () => {
  it('accepts a real-shaped manifest (crud-tracker archetype)', () => {
    expect(buildManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it('rejects an enum field with no enumValues', () => {
    const bad = {
      ...validManifest,
      entities: [{ name: 'Habit', fields: [{ name: 'frequency', type: 'enum' }] }],
    };
    expect(buildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an entity with no fields', () => {
    const bad = { ...validManifest, entities: [{ name: 'Habit', fields: [] }] };
    expect(buildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a manifest with no screens', () => {
    const bad = { ...validManifest, screens: [] };
    expect(buildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an invalid accent color', () => {
    const bad = { ...validManifest, branding: { accentColor: 'green', tone: 'warm' } };
    expect(buildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a mismatched schemaVersion', () => {
    const bad = { ...validManifest, schemaVersion: 999 };
    expect(buildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('defaults references when omitted', () => {
    const { references: _references, ...withoutReferences } = validManifest;
    const result = buildManifestSchema.safeParse(withoutReferences);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.references).toEqual({ researchCardIds: [] });
    }
  });
});

describe('validateManifest', () => {
  it('returns ok:true and parsed data for a valid manifest', () => {
    const result = validateManifest(validManifest);
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ productName: 'HabitLoop' });
    expect(result.errors).toBeNull();
  });

  it('returns readable path:message error strings for an invalid manifest', () => {
    const result = validateManifest({ ...validManifest, roles: [] });
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('roles')]));
  });
});

describe('migrateManifest', () => {
  it('passes through a current-version manifest unchanged', () => {
    const result = migrateManifest(validManifest);
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ schemaVersion: MANIFEST_SCHEMA_VERSION });
  });

  it('rejects an unsupported schema version with a clear error', () => {
    const result = migrateManifest({ ...validManifest, schemaVersion: 2 });
    expect(result.ok).toBe(false);
    expect(result.errors![0]).toMatch(/unsupported manifest schema version/);
  });

  it('rejects a payload with no schemaVersion at all', () => {
    const { schemaVersion: _schemaVersion, ...withoutVersion } = validManifest;
    const result = migrateManifest(withoutVersion);
    expect(result.ok).toBe(false);
  });
});
