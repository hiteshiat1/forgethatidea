import { type CSSProperties, type HTMLAttributes } from 'react';

export type PillTone = 'neutral' | 'signal' | 'success' | 'warning' | 'danger';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
}

const tones: Record<PillTone, CSSProperties> = {
  neutral: { background: 'var(--forge-ink-600)', color: 'var(--forge-slate-200)' },
  signal: { background: 'rgba(255, 179, 56, 0.15)', color: 'var(--forge-signal-amber)' },
  success: { background: 'rgba(62, 207, 142, 0.15)', color: 'var(--forge-success)' },
  warning: { background: 'rgba(255, 179, 56, 0.15)', color: 'var(--forge-warning)' },
  danger: { background: 'rgba(255, 90, 95, 0.15)', color: 'var(--forge-danger)' },
};

/**
 * Compact status/label primitive (Epic 0.12) — used for phase tags, manifest
 * fields, and live-state badges.
 */
export function Pill({ tone = 'neutral', style, ...rest }: PillProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--forge-space-1)',
        fontFamily: 'var(--forge-font-mono)',
        fontSize: '0.75rem',
        fontWeight: 500,
        letterSpacing: '0.01em',
        padding: '3px 10px',
        borderRadius: 'var(--forge-radius-pill)',
        ...tones[tone],
        ...style,
      }}
      {...rest}
    />
  );
}
