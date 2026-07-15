import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useWatchlist } from '../useWatchlist';
import { fmtPct, fmtPrice, fmtVolume } from '../useMarket';
import { Mark } from '../components/Mark';
import { SymbolSearch } from '../components/SymbolSearch';
import { MiniChart } from '../components/MiniChart';
import { microLabel } from '../styles';

/* /analysis — Market Analysis.
 *
 * Today: search a stock, see its real price, stats, chart and news.
 * Later: this is where ML models, predictions and decision support land. The
 * slots for those are marked as empty on purpose — a placeholder that shows a
 * fake "BUY signal: 87% confidence" would be a lie about a financial product,
 * and it is exactly the kind of thing that destroys trust in a demo. Empty and
 * honest beats populated and invented.
 */

const RANGES = ['1D', '1W', '1M', '3M', '1Y'];

function Stat({ label, value, tone }) {
  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ ...microLabel, marginBottom: 5 }}>{label}</div>
      <div
        style={{
          fontSize: 14,
          fontVariantNumeric: 'tabular-nums',
          color: tone ?? 'var(--text)',
        }}
      >
        {value ?? '—'}
      </div>
    </div>
  );
}

/* An honest empty slot for work that doesn't exist yet. */
function ComingSoon({ title, children }) {
  return (
    <section
      style={{
        border: '1px dashed var(--hairline)',
        padding: '18px 20px',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        <span style={{ ...microLabel, color: 'var(--amber)' }}>Not built yet</span>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
        {children}
      </p>
    </section>
  );
}

export function Analysis() {
  // The symbol lives in the URL, so /analysis?symbol=NVDA is shareable and a
  // refresh keeps you on the stock you were looking at.
  const [params, setParams] = useSearchParams();
  const symbol = (params.get('symbol') || '').toUpperCase();
  const [range, setRange] = useState('1M');

  const { isAuthed } = useAuth();
  const watchlist = useWatchlist();

  const [quote, setQuote] = useState(null);
  const [profile, setProfile] = useState(null);
  const [candles, setCandles] = useState(null);
  const [news, setNews] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Quote / profile / news: refetch when the symbol changes.
  useEffect(() => {
    if (!symbol) {
      setQuote(null);
      setProfile(null);
      setNews([]);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);

    // Fired together, not awaited in sequence: three independent round trips
    // run concurrently instead of stacking their latency.
    Promise.allSettled([
      api.get(`/api/quote/${encodeURIComponent(symbol)}`),
      api.get(`/api/profile/${encodeURIComponent(symbol)}`),
      api.get(`/api/news/${encodeURIComponent(symbol)}`),
    ])
      .then(([q, p, n]) => {
        if (!alive) return;
        if (q.status === 'rejected') {
          // The quote is the page. Profile and news are decorative, so their
          // failure degrades quietly; a missing quote is a real error.
          setError(q.reason?.message || `Could not load ${symbol}`);
          setQuote(null);
        } else {
          setQuote(q.value);
        }
        setProfile(p.status === 'fulfilled' ? p.value : null);
        setNews(n.status === 'fulfilled' ? n.value : []);
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [symbol]);

  // Candles: refetch when symbol OR range changes.
  useEffect(() => {
    if (!symbol) {
      setCandles(null);
      return;
    }
    let alive = true;
    setCandles(null); // clear immediately so the old stock's chart never shows under the new one's name
    api
      .get(`/api/candles/${encodeURIComponent(symbol)}?range=${range}`)
      .then((data) => alive && setCandles(data))
      .catch(() => alive && setCandles(null));
    return () => {
      alive = false;
    };
  }, [symbol, range]);

  const up = (quote?.percentChange ?? 0) >= 0;
  const tone = up ? 'var(--up)' : 'var(--down)';
  const saved = symbol && watchlist.has(symbol);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 60 }}>
      <header
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 18px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          <Mark size={19} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>getinvestage</span>
        </Link>
        <span style={{ ...microLabel, color: 'var(--text-2)' }}>Market Analysis</span>
        <span style={{ flex: 1 }} />
        <Link to="/dashboard" style={{ ...microLabel, color: 'var(--text-2)' }}>
          Terminal →
        </Link>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>Market Analysis</h1>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
          Look up any listed stock. Price, fundamentals and recent news, straight from the
          market data feed.
        </p>

        <div style={{ maxWidth: 420, marginBottom: 32 }}>
          <SymbolSearch
            autoFocus
            placeholder="Search a stock — e.g. NVDA, Apple…"
            onSelect={(sym) => setParams({ symbol: sym })}
          />
        </div>

        {!symbol && (
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Search a symbol above to begin.
          </p>
        )}

        {symbol && error && (
          <p
            role="alert"
            style={{
              fontSize: 12.5,
              color: 'var(--down)',
              border: '1px solid var(--down)',
              padding: '10px 12px',
            }}
          >
            {error}
          </p>
        )}

        {symbol && loading && !quote && (
          <p style={{ ...microLabel }}>Loading {symbol}…</p>
        )}

        {symbol && quote && (
          <>
            {/* --- price header --- */}
            <section
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 20,
                flexWrap: 'wrap',
                paddingBottom: 18,
                borderBottom: '1px solid var(--hairline)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.03em' }}>
                    {symbol}
                  </span>
                  <button
                    onClick={() =>
                      isAuthed ? watchlist.toggle(symbol).catch(() => {}) : null
                    }
                    disabled={!isAuthed}
                    aria-pressed={!!saved}
                    title={
                      isAuthed
                        ? saved
                          ? 'Saved — click to remove'
                          : 'Save to your watchlist'
                        : 'Sign in to save'
                    }
                    style={{
                      fontSize: 15,
                      lineHeight: 1,
                      padding: 0,
                      background: 'transparent',
                      border: 'none',
                      cursor: isAuthed ? 'pointer' : 'not-allowed',
                      color: saved ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {saved ? '★' : '☆'}
                  </button>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                  {profile?.name || '—'}
                  {profile?.exchange ? ` · ${profile.exchange}` : ''}
                </div>
              </div>

              <span style={{ flex: 1 }} />

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: 26,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {fmtPrice(quote.current)}
                </div>
                <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: tone }}>
                  {quote.change >= 0 ? '+' : ''}
                  {quote.change.toFixed(2)} ({fmtPct(quote.percentChange)})
                </div>
              </div>
            </section>

            {/* --- chart --- */}
            <section style={{ padding: '18px 0' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    aria-pressed={r === range}
                    style={{
                      padding: '4px 9px',
                      fontSize: 11,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      color: r === range ? 'var(--text)' : 'var(--muted)',
                      background: r === range ? 'rgba(255,255,255,0.06)' : 'transparent',
                      border: '1px solid var(--hairline)',
                    }}
                  >
                    {r}
                  </button>
                ))}
                {/* The honesty badge, same contract as the dashboard: say when
                    the data isn't real market history. */}
                {candles && candles.source !== 'yahoo' && (
                  <span style={{ ...microLabel, alignSelf: 'center', color: 'var(--amber)' }}>
                    Simulated history
                  </span>
                )}
              </div>

              {candles ? (
                <MiniChart series={candles.candles.map((c) => c.c)} up={up} />
              ) : (
                <div style={{ ...microLabel, padding: '40px 0', textAlign: 'center' }}>
                  Loading chart…
                </div>
              )}
            </section>

            {/* --- stats --- */}
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '0 24px',
                borderTop: '1px solid var(--hairline)',
                borderBottom: '1px solid var(--hairline)',
                marginBottom: 28,
              }}
            >
              <Stat label="Open" value={fmtPrice(quote.open)} />
              <Stat label="Prev close" value={fmtPrice(quote.prevClose)} />
              <Stat label="Day high" value={fmtPrice(quote.high)} />
              <Stat label="Day low" value={fmtPrice(quote.low)} />
              <Stat label="Change" value={fmtPct(quote.percentChange)} tone={tone} />
              <Stat
                label="Market cap"
                // Finnhub reports market cap in millions.
                value={profile?.marketCap ? `$${fmtVolume(profile.marketCap * 1e6)}` : '—'}
              />
              <Stat label="Industry" value={profile?.industry || '—'} />
              <Stat label="Currency" value={profile?.currency || '—'} />
            </section>

            {/* --- future ML slots: empty and labeled, never faked --- */}
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 14px' }}>
              Decision support
            </h2>

            <ComingSoon title="Price prediction model">
              An ML model forecasting {symbol}'s near-term price range, with the confidence
              interval and the features it actually used. Nothing is shown here until a real
              model is trained and evaluated — a made-up signal on a stock page is worse than
              no signal.
            </ComingSoon>

            <ComingSoon title="Signal & risk breakdown">
              Momentum, volatility and correlation against your saved watchlist, so a position
              is judged next to what you already hold rather than in isolation.
            </ComingSoon>

            <ComingSoon title="Grounded research assistant">
              Ask why {symbol} moved and get an answer with citations back to the filings and
              articles it came from — retrieval over real documents, not a language model
              guessing.
            </ComingSoon>

            {/* --- news: real data, so it renders for real --- */}
            {news.length > 0 && (
              <>
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: '28px 0 14px' }}>
                  Recent news
                </h2>
                {news.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    // noreferrer prevents the opened page from reaching back
                    // through window.opener; these URLs come from an upstream
                    // feed, so they're not ours to trust.
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      padding: '12px 0',
                      borderBottom: '1px solid var(--hairline)',
                      textDecoration: 'none',
                      color: 'var(--text)',
                    }}
                  >
                    <div style={{ fontSize: 13, lineHeight: 1.45, marginBottom: 4 }}>
                      {item.headline}
                    </div>
                    <div style={microLabel}>{item.source}</div>
                  </a>
                ))}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
