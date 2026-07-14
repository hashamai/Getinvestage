import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtPct, fmtPrice } from '../useMarket';
import { useAuth } from '../auth';
import { useWatchlist } from '../useWatchlist';
import { TickerTape } from './TickerTape';
import { Watchlist } from './Watchlist';
import { PriceChart } from './PriceChart';
import { Assistant } from './Assistant';
import { Mark } from './Mark';

const microLabel = {
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

function MiniQuote({ inst }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap' }}>
      <span style={microLabel}>{inst.name}</span>
      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        {fmtPrice(inst.price)}
      </span>
      <span
        style={{
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
          color: inst.chgPct >= 0 ? 'var(--up)' : 'var(--down)',
        }}
      >
        {fmtPct(inst.chgPct)}
      </span>
    </span>
  );
}

/** Header slot: sign-in link, or the current user's name linking to /account. */
function AuthNav() {
  const { status, user } = useAuth();
  if (status === 'loading') return null;

  const base = {
    ...microLabel,
    flexShrink: 0,
    textDecoration: 'none',
    color: 'var(--text-2)',
  };

  if (status === 'anon') {
    return (
      <Link to="/login" style={base} title="Sign in to save a watchlist">
        Sign in
      </Link>
    );
  }

  return (
    <Link
      to="/account"
      style={{ ...base, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}
      title={user?.email}
    >
      {user?.display_name || user?.email}
    </Link>
  );
}

export function Dashboard({ market, onBack, initialAsk }) {
  const [selected, setSelected] = useState('NVDA');
  const [range, setRange] = useState('1D');
  const { isAuthed } = useAuth();
  const watchlist = useWatchlist();
  const navigate = useNavigate();
  const inst = market.tickers.find((t) => t.symbol === selected) ?? market.tickers[0];

  const statusColor = market.status.tone === 'up' ? 'var(--up)' : 'var(--amber)';
  const clock = market.now.toLocaleTimeString('en-GB', { hour12: false });

  const selectSymbol = (sym) => {
    // The terminal's chart is driven by useMarket's fixed instrument universe
    // (it needs simulated history, beta, sector). A symbol found via search
    // has none of that, and `tickers.find(...)` would fall back to tickers[0] —
    // silently showing NVDA's chart under someone else's ticker. So anything
    // outside the known universe goes to /analysis, which is built for
    // arbitrary symbols and fetches real candles for them.
    const known = market.tickers.find((t) => t.symbol === sym || t.ySym === sym);
    if (known) setSelected(known.symbol);
    else navigate(`/analysis?symbol=${encodeURIComponent(sym)}`);
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr',
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <header
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '0 18px',
          borderBottom: '1px solid var(--hairline)',
          minWidth: 0,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Mark size={19} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>getinvestage</span>
        </span>
        <span style={{ display: 'inline-flex', gap: 18, minWidth: 0, overflow: 'hidden' }}>
          {market.indices.map((idx) => (
            <MiniQuote key={idx.symbol} inst={idx} />
          ))}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            ...microLabel,
            flexShrink: 0,
            color: market.source === 'live' ? 'var(--text-2)' : 'var(--muted)',
          }}
          title={
            market.source === 'live'
              ? 'Quotes and history from the market data backend (Finnhub + Yahoo Finance)'
              : market.source === 'simulated'
                ? 'Backend unreachable — showing simulated data'
                : 'Connecting to market data…'
          }
        >
          {market.source === 'live'
            ? 'LIVE · YAHOO/FINNHUB'
            : market.source === 'simulated'
              ? 'SIMULATED — OFFLINE'
              : 'CONNECTING…'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor,
              animation: 'pulseDot 2s ease-in-out infinite',
            }}
          />
          <span style={{ ...microLabel, color: statusColor }}>{market.status.label}</span>
        </span>
        <span
          style={{
            fontSize: 12.5,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-2)',
            flexShrink: 0,
          }}
        >
          {clock}
        </span>
        <Link
          to="/analysis"
          style={{ ...microLabel, flexShrink: 0, textDecoration: 'none', color: 'var(--text-2)' }}
        >
          Analysis
        </Link>
        <AuthNav />
        <button
          onClick={onBack}
          style={{
            flexShrink: 0,
            padding: '8px 12px',
            fontSize: 11.5,
            color: 'var(--text-2)',
            border: '1px solid var(--hairline)',
            transition: 'color 140ms ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
        >
          ← site
        </button>
      </header>

      <TickerTape instruments={market.instruments} size="sm" />

      {/* main */}
      <main
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 390px) minmax(0, 1fr) minmax(280px, 340px)',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <Watchlist
          tickers={market.tickers}
          selected={selected}
          onSelect={selectSymbol}
          canSave={isAuthed}
          isSaved={watchlist.has}
          // Swallow the rejection: useWatchlist already rolled the row back and
          // set its error state, so an unhandled promise here would be noise.
          onToggleSave={(symbol) => watchlist.toggle(symbol).catch(() => {})}
          savedItems={watchlist.items}
          onRemoveSaved={(symbol) => watchlist.remove(symbol).catch(() => {})}
          isAuthed={isAuthed}
        />
        <PriceChart inst={inst} range={range} onRangeChange={setRange} source={market.source} />
        <Assistant market={market} selectedSymbol={selected} initialAsk={initialAsk} />
      </main>
    </div>
  );
}
