import { z } from 'zod';

/**
 * Environment contract (Epic 0.3). The server validates every required variable
 * at boot and fails fast with a readable message instead of crashing later deep
 * in a request. No secret values live in the repo — see `.env.example`.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Anthropic (Epic 0.9). Optional in dev/test so the server boots without it,
  // required in production.
  ANTHROPIC_API_KEY: z.string().optional(),

  // OpenAI (Epic 0.9b). Optional everywhere for now — the model router (0.9d)
  // will hard-require it in production only when a task routes to OpenAI.
  OPENAI_API_KEY: z.string().optional(),

  // Postgres (Epic 0.7). Same treatment.
  DATABASE_URL: z.string().url().optional(),

  // CORS origin for the Vite app in dev/prod.
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;

  // Production hard requirements: secrets must be present.
  if (env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
    if (!env.DATABASE_URL) missing.push('DATABASE_URL');
    if (missing.length > 0) {
      throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
    }
  }

  cached = env;
  return env;
}
