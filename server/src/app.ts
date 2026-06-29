import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { loadEnv, type Env } from './env.js';

/**
 * Builds the Fastify instance. Kept separate from `index.ts` so tests can spin
 * up the app without binding a port (Epic 0.6 health check, future routes).
 */
export function buildApp(env: Env = loadEnv()): FastifyInstance {
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

  return app;
}
