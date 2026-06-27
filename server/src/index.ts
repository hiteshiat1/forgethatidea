import { buildApp } from './app.js';
import { loadEnv } from './env.js';

async function main() {
  const env = loadEnv();
  const app = buildApp(env);

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down`);
      await app.close();
      process.exit(0);
    });
  }
}

main();
