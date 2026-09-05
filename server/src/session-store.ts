import { eq } from 'drizzle-orm';
import type { Phase } from '@forge/shared';
import type { Database } from './db/client.js';
import { sessions } from './db/schema.js';
import type { BrainstormFindings } from './brainstorm-logic.js';
import type { SourcesIntake } from './sources-logic.js';

export interface SessionRecord {
  id: string;
  userId: string | null;
  phase: Phase;
  chat: unknown[];
  cards: unknown[];
  /** Brainstorm phase findings (Epic 2.7) — icp/coreJob/differentiator, captured incrementally. */
  brainstormFindings: BrainstormFindings;
  /** Sources/RAG intake (Epic 2.8) — competitor links/names, or an explicit decline. */
  sourcesIntake: SourcesIntake;
  /** Refinement round counters (Epic 2.11) — app and marketing tracked independently. */
  appRefinementRounds: number;
  marketingRefinementRounds: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionUpdate {
  phase?: Phase;
  chat?: unknown[];
  cards?: unknown[];
  brainstormFindings?: BrainstormFindings;
  sourcesIntake?: SourcesIntake;
  appRefinementRounds?: number;
  marketingRefinementRounds?: number;
}

/**
 * Persistence seam for the product/build session (Epic 1.10) — phase, chat
 * transcript, and canvas cards, so a refresh or a later visit resumes
 * exactly where the user left off. Mirrors the OnboardingStore/AuthStore
 * pattern (interface + swappable implementation) used elsewhere.
 */
export interface SessionStore {
  /** Creates a new session, optionally tied to an authenticated user. */
  create(userId: string | null): Promise<SessionRecord>;
  get(sessionId: string): Promise<SessionRecord | null>;
  update(sessionId: string, patch: SessionUpdate): Promise<SessionRecord | null>;
  /** All sessions for a user, most recently updated first — for resume ("continue where you left off"). */
  listByUser(userId: string): Promise<SessionRecord[]>;
}

export function createDbSessionStore(db: Database): SessionStore {
  return {
    async create(userId) {
      const [row] = await db.insert(sessions).values({ userId }).returning();
      if (!row) throw new Error('failed to create session');
      return row as SessionRecord;
    },

    async get(sessionId) {
      const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      return (row as SessionRecord) ?? null;
    },

    async update(sessionId, patch) {
      const [row] = await db
        .update(sessions)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(sessions.id, sessionId))
        .returning();
      return (row as SessionRecord) ?? null;
    },

    async listByUser(userId) {
      const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
      return (rows as SessionRecord[]).sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
    },
  };
}

/** In-memory implementation for tests and dev-without-a-database. */
export function createInMemorySessionStore(): SessionStore {
  const byId = new Map<string, SessionRecord>();
  let nextId = 1;

  return {
    async create(userId) {
      const now = new Date();
      const record: SessionRecord = {
        id: `session-${nextId++}`,
        userId,
        phase: 'onboarding',
        chat: [],
        cards: [],
        brainstormFindings: {},
        sourcesIntake: { sources: [], declined: false },
        appRefinementRounds: 0,
        marketingRefinementRounds: 0,
        createdAt: now,
        updatedAt: now,
      };
      byId.set(record.id, record);
      return record;
    },

    async get(sessionId) {
      return byId.get(sessionId) ?? null;
    },

    async update(sessionId, patch) {
      const existing = byId.get(sessionId);
      if (!existing) return null;
      const updated: SessionRecord = { ...existing, ...patch, updatedAt: new Date() };
      byId.set(sessionId, updated);
      return updated;
    },

    async listByUser(userId) {
      return Array.from(byId.values())
        .filter((s) => s.userId === userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },
  };
}
