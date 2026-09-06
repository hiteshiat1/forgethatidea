import { describe, expect, it } from 'vitest';
import { summarizeManifest } from './manifest-summary.js';
import type { BuildManifest } from '@forge/shared';
import type { SessionCard } from './phase-gates.js';

function buildManifest(overrides: Partial<BuildManifest> = {}): BuildManifest {
  return {
    schemaVersion: 1,
    productName: 'Habit Tracker',
    icp: 'People building daily habits who want gentle accountability.',
    entities: [
      { name: 'Habit', fields: [{ name: 'title', type: 'string' }] },
      { name: 'Entry', fields: [{ name: 'completedAt', type: 'date' }] },
    ],
    screens: [
      { name: 'Dashboard', purpose: 'See today’s habits at a glance' },
      { name: 'History', purpose: 'Review past streaks' },
    ],
    roles: ['user'],
    keyActions: ['Mark a habit complete', 'Create a new habit'],
    branding: { accentColor: '#2E7D32', tone: 'calm and encouraging' },
    references: { researchCardIds: [] },
    ...overrides,
  };
}

describe('summarizeManifest (#41)', () => {
  it('returns null when there is no manifest yet', () => {
    expect(summarizeManifest(null, [])).toBeNull();
  });

  it('mentions the product name and ICP in plain language', () => {
    const summary = summarizeManifest(buildManifest(), []);
    expect(summary).toContain('Habit Tracker');
    expect(summary).toContain('People building daily habits who want gentle accountability.');
  });

  it('lists entities and screens by name', () => {
    const summary = summarizeManifest(buildManifest(), []);
    expect(summary).toContain('Habit');
    expect(summary).toContain('Entry');
    expect(summary).toContain('Dashboard');
    expect(summary).toContain('History');
  });

  it('lists key actions', () => {
    const summary = summarizeManifest(buildManifest(), []);
    expect(summary).toContain('Mark a habit complete');
    expect(summary).toContain('Create a new habit');
  });

  it('reports cost and marketing card status when present and locked', () => {
    const cards: SessionCard[] = [
      { id: 'c1', type: 'cost', status: 'locked' },
      { id: 'c2', type: 'marketing', status: 'draft' },
    ];
    const summary = summarizeManifest(buildManifest(), cards);
    expect(summary).toContain('Cost estimate: ready');
    expect(summary).toContain('Marketing plan: in progress');
  });

  it('reports cost and marketing as not started when no card of that type exists', () => {
    const summary = summarizeManifest(buildManifest(), []);
    expect(summary).toContain('Cost estimate: not started');
    expect(summary).toContain('Marketing plan: not started');
  });

  it('never fabricates specific cost figures or marketing copy', () => {
    const cards: SessionCard[] = [{ id: 'c1', type: 'cost', status: 'locked' }];
    const summary = summarizeManifest(buildManifest(), cards);
    expect(summary).not.toMatch(/\$\d/);
  });
});
