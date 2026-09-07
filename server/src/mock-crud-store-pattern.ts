import type { ManifestEntity } from '@forge/shared';

/**
 * Mock CRUD store pattern library (Epic 4.10): a standardized reference
 * pattern for the in-memory data layer, embedded into the codegen prompt
 * (#63) so every entity in a generated app is backed by the same consistent
 * useReducer-based store shape rather than each generation inventing its
 * own ad-hoc state management. Like the mock auth pattern (#70), this is
 * prompt content the model follows, not a runtime module the generated
 * (single-file) app could import.
 *
 * Covers full CRUD plus list/filter (the issue's explicit acceptance
 * criteria) and is always explicit that state resets on refresh — a
 * deliberate limitation of a mocked prototype, not a bug, so the generated
 * app should surface that to its own user rather than hide it.
 */
export function buildMockCrudStorePattern(entities: ManifestEntity[]): string {
  const entityNames = entities.map((e) => e.name).join(', ');

  return `
Mock CRUD store pattern (use this consistently for every entity: ${entityNames}):
- Model each entity's collection as in-memory state via useReducer: const [state, dispatch] = useReducer(reducer, initialState), seeded with the seed data.
- The reducer supports actions for full CRUD: create (add a new record with a generated id), read (the current list, always available from state directly), update (patch a record by id), and delete (remove a record by id).
- Provide basic list/filter support — e.g. deriving a filtered view with Array.prototype.filter over the current state rather than a separate query mechanism.
- This is in-memory only and resets to the seed data on page refresh — that's expected for a mocked prototype, not a bug. If it's useful, surface a small note in the UI making that clear to whoever is using the app (e.g. "Demo data — resets on refresh").
- Never persist this state anywhere (no localStorage, no IndexedDB, no network calls) — consistent with the output contract's ban on those.
`.trim();
}
