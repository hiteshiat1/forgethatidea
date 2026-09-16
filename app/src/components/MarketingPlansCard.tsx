import { useState } from 'react';
import { type MarketingPlansCardContent } from '../api.js';
import { CanvasCard, type CardStatus } from './CanvasPane.js';
import '../styles/marketing-plans-card.css';

export interface MarketingPlansCardProps {
  status: CardStatus;
  content: MarketingPlansCardContent;
  index?: number;
  onSelect: (index: number) => void;
  selecting?: boolean;
}

/**
 * Marketing plans comparison card (Epic 3.5): mirrors BuildOptionsCard's
 * click-to-select pattern — 3 plans side-by-side, each covering
 * ICP/GTM/SEO/ads plus the real competitors it positions against, clicking
 * one locks it in directly (same effect as asking the agent in chat).
 */
export function MarketingPlansCard({
  status,
  content,
  index,
  onSelect,
  selecting = false,
}: MarketingPlansCardProps) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const locked = status === 'locked' || status === 'live';

  function handleClick(planIndex: number) {
    if (locked || selecting) return;
    setPendingIndex(planIndex);
    onSelect(planIndex);
  }

  return (
    <CanvasCard title="Marketing plans" index={index} status={status} accent="signal">
      <div className="marketing-plans-card__grid">
        {content.plans.map((plan, i) => {
          const isSelected = content.selectedIndex === i;
          return (
            <button
              key={plan.name}
              type="button"
              className={`marketing-plans-card__plan${isSelected ? ' marketing-plans-card__plan--selected' : ''}`}
              onClick={() => handleClick(i)}
              disabled={locked || selecting}
              aria-pressed={isSelected}
            >
              <span className="marketing-plans-card__plan-name">{plan.name}</span>
              <dl className="marketing-plans-card__plan-details">
                <dt>ICP</dt>
                <dd>{plan.icp}</dd>
                <dt>Go-to-market</dt>
                <dd>{plan.gtm}</dd>
                <dt>SEO</dt>
                <dd>{plan.seo}</dd>
                <dt>Ads</dt>
                <dd>{plan.ads}</dd>
              </dl>
              <span className="marketing-plans-card__competitors">
                vs {plan.competitors.join(', ')}
              </span>
              {isSelected && <span className="marketing-plans-card__badge">Selected</span>}
              {selecting && pendingIndex === i && !isSelected && (
                <span className="marketing-plans-card__badge">Selecting…</span>
              )}
            </button>
          );
        })}
      </div>
    </CanvasCard>
  );
}
