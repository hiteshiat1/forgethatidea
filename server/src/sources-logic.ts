/**
 * Sources/RAG intake phase (Epic 2.8) — phase 2's job: collect competitor
 * names, apps, and reference links from the user for research. Kept as its
 * own structure on the session (same reasoning as brainstorm-logic.ts):
 * raw sources are the *input* to research, not research findings or a
 * manifest-shape decision, so they don't belong on BuildManifest either.
 */
export interface Source {
  type: 'link' | 'text';
  value: string;
}

export interface SourcesIntake {
  sources: Source[];
  /** True once the user has explicitly said "none" — intake is done with nothing collected. */
  declined: boolean;
}

const URL_LIKE = /^(https?:\/\/|www\.)/i;

/** Classifies one piece of user-provided input as a link or free text (a competitor name, etc). */
export function classifySource(input: string): Source {
  const value = input.trim();
  return { type: URL_LIKE.test(value) ? 'link' : 'text', value };
}

export interface SourcesIntakeStatus {
  complete: boolean;
}

/**
 * Sources intake is complete once either at least one source has been
 * recorded, or the user has explicitly declined — "handles 'none'
 * gracefully" means declining is itself a valid, complete outcome, not a
 * missing-data state to keep prompting for.
 */
export function checkSourcesIntakeComplete(intake: SourcesIntake): SourcesIntakeStatus {
  return { complete: intake.sources.length > 0 || intake.declined };
}
