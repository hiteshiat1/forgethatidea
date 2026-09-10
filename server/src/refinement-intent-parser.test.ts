import { describe, it, expect, vi } from 'vitest';
import {
  buildIntentParsePrompt,
  parseIntentResponse,
  isIntentParseFailure,
  parseChangeIntent,
} from './refinement-intent-parser.js';

const CURRENT_CODE = 'export default function App() { return <button>Save</button>; }';

describe('buildIntentParsePrompt (#89)', () => {
  it('includes the current app code and the change request', () => {
    const prompt = buildIntentParsePrompt(CURRENT_CODE, 'Make the header blue.');
    expect(prompt).toContain(CURRENT_CODE);
    expect(prompt).toContain('Make the header blue.');
  });

  it('asks for a target, an action, and whether the request is ambiguous', () => {
    const prompt = buildIntentParsePrompt(CURRENT_CODE, 'Make the header blue.');
    expect(prompt.toLowerCase()).toContain('target');
    expect(prompt.toLowerCase()).toContain('ambiguous');
  });

  it('requests structured JSON output', () => {
    const prompt = buildIntentParsePrompt(CURRENT_CODE, 'Make the header blue.');
    expect(prompt.toLowerCase()).toContain('json');
  });
});

describe('parseIntentResponse (#89)', () => {
  it('parses a clear, unambiguous intent', () => {
    const result = parseIntentResponse(
      JSON.stringify({
        ambiguous: false,
        target: 'header',
        action: 'style',
        summary: 'Change header color to blue',
      }),
    );
    expect(isIntentParseFailure(result)).toBe(false);
    if (!isIntentParseFailure(result) && !result.ambiguous) {
      expect(result.target).toBe('header');
      expect(result.action).toBe('style');
      expect(result.summary).toBe('Change header color to blue');
    }
  });

  it('parses an ambiguous intent with a clarifying question', () => {
    const result = parseIntentResponse(
      JSON.stringify({
        ambiguous: true,
        clarifyingQuestion: 'Which field should the new status apply to?',
      }),
    );
    expect(isIntentParseFailure(result)).toBe(false);
    if (!isIntentParseFailure(result) && result.ambiguous) {
      expect(result.clarifyingQuestion).toBe('Which field should the new status apply to?');
    }
  });

  it('rejects malformed JSON', () => {
    const result = parseIntentResponse('not json');
    expect(isIntentParseFailure(result)).toBe(true);
  });

  it('rejects a shape missing required fields for its own ambiguous flag', () => {
    const result = parseIntentResponse(JSON.stringify({ ambiguous: false }));
    expect(isIntentParseFailure(result)).toBe(true);
  });

  it('rejects an ambiguous:true payload missing the clarifying question', () => {
    const result = parseIntentResponse(JSON.stringify({ ambiguous: true }));
    expect(isIntentParseFailure(result)).toBe(true);
  });
});

describe('parseChangeIntent (#89)', () => {
  it('calls the model and returns a parsed unambiguous intent', async () => {
    const client = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 20,
        stopReason: 'end_turn',
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ambiguous: false,
              target: 'header',
              action: 'style',
              summary: 'Change header color to blue',
            }),
          },
        ],
      })),
    };

    const result = await parseChangeIntent({
      currentCode: CURRENT_CODE,
      changeRequest: 'Make the header blue.',
      anthropicClient: client,
    });

    expect(result.ambiguous).toBe(false);
    if (!result.ambiguous) {
      expect(result.summary).toBe('Change header color to blue');
    }
  });

  it('returns an unambiguous fallback intent on a model error — never blocks the edit pipeline on a parser outage', async () => {
    const client = { streamMessage: vi.fn(async () => Promise.reject(new Error('down'))) };

    const result = await parseChangeIntent({
      currentCode: CURRENT_CODE,
      changeRequest: 'Make the header blue.',
      anthropicClient: client,
    });

    expect(result.ambiguous).toBe(false);
    if (!result.ambiguous) {
      expect(result.summary).toBe('Make the header blue.');
    }
  });

  it('returns an unambiguous fallback intent on a malformed response', async () => {
    const client = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 20,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: 'not json' }],
      })),
    };

    const result = await parseChangeIntent({
      currentCode: CURRENT_CODE,
      changeRequest: 'Make the header blue.',
      anthropicClient: client,
    });

    expect(result.ambiguous).toBe(false);
  });
});
