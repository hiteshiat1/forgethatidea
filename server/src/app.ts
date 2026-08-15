import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { loadEnv, type Env } from './env.js';
import { type OnboardingStore, createInMemoryOnboardingStore } from './onboarding-store.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';
import {
  createAnthropicClient,
  createSdkClient,
  type AnthropicClientDeps,
} from './anthropic-client.js';

declare module 'fastify' {
  interface FastifyInstance {
    anthropic?: ReturnType<typeof createAnthropicClient>;
  }
}

export interface BuildAppDeps {
  /** Onboarding persistence (Epic 1.4). Defaults to in-memory; swap for DB-backed with #7/#8. */
  onboardingStore?: OnboardingStore;
  /** Anthropic Messages API wrapper (Epic 0.9). Defaults to a real SDK client keyed by env. */
  anthropicClient?: ReturnType<typeof createAnthropicClient>;
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

  // Anthropic Messages API wrapper (Epic 0.9). Consumed by the agent tool-call
  // dispatch loop (#2.4) once it lands; only constructed when a key is present
  // so the server still boots without one in dev/test.
  if (deps.anthropicClient) {
    app.decorate('anthropic', deps.anthropicClient);
  } else if (env.ANTHROPIC_API_KEY) {
    const sdkClient = createSdkClient(env.ANTHROPIC_API_KEY);
    const anthropicDeps: AnthropicClientDeps = { sdkClient, logger: app.log };
    app.decorate('anthropic', createAnthropicClient(anthropicDeps));
  }

  return app;
}
