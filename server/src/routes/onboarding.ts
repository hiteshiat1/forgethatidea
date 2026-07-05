import { randomUUID } from 'node:crypto';
import { type FastifyInstance } from 'fastify';
import { validateOnboarding } from '@forge/shared';
import { type OnboardingStore } from '../onboarding-store.js';

/** Header carrying the session id until real session/auth (#8) replaces it. */
const SESSION_HEADER = 'x-forge-session';

/**
 * Onboarding routes (Epic 1.4). Validates the five-question payload with the
 * shared schema and persists it to the session via the {@link OnboardingStore}
 * seam. Session identity is a placeholder header for now; #8 will swap in real
 * authenticated sessions without changing this contract.
 */
export function registerOnboardingRoutes(app: FastifyInstance, store: OnboardingStore) {
  app.post('/api/onboarding', async (request, reply) => {
    const result = validateOnboarding(request.body);
    if (!result.ok) {
      return reply.status(400).send({ error: 'validation_failed', fields: result.errors });
    }

    // Placeholder session resolution — real sessions arrive with #8.
    const sessionId = (request.headers[SESSION_HEADER] as string | undefined) ?? randomUUID();
    await store.save(sessionId, result.data);

    return reply.status(201).send({ sessionId, responses: result.data });
  });
}
