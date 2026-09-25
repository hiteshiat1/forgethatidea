import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@forge/shared/ui';
import { getEntitlements, type TierId } from '../api.js';
import '../styles/checkout-return.css';

type ReturnState =
  | { status: 'checking' }
  | { status: 'unlocked'; tierId: TierId }
  | { status: 'pending' }
  | { status: 'cancelled' };

/**
 * Checkout return page (Epic 6.5): the URL Stripe sends the user back to
 * after checkout, whether they completed payment or cancelled. Never
 * trusts the URL alone as proof of purchase — the real grant only exists
 * once Stripe's webhook (#99) has reached the entitlements service (#100),
 * so this page re-fetches /api/entitlements rather than assuming
 * `?status=success` means the tier is actually owned yet. A short poll
 * covers the (usually sub-second, but not guaranteed) gap between the
 * checkout redirect landing and the webhook being processed.
 */
export function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<ReturnState>({ status: 'checking' });

  const status = searchParams.get('status');
  const tierId = searchParams.get('tier') as TierId | null;
  const sessionId = searchParams.get('session');

  useEffect(() => {
    if (status === 'cancelled') {
      setState({ status: 'cancelled' });
      return;
    }

    if (!tierId) {
      setState({ status: 'pending' });
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts += 1;
      const result = await getEntitlements();
      if (cancelled) return;

      if (result.owned?.includes(tierId!)) {
        setState({ status: 'unlocked', tierId: tierId! });
        return;
      }

      if (attempts < 5) {
        setTimeout(poll, 1500);
      } else {
        setState({ status: 'pending' });
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [status, tierId]);

  function returnToSession() {
    navigate(sessionId ? `/app?session=${sessionId}` : '/app');
  }

  return (
    <div className="checkout-return">
      {state.status === 'checking' && (
        <>
          <h1>Confirming your purchase…</h1>
          <p>This only takes a moment.</p>
        </>
      )}
      {state.status === 'unlocked' && (
        <>
          <h1>You&apos;re all set</h1>
          <p>Your purchase is unlocked and ready — no need to refresh.</p>
          <Button onClick={returnToSession}>Back to your project</Button>
        </>
      )}
      {state.status === 'pending' && (
        <>
          <h1>Payment received</h1>
          <p>
            We&apos;re still finalizing your unlock — this can take a minute. Head back to your
            project; it&apos;ll appear as soon as it&apos;s ready.
          </p>
          <Button onClick={returnToSession}>Back to your project</Button>
        </>
      )}
      {state.status === 'cancelled' && (
        <>
          <h1>No charge made</h1>
          <p>You cancelled checkout — nothing was purchased. You can try again anytime.</p>
          <Button onClick={returnToSession}>Back to your project</Button>
        </>
      )}
    </div>
  );
}
