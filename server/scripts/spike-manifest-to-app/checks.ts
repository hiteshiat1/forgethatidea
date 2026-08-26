import * as esbuild from 'esbuild';

export interface CompileCheckResult {
  ok: boolean;
  errors: string[];
}

/** Parses/transforms the generated code as TSX; does not execute it. */
export async function checkCompiles(code: string): Promise<CompileCheckResult> {
  try {
    await esbuild.transform(code, { loader: 'tsx', jsx: 'automatic' });
    return { ok: true, errors: [] };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'errors' in err
          ? JSON.stringify((err as { errors: unknown }).errors)
          : String(err);
    return { ok: false, errors: [message] };
  }
}

export interface ContractCheckResult {
  ok: boolean;
  violations: string[];
}

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\blocalStorage\b/, label: 'uses localStorage' },
  { pattern: /\bsessionStorage\b/, label: 'uses sessionStorage' },
  { pattern: /\bfetch\s*\(/, label: 'uses fetch()' },
  { pattern: /\bXMLHttpRequest\b/, label: 'uses XMLHttpRequest' },
  { pattern: /<form[\s>]/i, label: 'uses a <form> element' },
];

/** Checks the templated output contract: single default export, no forbidden APIs. */
export function checkContract(code: string): ContractCheckResult {
  const violations: string[] = [];

  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) violations.push(label);
  }

  if (!/export\s+default\s+function/.test(code)) {
    violations.push('no `export default function` found');
  }

  const importLines = code
    .split('\n')
    .filter((line) => /^\s*import\s/.test(line))
    .filter((line) => !/from\s+['"]react['"]/.test(line));
  if (importLines.length > 0) {
    violations.push(`imports beyond 'react': ${importLines.map((l) => l.trim()).join('; ')}`);
  }

  return { ok: violations.length === 0, violations };
}
