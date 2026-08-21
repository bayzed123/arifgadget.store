import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth, useToast } from '../../lib/store';
import { Logo } from '../../components/Logo';

type Mode = 'login' | 'setup' | 'forgot-username' | 'forgot-answer';

/**
 * Doubles as the first-run screen. `/api/admin/setup` only succeeds while the
 * admins table is empty, so the "create account" branch closes itself
 * permanently once an owner exists.
 *
 * The forgot-password steps only ever work for a staff/admin account with a
 * security question set — the backend gives the exact same generic error
 * for a missing account, the owner's own account, or one created before
 * this feature existed, so this screen can never be used to confirm which
 * usernames are real or which one belongs to the owner.
 */
export function Login() {
  const { signIn } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function backToLogin(prefillUsername?: string) {
    setMode('login');
    setError('');
    setPassword('');
    setAnswer('');
    setNewPassword('');
    setConfirmPassword('');
    setQuestion('');
    if (prefillUsername !== undefined) setUsername(prefillUsername);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      if (mode === 'setup') {
        await api('/api/admin/setup', { method: 'POST', body: { username, name, password } });
        toast('Owner account created', 'success');
      }
      await signIn(username, password);
      toast('Signed in', 'success');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Sign in failed';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotUsername(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api<{ question: string }>('/api/admin/forgot-password/start', { method: 'POST', body: { username } });
      setQuestion(res.question);
      setMode('forgot-answer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start password reset');
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotAnswer(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (newPassword.length < 10) {
      setError('New password must be at least 10 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api('/api/admin/forgot-password/verify', {
        method: 'POST',
        body: { username, answer, new_password: newPassword },
      });
      toast('Password updated — sign in with the new one', 'success');
      backToLogin(username);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'setup' ? 'Create owner account' : mode === 'forgot-username' || mode === 'forgot-answer' ? 'Reset your password' : 'Staff sign in';
  const subtitle =
    mode === 'setup'
      ? 'Only available until the first account exists.'
      : mode === 'forgot-username'
        ? 'Enter your username to see your security question.'
        : mode === 'forgot-answer'
          ? 'Answer your security question to set a new password.'
          : 'Manage products, stock and orders.';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'var(--bg)',
      }}
    >
      <div className="panel" style={{ width: '100%', maxWidth: 420 }}>
        <div className="panel-body stack gap-24" style={{ padding: 30 }}>
          <div className="center" style={{ color: 'var(--ink)' }}>
            <Logo />
          </div>

          <div className="center">
            <h1 style={{ fontSize: '1.35rem' }}>{title}</h1>
            <p className="small muted">{subtitle}</p>
          </div>

          {mode === 'forgot-username' && (
            <form className="stack gap-16" onSubmit={submitForgotUsername}>
              <div className="field">
                <label htmlFor="fu-user">Username</label>
                <input
                  id="fu-user"
                  className="input"
                  required
                  maxLength={60}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.trim())}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                />
              </div>

              {error && <div className="alert error">{error}</div>}

              <button className="btn primary lg block" type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
            </form>
          )}

          {mode === 'forgot-answer' && (
            <form className="stack gap-16" onSubmit={submitForgotAnswer}>
              <div className="field">
                <label>Your security question</label>
                <p className="small" style={{ fontWeight: 600 }}>
                  {question}
                </p>
              </div>

              <div className="field">
                <label htmlFor="fa-answer">Answer</label>
                <input
                  id="fa-answer"
                  className="input"
                  required
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="fa-new">New password</label>
                <input
                  id="fa-new"
                  type="password"
                  className="input"
                  required
                  minLength={10}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <span className="hint">At least 10 characters.</span>
              </div>

              <div className="field">
                <label htmlFor="fa-confirm">Confirm new password</label>
                <input
                  id="fa-confirm"
                  type="password"
                  className="input"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {error && <div className="alert error">{error}</div>}

              <button className="btn primary lg block" type="submit" disabled={busy}>
                {busy ? 'Updating…' : 'Set new password'}
              </button>
            </form>
          )}

          {(mode === 'login' || mode === 'setup') && (
            <form className="stack gap-16" onSubmit={submit}>
              {mode === 'setup' && (
                <div className="field">
                  <label htmlFor="lname">Your name</label>
                  <input
                    id="lname"
                    className="input"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="field">
                <label htmlFor="luser">Username</label>
                {/*
                  No placeholder. This field used to suggest the shop's real
                  sign-in name, which put half of a working credential on a page
                  anyone can open — an attacker was left guessing only the
                  password. The label is enough to say what belongs here.

                  `autoComplete` stays on so a staff member's own saved password
                  still fills in; that is their browser's copy, not ours.
                */}
                <input
                  id="luser"
                  className="input"
                  required
                  maxLength={60}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.trim())}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>

              <div className="field">
                <label htmlFor="lpass">Password</label>
                <input
                  id="lpass"
                  type="password"
                  className="input"
                  required
                  minLength={mode === 'setup' ? 10 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                />
                {mode === 'setup' && <span className="hint">At least 10 characters.</span>}
              </div>

              {error && <div className="alert error">{error}</div>}

              <button className="btn primary lg block" type="submit" disabled={busy}>
                {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account & sign in'}
              </button>
            </form>
          )}

          <div className="center small stack gap-8">
            {mode === 'login' && (
              <button className="btn ghost sm" onClick={() => { setMode('forgot-username'); setError(''); }}>
                Forgot password?
              </button>
            )}

            {(mode === 'forgot-username' || mode === 'forgot-answer') && (
              <button className="btn ghost sm" onClick={() => backToLogin()}>
                Back to sign in
              </button>
            )}

            {(mode === 'login' || mode === 'setup') && (
              <button
                className="btn ghost sm"
                onClick={() => {
                  setMode(mode === 'login' ? 'setup' : 'login');
                  setError('');
                }}
              >
                {mode === 'login' ? 'First time? Create the owner account' : 'Back to sign in'}
              </button>
            )}
          </div>

          <div className="center">
            <Link to="/" className="small dim">
              ← Back to storefront
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
