import type { Phase } from '@forge/shared';

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

export interface ApiSession {
  id: string;
  userId: string | null;
  phase: Phase;
  activeAppVersion: number | null;
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
