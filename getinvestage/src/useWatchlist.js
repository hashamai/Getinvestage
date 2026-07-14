import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

/* The user's saved symbols, persisted server-side (Postgres in production).
 *
 * Add/remove are optimistic: the UI updates immediately and rolls back if the
 * server rejects it. A watchlist star that waits 300ms for a round trip feels
 * broken, and the failure case here is rare and cheap to undo. */

export function useWatchlist() {
  const { status } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.get('/api/watchlist'));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authed') reload();
    else if (status === 'anon') setItems([]); // never show a stale list after logout
  }, [status, reload]);

  const add = useCallback(async (symbol) => {
    const sym = symbol.trim().toUpperCase();
    const optimistic = { id: `pending:${sym}`, symbol: sym, position: 999 };
    setItems((prev) => (prev.some((i) => i.symbol === sym) ? prev : [...prev, optimistic]));
    try {
      const saved = await api.post('/api/watchlist', { symbol: sym });
      setItems((prev) => prev.map((i) => (i.id === optimistic.id ? saved : i)));
      setError(null);
    } catch (err) {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id)); // roll back
      setError(err.message);
      throw err;
    }
  }, []);

  const remove = useCallback(async (symbol) => {
    const sym = symbol.trim().toUpperCase();
    // Capture the removed rows from inside the updater, not from the render-time
    // `items`. Snapshotting the whole array and restoring it on failure would
    // clobber anything a concurrent add() appended in the meantime — and putting
    // `items` in the dep array also rebuilt remove/toggle on every list change,
    // re-rendering every row.
    let removed = [];
    setItems((prev) => {
      removed = prev.filter((i) => i.symbol === sym);
      return prev.filter((i) => i.symbol !== sym);
    });
    try {
      await api.del(`/api/watchlist/${encodeURIComponent(sym)}`);
      setError(null);
    } catch (err) {
      // Put back only what we took out, leaving concurrent changes intact.
      setItems((prev) => (prev.some((i) => i.symbol === sym) ? prev : [...prev, ...removed]));
      setError(err.message);
      throw err;
    }
  }, []);

  const has = useCallback(
    (symbol) => items.some((i) => i.symbol === symbol.trim().toUpperCase()),
    [items],
  );

  const toggle = useCallback(
    (symbol) => (has(symbol) ? remove(symbol) : add(symbol)),
    [has, add, remove],
  );

  return { items, loading, error, add, remove, toggle, has, reload };
}
