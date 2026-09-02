import { randomBytes, createHash } from 'node:crypto';

/**
 * Session tokens (Epic 0.8). The raw token is what's set in the session
 * cookie and given to the client; only its SHA-256 hash is ever stored in
 * the database, so a DB read (leak, backup, log) never exposes a usable
 * session credential. Comparison happens by hashing the presented token and
 * looking up that hash — never by comparing raw tokens.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
