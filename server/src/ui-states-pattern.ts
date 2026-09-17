/**
 * Empty/error/loading state pattern library (Epic 4.19): a standardized
 * prompt block for the three "edge path" states every generated app needs
 * so a demo never looks broken — mirrors mock-auth-pattern.ts/
 * nav-pattern.ts's shape (prompt content embedded into the generation
 * prompt via codegen-contract.ts, not runtime code shipped in Forge).
 *
 * All three states are simulated in-memory (no real network call, no
 * setTimeout-as-fake-latency requirement beyond what the model judges
 * useful for the loading state) — consistent with the codegen contract's
 * ban on fetch/localStorage and "no real backend" stance. The error
 * boundary is the one piece with a real, statically-checkable contract:
 * codegen-contract.ts's `missing_error_boundary` rule requires an actual
 * React error boundary class (componentDidCatch/getDerivedStateFromError),
 * not just a try/catch, since only a real boundary can actually stop a
 * render-time crash from blanking the whole demo.
 */
export function buildUiStatesPattern(): string {
  return `
Empty/error/loading states (required — a demo should never look broken):
- Empty state: any list/collection screen that currently has no items must show a friendly empty state (a short message plus a clear call-to-action, e.g. "No habits yet — add your first one") instead of a blank area.
- Loading state: if a screen simulates any async-feeling action (e.g. "saving...", initial data load), briefly show a simple loading indicator (a spinner or "Loading…" text) before revealing the result — never a real network call, just a short simulated delay if you use one at all.
- Error boundary: wrap the app's main content in a real React error boundary — a class component implementing componentDidCatch and getDerivedStateFromError (a try/catch inside an event handler does NOT count, since it can't catch render-time errors). On a caught error, show a plain-language fallback message instead of a blank white screen.
`.trim();
}
