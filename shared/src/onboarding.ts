import { z } from 'zod';

/**
 * Onboarding question set & data model (Epic 1.4). The five answers seed the
 * whole session: the agent reads them in the brainstorm/planning phases. This
 * module is the single source of truth for both the Typeform-style UI (Epic
 * 1.5, #17) and the server route that persists the responses.
 */

/** Budget bands the user picks from. Coarse on purpose — signals ambition, not accounting. */
export const BUDGET_OPTIONS = [
  { value: 'under-1k', label: 'Under $1k' },
  { value: '1k-10k', label: '$1k–$10k' },
  { value: '10k-50k', label: '$10k–$50k' },
  { value: '50k-plus', label: '$50k+' },
  { value: 'unsure', label: 'Not sure yet' },
] as const;

/** Self-reported technical comfort — tunes how the agent explains build options. */
export const TECHNICAL_LEVEL_OPTIONS = [
  { value: 'non-technical', label: 'Non-technical' },
  { value: 'some-technical', label: 'Some technical knowledge' },
  { value: 'technical', label: 'Technical / can code' },
] as const;

const budgetValues = BUDGET_OPTIONS.map((o) => o.value) as [string, ...string[]];
const technicalLevelValues = TECHNICAL_LEVEL_OPTIONS.map((o) => o.value) as [string, ...string[]];

/**
 * The onboarding response model. Every field is required before the user can
 * continue — see `onboardingSchema` for the enforced constraints.
 */
export const onboardingSchema = z.object({
  /** The rough idea, in the user's own words. */
  idea: z.string().trim().min(10, 'Tell us a little more about the idea.').max(2000),
  /** Industry / domain the idea lives in. */
  industry: z.string().trim().min(2, 'Which industry is this for?').max(120),
  /** Budget band. */
  budget: z.enum(budgetValues),
  /** Self-reported technical level. */
  technicalLevel: z.enum(technicalLevelValues),
  /** What success looks like for the user. */
  goal: z.string().trim().min(5, 'What are you hoping to get out of this?').max(500),
});

export type OnboardingResponses = z.infer<typeof onboardingSchema>;
export type BudgetOption = (typeof BUDGET_OPTIONS)[number]['value'];
export type TechnicalLevelOption = (typeof TECHNICAL_LEVEL_OPTIONS)[number]['value'];

export type OnboardingQuestion = {
  /** Key into {@link OnboardingResponses}. */
  id: keyof OnboardingResponses;
  /** The prompt shown to the user. */
  prompt: string;
  /** Optional supporting copy. */
  hint?: string;
  /** Input affordance the UI should render. */
  type: 'text' | 'longtext' | 'select';
  /** Choices for `select` questions. */
  options?: ReadonlyArray<{ value: string; label: string }>;
};

/**
 * The questions in display order. The Typeform-style flow (#17) renders one at
 * a time from this list; the ids line up with {@link onboardingSchema} keys.
 */
export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  {
    id: 'idea',
    prompt: "What's the idea?",
    hint: 'A sentence or two is plenty — we’ll dig into the details together.',
    type: 'longtext',
  },
  {
    id: 'industry',
    prompt: 'What industry or space is it for?',
    type: 'text',
  },
  {
    id: 'budget',
    prompt: 'Roughly what budget are you working with?',
    type: 'select',
    options: BUDGET_OPTIONS,
  },
  {
    id: 'technicalLevel',
    prompt: 'How technical are you?',
    hint: 'So we know how much to explain.',
    type: 'select',
    options: TECHNICAL_LEVEL_OPTIONS,
  },
  {
    id: 'goal',
    prompt: "What's the goal?",
    hint: 'What would make this worth your time?',
    type: 'text',
  },
] as const;

/**
 * Validate a partial/unknown set of responses against {@link onboardingSchema}.
 * Returns the parsed data on success, or a field→message map on failure so the
 * UI can show inline errors and the server can reject incomplete submissions.
 */
export function validateOnboarding(
  input: unknown,
):
  | { ok: true; data: OnboardingResponses }
  | { ok: false; errors: Partial<Record<keyof OnboardingResponses, string>> } {
  const result = onboardingSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };

  const errors: Partial<Record<keyof OnboardingResponses, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof OnboardingResponses | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
