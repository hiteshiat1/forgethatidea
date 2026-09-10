import { describe, it, expect, vi } from 'vitest';
import { answerClarification } from './refinement-clarification.js';

const CURRENT_CODE = 'export default function App() { return <button>Save</button>; }';

describe('answerClarification (#85)', () => {
  it('includes the current code and the question in the prompt sent to the model', async () => {
    const client = {
      streamMessage: vi.fn(async (_req: unknown, handlers: { onText?: (t: string) => void }) => {
        handlers.onText?.('The Save button submits the form.');
        return {
          inputTokens: 5,
          outputTokens: 5,
          stopReason: 'end_turn',
          content: [{ type: 'text' as const, text: 'The Save button submits the form.' }],
        };
      }),
    };

    const answer = await answerClarification({
      currentCode: CURRENT_CODE,
      question: 'What does the Save button do?',
      anthropicClient: client,
    });

    expect(answer).toBe('The Save button submits the form.');
    const sentPrompt = (
      client.streamMessage.mock.calls[0]![0] as { messages: { content: string }[] }
    ).messages[0]!.content;
    expect(sentPrompt).toContain(CURRENT_CODE);
    expect(sentPrompt).toContain('What does the Save button do?');
  });

  it('returns a graceful fallback message when the model call fails', async () => {
    const client = { streamMessage: vi.fn(async () => Promise.reject(new Error('down'))) };

    const answer = await answerClarification({
      currentCode: CURRENT_CODE,
      question: 'What does the Save button do?',
      anthropicClient: client,
    });

    expect(answer.length).toBeGreaterThan(0);
  });
});
