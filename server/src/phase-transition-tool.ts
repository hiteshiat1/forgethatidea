import { PHASES, type Phase } from '@forge/shared';
import { transition, IllegalTransitionError } from './phase-machine.js';
import { checkGate, type SessionCard } from './phase-gates.js';
import type { SessionStore } from './session-store.js';
import type { TurnEvent } from './turn-events.js';

export interface PhaseTransitionToolDeps {
  store: SessionStore;
  sessionId: string;
  /** Called with a phase_changed event immediately after a successful transition. */
  onEvent: (event: TurnEvent) => void;
}

export type PhaseTransitionResult =
  | { ok: true; phase: Phase }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'invalid_input' }
  | { ok: false; error: 'illegal_phase_transition'; from: Phase; to: Phase }
  | { ok: false; error: 'phase_gate_not_satisfied'; to: Phase; missing: string[] };

function isTransitionInput(input: unknown): input is { to: Phase } {
  return (
    typeof input === 'object' &&
    input !== null &&
    'to' in input &&
    typeof (input as { to: unknown }).to === 'string' &&
    (PHASES as readonly string[]).includes((input as { to: string }).to)
  );
}

/**
 * `transition_phase` tool (Epic 2.12): the agent's only way to actually
 * advance the session's phase during conversation. Applies the same
 * state-machine (#28) + gate (#29) checks the HTTP PATCH route uses, and —
 * unlike that route — reports a successful transition as a `phase_changed`
 * TurnEvent via `onEvent`, which the orchestrator collects into the ordered
 * event log the turn response returns to the client.
 */
export function createPhaseTransitionTool(deps: PhaseTransitionToolDeps) {
  const { store, sessionId, onEvent } = deps;

  async function transition_phase(rawInput: unknown): Promise<PhaseTransitionResult> {
    if (!isTransitionInput(rawInput)) {
      return { ok: false, error: 'invalid_input' };
    }

    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    try {
      transition(session.phase, rawInput.to);
    } catch (err) {
      if (err instanceof IllegalTransitionError) {
        return { ok: false, error: 'illegal_phase_transition', from: err.from, to: err.to };
      }
      throw err;
    }

    const gate = checkGate(rawInput.to, session.cards as SessionCard[]);
    if (!gate.passed) {
      return {
        ok: false,
        error: 'phase_gate_not_satisfied',
        to: rawInput.to,
        missing: gate.missing,
      };
    }

    await store.update(sessionId, { phase: rawInput.to });
    onEvent({ type: 'phase_changed', from: session.phase, to: rawInput.to });

    return { ok: true, phase: rawInput.to };
  }

  return { transition_phase };
}
