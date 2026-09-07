import { describe, expect, it, vi } from 'vitest';
import { runAutoRepairLoop, isAutoRepairFailure } from './auto-repair-loop.js';
import type { GenerationSpec } from './generation-spec.js';
import type { AnthropicMessageParam } from './anthropic-client.js';

function spec(): GenerationSpec {
  return {
    archetype: 'crud-tracker',
    productName: 'HabitLoop',
    icp: 'people building daily habits',
    entities: [{ name: 'Habit', fields: [{ name: 'title', type: 'string' }] }],
    screens: [{ name: 'Habit list', purpose: 'see all habits' }],
    roles: ['user'],
    keyActions: ['create habit'],
    branding: { accentColor: '#2E7D32', tone: 'encouraging' },
  };
}

const VALID_CODE = 'export default function App() { return null; }';
const INVALID_CODE = 'localStorage.setItem("x", "1"); function App() { return null; }';

function clientReturning(...codes: string[]) {
  let call = 0;
  return {
    streamMessage: vi.fn(async (_req: unknown, handlers: { onText?: (t: string) => void }) => {
      const code = codes[Math.min(call, codes.length - 1)]!;
      call++;
      handlers.onText?.(code);
      return {
        inputTokens: 100,
        outputTokens: 200,
        stopReason: 'end_turn',
        content: [{ type: 'text' as const, text: code }],
      };
    }),
  };
}

describe('runAutoRepairLoop (#67)', () => {
  it('succeeds on the first attempt when generation validates cleanly', async () => {
    const client = clientReturning(VALID_CODE);

    const result = await runAutoRepairLoop({ spec: spec(), anthropicClient: client });

    expect(isAutoRepairFailure(result)).toBe(false);
    if (!isAutoRepairFailure(result)) {
      expect(result.code).toBe(VALID_CODE);
      expect(result.repairRounds).toBe(0);
    }
    expect(client.streamMessage).toHaveBeenCalledTimes(1);
  });

  it('repairs after one failed validation, succeeding on the second attempt', async () => {
    const client = clientReturning(INVALID_CODE, VALID_CODE);

    const result = await runAutoRepairLoop({ spec: spec(), anthropicClient: client });

    expect(isAutoRepairFailure(result)).toBe(false);
    if (!isAutoRepairFailure(result)) {
      expect(result.code).toBe(VALID_CODE);
      expect(result.repairRounds).toBe(1);
    }
    expect(client.streamMessage).toHaveBeenCalledTimes(2);
  });

  it('includes the exact validation errors in the repair attempt prompt', async () => {
    const client = clientReturning(INVALID_CODE, VALID_CODE);

    await runAutoRepairLoop({ spec: spec(), anthropicClient: client });

    const req = client.streamMessage.mock.calls[1]![0] as { messages: AnthropicMessageParam[] };
    const secondCallPrompt = req.messages[0]!.content;
    expect(secondCallPrompt).toContain('forbidden_localStorage');
    expect(secondCallPrompt).toContain(INVALID_CODE);
  });

  it('gives up after maxRepairRounds and surfaces a graceful terminal failure', async () => {
    const client = clientReturning(INVALID_CODE, INVALID_CODE, INVALID_CODE);

    const result = await runAutoRepairLoop({
      spec: spec(),
      anthropicClient: client,
      maxRepairRounds: 2,
    });

    expect(isAutoRepairFailure(result)).toBe(true);
    if (isAutoRepairFailure(result)) {
      expect(result.error).toBe('validation_failed_after_repairs');
      expect(result.repairRounds).toBe(2);
      expect(result.lastErrors).toContain('forbidden_localStorage');
    }
    // Initial attempt + 2 repair rounds = 3 total calls.
    expect(client.streamMessage).toHaveBeenCalledTimes(3);
  });

  it('never throws when the model call itself fails — resolves to a typed failure', async () => {
    const client = { streamMessage: vi.fn(async () => Promise.reject(new Error('down'))) };

    const result = await runAutoRepairLoop({ spec: spec(), anthropicClient: client });

    expect(isAutoRepairFailure(result)).toBe(true);
    if (isAutoRepairFailure(result)) {
      expect(result.error).toBe('generation_failed');
    }
  });

  it('reports repair round count as a quality metric even on success', async () => {
    const client = clientReturning(INVALID_CODE, INVALID_CODE, VALID_CODE);

    const result = await runAutoRepairLoop({
      spec: spec(),
      anthropicClient: client,
      maxRepairRounds: 3,
    });

    expect(isAutoRepairFailure(result)).toBe(false);
    if (!isAutoRepairFailure(result)) {
      expect(result.repairRounds).toBe(2);
    }
  });
});
