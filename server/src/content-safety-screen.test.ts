import { describe, expect, it, vi } from 'vitest';
import {
  buildScreeningPrompt,
  parseScreeningResponse,
  isScreeningFailure,
  screenManifestForSafety,
} from './content-safety-screen.js';
import type { GenerationSpec } from './generation-spec.js';

function spec(overrides: Partial<GenerationSpec> = {}): GenerationSpec {
  return {
    archetype: 'crud-tracker',
    productName: 'HabitLoop',
    icp: 'people building daily habits',
    entities: [{ name: 'Habit', fields: [{ name: 'title', type: 'string' }] }],
    screens: [{ name: 'Habit list', purpose: 'see all habits' }],
    roles: ['user'],
    keyActions: ['create habit'],
    branding: { accentColor: '#2E7D32', tone: 'encouraging' },
    ...overrides,
  };
}

describe('buildScreeningPrompt (#78)', () => {
  it('includes the manifest content to be screened', () => {
    const prompt = buildScreeningPrompt(spec());
    expect(prompt).toContain('HabitLoop');
    expect(prompt).toContain('people building daily habits');
    expect(prompt).toContain('Habit');
  });

  it('names the categories to screen for', () => {
    const prompt = buildScreeningPrompt(spec());
    expect(prompt.toLowerCase()).toContain('harmful');
    expect(prompt.toLowerCase()).toContain('deceptive');
    expect(prompt.toLowerCase()).toContain('infringing');
  });

  it('requests structured JSON output', () => {
    const prompt = buildScreeningPrompt(spec());
    expect(prompt.toLowerCase()).toContain('json');
  });
});

describe('parseScreeningResponse (#78)', () => {
  it('parses an allowed decision', () => {
    const result = parseScreeningResponse(JSON.stringify({ allowed: true }));
    expect(isScreeningFailure(result)).toBe(false);
    if (!isScreeningFailure(result)) {
      expect(result.decision.allowed).toBe(true);
    }
  });

  it('parses a blocked decision with a reason', () => {
    const result = parseScreeningResponse(
      JSON.stringify({ allowed: false, reason: 'Requests a weapon marketplace.' }),
    );
    expect(isScreeningFailure(result)).toBe(false);
    if (!isScreeningFailure(result)) {
      expect(result.decision.allowed).toBe(false);
      expect(result.decision.reason).toContain('weapon');
    }
  });

  it('rejects malformed JSON', () => {
    const result = parseScreeningResponse('not json');
    expect(isScreeningFailure(result)).toBe(true);
    if (isScreeningFailure(result)) {
      expect(result.error).toBe('invalid_json');
    }
  });

  it('rejects a response missing the allowed field', () => {
    const result = parseScreeningResponse(JSON.stringify({ reason: 'no allowed field' }));
    expect(isScreeningFailure(result)).toBe(true);
    if (isScreeningFailure(result)) {
      expect(result.error).toBe('invalid_shape');
    }
  });

  it('rejects a blocked decision with no reason given', () => {
    const result = parseScreeningResponse(JSON.stringify({ allowed: false }));
    expect(isScreeningFailure(result)).toBe(true);
    if (isScreeningFailure(result)) {
      expect(result.error).toBe('invalid_shape');
    }
  });
});

describe('screenManifestForSafety (#78)', () => {
  it('calls the model and returns an allowed decision', async () => {
    const client = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: JSON.stringify({ allowed: true }) }],
      })),
    };

    const result = await screenManifestForSafety({ spec: spec(), anthropicClient: client });

    expect(isScreeningFailure(result)).toBe(false);
    if (!isScreeningFailure(result)) {
      expect(result.decision.allowed).toBe(true);
    }
  });

  it('fails open (allowed) on a model error, rather than blocking every build when the screener is down', async () => {
    const client = { streamMessage: vi.fn(async () => Promise.reject(new Error('down'))) };

    const result = await screenManifestForSafety({ spec: spec(), anthropicClient: client });

    expect(isScreeningFailure(result)).toBe(false);
    if (!isScreeningFailure(result)) {
      expect(result.decision.allowed).toBe(true);
      expect(result.decision.reason).toContain('unavailable');
    }
  });
});
