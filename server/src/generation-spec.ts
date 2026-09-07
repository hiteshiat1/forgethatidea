import type {
  Archetype,
  BuildManifest,
  ManifestBranding,
  ManifestEntity,
  ManifestScreen,
} from '@forge/shared';
import { chooseArchetype } from './archetype-catalog.js';

/** Hard caps keeping the compiled spec — and therefore the generation prompt token budget — bounded. */
const MAX_ENTITIES = 6;
const MAX_FIELDS_PER_ENTITY = 8;
const MAX_SCREENS = 6;

export interface GenerationSpec {
  archetype: Archetype;
  productName: string;
  icp: string;
  entities: ManifestEntity[];
  screens: ManifestScreen[];
  roles: string[];
  keyActions: string[];
  branding: ManifestBranding;
}

export interface CompileSpecSuccess {
  ok: true;
  spec: GenerationSpec;
}

export interface CompileSpecFailure {
  ok: false;
  error: 'incomplete_manifest';
  details: string[];
}

export type CompileSpecResult = CompileSpecSuccess | CompileSpecFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isCompileSpecFailure(result: CompileSpecResult): result is CompileSpecFailure {
  return result.ok === false;
}

function isCompleteManifest(manifest: BuildManifest): string[] {
  const problems: string[] = [];
  if (!manifest.productName?.trim()) problems.push('productName is required');
  if (!manifest.icp?.trim()) problems.push('icp is required');
  if (!manifest.entities?.length) problems.push('at least one entity is required');
  if (!manifest.screens?.length) problems.push('at least one screen is required');
  if (!manifest.roles?.length) problems.push('at least one role is required');
  if (!manifest.keyActions?.length) problems.push('at least one key action is required');
  if (!manifest.branding) problems.push('branding is required');
  return problems;
}

/**
 * Manifest -> generation-spec compiler (Epic 4.3): the deterministic step
 * between a frozen manifest (#61) and the generation pipeline (#65) — a pure
 * function, same manifest always compiles to the same (deep-equal) spec, so
 * a re-build from the same frozen snapshot is reproducible.
 *
 * Deliberately narrower than `BuildManifest`: drops `references` (research/
 * cost/marketing card pointers — irrelevant to generation) and `schemaVersion`
 * (a manifest-store concern, not a generation concern), and hard-caps
 * entity/field/screen counts so an unusually large manifest can never blow
 * the generation prompt's token budget — "spec size bounded" per the issue.
 */
export function compileGenerationSpec(manifest: BuildManifest): CompileSpecResult {
  const problems = isCompleteManifest(manifest);
  if (problems.length > 0) {
    return { ok: false, error: 'incomplete_manifest', details: problems };
  }

  const archetype = manifest.archetype ?? chooseArchetype(manifest).archetype;

  const entities = manifest.entities.slice(0, MAX_ENTITIES).map((entity) => ({
    name: entity.name,
    fields: entity.fields.slice(0, MAX_FIELDS_PER_ENTITY),
  }));
  const screens = manifest.screens.slice(0, MAX_SCREENS);

  return {
    ok: true,
    spec: {
      archetype,
      productName: manifest.productName,
      icp: manifest.icp,
      entities,
      screens,
      roles: [...manifest.roles],
      keyActions: [...manifest.keyActions],
      branding: { ...manifest.branding },
    },
  };
}
