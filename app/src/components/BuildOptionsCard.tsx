import { useState } from 'react';
import { type BuildOptionsCardContent } from '../api.js';
import { CanvasCard, type CardStatus } from './CanvasPane.js';
import '../styles/build-options-card.css';

export interface BuildOptionsCardProps {
  status: CardStatus;
  content: BuildOptionsCardContent;
  index?: number;
  /** Fired with the 0-based index the user clicked. No-op while status is 'locked'. */
  onSelect: (index: number) => void;
  selecting?: boolean;
}

/**
 * Build-options comparison card (Epic 3.1): shows the 3 directions the
 * agent proposed side-by-side, letting the user click one to lock it in
 * directly (mirrors asking the agent to do the same thing in chat — both
 * paths call the same select_build_option logic server-side). Once locked,
 * options render read-only with the chosen one highlighted.
 */
export function BuildOptionsCard({
  status,
  content,
  index,
  onSelect,
  selecting = false,
}: BuildOptionsCardProps) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const locked = status === 'locked' || status === 'live';

  function handleClick(optionIndex: number) {
    if (locked || selecting) return;
    setPendingIndex(optionIndex);
    onSelect(optionIndex);
  }

  return (
    <CanvasCard title="Build options" index={index} status={status} accent="planning">
      <div className="build-options-card__grid">
        {content.options.map((option, i) => {
          const isSelected = content.selectedIndex === i;
          return (
            <button
              key={option.name}
              type="button"
              className={`build-options-card__option${isSelected ? ' build-options-card__option--selected' : ''}`}
              onClick={() => handleClick(i)}
              disabled={locked || selecting}
              aria-pressed={isSelected}
            >
              <span className="build-options-card__option-name">{option.name}</span>
              <span className="build-options-card__option-summary">{option.summary}</span>
              {isSelected && <span className="build-options-card__option-badge">Selected</span>}
              {selecting && pendingIndex === i && !isSelected && (
                <span className="build-options-card__option-badge">Selecting…</span>
              )}
            </button>
          );
        })}
      </div>
    </CanvasCard>
  );
}
