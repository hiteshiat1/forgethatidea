import { and, eq, desc } from 'drizzle-orm';
import type { Database } from './db/client.js';
import { artifacts } from './db/schema.js';

export type ArtifactType = 'app' | 'spec-pack' | 'pitch-deck' | 'financial-pack';

export interface ArtifactVersion {
  id: string;
  sessionId: string;
  type: ArtifactType;
  version: number;
  manifestId: string | null;
  content: unknown;
  storageKey: string | null;
  createdAt: Date;
}

export interface SaveArtifactInput {
  /** The manifest version this artifact was generated from (Epic 4.13 — "each build stored with manifest version link"). */
  manifestId: string | null;
  content: unknown;
}

/**
 * Persistence seam for generated artifacts (Epic 4.13) — every save is a
 * new, immutable, monotonically-versioned row scoped to (sessionId, type),
 * never an update-in-place. Mirrors ManifestStore's exact pattern: the
 * latest version is whichever write committed last, every prior version
 * stays queryable, and reverting (session-store.ts's `activeAppVersion`)
 * only repoints which version is "current" rather than deleting or
 * reordering any row here.
 */
export interface ArtifactStore {
  getLatest(sessionId: string, type: ArtifactType): Promise<ArtifactVersion | null>;
  getVersion(
    sessionId: string,
    type: ArtifactType,
    version: number,
  ): Promise<ArtifactVersion | null>;
  save(sessionId: string, type: ArtifactType, input: SaveArtifactInput): Promise<ArtifactVersion>;
  listVersions(sessionId: string, type: ArtifactType): Promise<ArtifactVersion[]>;
}

export function createDbArtifactStore(db: Database): ArtifactStore {
  return {
    async getLatest(sessionId, type) {
      const [row] = await db
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.sessionId, sessionId), eq(artifacts.type, type)))
        .orderBy(desc(artifacts.version))
        .limit(1);
      return (row as ArtifactVersion) ?? null;
    },

    async getVersion(sessionId, type, version) {
      const [row] = await db
        .select()
        .from(artifacts)
        .where(
          and(
            eq(artifacts.sessionId, sessionId),
            eq(artifacts.type, type),
            eq(artifacts.version, version),
          ),
        )
        .limit(1);
      return (row as ArtifactVersion) ?? null;
    },

    async save(sessionId, type, input) {
      const latest = await this.getLatest(sessionId, type);
      const version = (latest?.version ?? 0) + 1;
      const [row] = await db
        .insert(artifacts)
        .values({
          sessionId,
          type,
          version,
          manifestId: input.manifestId,
          content: input.content,
        })
        .returning();
      if (!row) throw new Error('failed to save artifact');
      return row as ArtifactVersion;
    },

    async listVersions(sessionId, type) {
      const rows = await db
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.sessionId, sessionId), eq(artifacts.type, type)))
        .orderBy(artifacts.version);
      return rows as ArtifactVersion[];
    },
  };
}

/** In-memory implementation for tests and dev-without-a-database. */
export function createInMemoryArtifactStore(): ArtifactStore {
  const byKey = new Map<string, ArtifactVersion[]>();
  let nextId = 1;

  function key(sessionId: string, type: ArtifactType): string {
    return `${sessionId}:${type}`;
  }

  return {
    async getLatest(sessionId, type) {
      const versions = byKey.get(key(sessionId, type));
      if (!versions || versions.length === 0) return null;
      return versions[versions.length - 1]!;
    },

    async getVersion(sessionId, type, version) {
      const versions = byKey.get(key(sessionId, type)) ?? [];
      return versions.find((v) => v.version === version) ?? null;
    },

    async save(sessionId, type, input) {
      const versions = byKey.get(key(sessionId, type)) ?? [];
      const version = versions.length + 1;
      const record: ArtifactVersion = {
        id: `artifact-${nextId++}`,
        sessionId,
        type,
        version,
        manifestId: input.manifestId,
        content: input.content,
        storageKey: null,
        createdAt: new Date(),
      };
      byKey.set(key(sessionId, type), [...versions, record]);
      return record;
    },

    async listVersions(sessionId, type) {
      return byKey.get(key(sessionId, type)) ?? [];
    },
  };
}
