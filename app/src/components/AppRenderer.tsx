import { useMemo, useState } from 'react';
import tokensCss from '@forge/shared/tokens.css?raw';
import '../styles/app-renderer.css';

export interface AppRendererProps {
  /** Pre-transpiled plain JS (esbuild, IIFE assigned to the `ForgeCompiledApp` global) — see server/src/generation-validation.ts. */
  compiledCode: string;
}

const REACT_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js';
const REACT_DOM_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js';

/**
 * Builds the sandboxed iframe's full HTML document: React/ReactDOM loaded
 * from a CDN (no local build-time dependency, per Epic 4.7's scope), the
 * Forge design tokens inlined so generated apps render on-brand without a
 * network fetch, and the already-compiled generated code dropped straight
 * into an ordinary `<script>` tag.
 *
 * This used to run Babel Standalone in the browser (a `<script
 * type="text/babel">` tag), transpiling raw JSX at runtime — which requires
 * `eval()`/`new Function()` internally. Browsers block that under a strict
 * `script-src` CSP, and a `srcDoc` iframe unconditionally inherits its
 * parent document's CSP (there is no sandbox-attribute opt-out — adding
 * `allow-same-origin` would lift it, but that also hands the frame the
 * parent's real origin, i.e. its cookies/session, defeating the sandbox
 * entirely). The fix is to never need runtime JSX transpilation in the
 * browser at all: the server now compiles JSX to plain JS once (esbuild)
 * and this component just runs that. `sandbox="allow-scripts"` alone is
 * enough for a plain script tag.
 *
 * A window.onerror/unhandledrejection handler reports a runtime error (via
 * postMessage) as a banner inside the frame rather than letting it do
 * anything that could escape the sandbox or crash the host page.
 */
function buildSandboxDocument(compiledCode: string): string {
  const escapedCode = compiledCode.replace(/<\/script>/gi, '<\\/script>');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${tokensCss}</style>
<style>
  body { margin: 0; font-family: var(--forge-font-sans, sans-serif); background: var(--forge-ink-900, #0b0c0f); color: white; }
  #forge-generated-root { min-height: 100vh; }
  #forge-error-banner { display: none; padding: 16px; background: #3a1414; color: #ffb3b3; font-family: monospace; white-space: pre-wrap; }
</style>
<script src="${REACT_CDN}"></script>
<script src="${REACT_DOM_CDN}"></script>
<script>
function reportError(message) {
  var banner = document.getElementById('forge-error-banner');
  banner.style.display = 'block';
  banner.textContent = 'This preview hit an error and could not render:\\n' + message;
  try { parent.postMessage({ source: 'forge-app-renderer', type: 'error', message: message }, '*'); } catch (e) {}
}
window.onerror = function (message) { reportError(String(message)); return true; };
window.addEventListener('unhandledrejection', function (event) {
  reportError(event.reason && event.reason.message ? event.reason.message : String(event.reason));
});
</script>
</head>
<body>
<div id="forge-error-banner"></div>
<div id="forge-generated-root"></div>
<script>
${escapedCode}

try {
  var ForgeGeneratedComponent = (typeof ForgeCompiledApp !== 'undefined' && ForgeCompiledApp && ForgeCompiledApp.default);
  if (typeof ForgeGeneratedComponent !== 'function') {
    throw new Error('Generated code has no usable default-exported component.');
  }
  var root = ReactDOM.createRoot(document.getElementById('forge-generated-root'));
  root.render(React.createElement(ForgeGeneratedComponent));
} catch (err) {
  reportError(err && err.message ? err.message : String(err));
}
</script>
</body>
</html>`;
}

/**
 * Sandboxed app renderer (Epic 4.7): renders generated app code inside an
 * isolated iframe so a user's generated app can never touch the Forge
 * session, its cookies, or the parent page's DOM/JS — `sandbox="allow-scripts"`
 * deliberately omits `allow-same-origin`, which is what makes the isolation
 * real (a same-origin sandboxed frame can still reach the parent via the DOM).
 * The frame's own onerror/unhandledrejection handlers keep a runtime error in
 * the generated app from doing anything more than showing a banner inside
 * the frame — Forge itself is structurally unaffected either way.
 */
export function AppRenderer({ compiledCode }: AppRendererProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const srcDoc = useMemo(() => buildSandboxDocument(compiledCode), [compiledCode]);

  return (
    <div className={`app-renderer${isFullScreen ? ' app-renderer--fullscreen' : ''}`}>
      <div className="app-renderer__toolbar">
        <button
          type="button"
          className="app-renderer__toggle"
          onClick={() => setIsFullScreen((v) => !v)}
        >
          {isFullScreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>
      <iframe
        title="Generated app preview"
        className="app-renderer__frame"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
      />
    </div>
  );
}
