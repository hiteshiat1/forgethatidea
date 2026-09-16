import { Button } from '@forge/shared/ui';
import { CanvasCard } from './CanvasPane.js';
import '../styles/confirm-build-gate.css';

const REQUIRED_CARD_LABELS: Record<string, string> = {
  options: 'Build options',
  architecture: 'Architecture',
  cost: 'Cost estimate',
  marketing: 'Marketing plan',
};

export interface ConfirmBuildGateProps {
  /** Card types still missing/not-yet-locked, from GET /api/sessions/:id/gate. Empty means the gate has passed. */
  missing: string[];
  onConfirm: () => void;
  confirming?: boolean;
  error?: string | null;
}

/**
 * Confirm-build gate (Epic 3.7): the single checkpoint between planning and
 * build — shows per-card lock status for all four required cards
 * (options/architecture/cost/marketing) and only enables "Confirm build"
 * once every one of them is locked. Reads its `missing` list from the same
 * checkGate (phase-gates.ts) the server enforces on the actual PATCH, so
 * the button's enabled state can never drift from what the server will
 * actually accept — this is a UI convenience, not a second source of truth.
 */
export function ConfirmBuildGate({
  missing,
  onConfirm,
  confirming = false,
  error = null,
}: ConfirmBuildGateProps) {
  const allLocked = missing.length === 0;

  return (
    <CanvasCard title="Ready to build?" status={allLocked ? 'locked' : 'draft'} accent="success">
      <ul className="confirm-build-gate__checklist">
        {Object.entries(REQUIRED_CARD_LABELS).map(([type, label]) => {
          const isLocked = !missing.includes(type);
          return (
            <li key={type} className="confirm-build-gate__item">
              <span
                className={`confirm-build-gate__icon${isLocked ? ' confirm-build-gate__icon--done' : ''}`}
                aria-hidden="true"
              >
                {isLocked ? '✓' : '○'}
              </span>
              {label}
            </li>
          );
        })}
      </ul>
      {error && <p className="confirm-build-gate__error">{error}</p>}
      <Button variant="primary" size="sm" onClick={onConfirm} disabled={!allLocked || confirming}>
        {confirming ? 'Confirming…' : 'Confirm build'}
      </Button>
    </CanvasCard>
  );
}
