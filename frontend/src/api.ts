import type {
  CandleResponse,
  IndexEntry,
  NewsItem,
  Profile,
  Quote,
  RangeKey,
  SearchResult,
} from './types';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE}${path}`);
  if (!resp.ok) {
    const detail = await resp.json().then((b) => b.detail).catch(() => resp.statusText);
    throw new ApiError(resp.status, typeof detail === 'string' ? detail : resp.statusText);
  }
  return resp.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const api = {
  health: () => get<{ status: string; demoMode: boolean }>('/api/health'),
  quote: (symbol: string) => get<Quote>(`/api/quote/${encodeURIComponent(symbol)}`),
  quotes: (symbols: string[]) =>
    get<Record<string, Quote | null>>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`),
  candles: (symbol: string, range: RangeKey) =>
    get<CandleResponse>(`/api/candles/${encodeURIComponent(symbol)}?range=${range}`),
  search: (q: string) => get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  profile: (symbol: string) => get<Profile>(`/api/profile/${encodeURIComponent(symbol)}`),
  news: (symbol: string) => get<NewsItem[]>(`/api/news/${encodeURIComponent(symbol)}`),
  indices: () => get<IndexEntry[]>('/api/indices'),
};

export const fmtPrice = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtChange = (n: number) => `${n >= 0 ? '+' : ''}${fmtPrice(n)}`;

export const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export const fmtMarketCap = (millions: number) => {
  if (!millions) return '—';
  if (millions >= 1_000_000) return `$${(millions / 1_000_000).toFixed(2)}T`;
  if (millions >= 1_000) return `$${(millions / 1_000).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
};
