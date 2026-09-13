import { transform } from 'esbuild';
import { checkContractViolations, type ContractViolation } from './codegen-contract.js';

export type ValidationErrorCode = ContractViolation | 'compile_error';

export interface ValidationSuccess {
  ok: true;
  /**
   * Plain, already-transpiled JS (esbuild, IIFE format assigned to the
   * `ForgeCompiledApp` global) — lets the sandboxed preview iframe
   * (AppRenderer) run the generated app with an ordinary script tag, with
   * no client-side JSX transpilation and therefore no runtime string-eval
   * step at all. Browsers block that under a strict `script-src` CSP
   * (inherited by `srcDoc` iframes from the parent document,
   * unconditionally — there's no sandbox-attribute opt-out), and the only
   * safe fix that doesn't also grant the iframe `allow-same-origin` (which
   * would let generated code reach the parent's cookies/session, defeating
   * the whole point of the sandbox) is to never need that in the browser
   * in the first place.
   */
  compiledCode: string;
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

  let compiledCode: string | undefined;
  try {
    const result = await transform(code, {
      loader: 'jsx',
      jsx: 'transform',
      format: 'iife',
      globalName: 'ForgeCompiledApp',
    });
    compiledCode = result.code;
  } catch (err) {
    errors.push('compile_error');
    details.push(err instanceof Error ? err.message : 'Unknown compile error');
  }

  if (errors.length > 0) {
    return { ok: false, errors, details };
  }

  return { ok: true, compiledCode: compiledCode! };
}

/**
 * Compiles code for the preview iframe on the fly — used wherever a legacy
 * artifact (saved before `compiledCode` existed on the artifact content
 * shape) needs a compiled form, or where an already-active/previously-valid
 * artifact's original code needs recompiling (e.g. reverting a diff-edit).
 * Falls back to the raw source on a compile failure rather than throwing —
 * worse for the preview (it'll error there instead of rendering), but the
 * caller must still resolve rather than crash.
 */
export async function compileForPreview(code: string): Promise<string> {
  const result = await validateGeneratedCode(code);
  return isValidationFailure(result) ? code : result.compiledCode;
}
