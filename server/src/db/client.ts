import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Creates a pooled Postgres connection + Drizzle client (Epic 0.7).
 * `max` bounds the pool size — kept modest since this runs inside a
 * Vercel Function, where each warm instance holds its own pool and
 * connections are a shared, limited resource across concurrent instances.
 */
export function createDbClient(databaseUrl: string, opts: { max?: number } = {}): Database {
  const sql = postgres(databaseUrl, { max: opts.max ?? 5 });
  return drizzle(sql, { schema });
}
