import type { Phase } from '@forge/shared';
import type { AgentModule } from './module-types.js';

/**
 * Brainstorm stopping rule (moved here from system-prompt.ts's universal
 * block during the module-registry refactor — it was previously injected
 * into every phase's prompt unconditionally even though it only makes
 * sense during brainstorm, a latent-but-harmless inconsistency corrected
 * as part of this extraction rather than carried into every new module).
 */
const BRAINSTORM_STOPPING_RULE = `
Brainstorm stopping rule: during the brainstorm phase, generate a focused set of
distinct build-option directions — not an exhaustive list. Stop and present
options once you have 3 to 5 meaningfully different directions (differing in
scope, audience, or core mechanic — not just wording). Do not keep generating
options past that point on your own; if the user wants more, they'll ask.
`.trim();

/**
 * Per-phase guidance text (Epic 2.3), extracted verbatim from
 * system-prompt.ts's old PHASE_GUIDANCE record — no wording changes except
 * brainstorm gaining its stopping rule, which used to live in a separate
 * always-on block regardless of phase.
 */
const SPINE_GUIDANCE: Record<Phase, string> = {
  onboarding:
    'The user is describing their idea for the first time. Ask clarifying questions to understand the core problem and who it is for; do not jump ahead to solutions yet.',
  sources:
    'Gather and ground context — research, references, or constraints the user provides. Distinguish what is confirmed from what is assumed.',
  brainstorm: `Generate distinct build-option directions for the user to choose from. Follow the brainstorm stopping rule below. Once you have your 3 directions, call render_build_options to show them as a comparison card — do not just describe them in chat text. Once the user picks one, call select_build_option to lock it in.

${BRAINSTORM_STOPPING_RULE}`,
  planning:
    'Turn the chosen direction into a concrete plan: architecture, cost estimate, and marketing angle. Apply the honesty constraints below strictly here — this phase is where invented numbers would do the most damage. Use render_architecture to show the plain-language architecture as a card (never technical jargon like API/database/backend — describe what each piece does for the user), then lock_architecture once the user is happy with it. For costs, call get_pricing_tiers first to ground every line item in a real published price, then render_cost_table with at least two usage scales (e.g. 100 and 1,000 users) — every line item needs both an assumption and a sourceUrl, never a number without one. Call lock_cost_table once the user is happy with it. For marketing, use web_search to find real competitors in this space, then render_marketing_plans with exactly 3 distinct plans (each covering icp/gtm/seo/ads and naming at least one real competitor found via search, never invented) — call select_marketing_plan once the user picks one. If the user asks to change any of these cards before locking it, call that same render_* tool again with the updated content — this replaces the card in place (never creates a duplicate) and moves it to a "refined" state. Never edit a card that has already been locked without the user explicitly asking to revisit it.',
  build:
    'Generate the actual mocked app from the locked plan. Stay faithful to what was locked in planning; do not silently change scope.',
  refine:
    'Iterate on the built app based on user feedback. Keep changes scoped to what was asked. If the user asks to change the marketing plan instead of the app, call refine_marketing_plans with the full updated 3-plan set (not render_marketing_plans — that tool is only for before the first lock) — each free-tier session has a limited number of these refinement rounds, so if the limit has been reached, say so plainly rather than calling it again.',
};

/**
 * Looked up directly by phase (not via a session object) — this is what
 * system-prompt.ts's `buildSystemPrompt({ phase })` actually has available
 * on every call, since building the prompt happens before a full session
 * fetch is guaranteed at every call site. AgentModule.buildPrompt's real
 * `(session) => string` contract is for net-new modules that genuinely need
 * session fields (e.g. the financial module reading assumptions); spine
 * modules don't need any, so they're exposed both ways rather than forcing
 * every caller through a fabricated session object.
 */
export function guidanceForPhase(phase: Phase): string {
  return SPINE_GUIDANCE[phase];
}

/**
 * One spine module per real phase (onboarding -> refine) — a mechanical,
 * no-behavior-change extraction of the old flat PHASE_GUIDANCE lookup into
 * the AgentModule shape (module-types.ts), so phase-specific guidance and
 * net-new activity modules (spec pack, pitch deck, financial, ...) compose
 * the same way rather than one flat lookup plus a growing pile of special
 * cases. Each spine module's tools are still wired directly in
 * agent-orchestrator.ts (unchanged) — getTools here is a no-op stub since
 * the spine's tool wiring predates the module-registry refactor and moving
 * it is out of scope for this pass (see the plan: existing render-tool
 * files are untouched).
 */
export const SPINE_MODULES: AgentModule[] = (Object.keys(SPINE_GUIDANCE) as Phase[]).map(
  (phase) => ({
    id: phase,
    buildPrompt: () => guidanceForPhase(phase),
    getTools: () => ({}),
    isActive: (session) => session.phase === phase,
  }),
);
