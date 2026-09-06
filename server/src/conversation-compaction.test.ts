import { describe, expect, it } from 'vitest';
import { compactChatHistory, isCompactionSummary } from './conversation-compaction.js';
import type { ChatMessage } from './chat-message.js';

function msg(id: string, role: 'user' | 'agent', text = id): ChatMessage {
  return { id, role, text };
}

describe('compactChatHistory (#37)', () => {
  it('leaves chat untouched when at or under the keep threshold', () => {
    const chat = [msg('1', 'user'), msg('2', 'agent')];
    expect(compactChatHistory(chat, 4)).toEqual(chat);
    expect(compactChatHistory(chat, 2)).toEqual(chat);
  });

  it('collapses older messages into one summary once over the threshold', () => {
    const chat = [
      msg('1', 'user'),
      msg('2', 'agent'),
      msg('3', 'user'),
      msg('4', 'agent'),
      msg('5', 'user'),
    ];
    const result = compactChatHistory(chat, 2);

    expect(result).toHaveLength(3);
    expect(result[0]?.role).toBe('agent');
    expect(isCompactionSummary(result[0]!)).toBe(true);
    expect(result[1]).toEqual(msg('4', 'agent'));
    expect(result[2]).toEqual(msg('5', 'user'));
  });

  it('summary mentions how many user/agent messages were compacted', () => {
    const chat = [msg('1', 'user'), msg('2', 'agent'), msg('3', 'user'), msg('4', 'agent')];
    const result = compactChatHistory(chat, 1);
    expect(result[0]?.text).toContain('2 user');
    expect(result[0]?.text).toContain('1 agent');
  });

  it('summary explicitly defers to the manifest as source of truth', () => {
    const chat = Array.from({ length: 5 }, (_, i) =>
      msg(String(i), i % 2 === 0 ? 'user' : 'agent'),
    );
    const result = compactChatHistory(chat, 1);
    expect(result[0]?.text.toLowerCase()).toContain('manifest');
  });

  it('re-compacting an already-compacted history keeps only one summary message', () => {
    const firstPass = compactChatHistory(
      [msg('1', 'user'), msg('2', 'agent'), msg('3', 'user'), msg('4', 'agent')],
      1,
    );
    const grown = [...firstPass, msg('5', 'user'), msg('6', 'agent'), msg('7', 'user')];
    const secondPass = compactChatHistory(grown, 1);

    expect(secondPass.filter((m) => isCompactionSummary(m))).toHaveLength(1);
    expect(isCompactionSummary(secondPass[0]!)).toBe(true);
  });

  it('isCompactionSummary is false for ordinary messages', () => {
    expect(isCompactionSummary(msg('1', 'user'))).toBe(false);
  });
});
