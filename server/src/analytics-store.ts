import { asc } from 'drizzle-orm';
import type { Database } from './db/client.js';
import { analyticsEvents } from './db/schema.js';
import type { AnalyticsLogger } from './analytics.js';

export interface AnalyticsEventRecord {
  id: string;
  type: string;
  sessionId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Durable analytics event store (Epic 5.11) — a persistence seam alongside
 * the Pino log line every event already gets, following the same
 * interface + swappable-implementation pattern as SessionStore/ArtifactStore.
 */
export interface AnalyticsStore {
  record(event: Record<string, unknown>): Promise<void>;
  listAll(): Promise<AnalyticsEventRecord[]>;
}

export function createDbAnalyticsStore(db: Database): AnalyticsStore {
  return {
    async record(event) {
      const { type, sessionId, ...rest } = event as { type: string; sessionId: string };
      await db.insert(analyticsEvents).values({ type, sessionId, payload: rest });
    },

    async listAll() {
      const rows = await db.select().from(analyticsEvents).orderBy(asc(analyticsEvents.createdAt));
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        sessionId: row.sessionId,
        payload: row.payload as Record<string, unknown>,
        createdAt: row.createdAt,
      }));
    },
  };
}

export function createInMemoryAnalyticsStore(): AnalyticsStore {
  const rows: AnalyticsEventRecord[] = [];
  let nextId = 1;

  return {
    async record(event) {
      const { type, sessionId, ...rest } = event as { type: string; sessionId: string };
      rows.push({
        id: `event-${nextId++}`,
        type,
        sessionId,
        payload: rest,
        createdAt: new Date(),
      });
    },

    async listAll() {
      return [...rows];
    },
  };
}

/**
 * Wraps a base AnalyticsLogger (Pino, normally) with durable persistence to
 * an AnalyticsStore — same `.info()` call signature every existing route/
 * orchestrator already uses, so this is a drop-in replacement for `app.log`
 * at the single construction site in build-app.ts rather than a change to
 * every call site. Persists first, then always forwards to the base logger
 * so operational log-tailing keeps working unchanged. Silently ignores any
 * object without `analytics_event: true` — this logger is also handed
 * general request logs in some call sites (`app.log` is Fastify's full
 * logger), and only structured analytics events belong in the durable
 * store.
 */
export function createPersistingAnalyticsLogger(
  store: AnalyticsStore,
  baseLogger: AnalyticsLogger,
): AnalyticsLogger {
  return {
    info(obj, msg) {
      if (obj && (obj as Record<string, unknown>).analytics_event === true) {
        void store.record(obj as Record<string, unknown>);
      }
      baseLogger.info(obj, msg);
    },
  };
}

export interface RefinementFunnelReport {
  /** Count of sessions, keyed by how many rounds they'd used at each refinement_used event, per stream. */
  roundsUsedDistribution: {
    app: Record<number, number>;
    marketing: Record<number, number>;
  };
  /** Distinct sessions with a gate_shown event, over distinct sessions seen at all (any event type). */
  gateHitRate: number;
  /** Distinct gated sessions with a later app_exported{fromGate:true}, over distinct gated sessions. */
  gateToExportRate: number;
}

/**
 * Computes the refinement funnel metrics (Epic 5.11) directly from the
 * durable event log — "queryable dashboard" without a separate service:
 * this function is the queryable surface, callable from a script, test, or
 * a future admin route. No gate→pay metric: no real billing/upgrade path
 * exists yet (Epic 9/11, #92 deferred), so there's no real conversion event
 * to compute a rate from — inventing one would be a misleading number.
 */
export async function queryRefinementFunnel(
  store: AnalyticsStore,
): Promise<RefinementFunnelReport> {
  const events = await store.listAll();

  const roundsUsedDistribution: RefinementFunnelReport['roundsUsedDistribution'] = {
    app: {},
    marketing: {},
  };
  const allSessions = new Set<string>();
  const gatedSessions = new Set<string>();
  const exportedFromGateSessions = new Set<string>();

  for (const event of events) {
    allSessions.add(event.sessionId);

    if (event.type === 'refinement_used') {
      const kind = event.payload.kind as 'app' | 'marketing';
      const round = event.payload.round as number;
      roundsUsedDistribution[kind][round] = (roundsUsedDistribution[kind][round] ?? 0) + 1;
    }

    if (event.type === 'gate_shown') {
      gatedSessions.add(event.sessionId);
    }

    if (event.type === 'app_exported' && event.payload.fromGate === true) {
      exportedFromGateSessions.add(event.sessionId);
    }
  }

  return {
    roundsUsedDistribution,
    gateHitRate: allSessions.size > 0 ? gatedSessions.size / allSessions.size : 0,
    gateToExportRate:
      gatedSessions.size > 0
        ? [...exportedFromGateSessions].filter((s) => gatedSessions.has(s)).length /
          gatedSessions.size
        : 0,
  };
}

export interface BuildFailureReport {
  /** Failure counts keyed by archetype (Epic 4.22's "rates by archetype") — 'unknown' when the archetype was never determined (spec_compile_failed). */
  failuresByArchetype: Record<string, number>;
  /** Failure counts keyed by cause — "common validation errors" per the issue, at the granularity the typed BuildFailedEvent causes already carry. */
  failuresByCause: Record<string, number>;
  /** Successful builds that needed zero repair rounds, over all successful builds — "repair-loop success rate". */
  cleanFirstTryRate: number;
  /** Overall build_failed events over all build attempts (succeeded + failed) — the top-line quality number for a "weekly quality report". */
  failureRate: number;
  totalSucceeded: number;
  totalFailed: number;
}

/**
 * Computes build-failure/quality metrics (Epic 4.22) directly from the
 * durable event log, mirroring queryRefinementFunnel's shape — the
 * queryable surface for a script, test, or future admin route, rather than
 * a separate dashboard service. Every build attempt emits exactly one of
 * build_succeeded/build_failed (build-orchestrator.ts), so counting each
 * event type once gives an exact attempt count with no double-counting or
 * inference needed.
 */
export async function queryBuildFailureReport(store: AnalyticsStore): Promise<BuildFailureReport> {
  const events = await store.listAll();

  const failuresByArchetype: Record<string, number> = {};
  const failuresByCause: Record<string, number> = {};
  let totalSucceeded = 0;
  let totalFailed = 0;
  let cleanFirstTrySucceeded = 0;

  for (const event of events) {
    if (event.type === 'build_failed') {
      totalFailed++;
      const archetype = event.payload.archetype as string;
      const cause = event.payload.cause as string;
      failuresByArchetype[archetype] = (failuresByArchetype[archetype] ?? 0) + 1;
      failuresByCause[cause] = (failuresByCause[cause] ?? 0) + 1;
    }

    if (event.type === 'build_succeeded') {
      totalSucceeded++;
      if (event.payload.repairRounds === 0) {
        cleanFirstTrySucceeded++;
      }
    }
  }

  const totalAttempts = totalSucceeded + totalFailed;

  return {
    failuresByArchetype,
    failuresByCause,
    cleanFirstTryRate: totalSucceeded > 0 ? cleanFirstTrySucceeded / totalSucceeded : 0,
    failureRate: totalAttempts > 0 ? totalFailed / totalAttempts : 0,
    totalSucceeded,
    totalFailed,
  };
}
