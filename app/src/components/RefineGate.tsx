import { Button } from '@forge/shared/ui';
import '../styles/refine-gate.css';

export interface RefineGateProps {
  sessionId: string;
  rounds: number;
  limit: number;
}

/**
 * Soft gate (Epic 5.3): shown once a stream's free refinement rounds are
 * used up. "No dead ends" — the free export path sits right alongside the
 * upgrade option, never a hard stop. There's no real billing/upgrade
 * destination yet (Epic 9/11, not built, #92 deferred), so "Upgrade" is a
 * visible, honest placeholder rather than a link to nowhere; the impression
 * itself is what the server already tracks (gate_shown, #87) since there's
 * no real conversion event to pair it with yet.
 */
export function RefineGate({ sessionId, rounds, limit }: RefineGateProps) {
  return (
    <div className="refine-gate" role="status">
      <p className="refine-gate__headline">
        You've used all {limit} free refinements for this app ({rounds}/{limit}).
      </p>
      <p className="refine-gate__body">
        Your prototype is still yours — export it any time. Unlimited refinements are coming soon
        for upgraded plans.
      </p>
      <div className="refine-gate__actions">
        <a className="refine-gate__export" href={`/api/sessions/${sessionId}/export`} download>
          Download as .jsx
        </a>
        <Button variant="secondary" size="sm" disabled title="Upgrades are coming soon">
          Upgrade (coming soon)
        </Button>
      </div>
    </div>
  );
}
