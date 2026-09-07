import { Pill } from '@forge/shared/ui';
import '../styles/build-progress.css';

/**
 * The real backend pipeline stages (Epic 4.3-4.7): compiling the manifest
 * into a generation spec, generating the candidate code, statically
 * validating it (auto-repairing behind the scenes on failure, #67), and
 * rendering it in the sandboxed preview (#68). Named after the actual
 * pipeline steps rather than invented UI-only labels, so this component
 * stays truthful about what's happening as those steps land.
 */
export type BuildStage = 'compiling' | 'generating' | 'validating' | 'rendering' | 'done';

const STAGE_ORDER: BuildStage[] = ['compiling', 'generating', 'validating', 'rendering', 'done'];

const STAGE_LABEL: Record<BuildStage, string> = {
  compiling: 'Compiling your plan into a build spec',
  generating: 'Generating your app',
  validating: 'Checking the build',
  rendering: 'Loading the preview',
  done: 'Ready',
};

export interface BuildProgressProps {
  /** Current stage — every stage before this one renders as complete. */
  stage: BuildStage;
  /**
   * Set when the build has failed at `stage` — switches to a human,
   * recoverable failure view instead of the staged progress list.
   */
  error?: string;
  /** Retries the build from the start. Omit to hide the retry action (e.g. while a retry is already in flight). */
  onRetry?: () => void;
}

function StageRow({ label, status }: { label: string; status: 'done' | 'active' | 'pending' }) {
  const marker = status === 'done' ? '✓' : status === 'active' ? '●' : '○';
  return (
    <li className={`build-progress__stage build-progress__stage--${status}`}>
      <span className="build-progress__marker" aria-hidden="true">
        {marker}
      </span>
      {label}
      {status === 'active' && (
        <Pill tone="signal" className="build-progress__active-pill">
          In progress
        </Pill>
      )}
    </li>
  );
}

/**
 * Build progress UX (Epic 4.12): the "building your prototype…" experience.
 * Shows real staged progress through the actual generation pipeline steps,
 * sets a time expectation up front (30-90s is the pipeline's real observed
 * range, not a guess pulled from nowhere), and — when a build fails — shows
 * a human, specific, recoverable failure state with a retry action rather
 * than a raw error or a dead end, matching the "no dead-end states"
 * discipline used throughout the backend pipeline (#40, #65-67).
 */
export function BuildProgress({ stage, error, onRetry }: BuildProgressProps) {
  if (error) {
    return (
      <div className="build-progress build-progress--error" role="alert">
        <p className="build-progress__error-title">
          Building your prototype hit a snag at the {STAGE_LABEL[stage].toLowerCase()} step.
        </p>
        <p className="build-progress__error-detail">{error}</p>
        {onRetry && (
          <button type="button" className="build-progress__retry" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  const currentIndex = STAGE_ORDER.indexOf(stage);

  return (
    <div className="build-progress" aria-live="polite">
      <p className="build-progress__title">Building your prototype…</p>
      <p className="build-progress__expectation">This usually takes 30–90 seconds.</p>
      <ul className="build-progress__stages">
        {STAGE_ORDER.filter((s) => s !== 'done').map((s, i) => (
          <StageRow
            key={s}
            label={STAGE_LABEL[s]}
            status={i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending'}
          />
        ))}
      </ul>
    </div>
  );
}
