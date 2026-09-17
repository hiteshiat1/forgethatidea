import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { act } from 'react';

export type HeadlessRenderErrorCode = 'no_component' | 'blank_render' | 'interaction_crashed';

export interface HeadlessRenderCheckInput {
  /** Pre-transpiled plain JS from generation-validation.ts — the same `ForgeCompiledApp`-global IIFE AppRenderer.tsx runs in the sandboxed preview iframe. */
  compiledCode: string;
  /** How many interactive elements (buttons, links) to click through. Default 5 — enough to exercise "core CRUD" without an exhaustive click-every-element pass that would just be slow. */
  maxInteractions?: number;
}

export interface HeadlessRenderSuccess {
  ok: true;
  /** True once the mounted app produced non-empty rendered content — a real render, not a blank screen. */
  hadContent: boolean;
  interactionsAttempted: number;
}

export interface HeadlessRenderFailure {
  ok: false;
  error: HeadlessRenderErrorCode;
  detail?: string;
}

export type HeadlessRenderResult = HeadlessRenderSuccess | HeadlessRenderFailure;

/**
 * Explicit type guard rather than relying on inline `!result.ok` narrowing —
 * this pattern has caused a Vercel-only build failure multiple times this
 * project even when local tsc is clean on the same TypeScript version.
 */
export function isHeadlessRenderFailure(
  result: HeadlessRenderResult,
): result is HeadlessRenderFailure {
  return result.ok === false;
}

const AMBIENT_GLOBALS = ['window', 'document', 'navigator', 'HTMLElement', 'Node'] as const;

/**
 * Installs a fresh jsdom window's globals onto `globalThis` for exactly the
 * duration of `fn`, then restores whatever was there before. react-dom
 * reaches for ambient `window`/`document` directly in several internal code
 * paths (e.g. `getActiveElementDeep` during commit) — passing a jsdom
 * `window` explicitly through the call chain is not enough, ambient
 * globals are required. This is scoped to one call rather than installed
 * for the whole process because esbuild's `transform` (used elsewhere in
 * the same generation pipeline, e.g. generation-validation.ts) throws an
 * "Invariant violation" if jsdom's globals are ambient when it runs (a
 * known esbuild/jsdom incompatibility, not a bug in either) — so jsdom must
 * never leak past this function's own call in the real nightly-eval CLI
 * process, which also calls the (non-jsdom) generation pipeline.
 *
 * Under vitest's `// @vitest-environment jsdom` docblock these globals are
 * already jsdom's own, so installing another jsdom's globals on top is
 * harmless (they're restored to the same ambient jsdom afterward, not to
 * `undefined`).
 */
async function withAmbientDom<T>(fn: () => Promise<T>): Promise<T> {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globalScope = globalThis as Record<string, unknown>;
  const previous = new Map<string, unknown>();
  // A plain assignment fails for globals Node itself defines as
  // getter-only (e.g. `navigator`, present since Node 21) — Object.defineProperty
  // can always overwrite a global's own property descriptor, regardless of
  // how it was originally declared.
  for (const key of AMBIENT_GLOBALS) {
    previous.set(key, globalScope[key]);
    const value =
      key === 'window' ? dom.window : (dom.window as unknown as Record<string, unknown>)[key];
    Object.defineProperty(globalScope, key, {
      value,
      writable: true,
      configurable: true,
    });
  }
  const previousActFlag = globalScope.IS_REACT_ACT_ENVIRONMENT;
  globalScope.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    return await fn();
  } finally {
    for (const key of AMBIENT_GLOBALS) {
      Object.defineProperty(globalScope, key, {
        value: previous.get(key),
        writable: true,
        configurable: true,
      });
    }
    globalScope.IS_REACT_ACT_ENVIRONMENT = previousActFlag;
    dom.window.close();
  }
}

/**
 * Headless render + click-through check (Epic 4.23): mounts a generated
 * app's compiled output in a fresh jsdom window per call and clicks through
 * a handful of interactive elements, asserting the app never crashes and
 * never renders a blank screen. This is the harness `run-eval.ts` invokes
 * per fixture once real generation output is available (currently only in
 * the nightly eval workflow, which is the only CI job with a live
 * ANTHROPIC_API_KEY today — see nightly-eval.yml).
 *
 * Deliberately does NOT attempt to assert semantic "core CRUD" correctness
 * (e.g. "clicking Add Habit adds a habit") — a manifest's `keyActions` are
 * free text ("create habit", "log completion") with no guaranteed mapping
 * to actual button labels the model generates, so text-matching against
 * them would be fragile and would fail for reasons unrelated to app
 * quality. What IS reliably checkable, and what this asserts instead: the
 * app mounts to real (non-blank) content, and clicking through whatever
 * interactive elements exist never throws an uncaught error — i.e. the app
 * is genuinely interactive, not just a static wall of text that happens to
 * compile.
 *
 * jsdom has no real layout engine (see responsive-pattern.ts's doc comment
 * for the same constraint), but layout isn't what this check needs —
 * mounting, re-rendering after state changes, and catching thrown errors
 * all work correctly in jsdom since those are DOM-tree and JS-execution
 * concerns, not rendering/paint concerns.
 *
 * `new Function` runs the compiled IIFE the same way AppRenderer's real
 * `<script>` tag does in the browser (see generation-validation.ts's
 * ForgeCompiledApp-global contract) — this only ever runs in CI/tests
 * against our own pipeline's freshly-generated, already-validated code,
 * never against arbitrary untrusted input in a live user-facing context,
 * so it isn't a security boundary the way the sandboxed iframe is.
 */
export async function runHeadlessRenderCheck(
  input: HeadlessRenderCheckInput,
): Promise<HeadlessRenderResult> {
  return withAmbientDom(() => runMountedCheck(input));
}

async function runMountedCheck(input: HeadlessRenderCheckInput): Promise<HeadlessRenderResult> {
  const maxInteractions = input.maxInteractions ?? 5;
  const globalScope = globalThis as Record<string, unknown>;
  const document = globalScope.document as {
    createElement: (tag: string) => HTMLElement;
    body: { appendChild: (el: HTMLElement) => void };
  };

  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | undefined;

  try {
    const React = await import('react');
    const ReactDOM = await import('react-dom');
    // The compiled artifact is `var ForgeCompiledApp = (...)();` — returning
    // it explicitly (rather than relying on the assignment reaching this
    // scope on its own, which a `var` inside a Function body does not do)
    // is what actually gets the module's exports back out.
    const evaluate = new Function(
      'React',
      'ReactDOM',
      `${input.compiledCode}\nreturn ForgeCompiledApp;`,
    );
    const compiledModule = evaluate(React, ReactDOM) as { default?: unknown } | undefined;
    const Component = compiledModule?.default;

    if (typeof Component !== 'function') {
      return { ok: false, error: 'no_component' };
    }

    root = createRoot(container as unknown as Element);
    act(() => {
      root!.render(createElement(Component as never));
    });

    if (container.children.length === 0) {
      return { ok: false, error: 'blank_render' };
    }

    const interactive = Array.from(
      container.querySelectorAll('button, a[href], [role="button"]'),
    ).slice(0, maxInteractions);

    // A click handler that throws surfaces as an "uncaught exception" event
    // on `window`, not as a synchronous throw out of `element.click()` —
    // React's dev-mode event dispatch (invokeGuardedCallbackDev) re-throws
    // it asynchronously via a real dispatched event rather than propagating
    // it back through the call stack, so a plain try/catch around the click
    // never sees it.
    // A click handler that throws inside React's dev-mode event dispatch
    // does not propagate back through a plain try/catch around
    // `element.click()` — React (in development builds) deliberately
    // re-dispatches it via a synthetic DOM event
    // (invokeGuardedCallbackDev) so browser devtools can pause on it, and
    // under jsdom this specific mechanism escapes as a real Node
    // `uncaughtException` rather than staying inside the jsdom window's own
    // event system. Intercepting at the process level, scoped to exactly
    // this click loop, is the only reliable way to catch it and report it
    // through this function's typed result instead of crashing the caller.
    let caughtError: Error | undefined;
    const onUncaughtException = (err: unknown) => {
      caughtError = err instanceof Error ? err : new Error(String(err));
    };
    process.on('uncaughtException', onUncaughtException);

    let interactionsAttempted = 0;
    try {
      for (const element of interactive) {
        act(() => {
          (element as unknown as HTMLElement).click();
        });
        interactionsAttempted += 1;
        if (caughtError) {
          return { ok: false, error: 'interaction_crashed', detail: caughtError.message };
        }
      }
    } finally {
      process.removeListener('uncaughtException', onUncaughtException);
    }

    return { ok: true, hadContent: true, interactionsAttempted };
  } catch (err) {
    return {
      ok: false,
      error: 'interaction_crashed',
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    container.remove();
  }
}
