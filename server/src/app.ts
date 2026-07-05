import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { loadEnv, type Env } from './env.js';
import { type OnboardingStore, createInMemoryOnboardingStore } from './onboarding-store.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';

export interface BuildAppDeps {
  /** Onboarding persistence (Epic 1.4). Defaults to in-memory; swap for DB-backed with #7/#8. */
  onboardingStore?: OnboardingStore;
}

/**
 * Builds the Fastify instance. Kept separate from `index.ts` so tests can spin
 * up the app without binding a port (Epic 0.6 health check, future routes).
 */
export function buildApp(env: Env = loadEnv(), deps: BuildAppDeps = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            }
          : undefined,
    },
  });

  app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });

  // Deploy skeleton health check (Epic 0.6). Reports liveness only — no secrets.
  app.get('/health', async () => ({
    status: 'ok',
    service: 'forge-server',
    env: env.NODE_ENV,
    uptime: process.uptime(),
  }));

  // Onboarding schema + persistence (Epic 1.4).
  registerOnboardingRoutes(app, deps.onboardingStore ?? createInMemoryOnboardingStore());

  return app;
}
