import { useState, type KeyboardEvent } from 'react';
import { type Phase } from '@forge/shared';
import { Button } from '@forge/shared/ui';
import '../styles/chat-input.css';

export interface ChatInputProps {
  phase: Phase;
  /** Fired with the trimmed message text when the user sends. */
  onSend: (text: string) => void;
  /** True while the agent is mid-turn — disables sending without changing phase-driven affordances. */
  disabled?: boolean;
}

const PLACEHOLDER: Record<Phase, string> = {
  onboarding: "What's the idea? Tell me about it...",
  sources: 'Paste competitor names, links, or references...',
  brainstorm: 'Answer, or steer the direction...',
  planning: 'Ask questions or request changes to the plan...',
  build: '',
  refine: 'Describe what you want changed...',
};

/**
 * Phases where the agent is doing the work and there's nothing for the user
 * to type — the input is replaced by guidance text instead of a disabled
 * box, per "non-typing phases show guidance".
 */
const NON_TYPING_PHASES = new Set<Phase>(['build']);

const NON_TYPING_GUIDANCE: Partial<Record<Phase, string>> = {
  build: 'Forge is building your app — sit tight, this only takes a moment.',
};

/**
 * Context-aware chat input (Epic 1.7): placeholder and enabled/disabled
 * state adapt to the session's current phase. Typing phases behave like a
 * normal chat box (Enter sends, Shift+Enter for a newline); non-typing
 * phases (currently just `build`) show guidance copy instead of an input,
 * since there's nothing for the user to type while the agent works.
 */
export function ChatInput({ phase, onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('');

  if (NON_TYPING_PHASES.has(phase)) {
    return (
      <div className="chat-input chat-input--guidance" role="status">
        {NON_TYPING_GUIDANCE[phase]}
      </div>
    );
  }

  const trimmed = value.trim();

  function send() {
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="chat-input">
      <textarea
        className="chat-input__field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDER[phase]}
        disabled={disabled}
        rows={1}
        aria-label="Message"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={send}
        disabled={disabled || !trimmed}
        aria-label="Send"
      >
        Send
      </Button>
    </div>
  );
}
