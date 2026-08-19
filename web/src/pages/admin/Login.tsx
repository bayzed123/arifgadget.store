import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth, useToast } from '../../lib/store';
import { Logo } from '../../components/Logo';

/**
 * Doubles as the first-run screen. `/api/admin/setup` only succeeds while the
 * admins table is empty, so the "create account" branch closes itself
 * permanently once an owner exists.
 */
export function Login() {
  const { signIn } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
            <h1 style={{ fontSize: '1.35rem' }}>{mode === 'login' ? 'Staff sign in' : 'Create owner account'}</h1>
            <p className="small muted">
              {mode === 'login'
                ? 'Manage products, stock and orders.'
                : 'Only available until the first account exists.'}
            </p>
          </div>

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

          <div className="center small">
            <button
              className="btn ghost sm"
              onClick={() => {
                setMode(mode === 'login' ? 'setup' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'First time? Create the owner account' : 'Back to sign in'}
            </button>
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
