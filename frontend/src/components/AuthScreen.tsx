import { useState } from 'react';
import { ApiError, login, register } from '../lib/api';

// Register or sign in to get a bearer session. The backend requires this before an attempt.
export default function AuthScreen({ onAuthed, onBack }: { onAuthed: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await register(alias, password, inviteCode);
      else await login(alias, password);
      onAuthed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="start">
      <img className="face" src="/face.png" alt="" aria-hidden="true" />
      <div className="start-overlay" />

      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-title">{mode === 'register' ? 'JOIN LARPLE' : 'WELCOME BACK'}</h1>
        <label>
          Alias
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            autoComplete="username"
            minLength={2}
            maxLength={30}
            pattern="[A-Za-z0-9_\-]+"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={10}
            maxLength={128}
            required
          />
        </label>
        {mode === 'register' && (
          <label>
            Invite code
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              autoComplete="off"
              maxLength={256}
            />
          </label>
        )}
        {error && <p className="auth-error">{error}</p>}

        <button className="btn btn--play" type="submit" disabled={busy}>
          {busy ? '…' : mode === 'register' ? 'CREATE ACCOUNT' : 'SIGN IN'}
        </button>

        <p className="auth-switch">
          {mode === 'register' ? 'Already have an account?' : 'Need an account?'}{' '}
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register');
              setError(null);
            }}
          >
            {mode === 'register' ? 'Sign in' : 'Register'}
          </button>
        </p>
        <button type="button" className="linkbtn" onClick={onBack}>
          ← Back
        </button>
      </form>
    </main>
  );
}
