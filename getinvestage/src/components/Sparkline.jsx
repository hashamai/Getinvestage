/** Tiny inline SVG sparkline of the last ~36 points, colored by direction. */
export function Sparkline({ points, width = 64, height = 20 }) {
  const pts = points.slice(-36);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * width;
      const y = height - 2 - ((p - min) / span) * (height - 4);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path d={d} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.2" />
    </svg>
  );
}
