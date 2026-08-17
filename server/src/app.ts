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

declare module 'fastify' {
  interface FastifyInstance {
    anthropic?: ReturnType<typeof createAnthropicClient>;
    openai?: ReturnType<typeof createOpenAiClient>;
    gemini?: ReturnType<typeof createGeminiClient>;
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
    const sdkClient = createAnthropicSdkClient(env.ANTHROPIC_API_KEY);
    const anthropicDeps: AnthropicClientDeps = { sdkClient, logger: app.log };
    app.decorate('anthropic', createAnthropicClient(anthropicDeps));
  }

  // OpenAI API wrapper (Epic 0.9b). Consumed by the multi-provider model
  // router (0.9d) once it lands; only constructed when a key is present.
  if (deps.openAiClient) {
    app.decorate('openai', deps.openAiClient);
  } else if (env.OPENAI_API_KEY) {
    const sdkClient = createOpenAiSdkClient(env.OPENAI_API_KEY);
    const openAiDeps: OpenAiClientDeps = { sdkClient, logger: app.log };
    app.decorate('openai', createOpenAiClient(openAiDeps));
  }

  // Gemini API wrapper (Epic 0.9c). Consumed by the multi-provider model
  // router (0.9d) once it lands; only constructed when a key is present.
  if (deps.geminiClient) {
    app.decorate('gemini', deps.geminiClient);
  } else if (env.GEMINI_API_KEY) {
    const sdkClient = createGeminiSdkClient(env.GEMINI_API_KEY);
    const geminiDeps: GeminiClientDeps = { sdkClient, logger: app.log };
    app.decorate('gemini', createGeminiClient(geminiDeps));
  }

  return app;
}
