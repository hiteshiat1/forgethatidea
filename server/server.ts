import { buildApp } from './src/app.js';

/**
 * Vercel Functions entrypoint (Epic 0.6). Vercel detects Fastify from this
 * file and runs the exported app directly — no `.listen()`, no `api/`
 * folder, no rewrites. Local dev and the standalone container image still
 * use `src/index.ts`, which calls `.listen()` for a real bound port.
 */
export default buildApp();
