import { PHASES, PHASE_LABELS, type Phase } from '@forge/shared';
import '../styles/phase-rail.css';

export interface PhaseRailProps {
  /** The phase the session is currently in. Drives done/active/upcoming states. */
  current: Phase;
}

type StepState = 'done' | 'active' | 'upcoming';

/**
 * Horizontal phase progression indicator (Epic 1.3). Renders every phase from
 * the shared ordered list, marking those before `current` as done, `current`
 * as active, and the rest as upcoming. Scrolls horizontally when the rail is
 * wider than the top bar (narrow screens); the active step is scrolled into
 * view so it stays visible.
 */
export function PhaseRail({ current }: PhaseRailProps) {
  const currentIndex = PHASES.indexOf(current);

  return (
    <ol className="phase-rail" aria-label="Session phases">
      {PHASES.map((phase, i) => {
        const state: StepState =
          i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'upcoming';
        return (
          <li
            key={phase}
            className={`phase-rail__step phase-rail__step--${state}`}
            aria-current={state === 'active' ? 'step' : undefined}
            ref={
              state === 'active'
                ? (el) => el?.scrollIntoView({ inline: 'center', block: 'nearest' })
                : undefined
            }
          >
            <span className="phase-rail__marker" aria-hidden="true">
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className="phase-rail__label">{PHASE_LABELS[phase]}</span>
          </li>
        );
      })}
    </ol>
  );
}
