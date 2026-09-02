import { describe, it, expect } from 'vitest';
import { canTransition, transition, IllegalTransitionError } from './phase-machine.js';

describe('canTransition', () => {
  it('allows advancing to the immediate next phase', () => {
    expect(canTransition('onboarding', 'sources')).toBe(true);
    expect(canTransition('sources', 'brainstorm')).toBe(true);
    expect(canTransition('build', 'refine')).toBe(true);
  });

  it('rejects skipping ahead more than one phase', () => {
    expect(canTransition('onboarding', 'brainstorm')).toBe(false);
    expect(canTransition('onboarding', 'refine')).toBe(false);
  });

  it('rejects moving backward', () => {
    expect(canTransition('brainstorm', 'onboarding')).toBe(false);
    expect(canTransition('refine', 'build')).toBe(false);
  });

  it('rejects staying on the same phase', () => {
    expect(canTransition('sources', 'sources')).toBe(false);
  });

  it('rejects transitioning away from the terminal phase', () => {
    expect(canTransition('refine', 'refine')).toBe(false);
  });
});

describe('transition', () => {
  it('returns the target phase for a legal transition', () => {
    expect(transition('onboarding', 'sources')).toBe('sources');
  });

  it('throws IllegalTransitionError for an illegal transition, naming both phases', () => {
    expect(() => transition('onboarding', 'planning')).toThrow(IllegalTransitionError);
    try {
      transition('onboarding', 'planning');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalTransitionError);
      expect((err as IllegalTransitionError).from).toBe('onboarding');
      expect((err as IllegalTransitionError).to).toBe('planning');
    }
  });
});
