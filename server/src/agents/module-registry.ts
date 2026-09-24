import type { AgentModule } from './module-types.js';
import type { SessionRecord } from '../session-store.js';

/**
 * Filters a list of agent modules down to the ones active for this session
 * this turn — the composition step described in the module-registry
 * refactor plan: exactly one spine module (matching `session.phase`) plus
 * every unlocked activity module (Epic 6+, keyed on `session.unlockedModules`
 * once that field exists) whose own `isActive` check passes.
 *
 * Deliberately just a filter, not a merge-into-one-prompt/one-tool-registry
 * step — that composition happens at the call site (agent-orchestrator.ts),
 * which already knows how to merge N tool registries into one flat object
 * (the same pattern the 4 existing render-tool factories already use).
 */
export function assembleActiveModules(
  modules: AgentModule[],
  session: SessionRecord,
): AgentModule[] {
  return modules.filter((module) => module.isActive(session));
}
