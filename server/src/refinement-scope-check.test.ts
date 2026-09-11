import { describe, it, expect, vi } from 'vitest';
import {
  buildScopeCheckPrompt,
  parseScopeCheckResponse,
  isScopeCheckFailure,
  checkRequestScope,
} from './refinement-scope-check.js';

describe('buildScopeCheckPrompt (#91)', () => {
  it('includes the change request text', () => {
    const prompt = buildScopeCheckPrompt('Add a status field and change the header color.');
    expect(prompt).toContain('Add a status field and change the header color.');
  });

  it('describes bundled/multi-change detection', () => {
    const prompt = buildScopeCheckPrompt('Add a status field and change the header color.');
    expect(prompt.toLowerCase()).toContain('separate');
  });

  it('requests structured JSON output', () => {
    const prompt = buildScopeCheckPrompt('Add a status field and change the header color.');
    expect(prompt.toLowerCase()).toContain('json');
  });
});

describe('parseScopeCheckResponse (#91)', () => {
  it('parses a single-change verdict', () => {
    const result = parseScopeCheckResponse(JSON.stringify({ isSingleChange: true }));
    expect(isScopeCheckFailure(result)).toBe(false);
    if (!isScopeCheckFailure(result)) {
      expect(result.isSingleChange).toBe(true);
    }
  });

  it('parses a multi-change verdict with the split-out changes', () => {
    const result = parseScopeCheckResponse(
      JSON.stringify({
        isSingleChange: false,
        detectedChanges: ['Add a status field', 'Change the header color'],
      }),
    );
    expect(isScopeCheckFailure(result)).toBe(false);
    if (!isScopeCheckFailure(result) && !result.isSingleChange) {
      expect(result.detectedChanges).toEqual(['Add a status field', 'Change the header color']);
    }
  });

  it('rejects malformed JSON', () => {
    const result = parseScopeCheckResponse('not json');
    expect(isScopeCheckFailure(result)).toBe(true);
  });

  it('rejects isSingleChange:false with fewer than 2 detected changes', () => {
    const result = parseScopeCheckResponse(
      JSON.stringify({ isSingleChange: false, detectedChanges: ['Only one'] }),
    );
    expect(isScopeCheckFailure(result)).toBe(true);
  });
});

describe('checkRequestScope (#91)', () => {
  it('calls the model and returns a single-change verdict', async () => {
    const client = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: JSON.stringify({ isSingleChange: true }) }],
      })),
    };

    const result = await checkRequestScope({
      changeRequest: 'Make the header blue.',
      anthropicClient: client,
    });

    expect(result.isSingleChange).toBe(true);
  });

  it('returns the detected changes for a bundled request', async () => {
    const client = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isSingleChange: false,
              detectedChanges: ['Add a status field', 'Change the header color', 'Reorder items'],
            }),
          },
        ],
      })),
    };

    const result = await checkRequestScope({
      changeRequest: 'Add a status field, change the header color, and reorder the items.',
      anthropicClient: client,
    });

    expect(result.isSingleChange).toBe(false);
    if (!result.isSingleChange) {
      expect(result.detectedChanges).toHaveLength(3);
    }
  });

  it('defaults to single-change on a model error — never blocks a normal refinement on an outage', async () => {
    const client = { streamMessage: vi.fn(async () => Promise.reject(new Error('down'))) };

    const result = await checkRequestScope({
      changeRequest: 'Make the header blue.',
      anthropicClient: client,
    });

    expect(result.isSingleChange).toBe(true);
  });

  it('defaults to single-change on a malformed response', async () => {
    const client = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: 'not json' }],
      })),
    };

    const result = await checkRequestScope({
      changeRequest: 'Make the header blue.',
      anthropicClient: client,
    });

    expect(result.isSingleChange).toBe(true);
  });
});
