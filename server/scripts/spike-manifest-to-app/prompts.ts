import type { SpikeManifest } from './manifest-fixtures.js';

const FORBIDDEN_APIS_NOTE =
  "Do not use localStorage, sessionStorage, fetch, XMLHttpRequest, or <form> elements (use onClick handlers and controlled inputs instead). This is a fully mocked, in-memory prototype — no network calls, no persistence beyond the component's own state.";

function manifestSummary(manifest: SpikeManifest): string {
  const entities = manifest.entities
    .map(
      (e) =>
        `  - ${e.name}: ${e.fields.map((f) => `${f.name} (${f.type}${f.enumValues ? `: ${f.enumValues.join('|')}` : ''})`).join(', ')}`,
    )
    .join('\n');
  const screens = manifest.screens.map((s) => `  - ${s.name}: ${s.purpose}`).join('\n');

  return `Product: ${manifest.productName}
Target user: ${manifest.icp}
Roles: ${manifest.roles.join(', ')}
Brand: accent color ${manifest.branding.accentColor}, tone: ${manifest.branding.tone}

Entities:
${entities}

Screens:
${screens}

Key actions: ${manifest.keyActions.join(', ')}`;
}

/**
 * Templated strategy: a strict output contract (single file, specific state
 * pattern, forbidden APIs, specific nav shape). The model fills in
 * entity-specific logic within fixed scaffolding — matches Epic 4's intended
 * codegen contract (#63) and mock CRUD store pattern (#70).
 */
export function templatedPrompt(manifest: SpikeManifest): string {
  return `Generate a single self-contained React component that implements the following mocked prototype app.

${manifestSummary(manifest)}

OUTPUT CONTRACT (must follow exactly):
1. A single .tsx file. No other files, no imports beyond 'react'.
2. State management: use React's useReducer hook with one reducer per entity, seeded with 5-8 realistic mock records per entity. Actions: CREATE, UPDATE, DELETE, LIST for each entity.
3. Navigation: a simple tab or sidebar switcher between the screens listed above, driven by useState (no router library).
4. ${FORBIDDEN_APIS_NOTE}
5. Export a single default component named after the product (e.g. \`export default function ${manifest.productName.replace(/\s+/g, '')}App()\`).
6. Inline styles only (no CSS files, no className referencing external stylesheets) — use the brand accent color ${manifest.branding.accentColor} for primary actions/highlights.
7. Every key action listed above must be reachable through the UI.

Output ONLY the code, no explanation before or after.`;
}

/**
 * Open-ended strategy: the manifest plus a light instruction, minimal
 * constraints on structure or state management.
 */
export function openEndedPrompt(manifest: SpikeManifest): string {
  return `Build a working mocked React prototype app for this product idea. It should be a realistic, usable prototype with mock data — not a wireframe.

${manifestSummary(manifest)}

Keep it self-contained (no backend, no real network calls) and make it feel like a real, functioning app a user could click through.

Output ONLY the code, no explanation before or after.`;
}
