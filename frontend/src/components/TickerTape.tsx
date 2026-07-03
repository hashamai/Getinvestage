import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { fmtPct, fmtPrice } from '../api';
import type { Quote } from '../types';

interface Props {
  quotes: Record<string, Quote | null> | null;
  onSelectSymbol: (symbol: string) => void;
}

/** Horizontally scrolling live ticker. Content is doubled for a seamless loop. */
export function TickerTape({ quotes, onSelectSymbol }: Props) {
  const entries = Object.entries(quotes ?? {}).filter(([, q]) => q) as [string, Quote][];
  if (!entries.length) return <div className="skeleton" style={{ height: 40, marginTop: 14 }} />;

  const renderItems = (prefix: string, hidden: boolean) =>
    entries.map(([sym, q]) => {
      const down = q.change < 0;
      return (
        <button
          key={`${prefix}${sym}`}
          className="tape-item"
          onClick={() => onSelectSymbol(sym)}
          tabIndex={-1}
          aria-hidden={hidden}
        >
          <span className="sym">{sym}</span>
          <span className="num">{fmtPrice(q.current)}</span>
          <span
            className={`num ${down ? 'down' : 'up'}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
          >
            {down ? <CaretDown size={12} weight="fill" /> : <CaretUp size={12} weight="fill" />}
            {fmtPct(q.percentChange)}
          </span>
        </button>
      );
    });

  return (
    <div className="tape" aria-label="Live market ticker">
      <div className="tape-track">
        {renderItems('a-', false)}
        {renderItems('b-', true)}
      </div>
    </div>
  );
}
