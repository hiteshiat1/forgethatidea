import { describe, expect, it } from 'vitest';
import { buildNavPattern } from './nav-pattern.js';
import type { ManifestScreen } from '@forge/shared';

const screens: ManifestScreen[] = [
  { name: 'Habit list', purpose: 'see all habits' },
  { name: 'Habit detail', purpose: 'see one habit and its history' },
  { name: 'Settings', purpose: 'manage account preferences' },
];

describe('buildNavPattern (#79)', () => {
  it('describes a persistent nav bar listing every screen from the manifest', () => {
    const pattern = buildNavPattern(screens);
    expect(pattern).toContain('Habit list');
    expect(pattern).toContain('Habit detail');
    expect(pattern).toContain('Settings');
  });

  it('specifies state-based view switching, explicitly forbidding a routing library', () => {
    const pattern = buildNavPattern(screens);
    expect(pattern.toLowerCase()).toMatch(/usestate/);
    // Forbids react-router/next-link/real <a href> nav — but the pattern
    // itself is allowed to *name* them as what NOT to use.
    expect(pattern.toLowerCase()).toMatch(/no react-router/);
  });

  it('requires a back/return affordance for screens reached by drilling in', () => {
    const pattern = buildNavPattern(screens);
    expect(pattern.toLowerCase()).toContain('back');
    expect(pattern.toLowerCase()).toMatch(/return|reachable/);
  });

  it('does not instruct including a nav bar for a single-screen manifest with nothing to switch between', () => {
    const pattern = buildNavPattern([{ name: 'Dashboard', purpose: 'the only screen' }]);
    expect(pattern.toLowerCase()).not.toMatch(/include a (persistent )?nav bar/);
  });

  it('never instructs installing a routing library, matching the single-file codegen contract', () => {
    const pattern = buildNavPattern(screens);
    expect(pattern.toLowerCase()).not.toMatch(/install|npm|react-router-dom/);
  });
});
