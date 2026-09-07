import type { ManifestBranding } from '@forge/shared';

export interface BrandPalette {
  base: string;
  light: string;
  dark: string;
  subtle: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b]
    .map((n) => clamp(n).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** Mixes a color toward white (`amount` in [0,1]) — used for light/subtle shades. */
function mixWithWhite(rgb: [number, number, number], amount: number): [number, number, number] {
  return rgb.map((c) => c + (255 - c) * amount) as [number, number, number];
}

/** Mixes a color toward black (`amount` in [0,1]) — used for the dark/pressed shade. */
function mixWithBlack(rgb: [number, number, number], amount: number): [number, number, number] {
  return rgb.map((c) => c * (1 - amount)) as [number, number, number];
}

/**
 * Derives a small, coherent palette from the manifest's single accent-color
 * hint (Epic 4.11) — a base, a lighter hover/highlight shade, a darker
 * active/pressed shade, and a subtle near-white tint for backgrounds.
 * Deliberately simple linear RGB mixing rather than a full color space
 * conversion (HSL/LAB): good enough for a generated prototype's UI, and
 * dependency-free. Always clamps to a valid 6-digit hex so an edge-case
 * accent (near-white, near-black) never derives an out-of-range value.
 */
export function derivePalette(accentColor: string): BrandPalette {
  const rgb = hexToRgb(accentColor);
  return {
    base: accentColor.toUpperCase(),
    light: rgbToHex(mixWithWhite(rgb, 0.35)),
    dark: rgbToHex(mixWithBlack(rgb, 0.25)),
    subtle: rgbToHex(mixWithWhite(rgb, 0.85)),
  };
}

/**
 * Composes the branding-injection instruction (Epic 4.11) embedded into the
 * codegen prompt (#63) alongside the mock auth/CRUD patterns (#70/#71) — the
 * product name and derived palette so the generated app feels like the
 * user's own product, with the Forge design tokens named explicitly as the
 * tasteful fallback for anything the accent palette doesn't cover (body
 * text color, spacing, typography, etc.).
 */
export function buildBrandingInjectionPattern(
  productName: string,
  branding: ManifestBranding,
): string {
  const palette = derivePalette(branding.accentColor);

  return `
Branding (make this feel like "${productName}"'s own product, not a generic template):
- Use "${productName}" as the product name/logo text wherever the app would show its own name (header, title, etc.).
- Use this derived accent palette for primary actions, active states, and highlights:
  - base: ${palette.base} (primary buttons, active nav, key highlights)
  - light: ${palette.light} (hover states)
  - dark: ${palette.dark} (pressed/active states)
  - subtle: ${palette.subtle} (selected-row or highlighted-section backgrounds)
- Overall tone: "${branding.tone}" — let this guide copy voice and visual density, not just color.
- For everything the accent palette doesn't cover (body text, borders, base backgrounds, spacing, typography), use the Forge design tokens (--forge-* CSS custom properties) as a tasteful fallback.
`.trim();
}
