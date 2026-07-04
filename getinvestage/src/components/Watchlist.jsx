import { useEffect, useRef } from 'react';
import { FLASH_THRESHOLD, fmtPct, fmtPrice } from '../useMarket';
import { Sparkline } from './Sparkline';

const ROW_GRID = 'minmax(88px, 1.1fr) 84px 66px 76px';

const microLabel = {
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

/** Price cell that flashes green/red on sharp ticks, then fades back. */
function PriceCell({ inst }) {
  const ref = useRef(null);
  const seqRef = useRef(inst.seq);

  useEffect(() => {
    if (inst.seq === seqRef.current) return;
    seqRef.current = inst.seq;
    if (Math.abs(inst.lastStep) < FLASH_THRESHOLD || !ref.current) return;
    ref.current.animate(
      [
        { color: inst.lastStep > 0 ? '#4ec58f' : '#e0655c' },
        { color: '#ededed' },
      ],
      { duration: 800, easing: 'ease-out' },
    );
  });

  return (
    <span
      ref={ref}
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontSize: 12.5,
        textAlign: 'right',
      }}
    >
      {fmtPrice(inst.price)}
    </span>
  );
}

export function Watchlist({ tickers, selected, onSelect }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderRight: '1px solid var(--hairline)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '14px 16px 10px',
        }}
      >
        <span style={{ ...microLabel, color: 'var(--text-2)' }}>WATCHLIST</span>
        <span style={microLabel}>{tickers.length} SYMBOLS</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: ROW_GRID,
          gap: 8,
          padding: '0 16px 8px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <span style={microLabel}>TICKER</span>
        <span style={{ ...microLabel, textAlign: 'right' }}>LAST</span>
        <span style={{ ...microLabel, textAlign: 'right' }}>CHG%</span>
        <span style={{ ...microLabel, textAlign: 'right' }}>TREND</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {tickers.map((inst) => {
          const isSel = inst.symbol === selected;
          return (
            <div
              key={inst.symbol}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(inst.symbol)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(inst.symbol)}
              aria-pressed={isSel}
              style={{
                display: 'grid',
                gridTemplateColumns: ROW_GRID,
                gap: 8,
                alignItems: 'center',
                padding: '9px 16px 9px 14px',
                borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent',
                background: isSel ? 'rgba(255,255,255,0.045)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                transition: 'background 140ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.028)';
              }}
              onMouseLeave={(e) => {
                if (!isSel) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em' }}>
                  {inst.symbol}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 10.5,
                    color: 'var(--muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {inst.name}
                </span>
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <PriceCell inst={inst} />
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontSize: 11.5,
                  fontVariantNumeric: 'tabular-nums',
                  color: inst.chgPct >= 0 ? 'var(--up)' : 'var(--down)',
                }}
              >
                {fmtPct(inst.chgPct)}
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Sparkline points={inst.history} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
