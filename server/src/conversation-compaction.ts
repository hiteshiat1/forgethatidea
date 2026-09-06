import type { ChatMessage } from './chat-message.js';

const SUMMARY_ID = 'compaction-summary';

/**
 * Conversation compaction (Epic 2.10): once a session's chat history grows
 * past `keepRecentMessages`, the older messages are collapsed into one
 * summary message so the model call's context (and cost) stays bounded no
 * matter how long a session runs. The manifest — not chat text — is always
 * the authoritative record of what's been decided, so the summary only ever
 * needs to preserve enough conversational color for the model to keep
 * sounding coherent, never the underlying facts.
 *
 * Idempotent: compacting an already-compacted history re-summarizes the
 * existing summary alongside whatever's newly out of the keep window, so the
 * result never accumulates more than one summary message.
 */
export function compactChatHistory(chat: ChatMessage[], keepRecentMessages: number): ChatMessage[] {
  if (chat.length <= keepRecentMessages) {
    return chat;
  }

  const cutoff = chat.length - keepRecentMessages;
  const older = chat.slice(0, cutoff);
  const recent = chat.slice(cutoff);

  return [summarizeMessages(older), ...recent];
}

function summarizeMessages(messages: ChatMessage[]): ChatMessage {
  const realMessages = messages.filter((m) => !isCompactionSummary(m));
  const userTurns = realMessages.filter((m) => m.role === 'user').length;
  const agentTurns = realMessages.filter((m) => m.role === 'agent').length;
  return {
    id: SUMMARY_ID,
    role: 'agent',
    text: `[Earlier conversation compacted: ${userTurns} user message(s) and ${agentTurns} agent reply/replies omitted. The build manifest and current phase remain the source of truth for everything decided so far.]`,
  };
}

/** Whether a chat message is a compaction summary produced by `compactChatHistory`. */
export function isCompactionSummary(message: ChatMessage): boolean {
  return message.id === SUMMARY_ID;
}
