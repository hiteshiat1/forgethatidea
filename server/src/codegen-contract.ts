import type { BuildManifest } from '@forge/shared';
import type { ArchetypeDefinition } from './archetype-catalog.js';
import { buildMockAuthPattern } from './mock-auth-pattern.js';
import { buildMockCrudStorePattern } from './mock-crud-store-pattern.js';

/**
 * Generator prompt & output contract (Epic 4.2). Two halves of the same
 * agreement: `buildCodegenPrompt` tells the model what it must produce,
 * `checkContractViolations` verifies programmatically that it did — the
 * static validation gate (#66) runs the latter against every candidate
 * artifact before it's ever shown to a user.
 *
 * Versioned so prompt/contract changes are traceable in logs — bump this
 * whenever either half changes in a way that could affect generated output,
 * matching the SYSTEM_PROMPT_VERSION convention in system-prompt.ts.
 */
export const CODEGEN_CONTRACT_VERSION = '2026-09-07.3';

export interface CodegenPromptInput {
  manifest: BuildManifest;
  archetype: ArchetypeDefinition;
}

/**
 * Composes the generation prompt for one archetype + manifest pair. Kept as
 * plain, explicit prose rather than a templating DSL — the constraints below
 * are exactly what `checkContractViolations` checks for, so keep the two in
 * sync when either changes.
 */
export function buildCodegenPrompt(input: CodegenPromptInput): string {
  const { manifest, archetype } = input;

  const entitiesBlock = manifest.entities
    .map(
      (e) =>
        `- ${e.name}: ${e.fields.map((f) => `${f.name} (${f.type}${f.enumValues ? `: ${f.enumValues.join('|')}` : ''})`).join(', ')}`,
    )
    .join('\n');
  const screensBlock = manifest.screens.map((s) => `- ${s.name}: ${s.purpose}`).join('\n');

  return `
Generate a single-file React application for "${manifest.productName}", built for: ${manifest.icp}.

Archetype: ${archetype.id} — ${archetype.description}

Entities:
${entitiesBlock}

Screens:
${screensBlock}

Roles: ${manifest.roles.join(', ')}
Key actions: ${manifest.keyActions.join(', ')}
Branding: accent color ${manifest.branding.accentColor}, tone "${manifest.branding.tone}"

Output contract (non-negotiable — violations are checked programmatically and route to auto-repair):
- A single self-contained React file. One default export, one top-level component. No other files, no imports beyond React itself and the design tokens.
- All application state lives in-memory (useState/useReducer) for the lifetime of the page load. Never persist to localStorage, sessionStorage, IndexedDB, or cookies.
- Never call fetch, XMLHttpRequest, or any other network API. Auth, database, and CRUD operations are all mocked entirely in-memory — no real backend exists.
- Never render a real HTML <form> tag (no native form submission semantics). Build inputs as plain controlled elements (input/button/onClick) instead.
- Seed data must be realistic and relevant to the ICP ("${manifest.icp}") — not generic placeholder text like "Item 1", "Item 2".
- Style using the Forge design tokens (--forge-* CSS custom properties) rather than inventing colors, spacing, or fonts from scratch.

${buildMockAuthPattern(manifest.roles)}

${buildMockCrudStorePattern(manifest.entities)}

Out of scope for this archetype in v1 — do not attempt:
${archetype.outOfScope.map((item) => `- ${item}`).join('\n')}

[codegen contract version: ${CODEGEN_CONTRACT_VERSION}]
`.trim();
}

export type ContractViolation =
  | 'forbidden_localStorage'
  | 'forbidden_sessionStorage'
  | 'forbidden_fetch'
  | 'forbidden_form_tag'
  | 'missing_default_export';

interface ViolationRule {
  code: ContractViolation;
  test: (code: string) => boolean;
}

const RULES: ViolationRule[] = [
  { code: 'forbidden_localStorage', test: (code) => /\blocalStorage\b/.test(code) },
  { code: 'forbidden_sessionStorage', test: (code) => /\bsessionStorage\b/.test(code) },
  { code: 'forbidden_fetch', test: (code) => /\bfetch\s*\(/.test(code) },
  { code: 'forbidden_form_tag', test: (code) => /<form[\s>]/i.test(code) },
  { code: 'missing_default_export', test: (code) => !/export\s+default\b/.test(code) },
];

/**
 * Programmatic scan for output-contract violations (Epic 4.2/4.5) — a fast,
 * deterministic pre-check the static validation gate (#66) runs before the
 * heavier compile check, so obviously-forbidden patterns fail fast with a
 * specific, actionable code rather than a generic compile error.
 */
export function checkContractViolations(code: string): ContractViolation[] {
  return RULES.filter((rule) => rule.test(code)).map((rule) => rule.code);
}
