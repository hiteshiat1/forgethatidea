import { useMemo, useState, type FormEvent } from 'react';
import {
  ONBOARDING_QUESTIONS,
  onboardingSchema,
  validateOnboarding,
  type OnboardingResponses,
} from '@forge/shared';
import { Button } from '@forge/shared/ui';
import '../styles/onboarding-flow.css';

type Answers = Partial<Record<keyof OnboardingResponses, string>>;

export interface OnboardingFlowProps {
  /** Called with the validated responses once the interview is submitted. */
  onComplete?: (responses: OnboardingResponses) => void;
}

/** Validate a single field against the shared schema; returns an error message or null. */
function fieldError(id: keyof OnboardingResponses, value: string | undefined): string | null {
  const result = onboardingSchema.shape[id].safeParse(value ?? '');
  return result.success ? null : (result.error.issues[0]?.message ?? 'Required');
}

/**
 * Typeform-style onboarding (Epic 1.5, #17). Walks the shared
 * ONBOARDING_QUESTIONS one at a time — text/longtext free entry and
 * single-choice selects — with a progress affordance and a final gate that
 * only submits once every answer passes the shared schema.
 */
export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [showError, setShowError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const question = ONBOARDING_QUESTIONS[index]!;
  const isLast = index === ONBOARDING_QUESTIONS.length - 1;
  const value = answers[question.id] ?? '';
  const error = fieldError(question.id, value);

  const allComplete = useMemo(() => validateOnboarding(answers).ok, [answers]);

  function setValue(next: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: next }));
    setShowError(false);
    setSubmitError(null);
  }

  function goNext() {
    if (error) {
      setShowError(true);
      return;
    }
    setShowError(false);
    if (!isLast) setIndex((i) => i + 1);
  }

  function goBack() {
    setShowError(false);
    setIndex((i) => Math.max(0, i - 1));
  }

  async function submit() {
    const result = validateOnboarding(answers);
    if (result.data === null) {
      setShowError(true);
      return;
    }
    const { data } = result;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      onComplete?.(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLast) submit();
    else goNext();
  }

  return (
    <form className="ob-flow" onSubmit={onSubmit}>
      <div className="ob-flow__progress" aria-hidden="true">
        <div className="ob-flow__progress-track">
          <div
            className="ob-flow__progress-fill"
            style={{ width: `${((index + 1) / ONBOARDING_QUESTIONS.length) * 100}%` }}
          />
        </div>
        <span className="ob-flow__progress-count">
          {index + 1} of {ONBOARDING_QUESTIONS.length}
        </span>
      </div>

      <div className="ob-flow__body">
        <label className="ob-flow__prompt" htmlFor={`ob-${question.id}`}>
          {question.prompt}
        </label>
        {question.hint && <p className="ob-flow__hint">{question.hint}</p>}

        {question.type === 'select' ? (
          <div className="ob-flow__choices" role="radiogroup" aria-label={question.prompt}>
            {question.options?.map((opt) => {
              const selected = value === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  role="radio"
                  aria-checked={selected}
                  className={`ob-flow__choice${selected ? ' ob-flow__choice--selected' : ''}`}
                  onClick={() => setValue(opt.value)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ) : question.type === 'longtext' ? (
          <textarea
            id={`ob-${question.id}`}
            className="ob-flow__input ob-flow__input--multiline"
            rows={4}
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type your answer…"
          />
        ) : (
          <input
            id={`ob-${question.id}`}
            className="ob-flow__input"
            type="text"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type your answer…"
          />
        )}

        {showError && error && <p className="ob-flow__error">{error}</p>}
        {submitError && <p className="ob-flow__error">{submitError}</p>}
      </div>

      <div className="ob-flow__actions">
        {index > 0 && (
          <Button type="button" variant="ghost" onClick={goBack} disabled={submitting}>
            Back
          </Button>
        )}
        {isLast ? (
          <Button type="submit" variant="primary" disabled={!allComplete || submitting}>
            {submitting ? 'Starting…' : 'Start the interview'}
          </Button>
        ) : (
          <Button type="submit" variant="primary">
            Next
          </Button>
        )}
      </div>
    </form>
  );
}
