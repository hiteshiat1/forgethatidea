import { describe, it, expect } from 'vitest';
import { checkGate, type SessionCard } from './phase-gates.js';

const lockedCard = (type: SessionCard['type']): SessionCard => ({
  id: `${type}-1`,
  type,
  status: 'locked',
});

describe('checkGate', () => {
  it('has no gate for phases that do not require one (passes trivially)', () => {
    expect(checkGate('sources', [])).toMatchObject({ passed: true });
    expect(checkGate('brainstorm', [])).toMatchObject({ passed: true });
  });

  it('fails the build gate when no cards exist', () => {
    const result = checkGate('build', []);
    expect(result.passed).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining(['options', 'architecture', 'cost', 'marketing']),
    );
  });

  it('fails the build gate when some required card types are missing', () => {
    const result = checkGate('build', [lockedCard('options'), lockedCard('cost')]);
    expect(result.passed).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['architecture', 'marketing']));
    expect(result.missing).not.toEqual(expect.arrayContaining(['options', 'cost']));
  });

  it('fails the build gate when a required card exists but is not locked', () => {
    const cards: SessionCard[] = [
      lockedCard('options'),
      lockedCard('architecture'),
      { id: 'cost-1', type: 'cost', status: 'draft' },
      lockedCard('marketing'),
    ];
    const result = checkGate('build', cards);
    expect(result.passed).toBe(false);
    expect(result.missing).toEqual(['cost']);
  });

  it('passes the build gate when all four required cards are locked', () => {
    const cards: SessionCard[] = [
      lockedCard('options'),
      lockedCard('architecture'),
      lockedCard('cost'),
      lockedCard('marketing'),
    ];
    const result = checkGate('build', cards);
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it('ignores extra unrelated cards when evaluating the build gate', () => {
    const cards: SessionCard[] = [
      lockedCard('options'),
      lockedCard('architecture'),
      lockedCard('cost'),
      lockedCard('marketing'),
      { id: 'extra-1', type: 'options', status: 'draft' },
    ];
    expect(checkGate('build', cards)).toEqual({ passed: true, missing: [] });
  });
});
