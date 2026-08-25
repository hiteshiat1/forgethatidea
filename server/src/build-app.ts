import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { loadEnv, type Env } from './env.js';
import { type OnboardingStore, createInMemoryOnboardingStore } from './onboarding-store.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';
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

declare module 'fastify' {
  interface FastifyInstance {
    anthropic?: ReturnType<typeof createAnthropicClient>;
    openai?: ReturnType<typeof createOpenAiClient>;
    gemini?: ReturnType<typeof createGeminiClient>;
    modelRouter: ReturnType<typeof createModelRouter>;
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

  return app;
}
