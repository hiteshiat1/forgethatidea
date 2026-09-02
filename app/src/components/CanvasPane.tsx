import { type ReactNode } from 'react';
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

export interface CanvasCardProps {
  title: ReactNode;
  status: CardStatus;
  children: ReactNode;
}

/**
 * A single deliverable card in the canvas (Epic 1.8). Wraps the shared `Card`
 * primitive with a status badge in the header; individual card *content*
 * (build options, cost tables, etc.) is filled in by later epics.
 */
export function CanvasCard({ title, status, children }: CanvasCardProps) {
  return (
    <Card
      className="canvas-card"
      glow={status === 'live'}
      header={
        <>
          <span>{title}</span>
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
