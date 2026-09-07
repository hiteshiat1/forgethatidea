import { describe, expect, it } from 'vitest';
import { buildMockAuthPattern } from './mock-auth-pattern.js';

describe('buildMockAuthPattern (#70)', () => {
  it('includes a mocked, clearly-labeled sign-in/sign-out flow for a single role', () => {
    const pattern = buildMockAuthPattern(['user']);
    expect(pattern.toLowerCase()).toContain('sign in');
    expect(pattern.toLowerCase()).toContain('sign out');
    expect(pattern.toLowerCase()).toContain('mock');
  });

  it('does not include a role switcher for a single-role manifest', () => {
    const pattern = buildMockAuthPattern(['user']);
    expect(pattern.toLowerCase()).not.toContain('switch role');
  });

  it('includes a role switcher when the manifest defines multiple roles', () => {
    const pattern = buildMockAuthPattern(['buyer', 'seller']);
    expect(pattern.toLowerCase()).toContain('switch role');
    expect(pattern).toContain('buyer');
    expect(pattern).toContain('seller');
  });

  it('never instructs use of a real auth provider, and explicitly forbids persisting the session', () => {
    const pattern = buildMockAuthPattern(['user']);
    expect(pattern.toLowerCase()).not.toContain('oauth');
    expect(pattern.toLowerCase()).not.toContain('jwt');
    expect(pattern.toLowerCase()).toContain('no cookies');
  });

  it('always uses in-memory state, matching the codegen contract (#63)', () => {
    const pattern = buildMockAuthPattern(['user']);
    expect(pattern.toLowerCase()).toContain('usestate');
  });
});
