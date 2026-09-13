import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './TopBar.js';
import '../styles/shell.css';

export interface AppShellProps {
  /** Phase rail slot for the top bar (Epic 1.3). */
  rail?: ReactNode;
  /** Status indicators slot for the top bar (Epic 1.11). */
  aside?: ReactNode;
  /** Left chat pane content (Epic 1.6/1.7). */
  chat: ReactNode;
  /** Right canvas pane content (Epic 1.8). */
  canvas: ReactNode;
}

const SPLIT_STORAGE_KEY = 'forge:chat-pane-width';
const DEFAULT_CHAT_WIDTH = 420;
const MIN_CHAT_WIDTH = 280;
const MIN_CANVAS_WIDTH = 360;

function readStoredWidth(): number {
  try {
    const stored = window.localStorage.getItem(SPLIT_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_CHAT_WIDTH;
  } catch {
    // Private browsing / storage disabled — fall back to the default rather
    // than breaking the layout over a non-essential preference.
    return DEFAULT_CHAT_WIDTH;
  }
}

/**
 * The two-pane application shell (Epic 1.1): top bar over a chat-left /
 * canvas-right body, with a draggable divider between them (users couldn't
 * previously resize the fixed 420px/1fr split even when the canvas — the
 * live app preview — needed more room). The chosen width persists in
 * localStorage per browser so it's remembered across visits; below the
 * responsive stacking breakpoint (shell.css, 760px) the divider is hidden
 * and panes stack vertically as before, since dragging a horizontal split
 * makes no sense in that layout.
 */
export function AppShell({ rail, aside, chat, canvas }: AppShellProps) {
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    setChatWidth(readStoredWidth());
  }, []);

  const clampWidth = useCallback((width: number) => {
    const bodyWidth = bodyRef.current?.getBoundingClientRect().width ?? Infinity;
    const maxChatWidth = Math.max(MIN_CHAT_WIDTH, bodyWidth - MIN_CANVAS_WIDTH);
    return Math.min(Math.max(width, MIN_CHAT_WIDTH), maxChatWidth);
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current || !bodyRef.current) return;
      const bodyLeft = bodyRef.current.getBoundingClientRect().left;
      setChatWidth(clampWidth(event.clientX - bodyLeft));
    },
    [clampWidth],
  );

  const stopDragging = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopDragging);
    setChatWidth((width) => {
      try {
        window.localStorage.setItem(SPLIT_STORAGE_KEY, String(width));
      } catch {
        // Non-essential preference — a failed write shouldn't break resizing.
      }
      return width;
    });
  }, [handlePointerMove]);

  function startDragging(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 12;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setChatWidth((width) => clampWidth(width - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setChatWidth((width) => clampWidth(width + step));
    } else {
      return;
    }
    // Persist immediately for keyboard adjustments (no separate "pointer up").
    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(chatWidth));
    } catch {
      // Non-essential preference.
    }
  }

  return (
    <div className="shell">
      <TopBar rail={rail} aside={aside} />
      <div
        className="shell-body"
        ref={bodyRef}
        style={{ gridTemplateColumns: `${chatWidth}px 6px 1fr` }}
      >
        <section className="shell-pane shell-pane--chat" aria-label="Conversation">
          {chat}
        </section>
        <div
          className="shell-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat and canvas panes"
          tabIndex={0}
          onPointerDown={startDragging}
          onKeyDown={handleKeyDown}
        >
          <div className="shell-divider__grip" />
        </div>
        <section className="shell-pane shell-pane--canvas" aria-label="Canvas">
          {canvas}
        </section>
      </div>
    </div>
  );
}
