import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Quote } from './types';

/** Fetch + poll helper with loading/error/refetch states. */
export function usePolled<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Clear stale data so the previous key's results never render under the
    // new key's label (e.g. AAPL's price under an MSFT header).
    setData(null);
    setLoading(true);
    setError(null);

    const run = (isFirst: boolean) =>
      fetcherRef
        .current()
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setError(null);
          if (isFirst) setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          // Keep last-good data on background poll failures.
          if (isFirst) {
            setData(null);
            setError(err);
            setLoading(false);
          }
        });

    run(true);
    const id = intervalMs > 0 ? setInterval(() => run(false), intervalMs) : undefined;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, intervalMs]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refetch };
}

/** Batched quote map for a list of symbols (single /api/quotes request). */
export function useQuoteMap(symbols: string[], intervalMs: number) {
  const key = symbols.join(',');
  return usePolled<Record<string, Quote | null>>(
    () => (symbols.length ? api.quotes(symbols) : Promise.resolve({})),
    intervalMs,
    [key],
  );
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

export type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) ?? 'dark',
  );
  // Layout effect so data-theme is applied before chart effects read CSS vars.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animated number that eases from its previous value to the new one. */
export function useCountUp(target: number, durationMs = 900): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reducedMotion() || !Number.isFinite(target)) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return display;
}

/**
 * Tracks quote movement between polls: returns 'up' | 'down' | null when the
 * price changed since the previous value, for flash/arrow animations.
 */
export function useMoveFlash(price: number | undefined): 'up' | 'down' | null {
  const prevRef = useRef<number | undefined>(undefined);
  const [move, setMove] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = price;
    if (price === undefined || prev === undefined || prev === price) return;
    setMove(price > prev ? 'up' : 'down');
    const id = setTimeout(() => setMove(null), 950);
    return () => clearTimeout(id);
  }, [price]);
  return move;
}
