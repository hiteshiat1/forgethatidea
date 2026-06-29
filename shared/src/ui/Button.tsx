import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--forge-space-2)',
  fontFamily: 'var(--forge-font-sans)',
  fontWeight: 600,
  lineHeight: 1,
  border: '1px solid transparent',
  borderRadius: 'var(--forge-radius-md)',
  cursor: 'pointer',
  transition: 'filter 120ms ease, background 120ms ease, border-color 120ms ease',
  whiteSpace: 'nowrap',
};

const sizes: Record<ButtonSize, CSSProperties> = {
  sm: { fontSize: 'var(--forge-font-size-sm, 0.875rem)', padding: '6px 12px' },
  md: { fontSize: '1rem', padding: '10px 16px' },
};

const variants: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--forge-gradient-signal)',
    color: 'var(--forge-ink-900)',
  },
  secondary: {
    background: 'var(--forge-ink-600)',
    color: 'var(--forge-slate-100)',
    borderColor: 'var(--forge-ink-500)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--forge-slate-200)',
  },
};

/**
 * Forge primary action primitive (Epic 0.12). Token-driven so the visual system
 * stays consistent across the shell and generated cards.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', style, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      style={{
        ...base,
        ...sizes[size],
        ...variants[variant],
        ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : null),
        ...style,
      }}
      {...rest}
    />
  );
});
