import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing (Epic 0.8) via argon2id — OWASP's current recommendation.
 * Salt is generated per-hash and embedded in the output string; never store
 * or log the raw password.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  return verify(storedHash, password);
}
