import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';
import { createRenderBuildOptionsTool } from '../render-build-options-tool.js';
import { createRenderArchitectureTool } from '../render-architecture-tool.js';
import { createRenderCostTableTool } from '../render-cost-table-tool.js';
import { createRenderMarketingPlansTool } from '../render-marketing-plans-tool.js';

const selectSchema = z.object({
  index: z.number().int(),
});

/**
 * Direct card-selection route (Epic 3.1): lets the user click an option
 * straight on the build-options card in the canvas, rather than only being
 * able to select via chat. Delegates to the same select_build_option logic
 * the agent's tool call uses (render-build-options-tool.ts) so both paths
 * stay consistent — clicking the card has exactly the same effect as asking
 * the agent to lock that option in.
 */
export function registerCardSelectionRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  sessionStore: SessionStore,
) {
  const auth = requireAuth(authStore);

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/cards/options/select',
    { preHandler: auth },
    async (request, reply) => {
      const parsed = selectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_failed' });
      }

      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const tool = createRenderBuildOptionsTool({
        store: sessionStore,
        sessionId: request.params.id,
        onEvent: () => {},
      });
      const result = await tool.select_build_option({ index: parsed.data.index });

      if (!result.ok) {
        return reply.status(400).send(result);
      }

      return reply.status(200).send(result);
    },
  );

  /**
   * Direct architecture-lock route (Epic 3.2): mirrors the options-select
   * route above — lets the user confirm the architecture directly from the
   * canvas card rather than only through chat, using the same
   * lock_architecture logic the agent's tool call uses.
   */
  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/cards/architecture/lock',
    { preHandler: auth },
    async (request, reply) => {
      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const tool = createRenderArchitectureTool({
        store: sessionStore,
        sessionId: request.params.id,
        onEvent: () => {},
      });
      const result = await tool.lock_architecture({});

      if (!result.ok) {
        return reply.status(400).send(result);
      }

      return reply.status(200).send(result);
    },
  );

  /**
   * Direct cost-table-lock route (Epic 3.4): mirrors the architecture-lock
   * route above — lets the user confirm the cost table directly from the
   * canvas card, using the same lock_cost_table logic the agent's tool
   * call uses.
   */
  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/cards/cost/lock',
    { preHandler: auth },
    async (request, reply) => {
      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const tool = createRenderCostTableTool({
        store: sessionStore,
        sessionId: request.params.id,
        onEvent: () => {},
      });
      const result = await tool.lock_cost_table({});

      if (!result.ok) {
        return reply.status(400).send(result);
      }

      return reply.status(200).send(result);
    },
  );

  /**
   * Direct marketing-plan-selection route (Epic 3.5): mirrors the
   * options-select route above — lets the user click a plan straight on
   * the marketing-plans card, using the same select_marketing_plan logic
   * the agent's tool call uses.
   */
  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/cards/marketing/select',
    { preHandler: auth },
    async (request, reply) => {
      const parsed = selectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_failed' });
      }

      const session = await sessionStore.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const tool = createRenderMarketingPlansTool({
        store: sessionStore,
        sessionId: request.params.id,
        onEvent: () => {},
      });
      const result = await tool.select_marketing_plan({ index: parsed.data.index });

      if (!result.ok) {
        return reply.status(400).send(result);
      }

      return reply.status(200).send(result);
    },
  );
}
