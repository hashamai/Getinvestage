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
import { microLabel } from '../styles';

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
  
  // New overlay states
  const [showNav, setShowNav] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

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
    if (known) {
      setSelected(known.symbol);
      setShowChart(true);
    } else {
      navigate(`/analysis?symbol=${encodeURIComponent(sym)}`);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <header className="app-header">
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
          className="hide-on-mobile"
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
          <span style={{ ...microLabel, color: statusColor }} className="hide-on-mobile">{market.status.label}</span>
        </span>
        <span
          style={{
            fontSize: 12.5,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-2)',
            flexShrink: 0,
          }}
          className="hide-on-mobile"
        >
          {clock}
        </span>
        <button
          onClick={() => setShowNav(true)}
          style={{
            flexShrink: 0,
            padding: '8px 12px',
            fontSize: 18,
            color: 'var(--text-2)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'color 140ms ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
          title="Menu"
        >
          ☰
        </button>
      </header>

      <TickerTape instruments={market.instruments} size="sm" />

      {/* main (Watchlist occupies full screen now) */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
      </main>

      {/* --- Overlays & Modals --- */}
      
      {/* Side Navigation Overlay */}
      {showNav && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowNav(false)} />
          <div style={{ width: 280, background: 'var(--bg)', borderLeft: '1px solid var(--hairline)', padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <button 
              onClick={() => setShowNav(false)} 
              style={{ alignSelf: 'flex-end', fontSize: 24, padding: 0, color: 'var(--text-2)' }}
            >
              ✕
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Link to="/analysis" style={{ textDecoration: 'none', color: 'var(--text)', fontSize: 16 }}>Analysis</Link>
              <Link to="/recommend" style={{ textDecoration: 'none', color: 'var(--text)', fontSize: 16 }}>Recommendations</Link>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--hairline)' }}>
                <AuthNav />
              </div>
              <button 
                onClick={onBack} 
                style={{ textAlign: 'left', padding: 0, color: 'var(--text-2)', fontSize: 14, marginTop: 16 }}
              >
                ← Return to site
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chart Modal Overlay */}
      {showChart && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 900, maxHeight: '90vh', background: 'var(--bg)', border: '1px solid var(--hairline)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <button 
              onClick={() => setShowChart(false)} 
              style={{ position: 'absolute', top: 12, right: 16, fontSize: 18, color: 'var(--text-2)', zIndex: 10 }}
            >
              ✕
            </button>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <PriceChart inst={inst} range={range} onRangeChange={setRange} source={market.source} />
            </div>
          </div>
        </div>
      )}

      {/* Floating Assistant Button */}
      <button
        onClick={() => setShowAssistant(!showAssistant)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--accent)',
          color: '#0a0b0d',
          fontSize: 24,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          zIndex: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease',
          transform: showAssistant ? 'scale(0.9)' : 'scale(1)',
        }}
        title="Open AI Assistant"
      >
        💬
      </button>

      {/* Floating Assistant Window */}
      {showAssistant && (
        <div 
          style={{ 
            position: 'fixed', 
            bottom: 96, 
            right: 24, 
            width: 360, 
            height: 540, 
            maxHeight: 'calc(100vh - 120px)', 
            maxWidth: 'calc(100vw - 48px)',
            background: 'var(--bg)', 
            border: '1px solid var(--hairline)', 
            borderRadius: 8, 
            zIndex: 80, 
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'hidden', 
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            animation: 'riseIn 0.3s cubic-bezier(0.2, 0.7, 0.2, 1)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderBottom: '1px solid var(--hairline)' }}>
            <button onClick={() => setShowAssistant(false)} style={{ color: 'var(--text-2)' }}>✕ close</button>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Assistant market={market} selectedSymbol={selected} initialAsk={initialAsk} />
          </div>
        </div>
      )}
    </div>
  );
}
