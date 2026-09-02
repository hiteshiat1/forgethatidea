import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { loadEnv, type Env } from './env.js';
import { type OnboardingStore, createInMemoryOnboardingStore } from './onboarding-store.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';
import { type AuthStore, createDbAuthStore, createInMemoryAuthStore } from './auth/auth-store.js';
import { registerAuthRoutes } from './routes/auth.js';
import {
  type SessionStore,
  createDbSessionStore,
  createInMemorySessionStore,
} from './session-store.js';
import { registerSessionRoutes } from './routes/session.js';
import {
  createCostGuard,
  createInMemoryCostGuardStore,
  CostCapExceededError,
  type CostGuardStore,
} from './cost-guard.js';
import {
  createAnthropicClient,
  createSdkClient as createAnthropicSdkClient,
  type AnthropicClientDeps,
} from './anthropic-client.js';
import {
  createOpenAiClient,
  createSdkClient as createOpenAiSdkClient,
  type OpenAiClientDeps,
} from './openai-client.js';
import {
  createGeminiClient,
  createSdkClient as createGeminiSdkClient,
  type GeminiClientDeps,
} from './gemini-client.js';
import {
  createModelRouter,
  createUnconfiguredProviderClient,
  DEFAULT_TASK_REGISTRY,
  DEFAULT_PRICING,
  DEFAULT_FALLBACK_MODEL,
} from './model-router.js';
import { createDbClient, type Database } from './db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    anthropic?: ReturnType<typeof createAnthropicClient>;
    openai?: ReturnType<typeof createOpenAiClient>;
    gemini?: ReturnType<typeof createGeminiClient>;
    modelRouter: ReturnType<typeof createModelRouter>;
    db?: Database;
    costGuard: ReturnType<typeof createCostGuard>;
  }
}

export interface BuildAppDeps {
  /** Onboarding persistence (Epic 1.4). Defaults to in-memory; swap for DB-backed with #7/#8. */
  onboardingStore?: OnboardingStore;
  /** Anthropic Messages API wrapper (Epic 0.9). Defaults to a real SDK client keyed by env. */
  anthropicClient?: ReturnType<typeof createAnthropicClient>;
  /** OpenAI API wrapper (Epic 0.9b). Defaults to a real SDK client keyed by env. */
  openAiClient?: ReturnType<typeof createOpenAiClient>;
  /** Gemini API wrapper (Epic 0.9c). Defaults to a real SDK client keyed by env. */
  geminiClient?: ReturnType<typeof createGeminiClient>;
  /** Multi-provider model router (Epic 0.9d). Defaults to real clients wired from env. */
  modelRouter?: ReturnType<typeof createModelRouter>;
  /** Postgres/Drizzle client (Epic 0.7). Defaults to a real pooled client keyed by DATABASE_URL. */
  db?: Database;
  /** Auth persistence (Epic 0.8). Defaults to DB-backed when `db` is available, else in-memory. */
  authStore?: AuthStore;
  /** Product/build session persistence (Epic 1.10). Defaults to DB-backed when `db` is available, else in-memory. */
  sessionStore?: SessionStore;
  /** Cost guardrail spend tracking (Epic 0.11). Defaults to in-memory; swap for DB-backed once persisted spend history is needed. */
  costGuardStore?: CostGuardStore;
  /** Full cost guardrail (Epic 0.11). Defaults to one built from env caps + costGuardStore. */
  costGuard?: ReturnType<typeof createCostGuard>;
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
    // Observability (Epic 0.10): correlate a request end-to-end. Reuse an
    // incoming x-request-id (from a client or upstream proxy) when present,
    // so a single trace ID can be followed across service boundaries.
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    },
  });

  app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  app.register(cookie);

  // Echo the correlated request ID back so callers/proxies can log against it.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Structured error capture with context (Epic 0.10). Logs every error with
  // its request ID, method, and URL; hides raw error messages in production
  // so internals never leak to a client, while dev/test see the real message.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    request.log.error(
      { err: error, reqId: request.id, method: request.method, url: request.url },
      'request failed',
    );

    // Cost guardrails (Epic 0.11): a clear, machine-readable 429 so callers
    // can distinguish "capped" from a generic server error.
    if (error instanceof CostCapExceededError) {
      return reply.status(429).send({
        error: error.reason,
        message: error.message,
        spendCents: error.spendCents,
        capCents: error.capCents,
      });
    }

    if (statusCode >= 500) {
      return reply.status(statusCode).send({
        error: 'internal_server_error',
        message: env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : error.message,
        reqId: request.id,
      });
    }

    return reply.status(statusCode).send({ error: error.name, message: error.message });
  });

  // Deploy skeleton health check (Epic 0.6). Reports liveness only — no secrets.
  app.get('/health', async () => ({
    status: 'ok',
    service: 'forge-server',
    env: env.NODE_ENV,
    uptime: process.uptime(),
  }));

  // Postgres/Drizzle client (Epic 0.7). Only constructed when DATABASE_URL is
  // present so the server still boots without one in dev/test.
  const db = deps.db ?? (env.DATABASE_URL ? createDbClient(env.DATABASE_URL) : undefined);
  if (db) app.decorate('db', db);

  // Onboarding schema + persistence (Epic 1.4).
  registerOnboardingRoutes(app, deps.onboardingStore ?? createInMemoryOnboardingStore());

  // Auth (Epic 0.8): email/password sign-up/sign-in, httpOnly session cookies.
  // DB-backed when a db client is available, otherwise in-memory (dev/test).
  const authStore = deps.authStore ?? (db ? createDbAuthStore(db) : createInMemoryAuthStore());
  registerAuthRoutes(app, authStore);

  // Session persistence & resume (Epic 1.10): phase/chat/cards tied to the
  // authenticated user. DB-backed when a db client is available, otherwise
  // in-memory (dev/test) — same convention as the auth store above.
  const sessionStore =
    deps.sessionStore ?? (db ? createDbSessionStore(db) : createInMemorySessionStore());
  registerSessionRoutes(app, authStore, sessionStore);

  // Anthropic Messages API wrapper (Epic 0.9). Only constructed when a key is
  // present so the server still boots without one in dev/test.
  const anthropicClient =
    deps.anthropicClient ??
    (env.ANTHROPIC_API_KEY
      ? createAnthropicClient({
          sdkClient: createAnthropicSdkClient(env.ANTHROPIC_API_KEY),
          logger: app.log,
        } satisfies AnthropicClientDeps)
      : undefined);
  if (anthropicClient) app.decorate('anthropic', anthropicClient);

  // OpenAI API wrapper (Epic 0.9b). Only constructed when a key is present.
  const openAiClient =
    deps.openAiClient ??
    (env.OPENAI_API_KEY
      ? createOpenAiClient({
          sdkClient: createOpenAiSdkClient(env.OPENAI_API_KEY),
          logger: app.log,
        } satisfies OpenAiClientDeps)
      : undefined);
  if (openAiClient) app.decorate('openai', openAiClient);

  // Gemini API wrapper (Epic 0.9c). Only constructed when a key is present.
  const geminiClient =
    deps.geminiClient ??
    (env.GEMINI_API_KEY
      ? createGeminiClient({
          sdkClient: createGeminiSdkClient(env.GEMINI_API_KEY),
          logger: app.log,
        } satisfies GeminiClientDeps)
      : undefined);
  if (geminiClient) app.decorate('gemini', geminiClient);

  // Multi-provider model router (Epic 0.9d). The single entry point the agent
  // tool-call dispatch loop (#2.4) will use — never talks to individual
  // provider clients directly. Providers with no key configured fall back to
  // a stub client that throws clearly if a task's route ever needs them.
  const modelRouter =
    deps.modelRouter ??
    createModelRouter({
      clients: {
        anthropic: anthropicClient ?? createUnconfiguredProviderClient('anthropic'),
        openai: openAiClient ?? createUnconfiguredProviderClient('openai'),
        gemini: geminiClient ?? createUnconfiguredProviderClient('gemini'),
      },
      taskRegistry: DEFAULT_TASK_REGISTRY,
      pricing: DEFAULT_PRICING,
      fallbackModel: DEFAULT_FALLBACK_MODEL,
      logger: app.log,
    });
  app.decorate('modelRouter', modelRouter);

  // Cost guardrails (Epic 0.11): per-session and per-user daily spend caps
  // on top of the model router's normalized costCents, so runaway AI usage
  // is soft-warned then hard-stopped regardless of which provider served it.
  const costGuard =
    deps.costGuard ??
    createCostGuard({
      store: deps.costGuardStore ?? createInMemoryCostGuardStore(),
      sessionCapCents: env.SESSION_COST_CAP_CENTS,
      userDailyCapCents: env.USER_DAILY_COST_CAP_CENTS,
      warnRatio: env.COST_CAP_WARN_RATIO,
      logger: app.log,
    });
  app.decorate('costGuard', costGuard);

  return app;
}
