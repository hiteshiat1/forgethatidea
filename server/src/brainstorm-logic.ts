/**
 * Brainstorm phase findings (Epic 2.7) — captured incrementally during the
 * brainstorm conversation, one question per turn, before enough is known to
 * seed the real build manifest (#32). Kept as its own lightweight structure
 * rather than added to `BuildManifest` directly: the manifest's required
 * fields (entities, screens, roles, etc.) are planning-phase product-shape
 * decisions that don't exist yet this early, so a manifest literally cannot
 * be created until much later — these findings live on the session (its
 * existing flexible `chat`/`cards` JSONB, or a future dedicated column) and
 * get promoted into the manifest's `icp` field once planning starts.
 */
export interface BrainstormFindings {
  /** Ideal customer profile — who this is for. */
  icp?: string;
  /** The core job the user is hiring this product to do. */
  coreJob?: string;
  /** What makes this different from the obvious alternative. */
  differentiator?: string;
}

export type BrainstormFindingKey = keyof BrainstormFindings;

const REQUIRED_FINDINGS: BrainstormFindingKey[] = ['icp', 'coreJob', 'differentiator'];

export interface BrainstormStoppingRuleResult {
  satisfied: boolean;
  /** Findings not yet captured (or captured as blank), in a fixed, stable order. */
  missing: BrainstormFindingKey[];
}

function isKnown(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

/**
 * Brainstorm stopping rule (Epic 2.7): the phase is done once ICP, core job,
 * and one differentiator are all known. This is the deterministic half of
 * "ask sharp questions one at a time until X is known" — it tells the caller
 * what's still missing; deciding *what question to ask next* for a missing
 * finding is the agent orchestrator's job (not yet built), which calls the
 * model with this result plus the system prompt (#30).
 */
export function checkBrainstormStoppingRule(
  findings: BrainstormFindings,
): BrainstormStoppingRuleResult {
  const missing = REQUIRED_FINDINGS.filter((key) => !isKnown(findings[key]));
  return { satisfied: missing.length === 0, missing };
}
