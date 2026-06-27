import { type ReactNode } from 'react';
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

/**
 * The two-pane application shell (Epic 1.1): top bar over a chat-left /
 * canvas-right body. Panes are passed in as slots so later epics fill them
 * without touching the layout. Responsive behaviour lives in shell.css.
 */
export function AppShell({ rail, aside, chat, canvas }: AppShellProps) {
  return (
    <div className="shell">
      <TopBar rail={rail} aside={aside} />
      <div className="shell-body">
        <section className="shell-pane shell-pane--chat" aria-label="Conversation">
          {chat}
        </section>
        <section className="shell-pane shell-pane--canvas" aria-label="Canvas">
          {canvas}
        </section>
      </div>
    </div>
  );
}
