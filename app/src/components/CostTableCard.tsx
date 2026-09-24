import { useState } from 'react';
import { type CostTableCardContent } from '../api.js';
import { CanvasCard, type CardStatus } from './CanvasPane.js';
import { Button } from '@forge/shared/ui';
import '../styles/cost-table-card.css';

export interface CostTableCardProps {
  status: CardStatus;
  content: CostTableCardContent;
  index?: number;
  onLock: () => void;
  locking?: boolean;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Cost table card (Epic 3.4): line-item monthly costs with a toggle between
 * usage scales (e.g. "100 users" vs "1,000 users") — each scale is a
 * complete, independently-sourced set of line items the agent supplied
 * (render-cost-table-tool.ts), not a computed extrapolation, so switching
 * scales is just switching which pre-built set is displayed.
 */
export function CostTableCard({
  status,
  content,
  index,
  onLock,
  locking = false,
}: CostTableCardProps) {
  const [activeScaleIndex, setActiveScaleIndex] = useState(0);
  const locked = status === 'locked' || status === 'live';
  const scale = content.scales[activeScaleIndex] ?? content.scales[0]!;

  return (
    <CanvasCard title="Cost estimate" index={index} status={status} accent="planning">
      {content.scales.length > 1 && (
        <div className="cost-table-card__scale-toggle" role="tablist" aria-label="Usage scale">
          {content.scales.map((s, i) => (
            <button
              key={s.label}
              type="button"
              role="tab"
              aria-selected={i === activeScaleIndex}
              className={`cost-table-card__scale-tab${i === activeScaleIndex ? ' cost-table-card__scale-tab--active' : ''}`}
              onClick={() => setActiveScaleIndex(i)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <table className="cost-table-card__table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Monthly</th>
            <th>Assumption</th>
          </tr>
        </thead>
        <tbody>
          {scale.lineItems.map((item) => (
            <tr key={item.name}>
              <td>{item.name}</td>
              <td>{formatCents(item.monthlyCostCents)}</td>
              <td className="cost-table-card__assumption">
                {item.assumption}{' '}
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  source
                </a>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td colSpan={2}>
              {formatCents(scale.totalMonthlyCostCents)}/mo ·{' '}
              {formatCents(scale.totalYearlyCostCents)}
              /yr
            </td>
          </tr>
        </tfoot>
      </table>

      {!locked && (
        <Button variant="primary" size="sm" onClick={onLock} disabled={locking}>
          {locking ? 'Locking…' : 'Looks good, lock it in'}
        </Button>
      )}
    </CanvasCard>
  );
}
