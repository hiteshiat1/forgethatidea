import { describe, expect, it, vi } from 'vitest';
import {
  buildSeedDataPrompt,
  parseSeedDataResponse,
  isSeedDataFailure,
  generateSeedData,
} from './seed-data-generator.js';
import type { GenerationSpec } from './generation-spec.js';

function spec(): GenerationSpec {
  return {
    archetype: 'crud-tracker',
    productName: 'HabitLoop',
    icp: 'people building daily habits',
    entities: [
      {
        name: 'Habit',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'streak', type: 'number' },
        ],
      },
    ],
    screens: [{ name: 'Habit list', purpose: 'see all habits' }],
    roles: ['user'],
    keyActions: ['create habit'],
    branding: { accentColor: '#2E7D32', tone: 'encouraging' },
  };
}

describe('buildSeedDataPrompt (#69)', () => {
  it('mentions the ICP, entity names/fields, and the required volume range', () => {
    const prompt = buildSeedDataPrompt(spec());
    expect(prompt).toContain('people building daily habits');
    expect(prompt).toContain('Habit');
    expect(prompt).toContain('title');
    expect(prompt).toContain('5');
    expect(prompt).toContain('15');
  });

  it('instructs against real personal data', () => {
    const prompt = buildSeedDataPrompt(spec());
    expect(prompt.toLowerCase()).toContain('fictional');
  });
});

describe('parseSeedDataResponse (#69)', () => {
  it('parses valid JSON with the right volume per entity', () => {
    const records = Array.from({ length: 8 }, (_, i) => ({ title: `Habit ${i}`, streak: i }));
    const json = JSON.stringify({ Habit: records });
    const result = parseSeedDataResponse(json, spec());
    expect(isSeedDataFailure(result)).toBe(false);
    if (!isSeedDataFailure(result)) {
      expect(result.seedData.Habit).toHaveLength(8);
    }
  });

  it('rejects malformed JSON', () => {
    const result = parseSeedDataResponse('not json', spec());
    expect(isSeedDataFailure(result)).toBe(true);
    if (isSeedDataFailure(result)) {
      expect(result.error).toBe('invalid_json');
    }
  });

  it('rejects a missing entity key', () => {
    const result = parseSeedDataResponse(JSON.stringify({}), spec());
    expect(isSeedDataFailure(result)).toBe(true);
    if (isSeedDataFailure(result)) {
      expect(result.error).toBe('missing_entity_data');
    }
  });

  it('rejects too few records for an entity (below 5)', () => {
    const json = JSON.stringify({ Habit: [{ title: 'a', streak: 1 }] });
    const result = parseSeedDataResponse(json, spec());
    expect(isSeedDataFailure(result)).toBe(true);
    if (isSeedDataFailure(result)) {
      expect(result.error).toBe('volume_out_of_range');
    }
  });

  it('rejects too many records for an entity (above 15)', () => {
    const records = Array.from({ length: 20 }, (_, i) => ({ title: `Habit ${i}`, streak: i }));
    const json = JSON.stringify({ Habit: records });
    const result = parseSeedDataResponse(json, spec());
    expect(isSeedDataFailure(result)).toBe(true);
    if (isSeedDataFailure(result)) {
      expect(result.error).toBe('volume_out_of_range');
    }
  });

  it('rejects records that look like real personal data (email addresses)', () => {
    const records = Array.from({ length: 6 }, (_, i) => ({
      title: `contact ${i}@gmail.com`,
      streak: i,
    }));
    const json = JSON.stringify({ Habit: records });
    const result = parseSeedDataResponse(json, spec());
    expect(isSeedDataFailure(result)).toBe(true);
    if (isSeedDataFailure(result)) {
      expect(result.error).toBe('possible_real_pii');
    }
  });

  it('rejects records that look like real phone numbers', () => {
    const records = Array.from({ length: 6 }, (_, i) => ({
      title: `call 555-123-4567 for habit ${i}`,
      streak: i,
    }));
    const json = JSON.stringify({ Habit: records });
    const result = parseSeedDataResponse(json, spec());
    expect(isSeedDataFailure(result)).toBe(true);
    if (isSeedDataFailure(result)) {
      expect(result.error).toBe('possible_real_pii');
    }
  });
});

describe('generateSeedData (#69)', () => {
  it('calls the model and returns parsed, validated seed data', async () => {
    const records = Array.from({ length: 8 }, (_, i) => ({ title: `Habit ${i}`, streak: i }));
    const client = {
      streamMessage: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 20,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: JSON.stringify({ Habit: records }) }],
      })),
    };

    const result = await generateSeedData({ spec: spec(), anthropicClient: client });

    expect(isSeedDataFailure(result)).toBe(false);
    if (!isSeedDataFailure(result)) {
      expect(result.seedData.Habit).toHaveLength(8);
    }
  });

  it('never throws when the model call fails — resolves to a typed failure', async () => {
    const client = { streamMessage: vi.fn(async () => Promise.reject(new Error('down'))) };

    const result = await generateSeedData({ spec: spec(), anthropicClient: client });

    expect(isSeedDataFailure(result)).toBe(true);
    if (isSeedDataFailure(result)) {
      expect(result.error).toBe('model_error');
    }
  });
});
