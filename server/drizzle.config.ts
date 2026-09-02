import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config (Epic 0.7). Reads DATABASE_URL directly from
 * process.env rather than server/src/env.ts — drizzle-kit runs as a
 * standalone CLI outside the Fastify app, before/without loadEnv()'s
 * production-mode validation.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
