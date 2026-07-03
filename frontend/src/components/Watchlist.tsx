import { CaretDown, CaretUp, X } from '@phosphor-icons/react';
import { fmtPct, fmtPrice } from '../api';
import { useMoveFlash, useQuoteMap } from '../hooks';
import type { Quote } from '../types';

interface Props {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}

function Row({
  sym,
  q,
  loading,
  selected,
  onSelect,
  onRemove,
}: {
  sym: string;
  q: Quote | null | undefined;
  loading: boolean;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const move = useMoveFlash(q?.current);
  const down = q ? q.change < 0 : false;
  return (
    <tr
      className={`gi-row${move ? ` flash-${move}` : ''}`}
      data-selected={selected}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      aria-label={`Select ${sym}`}
    >
      <td>{sym}</td>
      <td className="num">{q ? fmtPrice(q.current) : loading ? '…' : '—'}</td>
      <td className={`num ${q ? (down ? 'down' : 'up') : ''}`}>
        {q ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span className="delta-arrow" key={down ? 'd' : 'u'}>
              {down ? <CaretDown size={12} weight="fill" /> : <CaretUp size={12} weight="fill" />}
            </span>
            {fmtPct(q.percentChange)}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td style={{ width: 40 }}>
        <button
          className="wl-remove icon-btn"
          style={{ width: 26, height: 26 }}
          aria-label={`Remove ${sym} from watchlist`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={14} />
        </button>
      </td>
    </tr>
  );
}

export function Watchlist({ symbols, selected, onSelect, onRemove }: Props) {
  const { data, loading } = useQuoteMap(symbols, 30_000);

  return (
    <div className="glass table-card" aria-label="Watchlist">
      <div className="panel-head">
        <h3 className="panel-title">Watchlist</h3>
      </div>
      {symbols.length === 0 ? (
        <p className="wl-empty">
          Your watchlist is empty.
          <br />
          Search a symbol and add it from its detail card.
        </p>
      ) : (
        <table className="gi-table">
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col">Last</th>
              <th scope="col">Chg%</th>
              <th scope="col" aria-label="Remove" style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {symbols.map((s) => (
              <Row
                key={s}
                sym={s}
                q={data?.[s]}
                loading={loading}
                selected={s === selected}
                onSelect={() => onSelect(s)}
                onRemove={() => onRemove(s)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
