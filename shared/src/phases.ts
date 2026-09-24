/**
 * The Forge session phases, in order. The agent advances through these gates
 * (Epic 2). Both the phase rail UI (Epic 1) and the server state machine read
 * from this single ordered list.
 */
export const PHASES = [
  'onboarding',
  'sources',
  'brainstorm',
  'planning',
  'build',
  'refine',
] as const;

export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  onboarding: 'Onboarding',
  sources: 'Sources',
  brainstorm: 'Brainstorm',
  planning: 'Planning',
  build: 'Build',
  refine: 'Refine',
};

/**
 * One fixed accent per phase (docs/landing-page-and-ui.md: "the flow of
 * each section should be visible to the user with color coding") — the
 * phase rail and any canvas content tied to a specific phase (e.g.
 * planning's cards) read from this single map so they never drift apart.
 * Deep blue -> yellow -> orange -> red-orange continues the landing page's
 * section-progression palette
 * (coolors.co/palette/0d3b66-faf0ca-f4d35e-ee964b-f95738); the last two
 * phases (build, refine) use the app's existing signal-amber and success
 * tokens rather than inventing further new hex values, since "you're
 * building" and "you've arrived" already have an established color in the
 * design system.
 */
export const PHASE_COLORS: Record<Phase, string> = {
  onboarding: '#0d3b66',
  sources: '#f4d35e',
  brainstorm: '#ee964b',
  planning: '#f95738',
  build: '#ffb338',
  refine: '#3ecf8e',
};

export function nextPhase(current: Phase): Phase | null {
  const i = PHASES.indexOf(current);
  return i >= 0 && i < PHASES.length - 1 ? PHASES[i + 1]! : null;
}
