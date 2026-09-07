import type { AssistantContentBlock, StreamMessageRequest } from './anthropic-client.js';
import type { GenerationSpec } from './generation-spec.js';

const MIN_RECORDS_PER_ENTITY = 5;
const MAX_RECORDS_PER_ENTITY = 15;

export type SeedRecord = Record<string, unknown>;
export type SeedData = Record<string, SeedRecord[]>;

export interface SeedDataSuccess {
  ok: true;
  seedData: SeedData;
}

export interface SeedDataFailure {
  ok: false;
  error:
    | 'model_error'
    | 'invalid_json'
    | 'missing_entity_data'
    | 'volume_out_of_range'
    | 'possible_real_pii';
  details?: string;
}

export type SeedDataResult = SeedDataSuccess | SeedDataFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isSeedDataFailure(result: SeedDataResult): result is SeedDataFailure {
  return result.ok === false;
}

/**
 * Composes the seed-data generation prompt: asks the model for realistic,
 * ICP-relevant sample records per entity as a single JSON object (entity
 * name -> array of records matching that entity's fields), explicit about
 * volume (5-15 per entity, per Epic 4.8's acceptance criteria) and that
 * every record must be clearly fictional.
 */
export function buildSeedDataPrompt(spec: GenerationSpec): string {
  const entitiesBlock = spec.entities
    .map((e) => `- ${e.name}: ${e.fields.map((f) => `${f.name} (${f.type})`).join(', ')}`)
    .join('\n');

  return `
Generate realistic sample (seed) data for "${spec.productName}", built for: ${spec.icp}.

Entities and their fields:
${entitiesBlock}

Requirements:
- Produce between ${MIN_RECORDS_PER_ENTITY} and ${MAX_RECORDS_PER_ENTITY} records per entity.
- Every record must be clearly fictional — never use a real person's name, a real email address, a real phone number, or any other real personal data.
- Data should feel realistic and relevant to the ICP, not generic placeholders like "Item 1" or "Test User".
- Respond with ONLY a single JSON object: keys are exact entity names, values are arrays of record objects matching that entity's fields. No prose, no markdown code fences.
`.trim();
}

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;

function containsPossiblePii(value: unknown): boolean {
  if (typeof value === 'string') {
    return EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsPossiblePii);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(containsPossiblePii);
  }
  return false;
}

/**
 * Parses and validates a model's seed-data JSON response against the spec's
 * entities: every entity must be present, its record count must fall within
 * [5, 15], and no record may contain an email-shaped or phone-shaped string
 * — a fast, deterministic heuristic for "no real personal data" that the
 * generation prompt alone can't guarantee. Never throws on malformed input.
 */
export function parseSeedDataResponse(json: string, spec: GenerationSpec): SeedDataResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'invalid_json' };
  }

  const seedData = parsed as SeedData;

  for (const entity of spec.entities) {
    const records = seedData[entity.name];
    if (!Array.isArray(records)) {
      return { ok: false, error: 'missing_entity_data', details: entity.name };
    }
    if (records.length < MIN_RECORDS_PER_ENTITY || records.length > MAX_RECORDS_PER_ENTITY) {
      return { ok: false, error: 'volume_out_of_range', details: entity.name };
    }
    if (containsPossiblePii(records)) {
      return { ok: false, error: 'possible_real_pii', details: entity.name };
    }
  }

  return { ok: true, seedData };
}

export interface SeedDataAnthropicClient {
  streamMessage(
    request: StreamMessageRequest,
    handlers: { onText?: (text: string) => void },
  ): Promise<{
    inputTokens: number;
    outputTokens: number;
    stopReason: string;
    content: AssistantContentBlock[];
  }>;
}

export interface GenerateSeedDataInput {
  spec: GenerationSpec;
  anthropicClient: SeedDataAnthropicClient;
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Seed-data generator (Epic 4.8): a dedicated model call producing
 * structured JSON seed records per entity, separate from the main app
 * generation call (#65) — the codegen contract's inline instruction alone
 * can't guarantee volume or screen for real-PII-shaped strings, since it's
 * free-form JSX; a dedicated JSON response can be validated directly.
 * "No dead-end states": a model failure resolves to a typed `model_error`
 * rather than throwing.
 */
export async function generateSeedData(input: GenerateSeedDataInput): Promise<SeedDataResult> {
  const { spec, anthropicClient } = input;
  const model = input.model ?? DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const prompt = buildSeedDataPrompt(spec);

  let result;
  try {
    result = await anthropicClient.streamMessage(
      { model, maxTokens, messages: [{ role: 'user', content: prompt }] },
      {},
    );
  } catch {
    return { ok: false, error: 'model_error' };
  }

  const text = result.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return parseSeedDataResponse(text, spec);
}
