import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('hashPassword / verifyPassword', () => {
  it('produces a hash that verifies against the original password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const hash1 = await hashPassword('same password');
    const hash2 = await hashPassword('same password');
    expect(hash1).not.toBe(hash2);
  });

  it('never stores the password in plaintext within the hash output', async () => {
    const hash = await hashPassword('do-not-leak-me');
    expect(hash).not.toContain('do-not-leak-me');
  });
});
