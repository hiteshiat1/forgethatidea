import { useEffect, useState } from 'react';
import { type Phase } from '@forge/shared';
import { Pill } from '@forge/shared/ui';
import { AppShell } from './components/AppShell.js';
import { AppRenderer } from './components/AppRenderer.js';
import { AuthGate } from './components/AuthGate.js';
import { BuildProgress, type BuildStage } from './components/BuildProgress.js';
import { CanvasPane } from './components/CanvasPane.js';
import { ChatInput } from './components/ChatInput.js';
import { ChatPane, type ChatMessage } from './components/ChatPane.js';
import { Onboarding } from './components/Onboarding.js';
import { PhaseRail } from './components/PhaseRail.js';
import { RefineGate } from './components/RefineGate.js';
import { StatusIndicators } from './components/StatusIndicators.js';
import { applyTurnEvents, type TurnEvent } from './turn-events.js';
import {
  getLatestSession,
  createSession,
  triggerBuild,
  sendMessage,
  refineApp,
  isGateReached,
  type AuthUser,
  type ApiSession,
} from './api.js';

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

type SessionBootstrapState =
  | { status: 'checking' }
  | { status: 'unauthenticated' }
  | { status: 'ready'; session: ApiSession };

/**
 * Session bootstrap (Epic 0.8/1.10 frontend counterpart, previously
 * nonexistent): on load, checks for an authenticated session via the real
 * httpOnly cookie the backend already issues. Anonymous -> AuthGate; once
 * authenticated, resumes the user's latest session or creates a new one.
 * Deliberately minimal — no session-switching UI, no multi-session list —
 * just enough for the rest of the app (the build route, #75) to have a
 * real session to act on.
 */
function useSessionBootstrap() {
  const [state, setState] = useState<SessionBootstrapState>({ status: 'checking' });

  async function resumeOrCreateSession() {
    const latest = await getLatestSession();
    if (latest.ok && latest.data) {
      setState({ status: 'ready', session: latest.data });
      return;
    }
    if (!latest.ok && latest.error.error !== 'unauthenticated') {
      // Any error other than "not signed in" still means we have no session
      // to act on, but leaves state as-is rather than guessing — surfaced
      // via the unauthenticated view's own retry (sign in again).
      setState({ status: 'unauthenticated' });
      return;
    }
    if (!latest.ok) {
      setState({ status: 'unauthenticated' });
      return;
    }

    const created = await createSession();
    if (created.ok) {
      setState({ status: 'ready', session: created.data });
    } else {
      setState({ status: 'unauthenticated' });
    }
  }

  useEffect(() => {
    resumeOrCreateSession();
  }, []);

  function handleAuthenticated(_user: AuthUser) {
    setState({ status: 'checking' });
    resumeOrCreateSession();
  }

  return { state, handleAuthenticated };
}

/**
 * Build trigger + progress + preview (Epic 4, wiring the generation
 * pipeline into the browser for the first time): once a session has
 * reached the `build` phase, the manifest is already frozen (#61) and a
 * build can be requested. Shows BuildProgress (#73) while in flight and
 * AppRenderer (#68) once code comes back.
 */
function BuildPanel({
  sessionId,
  onAppRoundUsed,
}: {
  sessionId: string;
  /** Bubbles the fresh round count up so the top-bar meter (#86) stays live without a full session refetch. */
  onAppRoundUsed: (rounds: number) => void;
}) {
  const [stage, setStage] = useState<BuildStage>('compiling');
  const [error, setError] = useState<string | undefined>(undefined);
  const [code, setCode] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineNote, setRefineNote] = useState<string | null>(null);
  const [gate, setGate] = useState<{ rounds: number; limit: number } | null>(null);

  async function runBuild() {
    setBuilding(true);
    setError(undefined);
    setCode(null);
    setStage('compiling');

    // The build route (#75) runs synchronously end to end server-side —
    // there's no intermediate progress event stream yet (that's #73's own
    // follow-up once streaming exists), so the stages advance optimistically
    // while the single request is in flight rather than sitting on
    // "compiling" for the whole duration.
    setStage('generating');
    const result = await triggerBuild(sessionId);
    setBuilding(false);

    if (!result.ok) {
      setStage('validating');
      setError(result.reason ?? result.error);
      return;
    }

    setStage('rendering');
    setCode(result.code);
    setStage('done');
  }

  async function runRefine(changeRequest: string) {
    setRefining(true);
    setRefineNote(null);
    const result = await refineApp(sessionId, changeRequest);
    setRefining(false);

    if (isGateReached(result)) {
      setGate({ rounds: result.rounds ?? 0, limit: result.limit ?? 0 });
      return;
    }

    if (!result.ok) {
      setRefineNote(result.reason ?? result.error);
      return;
    }

    if (result.kind === 'clarification') {
      setRefineNote(result.answer);
      return;
    }

    setCode(result.code);
    onAppRoundUsed(result.rounds);
  }

  if (code) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: 'var(--forge-space-2) var(--forge-space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--forge-space-3)',
          }}
        >
          <a
            href={`/api/sessions/${sessionId}/export`}
            download
            style={{ color: 'var(--forge-signal-amber)', fontSize: '0.9rem' }}
          >
            Download as .jsx
          </a>
          <a
            href={`/api/sessions/${sessionId}/export/summary`}
            download
            style={{ color: 'var(--forge-signal-amber)', fontSize: '0.9rem' }}
          >
            Download plan summary
          </a>
          {refining && (
            <span style={{ color: 'var(--forge-slate-300)', fontSize: '0.85rem' }}>
              Applying your change…
            </span>
          )}
          {refineNote && !refining && (
            <span style={{ color: 'var(--forge-slate-300)', fontSize: '0.85rem' }}>
              {refineNote}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AppRenderer code={code} />
        </div>
        {gate ? (
          <RefineGate sessionId={sessionId} rounds={gate.rounds} limit={gate.limit} />
        ) : (
          <ChatInput phase="refine" onSend={runRefine} disabled={refining} />
        )}
      </div>
    );
  }

  if (building || error) {
    return <BuildProgress stage={stage} error={error} onRetry={runBuild} />;
  }

  return (
    <div style={{ padding: 'var(--forge-space-6)' }}>
      <p style={{ color: 'var(--forge-slate-300)', marginBottom: 'var(--forge-space-4)' }}>
        Your plan is locked in — ready to build your prototype.
      </p>
      <button
        type="button"
        onClick={runBuild}
        style={{
          padding: 'var(--forge-space-3) var(--forge-space-6)',
          borderRadius: 'var(--forge-radius-md)',
          border: 'none',
          background: 'var(--forge-signal-amber)',
          color: 'var(--forge-ink-900)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Build my app
      </button>
    </div>
  );
}

/**
 * App root. Renders the two-pane shell (Epic 1.1); the chat and canvas panes are
 * placeholders that later Epic 1 issues fill in.
 */
export function App() {
  const { state: sessionState, handleAuthenticated } = useSessionBootstrap();
  const [onboarded, setOnboarded] = useState(false);
  const [turnState, setTurnState] = useState({
    phase: 'onboarding' as Phase,
    cardIds: [] as string[],
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  // Seed turnState.phase from the real session exactly once it becomes
  // available, then let handleTurnEvents (below, driven by real message
  // responses) own it from there — never read session.phase directly for
  // rendering, since that would go stale the instant a turn changes phase
  // without a full session refetch.
  const [phaseSeeded, setPhaseSeeded] = useState(false);
  if (sessionState.status === 'ready' && !phaseSeeded) {
    setPhaseSeeded(true);
    setTurnState((prev) => ({ ...prev, phase: sessionState.session.phase }));
  }
  const phase = turnState.phase;

  /**
   * Applies a turn's ordered events (Epic 2.12) — phase transitions and card
   * emissions — to local state in order, in the exact sequence they occurred.
   */
  function handleTurnEvents(events: TurnEvent[]) {
    setTurnState((prev) => applyTurnEvents(prev, events));
  }
  // Refinement round state (Epic 2.11, live-wired in #86): seeded once from
  // the real session (server-tracked, #38) alongside the phase, then kept
  // current locally as refine-app calls (#76/#85/#89) report fresh round
  // counts — mirrors the phaseSeeded pattern above rather than refetching
  // the whole session after every refinement.
  const [refinement, setRefinement] = useState({
    app: { rounds: 0, limit: 3 },
    marketing: { rounds: 0, limit: 3 },
  });
  if (sessionState.status === 'ready' && !phaseSeeded) {
    const { session } = sessionState;
    setRefinement({
      app: { rounds: session.appRefinementRounds, limit: session.refinementLimits.app },
      marketing: {
        rounds: session.marketingRefinementRounds,
        limit: session.refinementLimits.marketing,
      },
    });
  }

  function handleAppRoundUsed(rounds: number) {
    setRefinement((prev) => ({ ...prev, app: { ...prev.app, rounds } }));
  }

  async function handleSend(text: string) {
    if (sessionState.status !== 'ready') return;
    const sessionId = sessionState.session.id;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text }]);
    setSending(true);

    const result = await sendMessage(sessionId, text);

    setSending(false);
    if (!result.ok) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          text: "I ran into trouble sending that — let's try again.",
        },
      ]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'agent', text: result.reply },
    ]);
    handleTurnEvents(result.events);
  }

  if (sessionState.status === 'checking') {
    return null;
  }

  if (sessionState.status === 'unauthenticated') {
    return <AuthGate onAuthenticated={handleAuthenticated} />;
  }

  const sessionId = sessionState.session.id;
  const readyToBuild = phase === 'build' || phase === 'refine';

  return (
    <AppShell
      rail={<PhaseRail current={phase} />}
      aside={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--forge-space-2)' }}>
          <StatusIndicators
            app={refinement.app}
            marketing={refinement.marketing}
            entitlement="free"
          />
          <HealthIndicator />
        </div>
      }
      chat={
        <div className="chat-column">
          <ChatPane messages={messages} />
          <ChatInput phase={phase} onSend={handleSend} disabled={sending} />
        </div>
      }
      canvas={
        readyToBuild ? (
          <BuildPanel sessionId={sessionId} onAppRoundUsed={handleAppRoundUsed} />
        ) : onboarded ? (
          <CanvasPane />
        ) : (
          <Onboarding onComplete={() => setOnboarded(true)} />
        )
      }
    />
  );
}
