import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TIER_IDS, isTierId } from './tier-catalog.js';

beforeEach(() => {
  vi.resetModules();
});

// loadEnv caches its result in a module-level variable (env.ts), so getting
// a second, differently-configured Env in the same test file requires a
// fresh module instance each time — same pattern as env.test.ts.
async function testEnv(overrides: Partial<Record<string, string>> = {}) {
  const { loadEnv } = await import('./env.js');
  return loadEnv({ NODE_ENV: 'test', ...overrides } as unknown as NodeJS.ProcessEnv);
}

async function testCatalog(overrides: Partial<Record<string, string>> = {}) {
  const { getTierCatalog } = await import('./tier-catalog.js');
  return getTierCatalog(await testEnv(overrides));
}

describe('tier-catalog (#97)', () => {
  it('defines exactly the four output tiers', () => {
    expect(TIER_IDS).toEqual(['app-refinement-topup', 'spec-pack', 'pitch-deck', 'financial-pack']);
  });

  it('returns one product per tier, each with an id, name, copy, and price', async () => {
    const catalog = await testCatalog();
    expect(catalog).toHaveLength(4);
    for (const product of catalog) {
      expect(TIER_IDS).toContain(product.id);
      expect(product.name.length).toBeGreaterThan(0);
      expect(product.description.length).toBeGreaterThan(0);
      expect(product.priceCents).toBeGreaterThan(0);
      expect(['subscription', 'one_off']).toContain(product.billingModel);
    }
  });

  it('marks the app-refinement top-up as the only subscription-eligible tier, the rest one-off', async () => {
    const catalog = await testCatalog();
    const byId = Object.fromEntries(catalog.map((p) => [p.id, p]));
    expect(byId['app-refinement-topup']!.billingModel).toBe('subscription');
    expect(byId['spec-pack']!.billingModel).toBe('one_off');
    expect(byId['pitch-deck']!.billingModel).toBe('one_off');
    expect(byId['financial-pack']!.billingModel).toBe('one_off');
  });

  it('reads price points from env, not hardcoded values', async () => {
    const defaultCatalog = await testCatalog();
    vi.resetModules();
    const overriddenCatalog = await testCatalog({
      PRICE_APP_REFINEMENT_TOPUP_CENTS: '1234',
      PRICE_SPEC_PACK_CENTS: '5678',
      PRICE_PITCH_DECK_CENTS: '4321',
      PRICE_FINANCIAL_PACK_CENTS: '9999',
    });

    const defaultById = Object.fromEntries(defaultCatalog.map((p) => [p.id, p.priceCents]));
    const overriddenById = Object.fromEntries(overriddenCatalog.map((p) => [p.id, p.priceCents]));

    expect(overriddenById['app-refinement-topup']).toBe(1234);
    expect(overriddenById['spec-pack']).toBe(5678);
    expect(overriddenById['pitch-deck']).toBe(4321);
    expect(overriddenById['financial-pack']).toBe(9999);

    // Sanity check the override actually changed something from the default,
    // proving these are genuinely env-driven rather than coincidentally equal.
    expect(overriddenById['app-refinement-topup']).not.toBe(defaultById['app-refinement-topup']);
  });

  it('isTierId narrows an arbitrary string to a real tier id', () => {
    expect(isTierId('spec-pack')).toBe(true);
    expect(isTierId('not-a-real-tier')).toBe(false);
  });
});
