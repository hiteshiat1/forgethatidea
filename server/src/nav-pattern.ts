import type { ManifestScreen } from '@forge/shared';

/**
 * Navigation pattern library (Epic 4.18): a standardized prompt block for
 * moving between a manifest's screens, embedded into the generation prompt
 * (codegen-contract.ts) alongside the auth/CRUD-store patterns — same
 * "prompt content, not runtime code" nature as mock-auth-pattern.ts, since
 * the codegen contract forbids any dependency beyond React itself (no
 * routing library, no `next/link`, no real `<a href>` navigation).
 *
 * State-based rather than router-based: one `currentScreen` value in the
 * app root's own state switches which screen renders, matching the
 * single-file/no-navigation-library constraint. A persistent nav bar lists
 * every top-level screen so all of them stay directly reachable; any screen
 * reached by drilling in from another (e.g. a list's row leading to a
 * detail view) must render a "Back" control, so deep screens are always
 * returnable per the issue's acceptance criteria — without that, a screen
 * reachable only via drill-down would have no way back to where it came
 * from once the model treats screens as independent views.
 */
export function buildNavPattern(screens: ManifestScreen[]): string {
  const screenList = screens.map((s) => `- ${s.name}: ${s.purpose}`).join('\n');

  if (screens.length <= 1) {
    return `
Navigation pattern: this app has a single screen (${screens[0]!.name}) — no nav bar and no screen-switching state needed since there is nothing to switch between.
`.trim();
  }

  return `
Navigation pattern (use this consistently — do not add a routing library or real links):
- Track which screen is showing as in-memory state at the app root: const [currentScreen, setCurrentScreen] = useState('${screens[0]!.name}').
- Render the current screen's content based on that state — no react-router, no next/link, no real <a href> navigation between screens.
- Include a persistent nav bar (top or side, pick whichever suits the archetype) listing every top-level screen by name:
${screenList}
Clicking a nav item switches currentScreen to that screen — every screen listed here must stay directly reachable from the nav bar at all times.
- Any screen reached by drilling in from another (e.g. clicking a row in a list screen to open its detail view) is NOT one of the top-level nav bar destinations — track it as its own state value if needed, and always render a clearly-labeled "Back" control on it that returns to the screen it was reached from. Every screen must be reachable and returnable — never a dead end.
`.trim();
}
