import type { BuildManifest } from '@forge/shared';

/**
 * App download/export (Epic 4.14): wraps the generated code in a single
 * downloadable .jsx file with a prepended comment-block README explaining
 * how to run it — no zip/multi-file bundling, since the instructions travel
 * with the file wherever it's copied and no new dependency is needed for a
 * single-file export.
 */
export function buildExportedFile(code: string, productName: string): string {
  const readme = `/*
 * ${productName} — exported from Forge (forgethatidea.com)
 *
 * This is a mocked prototype: a single self-contained React component with
 * seed data and mock auth/CRUD baked in — there is no real backend, and
 * nothing here persists beyond the browser session it runs in.
 *
 * To run it:
 *
 * With Vite:
 *   1. npm create vite@latest my-app -- --template react
 *   2. Replace src/App.jsx with this file's contents.
 *   3. npm install && npm run dev
 *
 * With Next.js:
 *   1. npx create-next-app@latest my-app
 *   2. Save this file as app/page.jsx (App Router) or pages/index.jsx (Pages Router).
 *   3. npm run dev
 */

`;
  return `${readme}${code}`;
}

/**
 * Plan summary export (Epic 5.9): a plain-text companion to the .jsx
 * download — "the free exit always includes app + plan summary" per the
 * issue. A second, separate document rather than folded into the .jsx's own
 * comment header, since it's a different kind of artifact (product plan,
 * not run instructions) and needs to stand alone as something shareable on
 * its own. Kept a plain single text document, not a zip, for the same
 * reason #75 avoided one: the file travels intact wherever it's copied,
 * with no bundling dependency.
 */
export function buildPlanSummary(manifest: BuildManifest): string {
  const entities = manifest.entities
    .map((entity) => `- ${entity.name} (${entity.fields.map((f) => f.name).join(', ')})`)
    .join('\n');
  const screens = manifest.screens
    .map((screen) => `- ${screen.name}: ${screen.purpose}`)
    .join('\n');
  const roles = manifest.roles.map((role) => `- ${role}`).join('\n');
  const keyActions = manifest.keyActions.map((action) => `- ${action}`).join('\n');

  return `${manifest.productName} — Plan Summary
Built with Forge (forgethatidea.com)

Who it's for
${manifest.icp}

Entities
${entities}

Screens
${screens}

Roles
${roles}

Key actions
${keyActions}

Branding
- Accent color: ${manifest.branding.accentColor}
- Tone: ${manifest.branding.tone}
`;
}
