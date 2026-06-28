import { type CSSProperties } from 'react';
import { color, gradient } from '@forge/shared';

export type BrandVariant = 'topbar' | 'hero';

export interface BrandLockupProps {
  /** `topbar` is the compact inline lockup; `hero` is the large onboarding mark. */
  variant?: BrandVariant;
}

const config: Record<BrandVariant, { fontSize: number; gap: number; stack: boolean }> = {
  topbar: { fontSize: 18, gap: 6, stack: false },
  hero: { fontSize: 56, gap: 4, stack: true },
};

/**
 * The "Forge / that idea" lockup (Epic 1.2). The "Forge" wordmark carries the
 * amber→coral signal gradient (the forge's heat); the "that idea" kicker uses
 * the signal amber. Two sizes: compact for the top bar, hero for onboarding.
 */
export function BrandLockup({ variant = 'topbar' }: BrandLockupProps) {
  const { fontSize, gap, stack } = config[variant];

  const root: CSSProperties = {
    fontFamily: 'var(--forge-font-sans)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.05,
    userSelect: 'none',
    display: stack ? 'flex' : 'inline-flex',
    flexDirection: stack ? 'column' : 'row',
    alignItems: stack ? 'flex-start' : 'baseline',
    gap,
    whiteSpace: stack ? 'normal' : 'nowrap',
  };

  return (
    <span style={root} aria-label="Forge that idea">
      <span
        aria-hidden
        style={{
          fontSize,
          background: gradient.signal,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Forge
      </span>
      <span
        aria-hidden
        style={{
          fontSize: stack ? fontSize * 0.42 : fontSize,
          fontWeight: stack ? 500 : 400,
          color: color.signal.amber,
          letterSpacing: stack ? '0.04em' : '-0.01em',
          textTransform: stack ? 'lowercase' : 'none',
        }}
      >
        that idea
      </span>
    </span>
  );
}
