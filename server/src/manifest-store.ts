import { eq, desc } from 'drizzle-orm';
import type { Database } from './db/client.js';
import { manifests } from './db/schema.js';
import type { BuildManifest } from '@forge/shared';

export interface ManifestVersion {
  id: string;
  sessionId: string;
  version: number;
  data: BuildManifest;
  createdAt: Date;
}

/**
 * Persistence seam for the build manifest (Epic 2.6). Every save is a new,
 * immutable, monotonically-versioned row — never an update-in-place. That
 * gives "concurrent writes last-write-wins with audit" for free: the latest
 * version is whichever write committed last (readers always see current
 * state), and every prior version stays queryable as the audit trail.
 * Mirrors the SessionStore/AuthStore pattern (interface + swappable impl).
 */
export interface ManifestStore {
  getLatest(sessionId: string): Promise<ManifestVersion | null>;
  save(sessionId: string, data: BuildManifest): Promise<ManifestVersion>;
  listVersions(sessionId: string): Promise<ManifestVersion[]>;
}

export function createDbManifestStore(db: Database): ManifestStore {
  return {
    async getLatest(sessionId) {
      const [row] = await db
        .select()
        .from(manifests)
        .where(eq(manifests.sessionId, sessionId))
        .orderBy(desc(manifests.version))
        .limit(1);
      return (row as ManifestVersion) ?? null;
    },

    async save(sessionId, data) {
      const latest = await this.getLatest(sessionId);
      const version = (latest?.version ?? 0) + 1;
      const [row] = await db.insert(manifests).values({ sessionId, version, data }).returning();
      if (!row) throw new Error('failed to save manifest');
      return row as ManifestVersion;
    },

    async listVersions(sessionId) {
      const rows = await db
        .select()
        .from(manifests)
        .where(eq(manifests.sessionId, sessionId))
        .orderBy(manifests.version);
      return rows as ManifestVersion[];
    },
  };
}

/** In-memory implementation for tests and dev-without-a-database. */
export function createInMemoryManifestStore(): ManifestStore {
  const bySession = new Map<string, ManifestVersion[]>();
  let nextId = 1;

  return {
    async getLatest(sessionId) {
      const versions = bySession.get(sessionId);
      if (!versions || versions.length === 0) return null;
      return versions[versions.length - 1]!;
    },

    async save(sessionId, data) {
      const versions = bySession.get(sessionId) ?? [];
      const version = versions.length + 1;
      const record: ManifestVersion = {
        id: `manifest-${nextId++}`,
        sessionId,
        version,
        data,
        createdAt: new Date(),
      };
      bySession.set(sessionId, [...versions, record]);
      return record;
    },

    async listVersions(sessionId) {
      return bySession.get(sessionId) ?? [];
    },
  };
}
