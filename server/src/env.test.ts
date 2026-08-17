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

describe('loadEnv — GEMINI_API_KEY', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('boots without GEMINI_API_KEY in development', async () => {
    const { loadEnv } = await import('./env.js');
    const env = loadEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it('boots without GEMINI_API_KEY in test', async () => {
    const { loadEnv } = await import('./env.js');
    const env = loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it('reads GEMINI_API_KEY when present', async () => {
    const { loadEnv } = await import('./env.js');
    const env = loadEnv({
      NODE_ENV: 'development',
      GEMINI_API_KEY: 'gm-test',
    } as NodeJS.ProcessEnv);
    expect(env.GEMINI_API_KEY).toBe('gm-test');
  });
});
