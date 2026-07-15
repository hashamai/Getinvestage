import { Link } from 'react-router-dom';
import { fmtPct, fmtPrice } from '../useMarket';
import { useQuotes } from '../useQuotes';
import { microLabel } from '../styles';

/* The signed-in user's saved symbols, with live prices.
 *
 * Separate from the default MARKET list because these are arbitrary tickers the
 * user searched for — they have no SEED entry, no simulated history, no beta.
 * All we have is a live quote, so all we show is a live quote. Inventing the
 * missing fields would be exactly the kind of quiet dishonesty the rest of this
 * codebase goes out of its way to avoid.
 */

const ROW_GRID = 'minmax(80px, 1fr) 84px 66px 22px';

export function SavedWatchlist({ items, selected, onSelect, onRemove, isAuthed }) {
  const symbols = items.map((i) => i.symbol);
  const { quotes, loading } = useQuotes(symbols);

  if (!isAuthed) {
    return (
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ ...microLabel, marginBottom: 6 }}>Your watchlist</div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          <Link to="/login" style={{ color: 'var(--text-2)' }}>
            Sign in
          </Link>{' '}
          to save symbols and keep them across devices.
        </p>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: '1px solid var(--hairline)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '12px 16px 8px',
        }}
      >
        <span style={{ ...microLabel, color: 'var(--text-2)' }}>Your watchlist</span>
        <span style={microLabel}>{items.length} saved</span>
      </div>

      {items.length === 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0, padding: '0 16px 12px' }}>
          Search above and star a symbol to save it.
        </p>
      )}

      {items.map((item) => {
        const q = quotes[item.symbol];
        const isSel = item.symbol === selected;
        const chg = q?.percentChange ?? 0;

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(item.symbol)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(item.symbol)}
            aria-pressed={isSel}
            style={{
              display: 'grid',
              gridTemplateColumns: ROW_GRID,
              gap: 8,
              alignItems: 'center',
              padding: '8px 16px 8px 14px',
              borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent',
              background: isSel ? 'rgba(255,255,255,0.045)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em' }}>
              {item.symbol}
            </span>

            <span
              style={{
                textAlign: 'right',
                fontSize: 12.5,
                fontVariantNumeric: 'tabular-nums',
                color: q ? 'var(--text)' : 'var(--muted)',
              }}
            >
              {/* Three distinct states: loading, no-quote-available, and a real
                  price. A dash that means "loading" and a dash that means "this
                  ticker has no data" are different facts. */}
              {q ? fmtPrice(q.current) : loading ? '·' : '—'}
            </span>

            <span
              style={{
                textAlign: 'right',
                fontSize: 11.5,
                fontVariantNumeric: 'tabular-nums',
                color: !q ? 'var(--muted)' : chg >= 0 ? 'var(--up)' : 'var(--down)',
              }}
            >
              {q ? fmtPct(chg) : '—'}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation(); // don't also select the row
                onRemove(item.symbol);
              }}
              aria-label={`Remove ${item.symbol} from watchlist`}
              title="Remove from watchlist"
              style={{
                padding: 0,
                lineHeight: 1,
                fontSize: 12,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--accent)',
              }}
            >
              ★
            </button>
          </div>
        );
      })}
    </div>
  );
}
