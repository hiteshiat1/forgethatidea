import { describe, it, expect, vi } from 'vitest';
import { runEval, isRegression } from './run-eval.js';
import type { BuildManifest } from '@forge/shared';

const VALID_CODE = 'export default function App() { return null; }';
const INVALID_CODE = 'localStorage.setItem("x", "1"); function App() { return null; }';

function fixture(overrides: Partial<BuildManifest> = {}): BuildManifest {
  return {
    schemaVersion: 1,
    productName: 'HabitLoop',
    icp: 'people building daily habits',
    entities: [{ name: 'Habit', fields: [{ name: 'title', type: 'string' }] }],
    screens: [{ name: 'Habit list', purpose: 'see all habits' }],
    roles: ['user'],
    keyActions: ['create habit'],
    branding: { accentColor: '#2E7D32', tone: 'encouraging' },
    references: { researchCardIds: [] },
    archetype: 'crud-tracker',
    ...overrides,
  };
}

function clientReturning(code: string) {
  return {
    streamMessage: vi.fn(async (_req: unknown, handlers: { onText?: (t: string) => void }) => {
      handlers.onText?.(code);
      return {
        inputTokens: 10,
        outputTokens: 20,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: code }],
      };
    }),
  };
}

describe('runEval (#77)', () => {
  it('reports a 100% pass rate when every fixture compiles and passes the contract', async () => {
    const client = clientReturning(VALID_CODE);
    const report = await runEval({
      fixtures: [fixture(), fixture({ productName: 'v2' })],
      anthropicClient: client,
      maxRepairRounds: 0,
    });

    expect(report.total).toBe(2);
    expect(report.passed).toBe(2);
    expect(report.passRate).toBe(1);
  });

  it('reports a partial pass rate and per-fixture results when some fail', async () => {
    let call = 0;
    const client = {
      streamMessage: vi.fn(async (_req: unknown, handlers: { onText?: (t: string) => void }) => {
        call++;
        const text = call === 1 ? VALID_CODE : INVALID_CODE;
        handlers.onText?.(text);
        return {
          inputTokens: 10,
          outputTokens: 20,
          stopReason: 'end_turn',
          content: [{ type: 'text' as const, text }],
        };
      }),
    };

    const report = await runEval({
      fixtures: [fixture({ productName: 'ok' }), fixture({ productName: 'broken' })],
      anthropicClient: client,
      maxRepairRounds: 0,
    });

    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.passRate).toBe(0.5);
    expect(report.results.find((r) => r.productName === 'ok')?.passed).toBe(true);
    expect(report.results.find((r) => r.productName === 'broken')?.passed).toBe(false);
  });

  it('reports the archetype for each result, enabling archetype-fit scoring', async () => {
    const client = clientReturning(VALID_CODE);
    const report = await runEval({
      fixtures: [fixture()],
      anthropicClient: client,
      maxRepairRounds: 0,
    });

    expect(report.results[0]?.archetype).toBe('crud-tracker');
  });
});

describe('isRegression (#77)', () => {
  it('flags a regression when the current pass rate drops below the baseline', () => {
    expect(isRegression(0.7, 0.9)).toBe(true);
  });

  it('does not flag a regression when the pass rate holds or improves', () => {
    expect(isRegression(0.9, 0.9)).toBe(false);
    expect(isRegression(1.0, 0.9)).toBe(false);
  });
});
