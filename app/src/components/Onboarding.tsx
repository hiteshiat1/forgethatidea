import { color } from '@forge/shared';
import { Button } from '@forge/shared/ui';
import { BrandLockup } from './BrandLockup.js';

export interface OnboardingProps {
  onStart?: () => void;
}

/**
 * Onboarding entry view (Epic 1.2 consumption point). Hosts the hero brand
 * lockup; the Typeform-style question flow itself lands in Epic 1.5 (#17).
 */
export function Onboarding({ onStart }: OnboardingProps) {
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
        <Button variant="primary" onClick={onStart}>
          Start forging
        </Button>
      </div>
    </div>
  );
}
