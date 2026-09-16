import { type PricingCategory, type createPricingCatalog } from './pricing-catalog.js';

export interface GetPricingTiersToolDeps {
  catalog: ReturnType<typeof createPricingCatalog>;
}

export type GetPricingTiersResult =
  | Awaited<ReturnType<ReturnType<typeof createPricingCatalog>['getTiers']>>
  | { error: 'invalid_input' };

const VALID_CATEGORIES: readonly PricingCategory[] = [
  'hosting',
  'database',
  'ai',
  'domain',
  'email',
];

function isValidCategory(value: unknown): value is PricingCategory {
  return typeof value === 'string' && (VALID_CATEGORIES as readonly string[]).includes(value);
}

function isGetPricingTiersInput(input: unknown): input is { category?: PricingCategory } {
  if (typeof input !== 'object' || input === null) return false;
  if (!('category' in input) || (input as { category: unknown }).category === undefined) {
    return true;
  }
  return isValidCategory((input as { category: unknown }).category);
}

/**
 * `get_pricing_tiers` tool (Epic 3.4): the agent's interface to the live
 * pricing catalog (pricing-catalog.ts, #46) — real, pre-sourced tiers to
 * build render_cost_table line items from, rather than relying on the
 * agent to find and cite its own sources via general web search. Returns
 * the catalog's `stale` flag as-is so the agent can decide whether to
 * caveat a figure, per the system prompt's honesty constraints.
 */
export function createGetPricingTiersTool(deps: GetPricingTiersToolDeps) {
  const { catalog } = deps;

  async function get_pricing_tiers(rawInput: unknown): Promise<GetPricingTiersResult> {
    if (!isGetPricingTiersInput(rawInput)) {
      return { error: 'invalid_input' };
    }

    return catalog.getTiers(rawInput.category);
  }

  return { get_pricing_tiers };
}
