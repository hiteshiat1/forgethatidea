/**
 * Forge design tokens — the single source of truth for the visual system.
 *
 * The dark "ink" base evokes a forge at rest; the amber→coral "signal" gradient
 * is the heat. Mono type is used for system/agent affordances, sans for prose.
 *
 * These values are mirrored in `tokens.css` as CSS custom properties so that
 * both runtime JS and stylesheets read from one place. Keep them in sync.
 */

export const color = {
  // Ink — the dark base scale (background → raised surfaces).
  ink: {
    900: '#0b0c0f',
    800: '#121419',
    700: '#1a1d24',
    600: '#242832',
    500: '#323744',
  },
  // Neutral text/border scale.
  slate: {
    400: '#6b7280',
    300: '#9aa3b2',
    200: '#c7cdd8',
    100: '#e8ebf0',
  },
  // Signal — the amber→coral heat used for primary actions and live state.
  signal: {
    amber: '#ffb338',
    coral: '#ff6b5e',
  },
  // Semantic.
  success: '#3ecf8e',
  warning: '#ffb338',
  danger: '#ff5a5f',
  white: '#ffffff',
} as const;

export const gradient = {
  signal: `linear-gradient(135deg, ${color.signal.amber} 0%, ${color.signal.coral} 100%)`,
} as const;

export const font = {
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
} as const;

export const fontSize = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.5rem',
  '2xl': '2rem',
  '3xl': '3rem',
} as const;

export const radius = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  pill: '999px',
} as const;

export const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
  12: '48px',
} as const;

export const shadow = {
  card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)',
  glow: '0 0 0 1px rgba(255,179,56,0.3), 0 0 24px rgba(255,107,94,0.25)',
} as const;

export const tokens = { color, gradient, font, fontSize, radius, space, shadow } as const;

export type Tokens = typeof tokens;
