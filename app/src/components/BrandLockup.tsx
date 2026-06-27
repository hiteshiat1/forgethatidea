import { color, gradient } from '@forge/shared';

export interface BrandLockupProps {
  /** Font size of the wordmark. */
  size?: number;
}

/**
 * The "Forge / that idea" wordmark. The amber→coral signal gradient on "Forge"
 * is the heat of the forge. Full brand treatment is refined in Epic 1.2 (#14).
 */
export function BrandLockup({ size = 18 }: BrandLockupProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--forge-font-sans)',
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          background: gradient.signal,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Forge
      </span>{' '}
      <span style={{ color: color.slate[300], fontWeight: 400 }}>that idea</span>
    </span>
  );
}
