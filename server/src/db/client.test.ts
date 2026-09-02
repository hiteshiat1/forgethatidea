import { describe, it, expect, vi } from 'vitest';

vi.mock('postgres', () => ({
  default: vi.fn(() => ({ options: {} })),
}));
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn((sql: unknown, opts: unknown) => ({ sql, opts })),
}));

describe('createDbClient', () => {
  it('creates a postgres connection with a bounded pool size', async () => {
    const postgres = (await import('postgres')).default;
    const { createDbClient } = await import('./client.js');

    createDbClient('postgres://user:pass@localhost:5432/db');

    expect(postgres).toHaveBeenCalledWith('postgres://user:pass@localhost:5432/db', { max: 5 });
  });

  it('respects a custom max pool size', async () => {
    const postgres = (await import('postgres')).default;
    const { createDbClient } = await import('./client.js');

    createDbClient('postgres://user:pass@localhost:5432/db', { max: 20 });

    expect(postgres).toHaveBeenCalledWith('postgres://user:pass@localhost:5432/db', { max: 20 });
  });
});
