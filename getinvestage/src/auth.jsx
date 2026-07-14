import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, refreshSession, setAccessToken } from './api';

/* Auth state.
 *
 * status: 'loading' -> we're asking the refresh cookie whether there's a
 *                      session; render nothing decisive until we know
 *         'authed'  -> user is set
 *         'anon'    -> no session
 *
 * The 'loading' state exists to stop a protected route from bouncing a
 * logged-in user to /login during the first paint after a hard refresh.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  // On boot, the in-memory access token is gone (reload wiped it). The
  // httpOnly refresh cookie survives, so ask it for a new one.
  useEffect(() => {
    let alive = true;
    refreshSession().then((data) => {
      if (!alive) return;
      if (data) {
        setUser(data.user);
        setStatus('authed');
      } else {
        setStatus('anon');
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const adopt = useCallback((data) => {
    setAccessToken(data.access_token);
    setUser(data.user);
    setStatus('authed');
    return data.user;
  }, []);

  const login = useCallback(
    (email, password) =>
      api.post('/api/auth/login', { email, password }, { auth: false }).then(adopt),
    [adopt],
  );

  const register = useCallback(
    (email, password, displayName) =>
      api
        .post(
          '/api/auth/register',
          { email, password, display_name: displayName ?? '' },
          { auth: false },
        )
        .then(adopt),
    [adopt],
  );

  const logout = useCallback(async () => {
    // Clear local state even if the network call fails — the user asked to be
    // logged out, and the access token dies with the tab regardless.
    try {
      await api.post('/api/auth/logout', undefined, { auth: false });
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    setUser(null);
    setStatus('anon');
  }, []);

  const value = useMemo(
    () => ({ user, status, isAuthed: status === 'authed', login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Gate a route behind a session. Remembers where the user was headed so
 *  login can send them back there instead of dumping them on the home page. */
export function ProtectedRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        style={{
          height: '100vh',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--muted)',
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        Restoring session…
      </div>
    );
  }

  if (status === 'anon') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
