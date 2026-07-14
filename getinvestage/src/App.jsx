import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useMarket } from './useMarket';
import { ProtectedRoute } from './auth';
import { useWipeNavigate } from './wipe';
import { Landing } from './components/Landing';
import { Dashboard } from './components/Dashboard';
import { AuthForm } from './routes/AuthForm';
import { Account } from './routes/Account';
import { Analysis } from './routes/Analysis';
import { NotFound } from './routes/NotFound';

/**
 * Getinvestage — routes.
 *
 * Navigation is real URLs now (was a useState screen switch), so /dashboard is
 * linkable, the back button works, and a hard refresh lands where you were.
 * FastAPI serves index.html for any non-/api path so those refreshes don't 404
 * in production — see backend/main.py.
 *
 * The market feed lives here, above the routes, so switching pages doesn't
 * tear down the poller and re-request every quote.
 *
 * Tweakable props:
 *  - accentColor: '#EDEDED' (presets: white #EDEDED, gold #E8C268, blue #5B8CFF, green #4EC58F)
 *  - marketTempo: 'calm' | 'normal' | 'volatile'
 *  - ambientMotion: boolean
 */
export default function App({
  accentColor = '#EDEDED',
  marketTempo = 'normal',
  ambientMotion = true,
}) {
  const market = useMarket(marketTempo);
  const wipeTo = useWipeNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
  }, [accentColor]);

  return (
    <div style={{ height: '100%', background: 'var(--bg)' }}>
      <Routes>
        <Route
          path="/"
          element={
            <Landing
              instruments={market.instruments}
              ambientMotion={ambientMotion}
              // The pending question rides along in router state instead of a
              // parent useState, so it survives the navigation.
              onLaunch={(opts) => wipeTo('/dashboard', { state: { ask: opts?.ask ?? null } })}
            />
          }
        />

        <Route
          path="/dashboard"
          element={
            <Dashboard
              market={market}
              initialAsk={location.state?.ask ?? null}
              onBack={() => wipeTo('/')}
            />
          }
        />

        {/* Public: anyone can research a stock. Saving it needs an account. */}
        <Route path="/analysis" element={<Analysis />} />

        <Route path="/login" element={<AuthForm mode="login" />} />
        <Route path="/register" element={<AuthForm mode="register" />} />

        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
