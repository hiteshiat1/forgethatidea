import type { Phase } from '@forge/shared';

/**
 * Session analytics events (Epic 2.15): funnel signal for product learning —
 * phase reached, drop-off (inferred downstream from consecutive
 * phase_entered events per session), and refinement usage/conversions.
 *
 * Deliberately PII-free: every event carries only a `sessionId` (an opaque
 * identifier, never the user's email or any chat/manifest content) plus
 * structural facts (which phase, which refinement kind, how many rounds).
 * Emitted as structured log lines via the existing Pino logger (#10) rather
 * than to a new external analytics service — none exists in this codebase,
 * and none should be invented; the `analytics_event` marker lets whatever log
 * pipeline exists downstream filter these out for funnel analysis without
 * this module needing to know what that pipeline is.
 */
export interface PhaseEnteredEvent {
  type: 'phase_entered';
  sessionId: string;
  phase: Phase;
}

export interface RefinementUsedEvent {
  type: 'refinement_used';
  sessionId: string;
  kind: 'app' | 'marketing';
  round: number;
  limit: number;
}

export interface SessionConvertedEvent {
  type: 'session_converted';
  sessionId: string;
}

export interface AppExportedEvent {
  type: 'app_exported';
  sessionId: string;
  /** The artifact version exported (Epic 4.13/4.14) — lets export rate be tracked per build attempt, not just per session. */
  version: number;
  /** True when this export happened while the session was in a gated state (Epic 5.11's "gate→export rate") — the route sets this from the session's own round counters at export time, not from any client-supplied flag. */
  fromGate?: boolean;
}

export interface ContentScreenedEvent {
  type: 'content_screened';
  sessionId: string;
  allowed: boolean;
}

/**
 * Fires every time the refinement round-limit gate (#87) actually blocks a
 * refine-app call — a clean, certain "impression" signal since it's emitted
 * from the single 429 path, not inferred from client behavior. No paired
 * "conversion" event exists yet: the only real destination from the gate
 * today is the always-available free export, and there's no upgrade path to
 * convert into (Epic 9/11, not built) — inventing one would just be a
 * misleading metric.
 */
export interface GateShownEvent {
  type: 'gate_shown';
  sessionId: string;
  kind: 'app' | 'marketing';
  rounds: number;
  limit: number;
}

export type AnalyticsEvent =
  | PhaseEnteredEvent
  | RefinementUsedEvent
  | SessionConvertedEvent
  | AppExportedEvent
  | ContentScreenedEvent
  | GateShownEvent;

export interface AnalyticsLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
}

/** Logs one analytics event as a structured line — `analytics_event: true` marks it for downstream filtering. */
export function emitAnalyticsEvent(logger: AnalyticsLogger, event: AnalyticsEvent): void {
  logger.info({ analytics_event: true, ...event }, `analytics.${event.type}`);
}
