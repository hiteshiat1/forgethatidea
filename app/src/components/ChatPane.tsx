import { useEffect, useRef } from 'react';
import { color } from '@forge/shared';
import { MarkdownMessage } from './MarkdownMessage.js';
import '../styles/chat-pane.css';

export type ChatRole = 'user' | 'agent';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** True only for the agent's in-flight message — its text grows as tokens stream in. */
  streaming?: boolean;
}

export interface ChatPaneProps {
  messages: ChatMessage[];
  /**
   * True while a turn is in flight with no reply yet — real turns can take
   * 10-20+ seconds (a multi-round Anthropic call server-side) with no
   * intermediate progress events, so without this the user has no signal
   * anything is happening between sending a message and the reply
   * appearing. Rendered as a trailing "typing" bubble, never as part of
   * `messages` itself.
   */
  pending?: boolean;
}

/**
 * Message stream (Epic 1.6). Renders user/agent bubbles in order, autoscrolls
 * to the latest message whenever the list changes (new message or a
 * streaming message's text growing), and shows an empty state before the
 * first message exists. Feeding real streamed tokens into `messages` is the
 * agent orchestrator's job (not yet built) — this component only needs an
 * ordered message list, so it's ready for that wiring without changes.
 */
export function ChatPane({ messages, pending = false }: ChatPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, pending]);

  if (messages.length === 0 && !pending) {
    return (
      <div className="chat-pane chat-pane--empty" aria-live="polite">
        <p className="chat-pane__empty-title">No messages yet</p>
        <p className="chat-pane__empty-hint">Say hello to start forging your idea.</p>
      </div>
    );
  }

  return (
    <div className="chat-pane" role="log" aria-live="polite">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`chat-message chat-message--${message.role}`}
          aria-busy={message.streaming || undefined}
        >
          <span className="chat-message__bubble">
            {message.role === 'agent' ? <MarkdownMessage text={message.text} /> : message.text}
            {message.streaming && (
              <span
                className="chat-message__cursor"
                aria-hidden="true"
                style={{ color: color.signal.amber }}
              >
                ▍
              </span>
            )}
          </span>
        </div>
      ))}
      {pending && (
        <div className="chat-message chat-message--agent" aria-label="Forge is working on a reply">
          <span className="chat-message__bubble chat-message__bubble--typing">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
          </span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
