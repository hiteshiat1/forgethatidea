import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { z } from 'zod';
import { PHASES, type Phase } from '@forge/shared';
import { requireAuth } from './auth.js';
import { type AuthStore } from '../auth/auth-store.js';
import { type SessionStore } from '../session-store.js';
import { transition, IllegalTransitionError, canTransition } from '../phase-machine.js';
import { checkGate, type SessionCard } from '../phase-gates.js';
import {
  recordRefinementRound,
  isRefinementFailure,
  type RefinementLimits,
} from '../refinement-tracker.js';
import { checkBrainstormStoppingRule } from '../brainstorm-logic.js';

const updateSchema = z.object({
  phase: z.enum(PHASES).optional(),
  chat: z.array(z.unknown()).optional(),
  cards: z.array(z.unknown()).optional(),
});

const brainstormFindingsSchema = z.object({
  icp: z.string().trim().min(1).optional(),
  coreJob: z.string().trim().min(1).optional(),
  differentiator: z.string().trim().min(1).optional(),
});

const refineSchema = z.object({
  kind: z.enum(['app', 'marketing']),
});

/**
 * Session persistence & resume routes (Epic 1.10). All routes require an
 * authenticated user (via requireAuth, Epic 0.8) so a session is always tied
 * to a real account — satisfies "session tied to authenticated user".
 */
export function registerSessionRoutes(
  app: FastifyInstance,
  authStore: AuthStore,
  store: SessionStore,
  refinementLimits: RefinementLimits,
) {
  const auth = requireAuth(authStore);

  app.post(
    '/api/sessions',
    { preHandler: auth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await store.create(request.userId!);
      return reply.status(201).send(session);
    },
  );

  // Resume: latest session for the authenticated user, or null if they have
  // none yet. "Resume lands on correct phase" — the client reads `phase`
  // straight off this response and routes the UI accordingly.
  app.get(
    '/api/sessions/latest',
    { preHandler: auth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [latest] = await store.listByUser(request.userId!);
      return reply.status(200).send(latest ?? null);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: auth },
    async (request, reply) => {
      const session = await store.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }
      return reply.status(200).send(session);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: auth },
    async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_failed' });
      }

      const existing = await store.get(request.params.id);
      if (!existing || existing.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      // Phase state machine (Epic 2.1): a phase change must be a legal
      // transition from the session's current phase — never an arbitrary
      // jump. Chat/cards updates don't touch the phase and skip this check.
      if (parsed.data.phase !== undefined) {
        try {
          transition(existing.phase, parsed.data.phase);
        } catch (err) {
          if (err instanceof IllegalTransitionError) {
            return reply.status(409).send({
              error: 'illegal_phase_transition',
              from: err.from,
              to: err.to,
            });
          }
          throw err;
        }

        // Phase gate enforcement (Epic 2.2): a structurally legal transition
        // can still be blocked by content rules — e.g. build requires all
        // four deliverable cards locked first. Evaluated against the
        // session's *current* cards, since this update's own `cards` (if
        // any) haven't been persisted yet.
        const cards = (parsed.data.cards ?? existing.cards) as SessionCard[];
        const gate = checkGate(parsed.data.phase, cards);
        if (!gate.passed) {
          return reply.status(409).send({
            error: 'phase_gate_not_satisfied',
            to: parsed.data.phase,
            missing: gate.missing,
          });
        }
      }

      const updated = await store.update(request.params.id, parsed.data);
      return reply.status(200).send(updated);
    },
  );

  // Gate status (Epic 2.2): "gate status queryable by UI" — lets the client
  // show progress toward unlocking the next phase without attempting (and
  // getting rejected by) a real PATCH.
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/gate',
    { preHandler: auth },
    async (request, reply) => {
      const session = await store.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const currentIndex = PHASES.indexOf(session.phase);
      const next: Phase | null =
        currentIndex < PHASES.length - 1 ? PHASES[currentIndex + 1]! : null;
      if (!next || !canTransition(session.phase, next)) {
        return reply.status(200).send({ next: null, passed: true, missing: [] });
      }

      const gate = checkGate(next, session.cards as SessionCard[]);
      return reply.status(200).send({ next, ...gate });
    },
  );

  // Refinement round tracking (Epic 2.11): call once per change-request ->
  // re-emit cycle. Rejects with 429 once the free-tier limit for that kind
  // is already reached — the gate signal the UI (#23) reads to disable
  // further refinement.
  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/refine',
    { preHandler: auth },
    async (request, reply) => {
      const parsed = refineSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_failed' });
      }

      const existing = await store.get(request.params.id);
      if (!existing || existing.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const result = await recordRefinementRound(
        store,
        request.params.id,
        parsed.data.kind,
        refinementLimits,
      );

      if (isRefinementFailure(result)) {
        if (result.error === 'session_not_found') {
          return reply.status(404).send({ error: 'session_not_found' });
        }
        return reply.status(429).send(result);
      }

      return reply.status(200).send(result);
    },
  );

  // Brainstorm findings (Epic 2.7): merges the given fields into the
  // session's existing findings (never replaces — a caller reporting one
  // newly-learned finding shouldn't wipe the others) and returns the
  // stopping-rule status so the caller knows whether to keep asking
  // questions or move on — "writes findings to manifest" is satisfied by
  // persisting them on the session; promoting them into a real BuildManifest
  // is the planning phase's job once one is created.
  app.patch<{ Params: { id: string } }>(
    '/api/sessions/:id/brainstorm',
    { preHandler: auth },
    async (request, reply) => {
      const parsed = brainstormFindingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_failed' });
      }

      const existing = await store.get(request.params.id);
      if (!existing || existing.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const merged = { ...existing.brainstormFindings, ...parsed.data };
      const updated = await store.update(request.params.id, { brainstormFindings: merged });
      const stoppingRule = checkBrainstormStoppingRule(merged);

      return reply.status(200).send({ findings: updated!.brainstormFindings, ...stoppingRule });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/brainstorm',
    { preHandler: auth },
    async (request, reply) => {
      const session = await store.get(request.params.id);
      if (!session || session.userId !== request.userId) {
        return reply.status(404).send({ error: 'session_not_found' });
      }

      const stoppingRule = checkBrainstormStoppingRule(session.brainstormFindings);
      return reply.status(200).send({ findings: session.brainstormFindings, ...stoppingRule });
    },
  );
}
