import { describe, it, expect, vi } from 'vitest';
import { createGetPricingTiersTool } from './get-pricing-tiers-tool.js';
import { createPricingCatalog, type PricingClient, type PricingTier } from './pricing-catalog.js';

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

function buildCatalog(tiers: PricingTier[] = SAMPLE_TIERS) {
  const client: PricingClient = { fetchTiers: vi.fn(async () => tiers) };
  return createPricingCatalog({ client });
}

describe('get_pricing_tiers tool (#47)', () => {
  it('returns every tier when no category filter is given', async () => {
    const catalog = buildCatalog();
    const tool = createGetPricingTiersTool({ catalog });

    const result = await tool.get_pricing_tiers({});

    if ('error' in result) throw new Error('expected success');
    expect(result.tiers).toEqual(SAMPLE_TIERS);
  });

  it('filters by category when given one', async () => {
    const catalog = buildCatalog();
    const tool = createGetPricingTiersTool({ catalog });

    const result = await tool.get_pricing_tiers({ category: 'hosting' });

    if ('error' in result) throw new Error('expected success');
    expect(result.tiers).toHaveLength(1);
    expect(result.tiers[0]!.category).toBe('hosting');
  });

  it('rejects an invalid category', async () => {
    const catalog = buildCatalog();
    const tool = createGetPricingTiersTool({ catalog });

    const result = await tool.get_pricing_tiers({ category: 'not-a-real-category' });

    expect(result).toMatchObject({ error: 'invalid_input' });
  });

  it('surfaces staleness from the catalog', async () => {
    const catalog = buildCatalog();
    const tool = createGetPricingTiersTool({ catalog });

    const result = await tool.get_pricing_tiers({});

    expect(result).toHaveProperty('stale');
  });
});
