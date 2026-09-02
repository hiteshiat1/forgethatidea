import { eq, and, gt } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { users, authSessions } from '../db/schema.js';

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Persistence seam for auth (Epic 0.8) — mirrors the OnboardingStore pattern
 * (interface + swappable implementation) used elsewhere in the codebase.
 */
export interface AuthStore {
  createUser(email: string, passwordHash: string): Promise<AuthUser>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<AuthSessionRecord>;
  /** Returns the session only if its token hash matches AND it hasn't expired. */
  findValidSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

export function createDbAuthStore(db: Database): AuthStore {
  return {
    async createUser(email, passwordHash) {
      const [row] = await db
        .insert(users)
        .values({ email, passwordHash })
        .returning({ id: users.id, email: users.email, passwordHash: users.passwordHash });
      if (!row) throw new Error('failed to create user');
      return row;
    },

    async findUserByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ?? null;
    },

    async createSession(userId, tokenHash, expiresAt) {
      const [row] = await db
        .insert(authSessions)
        .values({ userId, tokenHash, expiresAt })
        .returning({
          id: authSessions.id,
          userId: authSessions.userId,
          tokenHash: authSessions.tokenHash,
          expiresAt: authSessions.expiresAt,
        });
      if (!row) throw new Error('failed to create session');
      return row;
    },

    async findValidSessionByTokenHash(tokenHash) {
      const [row] = await db
        .select()
        .from(authSessions)
        .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, new Date())))
        .limit(1);
      return row ?? null;
    },

    async deleteSession(tokenHash) {
      await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
    },
  };
}

/** In-memory implementation for tests and dev-without-a-database. */
export function createInMemoryAuthStore(): AuthStore {
  const usersById = new Map<string, AuthUser>();
  const usersByEmail = new Map<string, string>(); // email -> id
  const sessions = new Map<string, AuthSessionRecord>(); // tokenHash -> record
  let nextUserId = 1;
  let nextSessionId = 1;

  return {
    async createUser(email, passwordHash) {
      if (usersByEmail.has(email)) {
        throw new Error('email already registered');
      }
      const user: AuthUser = { id: `user-${nextUserId++}`, email, passwordHash };
      usersById.set(user.id, user);
      usersByEmail.set(email, user.id);
      return user;
    },

    async findUserByEmail(email) {
      const id = usersByEmail.get(email);
      return id ? (usersById.get(id) ?? null) : null;
    },

    async createSession(userId, tokenHash, expiresAt) {
      const session: AuthSessionRecord = {
        id: `session-${nextSessionId++}`,
        userId,
        tokenHash,
        expiresAt,
      };
      sessions.set(tokenHash, session);
      return session;
    },

    async findValidSessionByTokenHash(tokenHash) {
      const session = sessions.get(tokenHash);
      if (!session) return null;
      if (session.expiresAt.getTime() <= Date.now()) return null;
      return session;
    },

    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
  };
}
