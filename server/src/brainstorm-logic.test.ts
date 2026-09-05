import { describe, it, expect } from 'vitest';
import { checkBrainstormStoppingRule, type BrainstormFindings } from './brainstorm-logic.js';

const empty: BrainstormFindings = {};

describe('checkBrainstormStoppingRule', () => {
  it('is not satisfied and lists all three findings as missing when nothing is known', () => {
    const result = checkBrainstormStoppingRule(empty);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['icp', 'coreJob', 'differentiator']));
  });

  it('lists only the fields still missing when some findings are known', () => {
    const result = checkBrainstormStoppingRule({ icp: 'independent hairdressers' });
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(['coreJob', 'differentiator']);
  });

  it('is satisfied once all three findings are captured', () => {
    const result = checkBrainstormStoppingRule({
      icp: 'independent hairdressers',
      coreJob: 'manage their own bookings without a receptionist',
      differentiator: 'built for solo operators, not salons',
    });
    expect(result).toEqual({ satisfied: true, missing: [] });
  });

  it('treats an empty-string finding as not yet known', () => {
    const result = checkBrainstormStoppingRule({
      icp: '   ',
      coreJob: 'manage bookings',
      differentiator: 'solo-first',
    });
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(['icp']);
  });
});
