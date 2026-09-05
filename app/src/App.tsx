import { useEffect, useState } from 'react';
import { type Phase } from '@forge/shared';
import { Pill } from '@forge/shared/ui';
import { AppShell } from './components/AppShell.js';
import { CanvasPane } from './components/CanvasPane.js';
import { ChatInput } from './components/ChatInput.js';
import { ChatPane, type ChatMessage } from './components/ChatPane.js';
import { Onboarding } from './components/Onboarding.js';
import { PhaseRail } from './components/PhaseRail.js';

type Health = { status: string; env: string } | null;

/** Live server status indicator for the top bar aside (placeholder until Epic 1.11). */
function HealthIndicator() {
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/health')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  const tone = error ? 'danger' : health ? 'success' : 'neutral';
  const label = error ? 'offline' : health ? health.env : 'connecting…';
  return <Pill tone={tone}>{label}</Pill>;
}

/**
 * App root. Renders the two-pane shell (Epic 1.1); the chat and canvas panes are
 * placeholders that later Epic 1 issues fill in.
 */
export function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [phase] = useState<Phase>('onboarding');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  function handleSend(text: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text }]);
  }

  return (
    <AppShell
      rail={<PhaseRail current={phase} />}
      aside={<HealthIndicator />}
      chat={
        <div className="chat-column">
          <ChatPane messages={messages} />
          <ChatInput phase={phase} onSend={handleSend} />
        </div>
      }
      canvas={onboarded ? <CanvasPane /> : <Onboarding onComplete={() => setOnboarded(true)} />}
    />
  );
}
