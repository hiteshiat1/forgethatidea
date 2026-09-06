import { describe, expect, it, vi } from 'vitest';
import { emitAnalyticsEvent } from './analytics.js';

describe('emitAnalyticsEvent (#42)', () => {
  it('logs a phase_entered event with a marker field and event type in the message', () => {
    const logger = { info: vi.fn() };

    emitAnalyticsEvent(logger, { type: 'phase_entered', sessionId: 'session-1', phase: 'sources' });

    expect(logger.info).toHaveBeenCalledWith(
      { analytics_event: true, type: 'phase_entered', sessionId: 'session-1', phase: 'sources' },
      'analytics.phase_entered',
    );
  });

  it('logs a refinement_used event with round/limit', () => {
    const logger = { info: vi.fn() };

    emitAnalyticsEvent(logger, {
      type: 'refinement_used',
      sessionId: 'session-1',
      kind: 'app',
      round: 1,
      limit: 3,
    });

    expect(logger.info).toHaveBeenCalledWith(
      {
        analytics_event: true,
        type: 'refinement_used',
        sessionId: 'session-1',
        kind: 'app',
        round: 1,
        limit: 3,
      },
      'analytics.refinement_used',
    );
  });

  it('logs a session_converted event', () => {
    const logger = { info: vi.fn() };

    emitAnalyticsEvent(logger, { type: 'session_converted', sessionId: 'session-1' });

    expect(logger.info).toHaveBeenCalledWith(
      { analytics_event: true, type: 'session_converted', sessionId: 'session-1' },
      'analytics.session_converted',
    );
  });

  it('never includes anything beyond sessionId, event-specific structural fields, and the type', () => {
    const logger = { info: vi.fn() };

    emitAnalyticsEvent(logger, {
      type: 'phase_entered',
      sessionId: 'session-1',
      phase: 'onboarding',
    });

    const [payload] = logger.info.mock.calls[0]!;
    expect(Object.keys(payload).sort()).toEqual(['analytics_event', 'phase', 'sessionId', 'type']);
  });
});
