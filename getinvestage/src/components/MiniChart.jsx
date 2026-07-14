/* A plain SVG line+area chart of closing prices.
 *
 * Deliberately not PriceChart: that component is coupled to the useMarket
 * instrument shape (beta, history, simulated ticks). The analysis page has a
 * bare list of closes from /api/candles and nothing else, so it gets a
 * component that asks for exactly that and nothing more.
 */

const W = 800;
const H = 220;

export function MiniChart({ series, up }) {
  if (!series || series.length < 2) {
    return (
      <div
        style={{
          height: H / 2,
          display: 'grid',
          placeItems: 'center',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          border: '1px solid var(--hairline)',
        }}
      >
        No price history
      </div>
    );
  }

  const min = Math.min(...series);
  const max = Math.max(...series);
  // A flat series would make (max - min) zero and every y coordinate NaN.
  const span = max - min || 1;

  const x = (i) => (i / (series.length - 1)) * W;
  const y = (v) => H - ((v - min) / span) * H;

  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const color = up ? 'var(--up)' : 'var(--down)';
  const gradientId = up ? 'mc-up' : 'mc-down';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: H, display: 'block' }}
      role="img"
      aria-label="Price history"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        // preserveAspectRatio="none" stretches the viewBox non-uniformly, which
        // would also stretch the stroke. This keeps the line 1.6px on screen.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
