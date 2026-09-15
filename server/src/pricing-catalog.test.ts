import { describe, it, expect, vi } from 'vitest';
import {
  createPricingCatalog,
  createCuratedPricingClient,
  type PricingTier,
  type PricingClient,
} from './pricing-catalog.js';

const SAMPLE_TIERS: PricingTier[] = [
  {
    provider: 'Acme Host',
    tierName: 'Basic',
    category: 'hosting',
    monthlyCostCents: 1000,
    notes: 'test tier',
    sourceUrl: 'https://example.com/hosting',
  },
  {
    provider: 'Acme DB',
    tierName: 'Basic',
    category: 'database',
    monthlyCostCents: 500,
    notes: 'test tier',
    sourceUrl: 'https://example.com/db',
  },
];

function fakeClient(
  tiers: PricingTier[] = SAMPLE_TIERS,
): PricingClient & { fetchTiers: ReturnType<typeof vi.fn> } {
  return { fetchTiers: vi.fn(async () => tiers) };
}

describe('createPricingCatalog', () => {
  it('fetches tiers from the client on first call', async () => {
    const client = fakeClient();
    const catalog = createPricingCatalog({ client });

    const result = await catalog.getTiers();

    expect(result.tiers).toEqual(SAMPLE_TIERS);
    expect(client.fetchTiers).toHaveBeenCalledTimes(1);
  });

  it('caches results — a second call does not re-fetch', async () => {
    const client = fakeClient();
    const catalog = createPricingCatalog({ client });

    await catalog.getTiers();
    await catalog.getTiers();

    expect(client.fetchTiers).toHaveBeenCalledTimes(1);
  });

  it('filters by category when given one', async () => {
    const client = fakeClient();
    const catalog = createPricingCatalog({ client });

    const result = await catalog.getTiers('hosting');

    expect(result.tiers).toHaveLength(1);
    expect(result.tiers[0]!.category).toBe('hosting');
  });

  it('every tier carries a sourceUrl', async () => {
    const client = fakeClient();
    const catalog = createPricingCatalog({ client });

    const result = await catalog.getTiers();

    for (const tier of result.tiers) {
      expect(tier.sourceUrl).toEqual(expect.stringMatching(/^https?:\/\//));
    }
  });

  it('is not stale immediately after a fresh fetch', async () => {
    const client = fakeClient();
    const catalog = createPricingCatalog({ client, maxAgeMs: 1000 });

    const result = await catalog.getTiers();

    expect(result.stale).toBe(false);
  });

  it('flags results as stale once maxAgeMs has elapsed', async () => {
    vi.useFakeTimers();
    try {
      const client = fakeClient();
      const catalog = createPricingCatalog({ client, maxAgeMs: 1000 });

      await catalog.getTiers();
      vi.advanceTimersByTime(1001);
      const result = await catalog.getTiers();

      expect(result.stale).toBe(true);
      // Still cached — staleness doesn't trigger an automatic re-fetch.
      expect(client.fetchTiers).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-fetches after invalidate() is called', async () => {
    const client = fakeClient();
    const catalog = createPricingCatalog({ client });

    await catalog.getTiers();
    catalog.invalidate();
    await catalog.getTiers();

    expect(client.fetchTiers).toHaveBeenCalledTimes(2);
  });
});

describe('createCuratedPricingClient', () => {
  it('returns a non-empty tier list covering every pricing category', async () => {
    const client = createCuratedPricingClient();

    const tiers = await client.fetchTiers();

    const categories = new Set(tiers.map((t) => t.category));
    expect(categories).toEqual(new Set(['hosting', 'database', 'ai', 'domain', 'email']));
  });

  it('every curated tier carries a real-looking source URL', async () => {
    const client = createCuratedPricingClient();

    const tiers = await client.fetchTiers();

    for (const tier of tiers) {
      expect(tier.sourceUrl).toEqual(expect.stringMatching(/^https:\/\//));
    }
  });
});
