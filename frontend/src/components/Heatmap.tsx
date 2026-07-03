import { fmtPct, fmtPrice } from '../api';
import type { Quote } from '../types';

interface Props {
  quotes: Record<string, Quote | null> | null;
  loading: boolean;
  onSelectSymbol: (symbol: string) => void;
}

/**
 * Solid tile color blended from a dark neutral toward green/red by |% change|
 * (TradingView-style). Theme-independent so white tile text stays readable.
 */
function tileColor(pct: number): string {
  const capped = Math.max(-4, Math.min(4, pct));
  const mix = Math.round(16 + (Math.abs(capped) / 4) * 74); // 16%..90%
  const target = capped >= 0 ? '#128a60' : '#d13c46';
  return `color-mix(in oklab, #24262c ${100 - mix}%, ${target} ${mix}%)`;
}

export function Heatmap({ quotes, loading, onSelectSymbol }: Props) {
  if (loading || !quotes) {
    return (
      <div className="heatmap">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="skeleton" style={{ minHeight: 86 }} />
        ))}
      </div>
    );
  }

  const entries = (Object.entries(quotes).filter(([, q]) => q) as [string, Quote][]).sort(
    (a, b) => b[1].percentChange - a[1].percentChange,
  );

  if (!entries.length) {
    return <p className="wl-empty">Market map unavailable right now.</p>;
  }

  return (
    <div className="heatmap" role="list" aria-label="Market heatmap">
      {entries.map(([sym, q]) => (
        <button
          key={sym}
          role="listitem"
          className="heat-tile"
          style={{ background: tileColor(q.percentChange) }}
          onClick={() => onSelectSymbol(sym)}
          aria-label={`${sym} ${fmtPct(q.percentChange)}, open chart`}
        >
          <span>
            <span className="heat-sym">{sym}</span>
            <div className="heat-price num">{fmtPrice(q.current)}</div>
          </span>
          <span className="heat-pct num">{fmtPct(q.percentChange)}</span>
        </button>
      ))}
    </div>
  );
}
