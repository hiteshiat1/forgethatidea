import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional header row content (title, actions). */
  header?: ReactNode;
  /** Apply the amber→coral glow to signal a live/active card. */
  glow?: boolean;
}

const surface: CSSProperties = {
  background: 'var(--forge-ink-700)',
  border: '1px solid var(--forge-ink-500)',
  borderRadius: 'var(--forge-radius-lg)',
  boxShadow: 'var(--forge-shadow-card)',
  color: 'var(--forge-slate-100)',
  overflow: 'hidden',
};

/**
 * Surface container primitive (Epic 0.12). Host for the canvas cards rendered by
 * agent tools in later epics (build options, cost table, architecture, etc.).
 */
export function Card({ header, glow = false, style, children, ...rest }: CardProps) {
  return (
    <div
      style={{
        ...surface,
        ...(glow ? { boxShadow: 'var(--forge-shadow-glow)' } : null),
        ...style,
      }}
      {...rest}
    >
      {header != null && (
        <div
          style={{
            padding: 'var(--forge-space-3) var(--forge-space-4)',
            borderBottom: '1px solid var(--forge-ink-500)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {header}
        </div>
      )}
      <div style={{ padding: 'var(--forge-space-4)' }}>{children}</div>
    </div>
  );
}
