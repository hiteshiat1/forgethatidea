export interface CostGuardStore {
  recordSpend(sessionId: string, userId: string, costCents: number): Promise<void>;
  getSessionSpendCents(sessionId: string): Promise<number>;
  /** Spend for the current UTC day. Resets naturally as the day rolls over. */
  getUserDailySpendCents(userId: string): Promise<number>;
}

function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** In-memory implementation for tests and dev-without-a-database. */
export function createInMemoryCostGuardStore(): CostGuardStore {
  const sessionSpend = new Map<string, number>();
  const userDailySpend = new Map<string, number>(); // `${userId}:${utcDayKey}` -> cents

  return {
    async recordSpend(sessionId, userId, costCents) {
      sessionSpend.set(sessionId, (sessionSpend.get(sessionId) ?? 0) + costCents);
      const key = `${userId}:${utcDayKey()}`;
      userDailySpend.set(key, (userDailySpend.get(key) ?? 0) + costCents);
    },

    async getSessionSpendCents(sessionId) {
      return sessionSpend.get(sessionId) ?? 0;
    },

    async getUserDailySpendCents(userId) {
      return userDailySpend.get(`${userId}:${utcDayKey()}`) ?? 0;
    },
  };
}

export type CostCapReason = 'session_cap_exceeded' | 'user_daily_cap_exceeded';

export class CostCapExceededError extends Error {
  readonly reason: CostCapReason;
  readonly spendCents: number;
  readonly capCents: number;

  constructor(reason: CostCapReason, spendCents: number, capCents: number) {
    super(
      reason === 'session_cap_exceeded'
        ? `Session cost cap exceeded: ${spendCents}c spent, cap is ${capCents}c.`
        : `Daily cost cap exceeded for this user: ${spendCents}c spent, cap is ${capCents}c.`,
    );
    this.name = 'CostCapExceededError';
    this.reason = reason;
    this.spendCents = spendCents;
    this.capCents = capCents;
  }
}

export interface CostGuardLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface CostGuardDeps {
  store: CostGuardStore;
  sessionCapCents: number;
  userDailyCapCents: number;
  /** Fraction of a cap (0-1) at which to soft-warn before the hard stop. */
  warnRatio: number;
  logger: CostGuardLogger;
}

export interface CostGuardIdentity {
  sessionId: string;
  userId: string;
}

/**
 * Per-session and per-user daily cost guardrails (Epic 0.11). Sits in front
 * of the model router: call `checkBeforeCall` before dispatching a request
 * and `recordUsage` with the router's normalized `costCents` afterward.
 * Soft-warns via the logger as spend crosses `warnRatio` of a cap, then
 * hard-stops (throws `CostCapExceededError`) once a cap is reached.
 */
export function createCostGuard(deps: CostGuardDeps) {
  const { store, sessionCapCents, userDailyCapCents, warnRatio, logger } = deps;

  async function checkBeforeCall({ sessionId, userId }: CostGuardIdentity): Promise<void> {
    const [sessionSpend, userDailySpend] = await Promise.all([
      store.getSessionSpendCents(sessionId),
      store.getUserDailySpendCents(userId),
    ]);

    if (sessionSpend >= sessionCapCents) {
      throw new CostCapExceededError('session_cap_exceeded', sessionSpend, sessionCapCents);
    }
    if (userDailySpend >= userDailyCapCents) {
      throw new CostCapExceededError('user_daily_cap_exceeded', userDailySpend, userDailyCapCents);
    }

    if (sessionSpend >= sessionCapCents * warnRatio) {
      logger.warn(
        { sessionId, userId, sessionSpend, sessionCapCents },
        'session cost is approaching its cap',
      );
    }
    if (userDailySpend >= userDailyCapCents * warnRatio) {
      logger.warn(
        { sessionId, userId, userDailySpend, userDailyCapCents },
        'user daily cost is approaching its cap',
      );
    }
  }

  async function recordUsage(
    { sessionId, userId }: CostGuardIdentity,
    costCents: number,
  ): Promise<void> {
    await store.recordSpend(sessionId, userId, costCents);
  }

  return { checkBeforeCall, recordUsage };
}
