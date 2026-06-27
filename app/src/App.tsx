import { useEffect, useState } from 'react';
import { color, gradient } from '@forge/shared';
import { Button, Card, Pill } from '@forge/shared/ui';

type Health = { status: string; env: string } | null;

/**
 * Foundation landing screen. Proves the full stack is wired: React + tokens on
 * the front, Fastify health endpoint on the back, shared package across both.
 * The real two-pane shell lands in Epic 1 (#13).
 */
export function App() {
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/health')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <main
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          <span
            style={{
              background: gradient.signal,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Forge
          </span>{' '}
          <span style={{ color: color.slate[300], fontWeight: 400 }}>that idea</span>
        </h1>
        <p style={{ marginTop: 12, color: color.slate[400] }}>
          {error
            ? 'server: unreachable'
            : health
              ? `server: ${health.status} · ${health.env}`
              : 'connecting…'}
        </p>

        <Card
          header={
            <>
              <span>Design system</span>
              <Pill tone="signal">primitives</Pill>
            </>
          }
          style={{ marginTop: 32, maxWidth: 360, textAlign: 'left' }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="primary">Forge it</Button>
            <Button variant="secondary">Refine</Button>
            <Button variant="ghost">Skip</Button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Pill tone="success">build</Pill>
            <Pill tone="warning">planning</Pill>
            <Pill>onboarding</Pill>
          </div>
        </Card>
      </div>
    </main>
  );
}
