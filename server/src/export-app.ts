/**
 * App download/export (Epic 4.14): wraps the generated code in a single
 * downloadable .jsx file with a prepended comment-block README explaining
 * how to run it — no zip/multi-file bundling, since the instructions travel
 * with the file wherever it's copied and no new dependency is needed for a
 * single-file export.
 */
export function buildExportedFile(code: string, productName: string): string {
  const readme = `/*
 * ${productName} — exported from Forge (forgethatidea.com)
 *
 * This is a mocked prototype: a single self-contained React component with
 * seed data and mock auth/CRUD baked in — there is no real backend, and
 * nothing here persists beyond the browser session it runs in.
 *
 * To run it:
 *
 * With Vite:
 *   1. npm create vite@latest my-app -- --template react
 *   2. Replace src/App.jsx with this file's contents.
 *   3. npm install && npm run dev
 *
 * With Next.js:
 *   1. npx create-next-app@latest my-app
 *   2. Save this file as app/page.jsx (App Router) or pages/index.jsx (Pages Router).
 *   3. npm run dev
 */

`;
  return `${readme}${code}`;
}
