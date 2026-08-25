// Vercel's Fastify entrypoint detector requires a *direct* import of
// `fastify` in this file — it does not follow the import chain into
// `buildApp()`, where the instance is actually constructed. This import
// has no other purpose here.
import fastify from 'fastify';
import { buildApp } from './src/build-app.js';
import { loadEnv } from './src/env.js';

/**
 * Vercel Functions entrypoint (Epic 0.6). Per Vercel's Fastify integration,
 * the entrypoint must call `fastify.listen()` itself — Vercel's Fluid
 * Compute wraps the resulting HTTP server, it does not drive requests
 * through an exported app instance the way the Express/Hono integrations
 * do. See https://vercel.com/docs/frameworks/backend/fastify.
 *
 * `build-app.ts` is named that (not `app.ts`) because `src/app.ts` matches
 * Vercel's entrypoint auto-detection (`app`/`index`/`server`/`main`, at the
 * project root and under `src/`) and was picked up as a second, invalid
 * candidate entrypoint, crashing the function at runtime.
 */
void fastify; // referenced only to satisfy the detector's static import scan

const env = loadEnv();
const app = buildApp(env);

app.listen({ port: env.PORT, host: env.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
