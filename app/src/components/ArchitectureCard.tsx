import { type ArchitectureCardContent } from '../api.js';
import { CanvasCard, type CardStatus } from './CanvasPane.js';
import { Button } from '@forge/shared/ui';
import '../styles/architecture-card.css';

export interface ArchitectureCardProps {
  status: CardStatus;
  content: ArchitectureCardContent;
  index?: number;
  onLock: () => void;
  locking?: boolean;
}

/**
 * Architecture card (Epic 3.2): a plain-language "boxes and arrows" view —
 * each component as a labeled box, each connection as a labeled arrow line
 * beneath — deliberately a simple list-based layout rather than a full
 * diagramming library, since the content itself is already guaranteed
 * jargon-free (render-architecture-tool.ts) and the goal is legibility for
 * a non-technical founder, not visual precision.
 */
export function ArchitectureCard({
  status,
  content,
  index,
  onLock,
  locking = false,
}: ArchitectureCardProps) {
  const locked = status === 'locked' || status === 'live';

  return (
    <CanvasCard title="Architecture" index={index} status={status} accent="signal">
      <p className="architecture-card__summary">{content.summary}</p>

      <div className="architecture-card__boxes">
        {content.components.map((component) => (
          <div key={component.name} className="architecture-card__box">
            <span className="architecture-card__box-name">{component.name}</span>
            <span className="architecture-card__box-description">{component.description}</span>
          </div>
        ))}
      </div>

      {content.connections.length > 0 && (
        <ul className="architecture-card__connections">
          {content.connections.map((connection) => (
            <li key={`${connection.from}->${connection.to}-${connection.label}`}>
              <strong>{connection.from}</strong> → <strong>{connection.to}</strong>:{' '}
              {connection.label}
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <Button variant="primary" size="sm" onClick={onLock} disabled={locking}>
          {locking ? 'Locking…' : 'Looks good, lock it in'}
        </Button>
      )}
    </CanvasCard>
  );
}
