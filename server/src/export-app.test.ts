import { describe, expect, it } from 'vitest';
import { buildExportedFile, buildPlanSummary } from './export-app.js';
import type { BuildManifest } from '@forge/shared';

const CODE = 'export default function App() { return null; }';

const MANIFEST: BuildManifest = {
  schemaVersion: 1,
  productName: 'HabitLoop',
  icp: 'People building a daily habit',
  entities: [
    {
      name: 'Habit',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'streak', type: 'number' },
      ],
    },
  ],
  screens: [{ name: 'Dashboard', purpose: 'See today’s habits at a glance' }],
  roles: ['Member'],
  keyActions: ['Mark a habit done for today'],
  branding: { accentColor: '#2E7D32', tone: 'Encouraging' },
  references: { researchCardIds: [] },
};

describe('buildExportedFile (#75)', () => {
  it('includes the original generated code unmodified', () => {
    const file = buildExportedFile(CODE, 'HabitLoop');
    expect(file).toContain(CODE);
  });

  it('includes a README-style comment block explaining how to run it', () => {
    const file = buildExportedFile(CODE, 'HabitLoop');
    expect(file.toLowerCase()).toContain('vite');
    expect(file.toLowerCase()).toContain('next');
    expect(file).toContain('HabitLoop');
  });

  it('the comment block is a real JS comment, not executable code', () => {
    const file = buildExportedFile(CODE, 'HabitLoop');
    expect(file.trimStart()).toMatch(/^\/\*/);
  });

  it('mentions this is a mocked prototype, not production-ready code', () => {
    const file = buildExportedFile(CODE, 'HabitLoop');
    expect(file.toLowerCase()).toContain('mock');
  });
});

describe('buildPlanSummary (#93)', () => {
  it('includes the product name and ICP', () => {
    const summary = buildPlanSummary(MANIFEST);
    expect(summary).toContain('HabitLoop');
    expect(summary).toContain('People building a daily habit');
  });

  it('lists every entity with its field names', () => {
    const summary = buildPlanSummary(MANIFEST);
    expect(summary).toContain('Habit');
    expect(summary).toContain('title');
    expect(summary).toContain('streak');
  });

  it('lists every screen with its purpose', () => {
    const summary = buildPlanSummary(MANIFEST);
    expect(summary).toContain('Dashboard');
    expect(summary).toContain('See today’s habits at a glance');
  });

  it('lists roles and key actions', () => {
    const summary = buildPlanSummary(MANIFEST);
    expect(summary).toContain('Member');
    expect(summary).toContain('Mark a habit done for today');
  });

  it('is clearly branded as coming from Forge', () => {
    const summary = buildPlanSummary(MANIFEST);
    expect(summary.toLowerCase()).toContain('forgethatidea.com');
  });
});
