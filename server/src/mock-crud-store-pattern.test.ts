import { describe, expect, it } from 'vitest';
import { buildMockCrudStorePattern } from './mock-crud-store-pattern.js';
import type { ManifestEntity } from '@forge/shared';

function entities(): ManifestEntity[] {
  return [
    { name: 'Habit', fields: [{ name: 'title', type: 'string' }] },
    { name: 'Entry', fields: [{ name: 'completedAt', type: 'date' }] },
  ];
}

describe('buildMockCrudStorePattern (#71)', () => {
  it('describes a useReducer-based in-memory store', () => {
    const pattern = buildMockCrudStorePattern(entities());
    expect(pattern.toLowerCase()).toContain('usereducer');
    expect(pattern.toLowerCase()).toContain('in-memory');
  });

  it('covers full CRUD (create/read/update/delete)', () => {
    const pattern = buildMockCrudStorePattern(entities());
    expect(pattern.toLowerCase()).toContain('create');
    expect(pattern.toLowerCase()).toContain('update');
    expect(pattern.toLowerCase()).toContain('delete');
  });

  it('covers list/filter operations', () => {
    const pattern = buildMockCrudStorePattern(entities());
    expect(pattern.toLowerCase()).toContain('list');
    expect(pattern.toLowerCase()).toContain('filter');
  });

  it('mentions every entity so the pattern is applied consistently across all of them', () => {
    const pattern = buildMockCrudStorePattern(entities());
    expect(pattern).toContain('Habit');
    expect(pattern).toContain('Entry');
  });

  it('documents to the user that data resets on refresh', () => {
    const pattern = buildMockCrudStorePattern(entities());
    expect(pattern.toLowerCase()).toContain('reset');
    expect(pattern.toLowerCase()).toContain('refresh');
  });

  it('explicitly forbids persisting to localStorage/IndexedDB/network', () => {
    const pattern = buildMockCrudStorePattern(entities());
    expect(pattern.toLowerCase()).toContain('never persist');
    expect(pattern.toLowerCase()).toContain('no localstorage');
    expect(pattern.toLowerCase()).toContain('no indexeddb');
  });
});
