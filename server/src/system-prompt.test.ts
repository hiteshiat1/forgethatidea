import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, SYSTEM_PROMPT_VERSION } from './system-prompt.js';

describe('SYSTEM_PROMPT_VERSION', () => {
  it('is a non-empty version string', () => {
    expect(SYSTEM_PROMPT_VERSION).toEqual(expect.any(String));
    expect(SYSTEM_PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});

describe('buildSystemPrompt', () => {
  it('codifies the persona and tone', () => {
    const prompt = buildSystemPrompt({ phase: 'onboarding' });
    expect(prompt).toMatch(/Forge/);
    // Grounded in the product's forge metaphor, not a generic assistant tone.
    expect(prompt.toLowerCase()).toMatch(/forge|heat|shape|craft/);
  });

  it('includes the current phase for phase awareness', () => {
    const prompt = buildSystemPrompt({ phase: 'planning' });
    expect(prompt).toMatch(/planning/i);
  });

  it('reflects a different phase when given one', () => {
    const onboarding = buildSystemPrompt({ phase: 'onboarding' });
    const build = buildSystemPrompt({ phase: 'build' });
    expect(onboarding).not.toEqual(build);
  });

  it('defines the brainstorm stopping rule', () => {
    const prompt = buildSystemPrompt({ phase: 'brainstorm' });
    expect(prompt.toLowerCase()).toMatch(/stop|enough options|three|3-5|converge/);
  });

  it('includes cost/marketing honesty constraints — no invented numbers', () => {
    const prompt = buildSystemPrompt({ phase: 'planning' });
    expect(prompt.toLowerCase()).toMatch(/never (invent|fabricate|make up)/);
    expect(prompt.toLowerCase()).toMatch(/cost/);
    expect(prompt.toLowerCase()).toMatch(/marketing/);
  });

  it('embeds the prompt version in the output for traceability', () => {
    const prompt = buildSystemPrompt({ phase: 'onboarding' });
    expect(prompt).toContain(SYSTEM_PROMPT_VERSION);
  });

  it('accepts every real phase without throwing', () => {
    const phases = ['onboarding', 'sources', 'brainstorm', 'planning', 'build', 'refine'] as const;
    for (const phase of phases) {
      expect(() => buildSystemPrompt({ phase })).not.toThrow();
    }
  });
});
