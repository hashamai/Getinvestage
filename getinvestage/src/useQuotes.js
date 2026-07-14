import { useEffect, useRef, useState } from 'react';
import { api } from './api';

/* Live quotes for an arbitrary set of symbols.
 *
 * useMarket() only knows the 16 hardcoded SEED instruments, so a symbol you
 * find via search has no price to show. This hook fills that gap: give it any
 * list of tickers and it polls the batch endpoint for them.
 *
 * It uses /api/quotes (one request for N symbols) rather than N calls to
 * /api/quote — the server fans out concurrently and the whole thing costs one
 * round trip. Polling matches the server's 30s quote cache; going faster would
 * just re-read the same cached value.
 */

const POLL_MS = 20_000;

export function useQuotes(symbols) {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);

  // Poll on the *contents* of the list, not its identity — callers build this
  // array inline, so a reference dep would restart the poller every render.
  const key = symbols.join(',');
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!key) {
      setQuotes({});
      return;
    }

    let alive = true;
    const fetchQuotes = async () => {
      try {
        const data = await api.get(`/api/quotes?symbols=${encodeURIComponent(key)}`);
        // Drop a response that arrived after the symbol list already changed,
        // or a slow request for the old list overwrites the new one.
        if (!alive || keyRef.current !== key) return;
        setQuotes(data);
      } catch {
        /* transient failure — keep the last good quotes rather than blanking */
      } finally {
        if (alive) setLoading(false);
      }
    };

    setLoading(true);
    fetchQuotes();
    const id = setInterval(fetchQuotes, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [key]);

  return { quotes, loading };
}
