import { type CSSProperties, type ReactNode } from 'react';
import { color } from '@forge/shared';
import { Card, Pill, type PillTone } from '@forge/shared/ui';
import '../styles/canvas-pane.css';

export type CardStatus = 'draft' | 'refined' | 'locked' | 'live';

const STATUS_LABEL: Record<CardStatus, string> = {
  draft: 'Draft',
  refined: 'Refined',
  locked: 'Locked',
  live: 'Live',
};

const STATUS_TONE: Record<CardStatus, PillTone> = {
  draft: 'neutral',
  refined: 'signal',
  locked: 'warning',
  live: 'success',
};

/**
 * Fixed accent palette deliverable cards pick from (Epic 1.9) — e.g. build
 * options in amber, cost/planning cards in slate, etc. Kept as a small fixed
 * set (rather than free-form color) so the canvas stays visually coherent as
 * new card types are added by later epics.
 */
export type CardAccent = 'signal' | 'success' | 'neutral';

const ACCENT_COLOR: Record<CardAccent, string> = {
  signal: color.signal.amber,
  success: color.success,
  neutral: color.slate[400],
};

export interface CanvasCardProps {
  /** Card title, rendered as the card's heading (h3) for accessible structure. */
  title: ReactNode;
  /** 1-based position in the canvas stack, shown before the title. */
  index?: number;
  status: CardStatus;
  accent?: CardAccent;
  children: ReactNode;
}

/**
 * Reusable card shell (Epic 1.9) that all deliverable cards extend: numbered
 * index, title (as an accessible heading), status badge, and a per-card-type
 * accent stripe. Wraps the shared `Card` primitive (Epic 0.12/1.8) — card
 * *content* (build options, cost tables, etc.) is filled in by later epics.
 */
export function CanvasCard({
  title,
  index,
  status,
  accent = 'neutral',
  children,
}: CanvasCardProps) {
  const accentStyle: CSSProperties = { borderLeft: `3px solid ${ACCENT_COLOR[accent]}` };

  return (
    <Card
      className="canvas-card"
      style={accentStyle}
      glow={status === 'live'}
      header={
        <>
          <h3 className="canvas-card__title">
            {index != null && <span className="canvas-card__index">{index}</span>}
            {title}
          </h3>
          <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
        </>
      }
    >
      {children}
    </Card>
  );
}

export interface CanvasPaneProps {
  /** Deliverable cards to stack, oldest/first at the top. */
  children?: ReactNode;
}

/**
 * The right-pane card host (Epic 1.8). Stacks deliverable cards and scrolls
 * independently of the chat pane (scrolling itself lives in the parent
 * `.shell-pane--canvas`, which is already `overflow: auto`); shows an empty
 * state before the first card exists.
 */
export function CanvasPane({ children }: CanvasPaneProps) {
  const hasCards = Array.isArray(children) ? children.some(Boolean) : Boolean(children);

  if (!hasCards) {
    return (
      <div className="canvas-pane canvas-pane--empty" aria-live="polite">
        <p className="canvas-pane__empty-title">No deliverables yet</p>
        <p className="canvas-pane__empty-hint">
          Cards will appear here as the conversation produces build options, plans, and other
          artifacts.
        </p>
      </div>
    );
  }

  return <div className="canvas-pane">{children}</div>;
}
