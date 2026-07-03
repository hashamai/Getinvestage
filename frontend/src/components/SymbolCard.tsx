import { CaretDown, CaretUp, Star } from '@phosphor-icons/react';
import { fmtChange, fmtMarketCap, fmtPct, fmtPrice } from '../api';
import type { Profile, Quote } from '../types';

interface Props {
  symbol: string;
  quote: Quote | null;
  profile: Profile | null;
  loading: boolean;
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
}

export function SymbolCard({
  symbol,
  quote,
  profile,
  loading,
  inWatchlist,
  onToggleWatchlist,
}: Props) {
  if (loading && !quote) {
    return (
      <section className="glass sym-card" aria-label="Symbol details loading">
        <div className="skeleton" style={{ height: 44, marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 38, width: '60%' }} />
      </section>
    );
  }

  const down = quote ? quote.change < 0 : false;
  const rangePct =
    quote && quote.high > quote.low
      ? Math.min(100, Math.max(0, ((quote.current - quote.low) / (quote.high - quote.low)) * 100))
      : 50;

  return (
    <section className="glass sym-card hover-lift" aria-label={`${symbol} details`}>
      <div className="sym-head">
        <span className="sym-logo" aria-hidden="true">
          {profile?.logo ? <img src={profile.logo} alt="" /> : symbol.slice(0, 2)}
        </span>
        <div style={{ minWidth: 0 }}>
          <h3 className="sym-title">{symbol}</h3>
          <div className="sym-sub">
            {profile ? `${profile.name} · ${profile.exchange}` : '—'}
          </div>
        </div>
      </div>

      {quote && (
        <>
          <div className="sym-price-row num">
            <span className="sym-price">{fmtPrice(quote.current)}</span>
            <span className="sym-ccy">{profile?.currency ?? 'USD'}</span>
            <span className={`sym-change ${down ? 'down' : 'up'}`}>
              <span className="delta-arrow" key={down ? 'd' : 'u'}>
                {down ? <CaretDown size={13} weight="fill" /> : <CaretUp size={13} weight="fill" />}
              </span>
              {fmtChange(quote.change)} {fmtPct(quote.percentChange)}
            </span>
          </div>

          <div className="range-bar">
            <div className="range-caption">DAY'S RANGE</div>
            <div
              className="range-track"
              role="img"
              aria-label={`Price ${fmtPrice(quote.current)} within day's range ${fmtPrice(quote.low)} to ${fmtPrice(quote.high)}`}
            >
              <span className="range-fill" style={{ left: `${rangePct}%` }} />
            </div>
            <div className="range-labels num">
              <span>{fmtPrice(quote.low)}</span>
              <span>{fmtPrice(quote.high)}</span>
            </div>
          </div>

          <dl className="sym-facts" style={{ margin: 0 }}>
            <div>
              <dt className="fact-label">Open</dt>
              <dd className="fact-value num" style={{ margin: 0 }}>{fmtPrice(quote.open)}</dd>
            </div>
            <div>
              <dt className="fact-label">Prev close</dt>
              <dd className="fact-value num" style={{ margin: 0 }}>{fmtPrice(quote.prevClose)}</dd>
            </div>
            <div>
              <dt className="fact-label">Market cap</dt>
              <dd className="fact-value num" style={{ margin: 0 }}>
                {fmtMarketCap(profile?.marketCap ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="fact-label">Industry</dt>
              <dd className="fact-value" style={{ margin: 0 }}>
                {profile?.industry || '—'}
              </dd>
            </div>
          </dl>
        </>
      )}

      <button className="wl-toggle" onClick={onToggleWatchlist}>
        <Star size={16} weight={inWatchlist ? 'fill' : 'regular'} aria-hidden="true" />
        {inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
      </button>
    </section>
  );
}
