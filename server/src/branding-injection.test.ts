import { describe, expect, it } from 'vitest';
import { derivePalette, buildBrandingInjectionPattern } from './branding-injection.js';
import type { ManifestBranding } from '@forge/shared';

function branding(overrides: Partial<ManifestBranding> = {}): ManifestBranding {
  return { accentColor: '#2E7D32', tone: 'calm and encouraging', ...overrides };
}

describe('derivePalette (#72)', () => {
  it('returns the accent color unchanged as the base', () => {
    const palette = derivePalette('#2E7D32');
    expect(palette.base).toBe('#2E7D32');
  });

  it('derives a lighter hover/highlight shade', () => {
    const palette = derivePalette('#2E7D32');
    expect(palette.light).not.toBe(palette.base);
    expect(palette.light.toUpperCase()).not.toBe('#2E7D32');
  });

  it('derives a darker active/pressed shade', () => {
    const palette = derivePalette('#2E7D32');
    expect(palette.dark).not.toBe(palette.base);
  });

  it('derives a subtle low-opacity-equivalent background tint', () => {
    const palette = derivePalette('#2E7D32');
    expect(palette.subtle).not.toBe(palette.base);
  });

  it('every derived shade is a valid 6-digit hex color', () => {
    const palette = derivePalette('#2E7D32');
    for (const shade of [palette.base, palette.light, palette.dark, palette.subtle]) {
      expect(shade).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('is deterministic — the same accent always derives the same palette', () => {
    expect(derivePalette('#2E7D32')).toEqual(derivePalette('#2E7D32'));
  });

  it('handles a near-white accent without producing an out-of-range value', () => {
    const palette = derivePalette('#FDFDFD');
    for (const shade of [palette.base, palette.light, palette.dark, palette.subtle]) {
      expect(shade).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('handles a near-black accent without producing an out-of-range value', () => {
    const palette = derivePalette('#020202');
    for (const shade of [palette.base, palette.light, palette.dark, palette.subtle]) {
      expect(shade).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('buildBrandingInjectionPattern (#72)', () => {
  it("includes the product name so it feels like the user's own product", () => {
    const pattern = buildBrandingInjectionPattern('HabitLoop', branding());
    expect(pattern).toContain('HabitLoop');
  });

  it('includes the derived palette shades', () => {
    const pattern = buildBrandingInjectionPattern('HabitLoop', branding());
    const palette = derivePalette('#2E7D32');
    expect(pattern).toContain(palette.base);
    expect(pattern).toContain(palette.light);
    expect(pattern).toContain(palette.dark);
  });

  it('includes the tone', () => {
    const pattern = buildBrandingInjectionPattern('HabitLoop', branding());
    expect(pattern).toContain('calm and encouraging');
  });

  it('instructs falling back to Forge design tokens for anything the palette does not cover', () => {
    const pattern = buildBrandingInjectionPattern('HabitLoop', branding());
    expect(pattern.toLowerCase()).toContain('forge');
    expect(pattern.toLowerCase()).toContain('fallback');
  });
});
