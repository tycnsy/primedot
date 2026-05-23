import { Navigate, useLocation } from 'react-router-dom';
import { FormEvent, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const location = useLocation();
  const {
    user,
    loading,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
  } = useAuth();
  const nextPath =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof location.state.from === 'string' &&
    location.state.from.startsWith('/')
      ? location.state.from
      : '/projects';
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'google' | 'password' | null>(
    null,
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  if (user) {
    return <Navigate to={nextPath} replace />;
  }

  const onGoogleClick = async () => {
    setError(null);
    setNotice(null);
    setBusyAction('google');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setBusyAction(null);
    }
  };

  const onPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusyAction('password');
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password);
      } else {
        await signUpWithPassword(email, password);
        setNotice('Check your email to confirm your account before signing in.');
        setPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth request failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const isBusy = busyAction !== null;
  const isGoogleBusy = busyAction === 'google';
  const isPasswordBusy = busyAction === 'password';

  return (
    <div className="surface-glow relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-7 rounded-xl2 border border-border bg-surface/80 p-8 shadow-elev2 backdrop-blur-xl animate-fade-in">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            Sessions v1
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            prime<span className="text-accent">.</span>
          </h1>
          <p className="text-sm leading-relaxed text-muted text-balance">
            Time-tracking and project pacing for content creators.
          </p>
        </div>

        <button
          type="button"
          onClick={onGoogleClick}
          disabled={isBusy}
          className="btn-secondary w-full !py-2.5"
        >
          <GoogleGlyph />
          {isGoogleBusy ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-subtle">
          <span className="h-px flex-1 bg-border" />
          <span>or with email</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="segmented w-full">
          <button
            type="button"
            data-active={mode === 'signin'}
            onClick={() => {
              setMode('signin');
              setError(null);
              setNotice(null);
            }}
            disabled={isBusy}
            className="flex-1"
          >
            Sign in
          </button>
          <button
            type="button"
            data-active={mode === 'signup'}
            onClick={() => {
              setMode('signup');
              setError(null);
              setNotice(null);
            }}
            disabled={isBusy}
            className="flex-1"
          >
            Sign up
          </button>
        </div>

        <form className="space-y-3" onSubmit={onPasswordSubmit}>
          <div className="space-y-1.5">
            <label className="label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isBusy}
              className="input"
              placeholder="you@studio.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isBusy}
              className="input"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn-primary w-full !py-2.5" disabled={isBusy}>
            {isPasswordBusy
              ? mode === 'signin'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : notice ? (
          <p className="text-xs text-success">{notice}</p>
        ) : (
          <p className="text-xs leading-relaxed text-subtle">
            Google OAuth and Email provider must be enabled in Supabase. New
            email accounts require confirmation before access.
          </p>
        )}
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.28-1.93-6.14-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.86 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.36-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.68-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.68 2.84C6.72 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
