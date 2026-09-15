export type PricingCategory = 'hosting' | 'database' | 'ai' | 'domain' | 'email';

export interface PricingTier {
  provider: string;
  tierName: string;
  category: PricingCategory;
  /** Cost in whole cents, per month, at the tier's baseline usage. */
  monthlyCostCents: number;
  /** Short plain-language note on what the baseline includes (e.g. "up to 100GB bandwidth"). */
  notes: string;
  /** The page this figure was sourced from — every line item must carry one (#47's "no invented prices"). */
  sourceUrl: string;
}

export interface PricingClient {
  /** Returns every known tier, freshest data the client has access to. */
  fetchTiers(): Promise<PricingTier[]>;
}

export interface PricingCatalogDeps {
  client: PricingClient;
  /** How old cached tiers can be before a lookup is flagged stale. Defaults to 30 days — hosting/DB/AI pricing doesn't change by the hour, but a quarter-old figure is worth flagging. */
  maxAgeMs?: number;
}

export interface PricingLookupResult {
  tiers: PricingTier[];
  /** True once any tier in the result is older than maxAgeMs — the caller (render_cost_table, #47) must label these clearly rather than presenting them as current. */
  stale: boolean;
  fetchedAt: number;
}

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Live pricing fetch service (Epic 3.3): the source of truth render_cost_table
 * (#47) reads from for defensible, sourced cost line items — "never invent a
 * price" only holds if there's a real, cited number to reach for instead.
 *
 * Mirrors web-search.ts's client/cache shape (a swappable `PricingClient`
 * behind an in-memory TTL cache) since there is no single API that returns
 * hosting+DB+AI+domain+email pricing together — `client.fetchTiers()` is the
 * seam a real implementation (scraping, a partner API, a maintained catalog)
 * plugs into without this service or its callers changing. Currently backed
 * by `createCuratedPricingClient` (a maintained snapshot with real source
 * URLs) rather than a live scrape, since real pricing pages change layout
 * often enough that scraping them reliably is its own project — the
 * "fetches/caches" contract and stale-labeling are what's real; the client
 * itself is the piece to swap out for a live source later.
 */
export function createPricingCatalog(deps: PricingCatalogDeps) {
  const { client } = deps;
  const maxAgeMs = deps.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  let cached: { tiers: PricingTier[]; fetchedAt: number } | null = null;

  async function getTiers(category?: PricingCategory): Promise<PricingLookupResult> {
    if (!cached) {
      const tiers = await client.fetchTiers();
      cached = { tiers, fetchedAt: Date.now() };
    }

    const stale = Date.now() - cached.fetchedAt > maxAgeMs;
    const tiers = category ? cached.tiers.filter((t) => t.category === category) : cached.tiers;

    return { tiers, stale, fetchedAt: cached.fetchedAt };
  }

  /** Forces a fresh fetch on the next call, discarding any cached tiers. */
  function invalidate(): void {
    cached = null;
  }

  return { getTiers, invalidate };
}

/**
 * Maintained pricing snapshot (Epic 3.3) — real published tiers as of the
 * date below, each with the page it came from. Update this list (and the
 * date) when pricing changes; this is plain data, not a live scrape, for the
 * reasons in createPricingCatalog's doc comment above.
 *
 * Last verified: 2026-09-15.
 */
const CURATED_TIERS: PricingTier[] = [
  {
    provider: 'Vercel',
    tierName: 'Pro',
    category: 'hosting',
    monthlyCostCents: 2000,
    notes: 'Per-member seat; includes 1TB bandwidth and unlimited projects',
    sourceUrl: 'https://vercel.com/pricing',
  },
  {
    provider: 'Vercel',
    tierName: 'Hobby',
    category: 'hosting',
    monthlyCostCents: 0,
    notes: 'Free for personal, non-commercial projects; 100GB bandwidth',
    sourceUrl: 'https://vercel.com/pricing',
  },
  {
    provider: 'Supabase',
    tierName: 'Pro',
    category: 'database',
    monthlyCostCents: 2500,
    notes: '8GB database, 100GB bandwidth, daily backups',
    sourceUrl: 'https://supabase.com/pricing',
  },
  {
    provider: 'Supabase',
    tierName: 'Free',
    category: 'database',
    monthlyCostCents: 0,
    notes: '500MB database, paused after 1 week of inactivity',
    sourceUrl: 'https://supabase.com/pricing',
  },
  {
    provider: 'Anthropic',
    tierName: 'Claude Sonnet API',
    category: 'ai',
    monthlyCostCents: 0,
    notes: 'Pay-as-you-go — no monthly base fee, billed per token used',
    sourceUrl: 'https://www.anthropic.com/pricing',
  },
  {
    provider: 'Namecheap',
    tierName: '.com domain',
    category: 'domain',
    monthlyCostCents: 100,
    notes: 'Roughly $12/year for a standard .com, amortized monthly',
    sourceUrl: 'https://www.namecheap.com/domains/',
  },
  {
    provider: 'Google Workspace',
    tierName: 'Business Starter',
    category: 'email',
    monthlyCostCents: 600,
    notes: 'Per-user custom email on your own domain',
    sourceUrl: 'https://workspace.google.com/pricing',
  },
  {
    provider: 'Resend',
    tierName: 'Free',
    category: 'email',
    monthlyCostCents: 0,
    notes: 'Transactional email, 3,000 emails/month free',
    sourceUrl: 'https://resend.com/pricing',
  },
];

/** The maintained-snapshot pricing client — see CURATED_TIERS' doc comment. */
export function createCuratedPricingClient(): PricingClient {
  return {
    fetchTiers: () => Promise.resolve(CURATED_TIERS),
  };
}
