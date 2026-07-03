import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretDown, CaretUp, X } from '@phosphor-icons/react';
import { fmtPct, fmtPrice } from '../api';
import type { Quote } from '../types';

interface Alert {
  id: number;
  symbol: string;
  price: number;
  pct: number;
}

interface Props {
  quotes: Record<string, Quote | null> | null;
}

/**
 * Live market alerts: on each quote refresh, surfaces the biggest mover not
 * already announced. Max 3 visible, auto-dismiss after 7s.
 */
export function Notifications({ quotes }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const announcedRef = useRef<Set<string>>(new Set());
  const idRef = useRef(0);
  const firstRef = useRef(true);

  useEffect(() => {
    if (!quotes) return;
    // Skip the very first batch so the page doesn't toast on load.
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const movers = (Object.entries(quotes).filter(([, q]) => q) as [string, Quote][])
      .filter(([sym, q]) => Math.abs(q.percentChange) >= 1 && !announcedRef.current.has(sym))
      .sort((a, b) => Math.abs(b[1].percentChange) - Math.abs(a[1].percentChange));
    if (!movers.length) return;

    const [sym, q] = movers[0];
    announcedRef.current.add(sym);
    const id = ++idRef.current;
    setAlerts((list) => [...list.slice(-2), { id, symbol: sym, price: q.current, pct: q.percentChange }]);
    const timer = setTimeout(() => setAlerts((list) => list.filter((a) => a.id !== id)), 7000);
    return () => clearTimeout(timer);
  }, [quotes]);

  return (
    <div className="notif-stack" aria-live="polite">
      <AnimatePresence>
        {alerts.map((a) => {
          const down = a.pct < 0;
          return (
            <motion.div
              key={a.id}
              className="glass notif"
              initial={{ opacity: 0, x: 80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <span className={`notif-icon ${down ? 'down' : 'up'}`}>
                {down ? (
                  <CaretDown size={17} weight="fill" className="down" />
                ) : (
                  <CaretUp size={17} weight="fill" className="up" />
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <p className="notif-title">
                  {a.symbol} {down ? 'falls' : 'climbs'}{' '}
                  <span className={`num ${down ? 'down' : 'up'}`}>{fmtPct(a.pct)}</span>
                </p>
                <p className="notif-body num">Last {fmtPrice(a.price)} — market alert</p>
              </span>
              <button
                className="icon-btn"
                style={{ width: 26, height: 26, marginLeft: 'auto' }}
                aria-label="Dismiss alert"
                onClick={() => setAlerts((list) => list.filter((x) => x.id !== a.id))}
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
