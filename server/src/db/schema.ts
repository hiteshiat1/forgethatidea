import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';

/**
 * Baseline schema (Epic 0.7): users, sessions, manifests, artifacts.
 * This is the database for Forge itself — not for the mocked apps it
 * generates (see architecture.md § 4.1).
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  /** argon2id hash (Epic 0.8) — never the plaintext password. */
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Login sessions (Epic 0.8) — deliberately separate from the `sessions`
 * table below, which is the product/build session (phase state machine).
 * A login persists across many product sessions and has its own lifecycle
 * (sign in/out, expiry), so conflating the two would tie a user's login to
 * a single build session's lifetime.
 */
export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** SHA-256 hash of the session token — the raw token lives only in the client's cookie. */
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const phaseEnum = pgEnum('phase', [
  'onboarding',
  'sources',
  'brainstorm',
  'planning',
  'build',
  'refine',
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  phase: phaseEnum('phase').notNull().default('onboarding'),
  /**
   * Chat transcript and canvas card state (Epic 1.10), so a refresh or a
   * resume restores exactly what the user left. Stored as flexible JSONB for
   * now — kept intentionally generic (array of arbitrary message/card
   * objects) since the real message and card schemas are formalized by the
   * phase state machine (#28) and manifest schema (#32). Once those land,
   * this can be tightened to a typed shape without changing the column.
   */
  chat: jsonb('chat').notNull().default([]),
  cards: jsonb('cards').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const manifests = pgTable('manifests', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  /** Monotonically increasing per session — every write is a new, immutable version. */
  version: integer('version').notNull().default(1),
  /** The manifest payload (entities, screens, roles, branding, etc.) — schema TBD by #32. */
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const artifactTypeEnum = pgEnum('artifact_type', [
  'app',
  'spec-pack',
  'pitch-deck',
  'financial-pack',
]);

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  manifestId: uuid('manifest_id').references(() => manifests.id, { onDelete: 'set null' }),
  type: artifactTypeEnum('type').notNull(),
  /** Where the artifact content lives — object storage key, not the content itself. */
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
