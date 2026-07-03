import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { fmtPct, fmtPrice } from '../api';
import { useQuoteMap } from '../hooks';

const TREND_SYMBOLS = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'MU', name: 'Micron Technology, Inc.' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
];

const AVATAR_COLORS = ['#76b900', '#c2185b', '#e82127'];

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

export function TrendsGrid({ onSelectSymbol }: Props) {
  const { data, loading } = useQuoteMap(
    TREND_SYMBOLS.map((t) => t.symbol),
    60_000,
  );

  return (
    <div aria-label="Community trends">
      <h3 className="panel-title" style={{ margin: '0 0 12px' }}>
        Trending tickers
      </h3>
      <div className="trends-grid">
        {loading &&
          TREND_SYMBOLS.map((t) => (
            <div key={t.symbol} className="skeleton" style={{ height: 110 }} />
          ))}
        {!loading &&
          TREND_SYMBOLS.map((t, i) => {
            const q = data?.[t.symbol];
            const down = q ? q.change < 0 : false;
            return (
              <button
                key={t.symbol}
                className="glass trend-card hover-lift"
                onClick={() => onSelectSymbol(t.symbol)}
                aria-label={`View ${t.symbol} chart`}
              >
                <span className="trend-head">
                  <span
                    className="sym-logo"
                    style={{ width: 34, height: 34, fontSize: 13, background: AVATAR_COLORS[i], color: '#fff' }}
                    aria-hidden="true"
                  >
                    {t.symbol.slice(0, 1)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <div className="trend-sym">{t.symbol}</div>
                    <div className="trend-name">{t.name}</div>
                  </span>
                </span>
                {q ? (
                  <span className="num">
                    <div className="trend-price">
                      {fmtPrice(q.current)} <span className="sym-ccy">USD</span>
                    </div>
                    <span className={`trend-chg ${down ? 'down' : 'up'}`}>
                      {down ? <CaretDown size={12} weight="fill" /> : <CaretUp size={12} weight="fill" />}
                      {fmtPct(q.percentChange)}
                    </span>
                  </span>
                ) : (
                  <span className="trend-name">Unavailable</span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
