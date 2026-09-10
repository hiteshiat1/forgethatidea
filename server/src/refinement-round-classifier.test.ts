import { describe, it, expect, vi } from 'vitest';
import {
  buildClassificationPrompt,
  parseClassificationResponse,
  isClassificationFailure,
  classifyRefinementMessage,
} from './refinement-round-classifier.js';

const CURRENT_CODE = 'export default function App() { return <button>Save</button>; }';

describe('buildClassificationPrompt (#85)', () => {
  it('includes the current app code and the user message', () => {
    const prompt = buildClassificationPrompt(CURRENT_CODE, 'Make the button bigger.');
    expect(prompt).toContain(CURRENT_CODE);
    expect(prompt).toContain('Make the button bigger.');
  });

  it('describes the two categories to classify between', () => {
    const prompt = buildClassificationPrompt(CURRENT_CODE, 'Make the button bigger.');
    expect(prompt.toLowerCase()).toContain('change request');
    expect(prompt.toLowerCase()).toContain('clarif');
  });

  it('requests structured JSON output', () => {
    const prompt = buildClassificationPrompt(CURRENT_CODE, 'Make the button bigger.');
    expect(prompt.toLowerCase()).toContain('json');
  });
});

describe('parseClassificationResponse (#85)', () => {
  it('parses a change_request classification', () => {
    const result = parseClassificationResponse(JSON.stringify({ kind: 'change_request' }));
    expect(isClassificationFailure(result)).toBe(false);
    if (!isClassificationFailure(result)) {
      expect(result.kind).toBe('change_request');
    }
  });

  it('parses a clarification classification', () => {
    const result = parseClassificationResponse(JSON.stringify({ kind: 'clarification' }));
    expect(isClassificationFailure(result)).toBe(false);
    if (!isClassificationFailure(result)) {
      expect(result.kind).toBe('clarification');
    }
  });

  it('rejects malformed JSON', () => {
    const result = parseClassificationResponse('not json');
    expect(isClassificationFailure(result)).toBe(true);
  });

  it('rejects an unrecognized kind value', () => {
    const result = parseClassificationResponse(JSON.stringify({ kind: 'something_else' }));
    expect(isClassificationFailure(result)).toBe(true);
  });
});

describe('classifyRefinementMessage (#85)', () => {
  it('calls the model and returns the classification', async () => {
    const client = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: JSON.stringify({ kind: 'change_request' }) }],
      })),
    };

    const result = await classifyRefinementMessage({
      currentCode: CURRENT_CODE,
      message: 'Make the button bigger.',
      anthropicClient: client,
    });

    expect(result.kind).toBe('change_request');
  });

  it('defaults to change_request on a model error — never silently drops a real request as free', async () => {
    const client = { streamMessage: vi.fn(async () => Promise.reject(new Error('down'))) };

    const result = await classifyRefinementMessage({
      currentCode: CURRENT_CODE,
      message: 'Make the button bigger.',
      anthropicClient: client,
    });

    expect(result.kind).toBe('change_request');
  });

  it('defaults to change_request on a malformed response', async () => {
    const client = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: 'not json' }],
      })),
    };

    const result = await classifyRefinementMessage({
      currentCode: CURRENT_CODE,
      message: 'Make the button bigger.',
      anthropicClient: client,
    });

    expect(result.kind).toBe('change_request');
  });
});
