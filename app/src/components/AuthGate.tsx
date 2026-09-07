import { useState, type FormEvent } from 'react';
import { color } from '@forge/shared';
import { Button } from '@forge/shared/ui';
import { signup, signin, type AuthUser } from '../api.js';
import { BrandLockup } from './BrandLockup.js';
import '../styles/auth-gate.css';

export interface AuthGateProps {
  onAuthenticated: (user: AuthUser) => void;
}

/**
 * Minimal real auth UI (Epic 0.8's backend, no frontend counterpart until
 * now) — a single email/password form that signs up a new account or signs
 * in an existing one, backed by the real httpOnly session cookie the
 * backend already issues. Scoped deliberately minimal: no password reset,
 * no email verification, no OAuth — just enough for a real session to
 * exist so the rest of the app (build route, #75) has something real to
 * act on. A dedicated, polished onboarding/auth experience is its own
 * future issue.
 */
export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result =
      mode === 'signup' ? await signup(email, password) : await signin(email, password);

    setSubmitting(false);
    if (!result.ok) {
      setError(
        result.error.error === 'email_already_registered'
          ? 'That email is already registered — try signing in instead.'
          : result.error.error === 'invalid_credentials'
            ? 'Incorrect email or password.'
            : 'Something went wrong. Please try again.',
      );
      return;
    }
    onAuthenticated(result.data);
  }

  return (
    <div className="auth-gate">
      <BrandLockup variant="hero" />
      <p style={{ color: color.slate[300], fontSize: '1.05rem', maxWidth: 420 }}>
        Sign {mode === 'signup' ? 'up' : 'in'} to start building.
      </p>
      <form className="auth-gate__form" onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="auth-gate__input"
        />
        <input
          type="password"
          placeholder="Password (min 10 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={10}
          className="auth-gate__input"
        />
        {error && <p className="auth-gate__error">{error}</p>}
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'signup' ? 'Sign up' : 'Sign in'}
        </Button>
      </form>
      <button
        type="button"
        className="auth-gate__switch"
        onClick={() => {
          setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
          setError(null);
        }}
      >
        {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </button>
    </div>
  );
}
