import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';

/**
 * Baseline schema (Epic 0.7): users, sessions, manifests, artifacts.
 * This is the database for Forge itself — not for the mocked apps it
 * generates (see architecture.md § 4.1).
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
