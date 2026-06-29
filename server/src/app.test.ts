import { describe, it, expect } from 'vitest';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';

describe('health check', () => {
  it('returns ok', async () => {
    const app = buildApp(loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'forge-server' });
    await app.close();
  });
});
