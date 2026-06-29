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

export function nextPhase(current: Phase): Phase | null {
  const i = PHASES.indexOf(current);
  return i >= 0 && i < PHASES.length - 1 ? PHASES[i + 1]! : null;
}
