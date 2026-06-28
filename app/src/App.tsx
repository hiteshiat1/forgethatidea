import { useEffect, useState } from 'react';
import { color, PHASES, PHASE_LABELS } from '@forge/shared';
import { Pill } from '@forge/shared/ui';
import { AppShell } from './components/AppShell.js';
import { Onboarding } from './components/Onboarding.js';

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

/** Temporary phase-rail stand-in occupying the rail slot until Epic 1.3 (#15). */
function PhaseRailPlaceholder() {
  return (
    <div style={{ display: 'flex', gap: 8, overflow: 'hidden' }}>
      {PHASES.map((phase, i) => (
        <Pill key={phase} tone={i === 0 ? 'signal' : 'neutral'}>
          {PHASE_LABELS[phase]}
        </Pill>
      ))}
    </div>
  );
}

function PanePlaceholder({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ padding: 'var(--forge-space-6)', color: color.slate[400] }}>
      <div style={{ fontWeight: 600, color: color.slate[200] }}>{title}</div>
      <p style={{ marginTop: 8, fontSize: '0.875rem' }}>{hint}</p>
    </div>
  );
}

/**
 * App root. Renders the two-pane shell (Epic 1.1); the chat and canvas panes are
 * placeholders that later Epic 1 issues fill in.
 */
export function App() {
  return (
    <AppShell
      rail={<PhaseRailPlaceholder />}
      aside={<HealthIndicator />}
      chat={<PanePlaceholder title="Conversation" hint="Chat stream lands in #18 / #19." />}
      canvas={<Onboarding />}
    />
  );
}
