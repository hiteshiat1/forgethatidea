import { Pill, type PillTone } from '@forge/shared/ui';
import '../styles/status-indicators.css';

export interface RefinementStatus {
  rounds: number;
  limit: number;
}

export interface StatusIndicatorsProps {
  app: RefinementStatus;
  marketing: RefinementStatus;
  /**
   * "unlimited" once a real entitlement/billing system (Epic 9/11, not yet
   * built) exists to grant it — every session is "free" until then. Kept as
   * a simple union rather than a richer tier enum for exactly that reason:
   * there is nothing else to represent yet.
   */
  entitlement: 'free' | 'unlimited';
}

function meterTone(status: RefinementStatus): PillTone {
  if (status.rounds >= status.limit) return 'danger';
  if (status.rounds >= status.limit - 1) return 'warning';
  return 'neutral';
}

function RefinementMeter({ label, status }: { label: string; status: RefinementStatus }) {
  return (
    <Pill tone={meterTone(status)} title={`${label} refinements used`}>
      {label} {status.rounds}/{status.limit}
    </Pill>
  );
}

/**
 * Top bar status indicators (Epic 1.11): refinement round counters for app
 * and marketing (tracked independently server-side, #38) plus an
 * entitlement pill. "Update live as rounds are used" is satisfied by this
 * being a plain render of props — the caller re-renders it with fresh
 * session data after each refinement call; this component holds no state
 * of its own.
 */
export function StatusIndicators({ app, marketing, entitlement }: StatusIndicatorsProps) {
  return (
    <div className="status-indicators">
      <RefinementMeter label="App" status={app} />
      <RefinementMeter label="Marketing" status={marketing} />
      <Pill tone={entitlement === 'unlimited' ? 'success' : 'neutral'}>
        {entitlement === 'unlimited' ? 'Unlimited' : 'Free'}
      </Pill>
    </div>
  );
}
