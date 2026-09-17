import { describe, expect, it } from 'vitest';
import { buildTransparencyPanelPattern } from './transparency-panel-pattern.js';

describe('buildTransparencyPanelPattern (#82)', () => {
  it('requires a panel listing what is mocked vs what production would add', () => {
    const pattern = buildTransparencyPanelPattern();
    expect(pattern.toLowerCase()).toMatch(/mocked/);
    expect(pattern.toLowerCase()).toMatch(/production/);
  });

  it('requires the panel to be non-intrusive but discoverable, not open by default', () => {
    const pattern = buildTransparencyPanelPattern();
    expect(pattern.toLowerCase()).toMatch(/discoverable/);
    expect(pattern.toLowerCase()).toMatch(/collapsed|closed|hidden until/);
  });

  it('requires plain-language copy, not technical jargon', () => {
    const pattern = buildTransparencyPanelPattern();
    expect(pattern.toLowerCase()).toMatch(/plain[- ]language/);
  });

  it('names the specific mocked concerns already present in every generated app', () => {
    const pattern = buildTransparencyPanelPattern();
    expect(pattern.toLowerCase()).toContain('auth');
    expect(pattern.toLowerCase()).toContain('storage');
  });
});
