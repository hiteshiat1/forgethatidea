import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('loadEnv — OPENAI_API_KEY', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('boots without OPENAI_API_KEY in development', async () => {
    const { loadEnv } = await import('./env.js');
    const env = loadEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('boots without OPENAI_API_KEY in test', async () => {
    const { loadEnv } = await import('./env.js');
    const env = loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('reads OPENAI_API_KEY when present', async () => {
    const { loadEnv } = await import('./env.js');
    const env = loadEnv({
      NODE_ENV: 'development',
      OPENAI_API_KEY: 'sk-test',
    } as NodeJS.ProcessEnv);
    expect(env.OPENAI_API_KEY).toBe('sk-test');
  });
});
