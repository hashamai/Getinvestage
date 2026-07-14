import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mark } from '../components/Mark';
import { useAuth } from '../auth';

/* Shared shell for /login and /register. One component rather than two
 * near-identical files — the only differences are the copy, the extra name
 * field, and which auth call fires. */

const microLabel = {
  display: 'block',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 6,
};

const fieldStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
  color: 'var(--text)',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--hairline)',
  outline: 'none',
};

function Field({ id, label, ...props }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={id} style={microLabel}>
        {label}
      </label>
      <input
        id={id}
        style={fieldStyle}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hairline)')}
        {...props}
      />
    </div>
  );
}

export function AuthForm({ mode }) {
  const isRegister = mode === 'register';
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where the user was headed before ProtectedRoute bounced them here.
  const from = location.state?.from ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return; // a double-submit would fire two registrations
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await auth.register(email, password, displayName);
      else await auth.login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
      setBusy(false); // stay on the form so the user can correct and retry
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 28,
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          <Mark size={19} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>getinvestage</span>
        </Link>

        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>
          {isRegister ? 'Create your account' : 'Sign in'}
        </h1>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 26px' }}>
          {isRegister
            ? 'Save a watchlist that follows you across devices.'
            : 'Welcome back. Your watchlist is where you left it.'}
        </p>

        <form onSubmit={onSubmit} noValidate>
          {isRegister && (
            <Field
              id="displayName"
              label="Name (optional)"
              type="text"
              autoComplete="name"
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}

          <Field
            id="email"
            label="Email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Field
            id="password"
            label="Password"
            type="password"
            required
            minLength={isRegister ? 8 : undefined}
            // Tells password managers to offer a new strong password on
            // signup and the saved one on login.
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {isRegister && (
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '-8px 0 16px' }}>
              At least 8 characters. A passphrase beats a short cryptic one.
            </p>
          )}

          {error && (
            <p
              role="alert"
              style={{
                fontSize: 12,
                color: 'var(--down)',
                border: '1px solid var(--down)',
                padding: '8px 10px',
                margin: '0 0 16px',
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%',
              padding: '11px 12px',
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'inherit',
              color: busy ? 'var(--muted)' : '#0d0e11',
              background: busy ? 'transparent' : 'var(--accent)',
              border: '1px solid var(--accent)',
              cursor: busy ? 'default' : 'pointer',
              transition: 'opacity 140ms ease',
            }}
          >
            {busy
              ? isRegister
                ? 'Creating…'
                : 'Signing in…'
              : isRegister
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 20 }}>
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <Link
            to={isRegister ? '/login' : '/register'}
            state={location.state}
            style={{ color: 'var(--text)' }}
          >
            {isRegister ? 'Sign in' : 'Create one'}
          </Link>
        </p>
      </div>
    </div>
  );
}
