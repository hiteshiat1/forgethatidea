import { transform } from 'esbuild';
import { checkContractViolations, type ContractViolation } from './codegen-contract.js';

export type ValidationErrorCode = ContractViolation | 'compile_error';

export interface ValidationSuccess {
  ok: true;
}

export interface ValidationFailure {
  ok: false;
  errors: ValidationErrorCode[];
  /** Human-readable detail per error, in the same order as `errors` where applicable — fed to the auto-repair prompt (#67). */
  details: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isValidationFailure(result: ValidationResult): result is ValidationFailure {
  return result.ok === false;
}

/**
 * Static validation gate (Epic 4.5): every candidate artifact from the
 * generation pipeline (#65) is checked here before it's ever shown to a
 * user. Two independent checks run and their failures are combined rather
 * than short-circuiting on the first — auto-repair (#67) benefits from
 * seeing every problem in one repair round rather than fixing one violation
 * only to immediately hit the next on the following attempt:
 *
 * 1. Compile check (esbuild's JSX/TS transform) — catches anything that
 *    doesn't parse or transpile, including an unterminated JSX tag or a
 *    syntax error the model introduced.
 * 2. Forbidden-API scan (#63's `checkContractViolations`) — catches
 *    contract violations that compile fine but are disallowed
 *    (localStorage, fetch, a real <form> tag, missing default export).
 *
 * Never throws: an internal esbuild failure or any other unexpected error
 * resolves to a typed `ValidationFailure` rather than propagating, so a
 * validation crash can never take down a build request — same "no dead-end
 * states" discipline as the generation pipeline (#65) and orchestrator (#40).
 */
export async function validateGeneratedCode(code: string): Promise<ValidationResult> {
  const errors: ValidationErrorCode[] = [];
  const details: string[] = [];

  const contractViolations = checkContractViolations(code);
  errors.push(...contractViolations);
  details.push(...contractViolations.map((v) => `Contract violation: ${v}`));

  try {
    await transform(code, { loader: 'jsx', jsx: 'transform' });
  } catch (err) {
    errors.push('compile_error');
    details.push(err instanceof Error ? err.message : 'Unknown compile error');
  }

  if (errors.length > 0) {
    return { ok: false, errors, details };
  }

  return { ok: true };
}
