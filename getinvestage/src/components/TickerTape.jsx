import { fmtPct, fmtPrice } from '../useMarket';

/** Infinite scrolling tape: list rendered twice, translateX 0 → -50% loop. */
export function TickerTape({ instruments, size = 'lg' }) {
  const sm = size === 'sm';

  const item = (inst, keyPrefix, hidden) => (
    <span
      key={keyPrefix + inst.symbol}
      aria-hidden={hidden || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 8,
        padding: sm ? '7px 16px' : '12px 22px',
        fontSize: sm ? 11 : 12,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.08em' }}>
        {inst.symbol}
      </span>
      <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {fmtPrice(inst.price)}
      </span>
      <span
        style={{
          color: inst.chgPct >= 0 ? 'var(--up)' : 'var(--down)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtPct(inst.chgPct)}
      </span>
    </span>
  );

  return (
    <div
      aria-label="Market ticker"
      style={{
        overflow: 'hidden',
        borderTop: '1px solid var(--hairline)',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 'max-content',
          animation: `tapeMove ${sm ? 38 : 52}s linear infinite`,
        }}
      >
        {instruments.map((i) => item(i, 'a-', false))}
        {instruments.map((i) => item(i, 'b-', true))}
      </div>
    </div>
  );
}
