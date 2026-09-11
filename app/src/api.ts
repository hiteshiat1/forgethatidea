import type { Phase } from '@forge/shared';
import type { TurnEvent } from './turn-events.js';

/**
 * Typed fetch wrappers for the real backend (Epic 0.8/1.10/4). Every call
 * sets `credentials: 'include'` since auth is an httpOnly session cookie
 * (routes/auth.ts), not a bearer token — the browser must be told to send
 * it on same-origin requests.
 */

export interface AuthUser {
  id: string;
  email: string;
}

export interface RefinementLimits {
  app: number;
  marketing: number;
}

export interface ApiSession {
  id: string;
  userId: string | null;
  phase: Phase;
  activeAppVersion: number | null;
  appRefinementRounds: number;
  marketingRefinementRounds: number;
  refinementLimits: RefinementLimits;
}

export type ApiError = { error: string; [key: string]: unknown };

async function parseJsonOrError<T>(
  res: Response,
): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const body = await res.json().catch(() => ({ error: 'invalid_response' }));
  if (!res.ok) {
    return { ok: false, error: body as ApiError };
  }
  return { ok: true, data: body as T };
}

export async function signup(email: string, password: string) {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseJsonOrError<AuthUser>(res);
}

export async function signin(email: string, password: string) {
  const res = await fetch('/api/auth/signin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseJsonOrError<AuthUser>(res);
}

export async function getLatestSession() {
  const res = await fetch('/api/sessions/latest', { credentials: 'include' });
  return parseJsonOrError<ApiSession | null>(res);
}

export async function createSession() {
  const res = await fetch('/api/sessions', { method: 'POST', credentials: 'include' });
  return parseJsonOrError<ApiSession>(res);
}

export interface BuildSuccessResponse {
  ok: true;
  code: string;
  version: number;
  repairRounds: number;
}

export type BuildResponse = BuildSuccessResponse | { ok: false; error: string; reason?: string };

export async function triggerBuild(sessionId: string): Promise<BuildResponse> {
  const res = await fetch(`/api/sessions/${sessionId}/build`, {
    method: 'POST',
    credentials: 'include',
  });
  return res.json();
}

export interface RefineAppChangeSuccess {
  ok: true;
  kind: 'change_request';
  code: string;
  version: number;
  revertedToOriginal: boolean;
  rounds: number;
}

export interface RefineAppClarificationSuccess {
  ok: true;
  kind: 'clarification';
  answer: string;
}

export type RefineAppSuccess = RefineAppChangeSuccess | RefineAppClarificationSuccess;

export interface RefineAppGateReached {
  ok: false;
  error: 'refinement_limit_reached';
  rounds?: number;
  limit?: number;
}

export type RefineAppResponse =
  | RefineAppSuccess
  | RefineAppGateReached
  | { ok: false; error: string; reason?: string };

/**
 * Applies a targeted change request to the session's active build (#76, with
 * #85/#89's round-classification and intent-parsing in front of it) —
 * distinguishes a real code edit (`change_request`) from a free answered
 * question (`clarification`) so the caller knows whether to expect new code
 * or just a reply.
 */
export function isGateReached(response: RefineAppResponse): response is RefineAppGateReached {
  return !response.ok && response.error === 'refinement_limit_reached';
}

export interface AppArtifactSuccess {
  ok: true;
  code: string;
  version: number;
}

export type AppArtifactResponse = AppArtifactSuccess | { ok: false; error: string };

/**
 * Fetches the session's existing active build (Epic 5.10) — lets a resumed
 * session (page reload after a build/refine happened in an earlier tab
 * session) re-render the app without triggering a brand new build.
 */
export async function getAppArtifact(sessionId: string): Promise<AppArtifactResponse> {
  const res = await fetch(`/api/sessions/${sessionId}/app`, { credentials: 'include' });
  return res.json();
}

export async function refineApp(
  sessionId: string,
  changeRequest: string,
): Promise<RefineAppResponse> {
  const res = await fetch(`/api/sessions/${sessionId}/refine-app`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeRequest }),
  });
  return res.json();
}

export interface SendMessageSuccess {
  ok: true;
  reply: string;
  events: TurnEvent[];
}

export type SendMessageResponse =
  | SendMessageSuccess
  | { ok: false; error: string; reason?: string };

/**
 * Sends one chat turn (Epic 2's agent orchestrator, #34) and returns the
 * agent's reply plus the ordered phase/card events from that turn (#39) —
 * the real counterpart to App.tsx's previous handleSend/handleTurnEvents([])
 * placeholder.
 */
export async function sendMessage(sessionId: string, text: string): Promise<SendMessageResponse> {
  const res = await fetch(`/api/sessions/${sessionId}/message`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}
