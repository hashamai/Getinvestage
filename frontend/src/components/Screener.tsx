import { useState } from 'react';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { fmtPct, fmtPrice } from '../api';
import { useMoveFlash } from '../hooks';
import type { Quote } from '../types';

type Filter = 'all' | 'gainers' | 'losers';

interface Props {
  quotes: Record<string, Quote | null> | null;
  loading: boolean;
  selected: string;
  onSelectSymbol: (symbol: string) => void;
}

function ScreenerRow({
  sym,
  q,
  selected,
  onSelect,
}: {
  sym: string;
  q: Quote;
  selected: boolean;
  onSelect: () => void;
}) {
  const move = useMoveFlash(q.current);
  const down = q.change < 0;
  return (
    <tr
      className={`gi-row${move ? ` flash-${move}` : ''}`}
      data-selected={selected}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      aria-label={`Open ${sym} chart`}
    >
      <td>{sym}</td>
      <td className="num">{fmtPrice(q.current)}</td>
      <td className={`num ${down ? 'down' : 'up'}`}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <span className="delta-arrow" key={down ? 'd' : 'u'}>
            {down ? <CaretDown size={12} weight="fill" /> : <CaretUp size={12} weight="fill" />}
          </span>
          {fmtPct(q.percentChange)}
        </span>
      </td>
      <td className="num">{fmtPrice(q.high)}</td>
      <td className="num">{fmtPrice(q.low)}</td>
    </tr>
  );
}

export function Screener({ quotes, loading, selected, onSelectSymbol }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [text, setText] = useState('');
  const [minPrice, setMinPrice] = useState('');

  const entries = (Object.entries(quotes ?? {}).filter(([, q]) => q) as [string, Quote][])
    .filter(([sym]) => sym.includes(text.trim().toUpperCase()))
    .filter(([, q]) => (filter === 'gainers' ? q.change >= 0 : filter === 'losers' ? q.change < 0 : true))
    .filter(([, q]) => (minPrice ? q.current >= Number(minPrice) : true))
    .sort((a, b) => b[1].percentChange - a[1].percentChange);

  return (
    <div className="glass table-card">
      <div className="panel-head">
        <h3 className="panel-title">Stock screener</h3>
      </div>
      <div className="screener-controls">
        <input
          className="screener-input"
          type="search"
          placeholder="Filter symbols…"
          aria-label="Filter screener by symbol"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ flex: 1, minWidth: 130 }}
        />
        <input
          className="screener-input"
          type="number"
          min="0"
          placeholder="Min price"
          aria-label="Minimum price"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          style={{ width: 110 }}
        />
        {(['all', 'gainers', 'losers'] as Filter[]).map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading && !quotes ? (
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 36 }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="wl-empty">No symbols match these filters.</p>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
          <table className="gi-table">
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Last</th>
                <th scope="col">Chg%</th>
                <th scope="col">High</th>
                <th scope="col">Low</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([sym, q]) => (
                <ScreenerRow
                  key={sym}
                  sym={sym}
                  q={q}
                  selected={sym === selected}
                  onSelect={() => onSelectSymbol(sym)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
