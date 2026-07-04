import { useEffect, useRef, useState } from 'react';

/* ---- seeded RNG helpers (used by the offline fallback + ambience) ---- */

export function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dayKey = () => new Date().toISOString().slice(0, 10);

/* ---- instrument universe ---------------------------------------------
   `ySym` is the Yahoo/backend symbol; display symbol stays terminal-short.
   base/mcap/pe are placeholders until live data arrives (P/E and cap are
   slow-moving reference figures, not streamed). */

const SEED = [
  { symbol: 'SPX', ySym: '^GSPC', name: 'S&P 500', base: 6487, beta: 0.45, sector: 'index', mcap: '—', pe: '—', vol: 0, isIndex: true },
  { symbol: 'NDQ', ySym: '^IXIC', name: 'NASDAQ', base: 23614, beta: 0.6, sector: 'index', mcap: '—', pe: '—', vol: 0, isIndex: true },
  { symbol: 'AAPL', ySym: 'AAPL', name: 'Apple', base: 294.4, beta: 0.9, sector: 'tech', mcap: '$4.3T', pe: 35.1, vol: 58_400_000 },
  { symbol: 'NVDA', ySym: 'NVDA', name: 'NVIDIA', base: 197.6, beta: 1.6, sector: 'chips', mcap: '$4.8T', pe: 46.4, vol: 212_800_000 },
  { symbol: 'MSFT', ySym: 'MSFT', name: 'Microsoft', base: 384.3, beta: 0.8, sector: 'tech', mcap: '$2.9T', pe: 37.2, vol: 21_300_000 },
  { symbol: 'AMZN', ySym: 'AMZN', name: 'Amazon', base: 241.7, beta: 1.1, sector: 'tech', mcap: '$2.5T', pe: 42.8, vol: 39_800_000 },
  { symbol: 'TSLA', ySym: 'TSLA', name: 'Tesla', base: 425.3, beta: 1.9, sector: 'ev', mcap: '$1.4T', pe: 68.3, vol: 96_500_000 },
  { symbol: 'META', ySym: 'META', name: 'Meta', base: 612.9, beta: 1.2, sector: 'media', mcap: '$1.5T', pe: 27.9, vol: 14_700_000 },
  { symbol: 'GOOGL', ySym: 'GOOGL', name: 'Alphabet', base: 361.2, beta: 1.0, sector: 'media', mcap: '$4.4T', pe: 22.6, vol: 28_900_000 },
  { symbol: 'AMD', ySym: 'AMD', name: 'AMD', base: 540.9, beta: 1.7, sector: 'chips', mcap: '$877B', pe: 48.9, vol: 61_200_000 },
  { symbol: 'NFLX', ySym: 'NFLX', name: 'Netflix', base: 74.2, beta: 1.3, sector: 'media', mcap: '$315B', pe: 44.1, vol: 34_000_000 },
  { symbol: 'JPM', ySym: 'JPM', name: 'JPMorgan', base: 334.1, beta: 0.7, sector: 'fin', mcap: '$923B', pe: 13.8, vol: 9_100_000 },
  { symbol: 'COIN', ySym: 'COIN', name: 'Coinbase', base: 304.7, beta: 2.3, sector: 'fin', mcap: '$78B', pe: 61.2, vol: 12_600_000 },
  { symbol: 'PLTR', ySym: 'PLTR', name: 'Palantir', base: 151.8, beta: 2.0, sector: 'data', mcap: '$342B', pe: 190.4, vol: 74_300_000 },
  { symbol: 'DIS', ySym: 'DIS', name: 'Disney', base: 95.7, beta: 0.9, sector: 'media', mcap: '$174B', pe: 24.7, vol: 11_800_000 },
  { symbol: 'UBER', ySym: 'UBER', name: 'Uber', base: 91.6, beta: 1.2, sector: 'gig', mcap: '$191B', pe: 31.5, vol: 22_400_000 },
];

const HISTORY_LEN = 120;
const QUOTE_POLL_MS = 20_000;
const CANDLE_REFRESH_MS = 5 * 60_000;

/* ---- API client (same-origin; Vite proxies /api to the backend) -------- */

async function getJson(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`${resp.status} ${path}`);
  return resp.json();
}

const fetchQuotes = (ySyms) =>
  getJson(`/api/quotes?symbols=${encodeURIComponent(ySyms.join(','))}`);

const fetchCandles = (ySym, range) =>
  getJson(`/api/candles/${encodeURIComponent(ySym)}?range=${range}`);

/* ---- synthetic fallback (offline mode, clearly labeled in the UI) ------- */

function syntheticIntraday(symbol, base, beta) {
  const rng = mulberry32(hashStr(symbol + dayKey()));
  const open = base * (1 + (rng() - 0.5) * 0.012);
  const pts = [open];
  for (let i = 1; i < HISTORY_LEN; i++) {
    pts.push(pts[i - 1] * (1 + (rng() - 0.5) * 2 * 0.0011 * beta));
  }
  return { open, pts };
}

function syntheticRange(inst, range) {
  const volPerStep = { '1W': 0.004, '1M': 0.009, '1Y': 0.021 }[range] ?? 0.009;
  const rng = mulberry32(hashStr(`${inst.symbol}:${range}:v1`));
  const pts = [inst.price];
  for (let i = 1; i < HISTORY_LEN; i++) {
    pts.push(pts[i - 1] * (1 + (rng() - 0.5) * 2 * volPerStep * inst.beta));
  }
  const offset = inst.price - pts[HISTORY_LEN - 1];
  return pts.map((p, i) => p + (offset * i) / (HISTORY_LEN - 1));
}

/* ---- market status from UTC ----------------------------------------------- */

export function marketStatus(now) {
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const weekday = day >= 1 && day <= 5;
  if (weekday && mins >= 810 && mins < 1200) return { label: 'NYSE OPEN', tone: 'up' };
  if (weekday && mins >= 1200) return { label: 'AFTER HOURS', tone: 'amber' };
  return { label: 'MARKETS CLOSED', tone: 'amber' };
}

const TEMPO = {
  calm: { interval: 1900, vol: 0.0008 },
  normal: { interval: 1100, vol: 0.0016 },
  volatile: { interval: 620, vol: 0.0034 },
};

/* Single-poll move (%) that triggers a green/red price-cell flash. */
export const FLASH_THRESHOLD = 0.01;

/* ---- the hook ---------------------------------------------------------------
   Live mode: quotes polled from the backend (Finnhub + Yahoo — the same feed
   yfinance wraps), intraday history from Yahoo 5-minute candles.
   If the backend is unreachable, falls back to the seeded simulation and the
   UI labels itself SIMULATED. */

export function useMarket(tempo = 'normal') {
  const instRef = useRef(null);
  if (!instRef.current) {
    instRef.current = SEED.map((s) => {
      const { open, pts } = syntheticIntraday(s.symbol, s.base, s.beta);
      const price = pts[pts.length - 1];
      return {
        ...s,
        open,
        price,
        chgPct: ((price - open) / open) * 100,
        dayHigh: Math.max(...pts),
        dayLow: Math.min(...pts),
        history: pts,
        lastStep: 0,
        seq: 0,
      };
    });
  }

  const [, setVersion] = useState(0);
  const [now, setNow] = useState(() => new Date());
  // 'connecting' → 'live' | 'simulated'
  const [source, setSource] = useState('connecting');
  const bump = () => setVersion((v) => v + 1);

  const applyQuotes = (map) => {
    let any = false;
    for (const inst of instRef.current) {
      const q = map[inst.ySym.toUpperCase()];
      if (!q) continue;
      any = true;
      const prev = inst.price;
      inst.price = q.current;
      inst.open = q.open || q.prevClose || inst.open;
      inst.chgPct = q.percentChange ?? inst.chgPct;
      inst.dayHigh = q.high || inst.dayHigh;
      inst.dayLow = q.low || inst.dayLow;
      inst.lastStep = prev ? ((q.current - prev) / prev) * 100 : 0;
      if (Math.abs(inst.lastStep) > 1e-9) {
        inst.history.push(q.current);
        if (inst.history.length > HISTORY_LEN) inst.history.shift();
      }
      inst.seq++;
    }
    return any;
  };

  // Connect: real quotes first, then real intraday candles for sparklines.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const map = await fetchQuotes(instRef.current.map((i) => i.ySym));
        if (!alive) return;
        if (!applyQuotes(map)) throw new Error('no quotes');
        setSource('live');
        bump();

        const results = await Promise.allSettled(
          instRef.current.map((i) => fetchCandles(i.ySym, '1D')),
        );
        if (!alive) return;
        results.forEach((r, idx) => {
          if (r.status !== 'fulfilled' || !r.value.candles?.length) return;
          const inst = instRef.current[idx];
          const candles = r.value.candles;
          inst.history = candles.slice(-HISTORY_LEN).map((c) => c.c);
          inst.history.push(inst.price);
          const volume = candles.reduce((s, c) => s + (c.v || 0), 0);
          if (volume > 0) inst.vol = volume;
          inst.dayHigh = Math.max(inst.dayHigh, ...candles.map((c) => c.h));
          inst.dayLow = Math.min(inst.dayLow, ...candles.map((c) => c.l));
        });
        bump();
      } catch {
        if (alive) setSource('simulated');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Live mode: poll real quotes.
  useEffect(() => {
    if (source !== 'live') return;
    const id = setInterval(async () => {
      try {
        const map = await fetchQuotes(instRef.current.map((i) => i.ySym));
        if (applyQuotes(map)) bump();
      } catch {
        /* transient poll failure — keep last good data */
      }
    }, QUOTE_POLL_MS);
    return () => clearInterval(id);
  }, [source]);

  // Live mode: refresh intraday candles occasionally (server caches 5 min).
  useEffect(() => {
    if (source !== 'live') return;
    const id = setInterval(async () => {
      const results = await Promise.allSettled(
        instRef.current.map((i) => fetchCandles(i.ySym, '1D')),
      );
      results.forEach((r, idx) => {
        if (r.status !== 'fulfilled' || !r.value.candles?.length) return;
        const inst = instRef.current[idx];
        inst.history = r.value.candles.slice(-HISTORY_LEN).map((c) => c.c);
        const volume = r.value.candles.reduce((s, c) => s + (c.v || 0), 0);
        if (volume > 0) inst.vol = volume;
      });
      bump();
    }, CANDLE_REFRESH_MS);
    return () => clearInterval(id);
  }, [source]);

  // Simulated fallback: the original seeded tick loop.
  useEffect(() => {
    if (source !== 'simulated') return;
    const { interval, vol } = TEMPO[tempo] ?? TEMPO.normal;
    const id = setInterval(() => {
      for (const inst of instRef.current) {
        const step = (Math.random() - 0.5) * 2 * vol * inst.beta;
        inst.price = Math.max(0.5, inst.price * (1 + step));
        inst.history.push(inst.price);
        if (inst.history.length > HISTORY_LEN) inst.history.shift();
        inst.chgPct = ((inst.price - inst.open) / inst.open) * 100;
        inst.dayHigh = Math.max(inst.dayHigh, inst.price);
        inst.dayLow = Math.min(inst.dayLow, inst.price);
        inst.lastStep = step * 100;
        inst.seq++;
      }
      bump();
    }, interval);
    return () => clearInterval(id);
  }, [source, tempo]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const instruments = instRef.current;
  return {
    instruments,
    indices: instruments.filter((i) => i.isIndex),
    tickers: instruments.filter((i) => !i.isIndex),
    now,
    status: marketStatus(now),
    source,
  };
}

/* ---- range series for the big chart -------------------------------------
   1D → the live intraday history. Other ranges → real Yahoo candles fetched
   once and cached; synthetic only in simulated mode. */

const rangeCache = new Map();

export function useRangeSeries(inst, range, source) {
  const live1D = range === '1D';
  const cacheKey = `${inst.ySym}:${range}:${source}`;
  const [fetched, setFetched] = useState(() => rangeCache.get(cacheKey) ?? null);

  useEffect(() => {
    if (live1D) return;
    const cached = rangeCache.get(cacheKey);
    if (cached) {
      setFetched(cached);
      return;
    }
    if (source === 'simulated') {
      const series = syntheticRange(inst, range);
      rangeCache.set(cacheKey, series);
      setFetched(series);
      return;
    }
    if (source !== 'live') return; // still connecting
    let alive = true;
    setFetched(null);
    fetchCandles(inst.ySym, range)
      .then((resp) => {
        if (!alive) return;
        const series = resp.candles.map((c) => c.c);
        rangeCache.set(cacheKey, series);
        setFetched(series);
      })
      .catch(() => {
        if (!alive) return;
        const series = syntheticRange(inst, range);
        setFetched(series);
      });
    return () => {
      alive = false;
    };
  }, [cacheKey, live1D, source]); // eslint-disable-line react-hooks/exhaustive-deps

  if (live1D) return { series: inst.history, loading: false };
  return { series: fetched, loading: fetched === null };
}

/* ---- formatting ------------------------------------------------------------ */

export const fmtPrice = (n) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export const fmtVolume = (n) => {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
};
