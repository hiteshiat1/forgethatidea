import { type OnboardingResponses } from '@forge/shared';

/**
 * Persistence seam for onboarding responses (Epic 1.4). Today this is an
 * in-memory map; once the DB (#7) and session/auth (#8) land, swap in a
 * Postgres-backed implementation keyed by the real session id — the route
 * and contract stay unchanged.
 */
export interface OnboardingStore {
  save(sessionId: string, responses: OnboardingResponses): Promise<void>;
  get(sessionId: string): Promise<OnboardingResponses | null>;
}

export function createInMemoryOnboardingStore(): OnboardingStore {
  const bySession = new Map<string, OnboardingResponses>();
  return {
    async save(sessionId, responses) {
      bySession.set(sessionId, responses);
    },
    async get(sessionId) {
      return bySession.get(sessionId) ?? null;
    },
  };
}
