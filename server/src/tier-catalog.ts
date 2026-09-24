import type { Env } from './env.js';

export const TIER_IDS = [
  'app-refinement-topup',
  'spec-pack',
  'pitch-deck',
  'financial-pack',
] as const;

export type TierId = (typeof TIER_IDS)[number];

export function isTierId(value: string): value is TierId {
  return (TIER_IDS as readonly string[]).includes(value);
}

export type BillingModel = 'subscription' | 'one_off';

export interface TierProduct {
  id: TierId;
  name: string;
  /** Centralised tier copy (#97) — the single place UI/checkout/receipts pull this text from, rather than each surface writing its own. */
  description: string;
  priceCents: number;
  billingModel: BillingModel;
}

/**
 * The four-output tier model (Epic 6.1): app-refinement top-up (metered,
 * subscribable), and three one-off unlockable modules — spec pack, pitch
 * deck, financial & strategy pack. Prices come from env (env.ts) so they're
 * configurable per environment without a code change; this module is the
 * single config source everything downstream (checkout, entitlements,
 * billing page, receipts) reads from rather than each defining its own copy
 * or price.
 */
export function getTierCatalog(env: Env): TierProduct[] {
  return [
    {
      id: 'app-refinement-topup',
      name: 'App Refinement Top-Up',
      description:
        'More rounds of app refinement beyond the free-tier limit, billed as a recurring top-up.',
      priceCents: env.PRICE_APP_REFINEMENT_TOPUP_CENTS,
      billingModel: 'subscription',
    },
    {
      id: 'spec-pack',
      name: 'Spec Pack',
      description:
        'Your locked plan turned into a full engineering spec — epics, issues, and dependency ordering, exportable straight to GitHub.',
      priceCents: env.PRICE_SPEC_PACK_CENTS,
      billingModel: 'one_off',
    },
    {
      id: 'pitch-deck',
      name: 'Pitch Deck',
      description:
        'An investor-ready pitch deck generated from your plan, with a revenue slide and real branding applied.',
      priceCents: env.PRICE_PITCH_DECK_CENTS,
      billingModel: 'one_off',
    },
    {
      id: 'financial-pack',
      name: 'Financial & Strategy Pack',
      description:
        'A grounded financial model and growth strategy for your idea — trajectory, funding routes, and kill-criteria, not invented numbers.',
      priceCents: env.PRICE_FINANCIAL_PACK_CENTS,
      billingModel: 'one_off',
    },
  ];
}
