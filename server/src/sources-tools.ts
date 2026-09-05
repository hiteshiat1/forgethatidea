import { classifySource } from './sources-logic.js';
import type { SessionStore } from './session-store.js';

export interface SourcesToolsDeps {
  store: SessionStore;
  sessionId: string;
}

export type SourcesToolResult =
  | { ok: true }
  | { ok: false; error: 'session_not_found' }
  | { ok: false; error: 'invalid_input' };

function isRecordSourceInput(input: unknown): input is { input: string } {
  return (
    typeof input === 'object' &&
    input !== null &&
    'input' in input &&
    typeof (input as { input: unknown }).input === 'string' &&
    (input as { input: string }).input.trim().length > 0
  );
}

/**
 * Sources/RAG intake tools (Epic 2.8): `record_source` and `decline_sources`,
 * the agent's interface to sources-logic.ts during the conversation.
 * Registered in the tool dispatcher (#31) — mirrors manifest-tools.ts's
 * shape (each tool takes `unknown`, validates, returns a safe result).
 */
export function createSourcesTools(deps: SourcesToolsDeps) {
  const { store, sessionId } = deps;

  async function record_source(rawInput: unknown): Promise<SourcesToolResult> {
    if (!isRecordSourceInput(rawInput)) {
      return { ok: false, error: 'invalid_input' };
    }

    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    const source = classifySource(rawInput.input);
    await store.update(sessionId, {
      sourcesIntake: {
        sources: [...session.sourcesIntake.sources, source],
        declined: session.sourcesIntake.declined,
      },
    });

    return { ok: true };
  }

  async function decline_sources(_rawInput: unknown): Promise<SourcesToolResult> {
    const session = await store.get(sessionId);
    if (!session) {
      return { ok: false, error: 'session_not_found' };
    }

    await store.update(sessionId, {
      sourcesIntake: { sources: session.sourcesIntake.sources, declined: true },
    });

    return { ok: true };
  }

  return { record_source, decline_sources };
}
