import { useEffect, useRef, useState } from 'react';
import { useMarket } from './useMarket';
import { Landing } from './components/Landing';
import { Dashboard } from './components/Dashboard';

/**
 * Getinvestage — screen routing + wipe transition.
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
  const [screen, setScreen] = useState('landing');
  const [leaving, setLeaving] = useState(false);
  const [pendingAsk, setPendingAsk] = useState(null);
  const timersRef = useRef([]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
  }, [accentColor]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const go = (target, opts = {}) => {
    if (leaving) return;
    setLeaving(true);
    if (opts.ask) setPendingAsk(opts.ask);
    if (target === 'landing') setPendingAsk(null);
    timersRef.current.push(setTimeout(() => setScreen(target), 450));
    timersRef.current.push(setTimeout(() => setLeaving(false), 1000));
  };

  return (
    <div style={{ height: '100%', background: 'var(--bg)' }}>
      {screen === 'landing' ? (
        <Landing
          instruments={market.instruments}
          ambientMotion={ambientMotion}
          onLaunch={(opts) => go('dashboard', opts ?? {})}
        />
      ) : (
        <Dashboard market={market} initialAsk={pendingAsk} onBack={() => go('landing')} />
      )}

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
    </div>
  );
}
