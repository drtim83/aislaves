'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Building2, Eye, EyeOff, KeyRound, PlaySquare } from 'lucide-react';
import { getFirebaseAuth, isFirebaseClientConfigured } from '@/lib/firebase/client';

export function LoginFormClient({ firebaseReady }: { firebaseReady: boolean }) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [pwdInvalid, setPwdInvalid] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [busy, setBusy] = useState(false);

  const clientFirebaseConfigured = firebaseReady || isFirebaseClientConfigured();

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      const emailEl = form.elements.namedItem('email') as HTMLInputElement | null;
      const pwdEl = form.elements.namedItem('password') as HTMLInputElement | null;
      const eInvalid = Boolean(emailEl && !emailEl.validity.valid);
      const pInvalid = Boolean(pwdEl && !pwdEl.validity.valid);
      setEmailInvalid(eInvalid);
      setPwdInvalid(pInvalid);
      setLiveError(
        eInvalid
          ? 'Email Address: Enter an email address in the format you@example.com.'
          : 'Password: Must be at least 6 characters.'
      );
      if (eInvalid) emailEl?.focus();
      else if (pInvalid) pwdEl?.focus();
      return;
    }

    setBusy(true);
    setLiveError('');
    try {
      let idToken: string | undefined;
      if (clientFirebaseConfigured) {
        const auth = getFirebaseAuth();
        const cred =
          authMode === 'signup'
            ? await createUserWithEmailAndPassword(auth, email, password)
            : await signInWithEmailAndPassword(auth, email, password);
        idToken = await cred.user.getIdToken();
      }

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idToken,
          email,
          demoRole: idToken ? undefined : 'operator',
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        session?: { role: 'operator' | 'sme_client' };
      };
      if (!res.ok) throw new Error(data.error || 'Sign in failed');

      router.push(data.session?.role === 'sme_client' ? '/portal' : '/operator');
      router.refresh();
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoRoleSwitch(demoRole: 'operator' | 'sme_client', tenantId?: string) {
    setBusy(true);
    setLiveError('');
    try {
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ demoRole, tenantId }),
      });
      router.push(demoRole === 'sme_client' ? '/portal' : '/operator/demo-stage');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            {clientFirebaseConfigured ? 'FIREBASE AUTH ENABLED' : 'LOCAL / SANDBOX AUTH'}
          </span>
          <h1 className="mt-2 mb-1 text-xl font-bold">
            {authMode === 'signin' ? 'Sign In to AISlaves' : 'Create AISlaves Operator Account'}
          </h1>
          <p className="m-0 text-xs text-[var(--text-muted)]">
            Operators access Plane A (`/operator`); SME owners land directly inside their read-only Supervision Portal (`/portal`).
          </p>
        </div>

        <div className="visually-hidden" aria-live="polite">
          {liveError}
        </div>

        {liveError ? (
          <div className="rounded-lg border border-[var(--danger)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--danger)]">
            {liveError}
          </div>
        ) : null}

        <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold mb-1">
              Work Email Address
            </label>
            <span id="email-hint" className="field-hint">
              Format: name@company.my
            </span>
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="username"
              spellCheck={false}
              enterKeyHint="next"
              required
              aria-invalid={emailInvalid ? 'true' : 'false'}
              aria-describedby={emailInvalid ? 'email-hint email-error' : 'email-hint'}
              data-error="email-error"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailInvalid && e.currentTarget.validity.valid) setEmailInvalid(false);
              }}
              onBlur={(e) => {
                if (e.target.value) setEmailInvalid(!e.target.validity.valid);
              }}
              placeholder="timothy.tok@gmail.com"
              className={`validated-input w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm ${
                emailInvalid ? 'user-invalid-fallback' : ''
              }`}
            />
            <div id="email-error" className="error-msg">
              <span role="img" aria-label="Error">
                !
              </span>{' '}
              Enter an email address in the format name@company.my.
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-xs font-semibold">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] bg-transparent border-0 cursor-pointer"
              >
                {showPwd ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    Hide password
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Show password
                  </>
                )}
              </button>
            </div>
            <span id="password-hint" className="field-hint">
              Minimum 6 characters
            </span>
            <input
              type={showPwd ? 'text' : 'password'}
              id="password"
              name="password"
              autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              enterKeyHint="done"
              required
              minLength={6}
              aria-invalid={pwdInvalid ? 'true' : 'false'}
              aria-describedby={pwdInvalid ? 'password-hint password-error' : 'password-hint'}
              data-error="password-error"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (pwdInvalid && e.currentTarget.validity.valid) setPwdInvalid(false);
              }}
              onBlur={(e) => {
                if (e.target.value) setPwdInvalid(!e.target.validity.valid);
              }}
              className={`validated-input w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm ${
                pwdInvalid ? 'user-invalid-fallback' : ''
              }`}
            />
            <div id="password-error" className="error-msg">
              <span role="img" aria-label="Error">
                !
              </span>{' '}
              Password must be at least 6 characters long.
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white cursor-pointer"
          >
            {authMode === 'signin' ? 'Sign In' : 'Create Operator Account'}
          </button>
        </form>

        <div className="border-t border-[var(--border)] pt-3 text-center text-xs text-[var(--text-muted)]">
          <button
            type="button"
            onClick={() => setAuthMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
            className="bg-transparent border-0 font-semibold text-[var(--accent)] underline cursor-pointer"
          >
            {authMode === 'signin'
              ? 'Need to register an operator email first? Create Account'
              : 'Already registered? Back to Sign In'}
          </button>
        </div>
      </section>

      {/* Zero-Friction Instant Pitch Mode Switchers */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <h2 className="m-0 text-sm font-bold">Instant Sales Demo Role Switcher</h2>
        <p className="m-0 text-xs text-[var(--text-muted)]">
          Jump straight into a client coffee-shop pitch without typing credentials:
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleDemoRoleSwitch('operator')}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--emerald)] px-3 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <PlaySquare className="h-3.5 w-3.5" aria-hidden="true" />
            Enter Demo Stage (Operator)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleDemoRoleSwitch('sme_client', 'demo-kopikita')}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer"
          >
            <Building2 className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
            Preview as KopiKita Boss
          </button>
        </div>
      </section>
    </div>
  );
}
