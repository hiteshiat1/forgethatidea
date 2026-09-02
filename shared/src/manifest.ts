import { z } from 'zod';

/**
 * Build manifest schema (Epic 2.5) — the single source of truth for what the
 * agent has decided to build: entities, screens, roles, key actions, and
 * branding, plus references back to the research/cost/marketing that
 * justified them. Read/written by the manifest tools (Epic 2.6, #33) and
 * consumed by the build pipeline (Epic 4) to generate the mocked app.
 *
 * Shape is informed by the #27 spike's `SpikeManifest` (5 hand-written
 * fixtures covering CRUD tracker, marketplace, booking, content feed, and
 * dashboard archetypes) — entities/fields/screens/roles/keyActions/branding
 * carry over close to as-is, since the spike already proved that shape
 * produces well-formed generation prompts. This schema adds: strict Zod
 * validation, the research/cost/marketing reference block the spike didn't
 * need, and versioning for migration.
 */

export const MANIFEST_SCHEMA_VERSION = 1;

export const fieldTypeEnum = z.enum(['string', 'number', 'boolean', 'date', 'enum']);
export type FieldType = z.infer<typeof fieldTypeEnum>;

export const manifestFieldSchema = z
  .object({
    name: z.string().trim().min(1),
    type: fieldTypeEnum,
    enumValues: z.array(z.string()).optional(),
  })
  .refine((field) => field.type !== 'enum' || (field.enumValues?.length ?? 0) > 0, {
    message: 'enumValues is required and non-empty when type is "enum"',
    path: ['enumValues'],
  });
export type ManifestField = z.infer<typeof manifestFieldSchema>;

export const manifestEntitySchema = z.object({
  name: z.string().trim().min(1),
  fields: z.array(manifestFieldSchema).min(1, 'an entity needs at least one field'),
});
export type ManifestEntity = z.infer<typeof manifestEntitySchema>;

export const manifestScreenSchema = z.object({
  name: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
});
export type ManifestScreen = z.infer<typeof manifestScreenSchema>;

export const manifestBrandingSchema = z.object({
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'accentColor must be a 6-digit hex color, e.g. "#2E7D32"'),
  tone: z.string().trim().min(1),
});
export type ManifestBranding = z.infer<typeof manifestBrandingSchema>;

/**
 * Pointers back to the research/cost/marketing findings that justified this
 * manifest's decisions — not the content itself (that lives on canvas cards,
 * #21/#22), just enough to trace a manifest field back to its source. All
 * optional: early in planning a manifest may exist before every reference
 * does.
 */
export const manifestReferencesSchema = z.object({
  researchCardIds: z.array(z.string()).default([]),
  costCardId: z.string().optional(),
  marketingCardId: z.string().optional(),
});
export type ManifestReferences = z.infer<typeof manifestReferencesSchema>;

export const buildManifestSchema = z.object({
  /** Bumped whenever the shape changes in a way older data can't satisfy without migration. */
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  productName: z.string().trim().min(1),
  /** Ideal customer profile — who this is for, in a sentence. */
  icp: z.string().trim().min(1),
  entities: z.array(manifestEntitySchema).min(1, 'a manifest needs at least one entity'),
  screens: z.array(manifestScreenSchema).min(1, 'a manifest needs at least one screen'),
  roles: z.array(z.string().trim().min(1)).min(1, 'a manifest needs at least one role'),
  keyActions: z.array(z.string().trim().min(1)).min(1, 'a manifest needs at least one key action'),
  branding: manifestBrandingSchema,
  references: manifestReferencesSchema.default({ researchCardIds: [] }),
});
export type BuildManifest = z.infer<typeof buildManifestSchema>;

export interface ManifestValidationResult {
  ok: boolean;
  data: BuildManifest | null;
  errors: string[] | null;
}

/**
 * Validates an unknown payload against {@link buildManifestSchema}. Returns
 * flattened, human-readable error strings (path: message) rather than raw
 * Zod issues, so callers (the manifest tools, #33) can surface them directly
 * to the agent or the user without reshaping them.
 */
export function validateManifest(input: unknown): ManifestValidationResult {
  const result = buildManifestSchema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data, errors: null };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  return { ok: false, data: null, errors };
}

/**
 * Migrates a manifest payload of an older `schemaVersion` to the current
 * shape. No prior versions exist yet (this is v1), so this is currently a
 * pass-through for v1 and a hard rejection for anything else — the seam
 * future migrations plug into without changing call sites.
 */
export function migrateManifest(input: unknown): ManifestValidationResult {
  const schemaVersion = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    return {
      ok: false,
      data: null,
      errors: [
        `schemaVersion: unsupported manifest schema version ${JSON.stringify(schemaVersion)}`,
      ],
    };
  }
  return validateManifest(input);
}
