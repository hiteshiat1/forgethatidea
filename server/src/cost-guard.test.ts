import { describe, it, expect, vi } from 'vitest';
import {
  createCostGuard,
  createInMemoryCostGuardStore,
  CostCapExceededError,
} from './cost-guard.js';

const CAPS = { sessionCapCents: 100, userDailyCapCents: 500, warnRatio: 0.8 };

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('createInMemoryCostGuardStore', () => {
  it('accumulates spend per session and per user/day independently', async () => {
    const store = createInMemoryCostGuardStore();
    await store.recordSpend('session-1', 'user-1', 30);
    await store.recordSpend('session-1', 'user-1', 20);
    await store.recordSpend('session-2', 'user-1', 10);

    expect(await store.getSessionSpendCents('session-1')).toBe(50);
    expect(await store.getSessionSpendCents('session-2')).toBe(10);
    expect(await store.getUserDailySpendCents('user-1')).toBe(60);
  });

  it('keeps different users independent', async () => {
    const store = createInMemoryCostGuardStore();
    await store.recordSpend('session-1', 'user-a', 40);
    await store.recordSpend('session-2', 'user-b', 40);

    expect(await store.getUserDailySpendCents('user-a')).toBe(40);
    expect(await store.getUserDailySpendCents('user-b')).toBe(40);
  });
});

describe('createCostGuard', () => {
  it('allows a call comfortably under both caps', async () => {
    const store = createInMemoryCostGuardStore();
    const guard = createCostGuard({ store, ...CAPS, logger: silentLogger() });

    await expect(guard.checkBeforeCall({ sessionId: 's1', userId: 'u1' })).resolves.toBeUndefined();
  });

  it('rejects a call once the session cap is already reached', async () => {
    const store = createInMemoryCostGuardStore();
    await store.recordSpend('s1', 'u1', 100);
    const guard = createCostGuard({ store, ...CAPS, logger: silentLogger() });

    await expect(guard.checkBeforeCall({ sessionId: 's1', userId: 'u1' })).rejects.toThrow(
      CostCapExceededError,
    );
  });

  it('rejects a call once the user daily cap is already reached, even under the session cap', async () => {
    const store = createInMemoryCostGuardStore();
    await store.recordSpend('s1', 'u1', 500);
    const guard = createCostGuard({ store, ...CAPS, logger: silentLogger() });

    await expect(guard.checkBeforeCall({ sessionId: 's2', userId: 'u1' })).rejects.toThrow(
      CostCapExceededError,
    );
  });

  it('includes a clear machine-readable reason on the cap error', async () => {
    const store = createInMemoryCostGuardStore();
    await store.recordSpend('s1', 'u1', 100);
    const guard = createCostGuard({ store, ...CAPS, logger: silentLogger() });

    await expect(guard.checkBeforeCall({ sessionId: 's1', userId: 'u1' })).rejects.toMatchObject({
      reason: 'session_cap_exceeded',
    });
  });

  it('soft-warns (logs) once spend crosses the warn ratio but still allows the call', async () => {
    const store = createInMemoryCostGuardStore();
    await store.recordSpend('s1', 'u1', 85); // 85% of 100 session cap
    const logger = silentLogger();
    const guard = createCostGuard({ store, ...CAPS, logger });

    await expect(guard.checkBeforeCall({ sessionId: 's1', userId: 'u1' })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', userId: 'u1' }),
      expect.stringContaining('approaching'),
    );
  });

  it('records spend after a call completes', async () => {
    const store = createInMemoryCostGuardStore();
    const guard = createCostGuard({ store, ...CAPS, logger: silentLogger() });

    await guard.recordUsage({ sessionId: 's1', userId: 'u1' }, 42);

    expect(await store.getSessionSpendCents('s1')).toBe(42);
    expect(await store.getUserDailySpendCents('u1')).toBe(42);
  });
});
