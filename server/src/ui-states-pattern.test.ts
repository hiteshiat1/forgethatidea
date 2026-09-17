import { describe, expect, it } from 'vitest';
import { buildUiStatesPattern } from './ui-states-pattern.js';

describe('buildUiStatesPattern (#80)', () => {
  it('requires empty states with a friendly call-to-action, not a blank screen', () => {
    const pattern = buildUiStatesPattern();
    expect(pattern.toLowerCase()).toContain('empty state');
    expect(pattern.toLowerCase()).toMatch(/call-to-action|cta/);
  });

  it('requires a real React error boundary, not just a try/catch', () => {
    const pattern = buildUiStatesPattern();
    expect(pattern.toLowerCase()).toContain('error boundary');
    expect(pattern.toLowerCase()).toMatch(/componentdidcatch|getderivedstatefromerror/);
  });

  it('addresses loading states for any simulated async work', () => {
    const pattern = buildUiStatesPattern();
    expect(pattern.toLowerCase()).toContain('loading');
  });

  it('never instructs a real network call for these states, matching the codegen contract', () => {
    const pattern = buildUiStatesPattern();
    expect(pattern.toLowerCase()).not.toMatch(/\bfetch\(|axios/);
  });
});
