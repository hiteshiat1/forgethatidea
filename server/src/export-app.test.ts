import { describe, expect, it } from 'vitest';
import { buildExportedFile } from './export-app.js';

const CODE = 'export default function App() { return null; }';

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
