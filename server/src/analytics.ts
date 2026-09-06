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

export type AnalyticsEvent = PhaseEnteredEvent | RefinementUsedEvent | SessionConvertedEvent;

export interface AnalyticsLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
}

/** Logs one analytics event as a structured line — `analytics_event: true` marks it for downstream filtering. */
export function emitAnalyticsEvent(logger: AnalyticsLogger, event: AnalyticsEvent): void {
  logger.info({ analytics_event: true, ...event }, `analytics.${event.type}`);
}
