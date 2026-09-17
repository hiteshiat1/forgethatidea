/**
 * "What's mocked" transparency panel pattern (Epic 4.21): a standardized
 * prompt block mirroring nav-pattern.ts/ui-states-pattern.ts's shape (prompt
 * content embedded into the generation prompt via codegen-contract.ts, not
 * runtime code shipped in Forge).
 *
 * Prompt-only guidance, not a static contract rule — unlike the error
 * boundary requirement in ui-states-pattern.ts, "is this panel discoverable
 * and plain-language" isn't mechanically checkable the way a class method
 * name is, so this stays advisory the same way empty/loading states did.
 */
export function buildTransparencyPanelPattern(): string {
  return `
"What's mocked" transparency panel (honesty by design — required in every generated app):
- Include a small, always-available panel (e.g. a "What's real?" button or icon in a corner) that a user can open to see what's mocked vs. what a production version would add.
- Discoverable but non-intrusive: collapsed/closed by default, never a modal that blocks the app on load — the user opens it when curious, not because it's forced on them.
- List the specific things this prototype fakes, in plain language, no jargon: authentication (e.g. "Sign-in is simulated — no real accounts or passwords"), data storage (e.g. "Your changes are stored in memory only and reset when you reload"), and any other mocked concern specific to this app.
- For each mocked item, name what a real production version would add instead (e.g. "A production version would use real accounts and a real database").
`.trim();
}
