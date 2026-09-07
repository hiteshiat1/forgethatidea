/**
 * Mock auth pattern library (Epic 4.9): a standardized reference JSX
 * snippet for sign-in/out flows, embedded into the generation prompt
 * (#63) so every generated app implements auth the same consistent way
 * rather than each generation reinventing it. Not runtime code shipped in
 * Forge itself — the generated app is a single self-contained file per the
 * codegen contract, so this is prompt content the model is instructed to
 * follow, not an imported module.
 *
 * Always in-memory state (useState, per the codegen contract's ban on
 * localStorage/cookies), always visibly labeled "mock" so a user of the
 * generated app is never deceived into thinking it's real authentication,
 * and includes a role switcher only when the manifest actually defines more
 * than one role — a single-role app has nothing to switch between.
 */
export function buildMockAuthPattern(roles: string[]): string {
  const hasMultipleRoles = roles.length > 1;

  const roleSwitcherSnippet = hasMultipleRoles
    ? `
Since this app has multiple roles (${roles.join(', ')}), also include a role switcher:
- A dropdown or button group labeled "Switch role (mock)" listing: ${roles.join(', ')}.
- Switching role updates the current mock user's role in state and changes what the UI shows/allows accordingly.
`.trim()
    : '';

  return `
Mock authentication pattern (use this consistently — do not invent a different auth flow):
- Represent the signed-in user as in-memory state: const [currentUser, setCurrentUser] = useState(null).
- A "Sign in (mock)" button sets currentUser to a fake user object (name, role) — never a real credential form, never calling any auth provider.
- A "Sign out" button resets currentUser to null.
- Clearly label the flow as mocked in the UI (e.g. a small "Demo account — not real authentication" note) so it's never mistaken for real auth.
- Never persist the session (no localStorage, no cookies) — it resets to signed-out on reload, which is expected for a mocked prototype.
${roleSwitcherSnippet}
`.trim();
}
