import { describe, expect, it } from 'vitest';
import { buildResponsivePattern } from './responsive-pattern.js';

describe('buildResponsivePattern (#81)', () => {
  it('requires the layout to be responsive down to a phone width', () => {
    const pattern = buildResponsivePattern();
    expect(pattern.toLowerCase()).toMatch(/responsive/);
    expect(pattern.toLowerCase()).toMatch(/375\s*px|phone|mobile/);
  });

  it('forbids fixed pixel widths on layout containers, requiring flexible sizing instead', () => {
    const pattern = buildResponsivePattern();
    expect(pattern.toLowerCase()).toMatch(/fixed pixel width/);
    expect(pattern.toLowerCase()).toMatch(/flex-wrap|max-width|minmax|%|1fr/);
  });

  it('requires no horizontal scroll on core screens', () => {
    const pattern = buildResponsivePattern();
    expect(pattern.toLowerCase()).toContain('horizontal scroll');
  });
});
