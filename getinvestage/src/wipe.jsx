import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/* The wipe transition, moved off the old useState screen-switch and onto the
 * router. Timing is unchanged from the original App.jsx: the panel starts
 * sweeping, the route swaps 450ms in (behind the panel), and the panel
 * finishes clearing at 1000ms. */

const SWAP_MS = 450;
const CLEAR_MS = 1000;

const WipeContext = createContext(null);

export function WipeProvider({ children }) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const wipeTo = useCallback(
    (to, options) => {
      if (leaving) return; // ignore a second click mid-transition
      setLeaving(true);
      timers.current.push(setTimeout(() => navigate(to, options), SWAP_MS));
      timers.current.push(setTimeout(() => setLeaving(false), CLEAR_MS));
    },
    [leaving, navigate],
  );

  return (
    <WipeContext.Provider value={wipeTo}>
      {children}
      {leaving && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            background: '#0d0e11',
            borderRight: '1px solid rgba(255,255,255,0.1)',
            transformOrigin: 'left',
            animation: 'wipe 1s cubic-bezier(0.7, 0, 0.2, 1) forwards',
            pointerEvents: 'none',
          }}
        />
      )}
    </WipeContext.Provider>
  );
}

/** navigate(to, options) with the wipe animation in front of it. */
export function useWipeNavigate() {
  const ctx = useContext(WipeContext);
  if (!ctx) throw new Error('useWipeNavigate must be used inside <WipeProvider>');
  return ctx;
}
