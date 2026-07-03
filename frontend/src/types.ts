export interface Quote {
  symbol: string;
  current: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  timestamp: number;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface CandleResponse {
  symbol: string;
  range: string;
  source: 'yahoo' | 'finnhub' | 'synthetic' | 'synthetic-anchored';
  candles: Candle[];
}

export interface SearchResult {
  symbol: string;
  description: string;
  type: string;
}

export interface Profile {
  symbol: string;
  name: string;
  exchange: string;
  industry: string;
  logo: string;
  marketCap: number;
  currency: string;
}

export interface NewsItem {
  id: number;
  headline: string;
  source: string;
  datetime: number;
  url: string;
  summary: string;
}

export interface IndexEntry {
  symbol: string;
  label: string;
  badge: string;
  quote: Quote | null;
}

export type RangeKey = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
export type ChartType = 'candles' | 'area';
