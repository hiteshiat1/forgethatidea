import { useState } from 'react';
import { color, type OnboardingResponses } from '@forge/shared';
import { Button } from '@forge/shared/ui';
import { BrandLockup } from './BrandLockup.js';
import { OnboardingFlow } from './OnboardingFlow.js';

export interface OnboardingProps {
  /** Fired once the interview is submitted with validated responses. */
  onComplete?: (responses: OnboardingResponses) => void;
}

/**
 * Onboarding entry view (Epic 1.2 consumption point). Shows the hero brand
 * lockup, then hands off to the Typeform-style question flow (Epic 1.5, #17)
 * once the user starts forging.
 */
export function Onboarding({ onComplete }: OnboardingProps) {
  const [started, setStarted] = useState(false);

  if (started) return <OnboardingFlow onComplete={onComplete} />;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 'var(--forge-space-6)',
        padding: 'var(--forge-space-8)',
      }}
    >
      <BrandLockup variant="hero" />
      <p style={{ color: color.slate[300], fontSize: '1.125rem', maxWidth: 420, lineHeight: 1.5 }}>
        Bring a rough idea. We&apos;ll shape it into a plan and a working mock — one phase at a
        time.
      </p>
      <div>
        <Button variant="primary" onClick={() => setStarted(true)}>
          Start forging
        </Button>
      </div>
    </div>
  );
}
