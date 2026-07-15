import { useEffect, useMemo, useRef } from 'react';
import { fmtPct, fmtPrice, fmtVolume, useRangeSeries } from '../useMarket';
import { microLabel } from '../styles';

const RANGES = ['1D', '1W', '1M', '1Y'];
const VB_W = 800;
const VB_H = 300;

function xLabels(range) {
  if (range === '1D') return ['09:30', '11:00', '12:30', '14:00', '15:30'];
  if (range === '1W') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  if (range === '1M') {
    const out = [];
    for (let back = 3; back >= 0; back--) {
      const d = new Date(Date.now() - back * 9 * 86400e3);
      out.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    return out;
  }
  const out = [];
  for (let back = 5; back >= 0; back--) {
    const d = new Date();
    d.setMonth(d.getMonth() - back * 2);
    out.push(d.toLocaleDateString('en-US', { month: 'short' }));
  }
  return out;
}

export function PriceChart({ inst, range, onRangeChange, source }) {
  const { series: fetchedSeries, loading } = useRangeSeries(inst, range, source);
  const series = fetchedSeries && fetchedSeries.length > 1 ? fetchedSeries : null;
  const pathRef = useRef(null);
  const areaRef = useRef(null);
  const drawKeyRef = useRef('');

  const { linePath, areaPath, min, max, lastFrac } = useMemo(() => {
    if (!series) {
      return { linePath: '', areaPath: '', min: 0, max: 1, lastFrac: { x: 1, y: 0.5 } };
    }
    const lo = Math.min(...series);
    const hi = Math.max(...series);
    const pad = (hi - lo || 1) * 0.06;
    const mn = lo - pad;
    const mx = hi + pad;
    const span = mx - mn;
    const n = series.length;
    const pts = series.map((v, i) => {
      const x = (i / (n - 1)) * VB_W;
      const y = (1 - (v - mn) / span) * VB_H;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return {
      linePath: `M${pts.join(' L')}`,
      areaPath: `M${pts.join(' L')} L${VB_W},${VB_H} L0,${VB_H} Z`,
      min: mn,
      max: mx,
      lastFrac: {
        x: 1,
        y: 1 - (series[n - 1] - mn) / span,
      },
    };
    // series identity changes every tick for 1D — that's intended.
  }, [series, series && series.length && series[series.length - 1]]);

  // Self-drawing line on symbol/range change (not on live ticks).
  useEffect(() => {
    if (!series) return;
    const key = `${inst.symbol}:${range}`;
    if (drawKeyRef.current === key) return;
    drawKeyRef.current = key;
    const path = pathRef.current;
    const area = areaRef.current;
    if (!path || !area) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    const anim = path.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: 900, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
    );
    anim.onfinish = () => {
      path.style.strokeDasharray = 'none';
      path.style.strokeDashoffset = '0';
    };
    area.style.opacity = '0';
    area.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 600,
      delay: 320,
      easing: 'ease-out',
    }).onfinish = () => {
      area.style.opacity = '1';
    };
  }, [inst.symbol, range, series]);

  const up = inst.chgPct >= 0;
  const gridFracs = [0.2, 0.4, 0.6, 0.8];
  const stats = [
    ['OPEN', fmtPrice(inst.open)],
    ['HIGH', fmtPrice(inst.dayHigh ?? Math.max(...inst.history))],
    ['LOW', fmtPrice(inst.dayLow ?? Math.min(...inst.history))],
    ['VOLUME', fmtVolume(inst.vol)],
    ['MKT CAP', inst.mcap],
    ['P/E', typeof inst.pe === 'number' ? inst.pe.toFixed(1) : inst.pe],
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        padding: '14px 18px 10px',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.04em' }}>
          {inst.symbol}
        </span>
        <span style={{ ...microLabel }}>{inst.name}</span>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', gap: 4 }}>
          {RANGES.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                onClick={() => onRangeChange(r)}
                aria-pressed={active}
                style={{
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? '#0a0b0d' : 'var(--text-2)',
                  border: active ? '1px solid var(--accent)' : '1px solid var(--hairline)',
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 10px' }}>
        <span
          style={{
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          ${fmtPrice(inst.price)}
        </span>
        <span
          style={{
            padding: '5px 10px',
            fontSize: 11.5,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: up ? 'var(--up)' : 'var(--down)',
            background: up ? 'rgba(78,197,143,0.1)' : 'rgba(224,101,92,0.12)',
            border: `1px solid ${up ? 'rgba(78,197,143,0.25)' : 'rgba(224,101,92,0.3)'}`,
          }}
        >
          {fmtPct(inst.chgPct)} today
        </span>
      </div>

      {/* chart */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          aria-label={`${inst.symbol} ${range} price chart`}
        >
          {gridFracs.map((f) => (
            <line
              key={f}
              x1="0"
              x2={VB_W}
              y1={f * VB_H}
              y2={f * VB_H}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path ref={areaRef} d={areaPath} fill="var(--accent)" fillOpacity="0.05" stroke="none" />
          <path
            ref={pathRef}
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* right-edge price labels (HTML so they don't stretch) */}
        {series &&
          gridFracs.map((f) => (
          <span
            key={f}
            style={{
              position: 'absolute',
              right: 4,
              top: `${f * 100}%`,
              transform: 'translateY(-55%)',
              fontSize: 10,
              color: 'var(--muted)',
              fontVariantNumeric: 'tabular-nums',
              background: 'rgba(10,11,13,0.72)',
              padding: '1px 4px',
            }}
          >
            ${fmtPrice(max - f * (max - min))}
          </span>
          ))}

        {/* live head dot */}
        {series && (
          <span
            style={{
              position: 'absolute',
              left: `${lastFrac.x * 100}%`,
              top: `${lastFrac.y * 100}%`,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 10px var(--accent)',
              transform: 'translate(-60%, -50%)',
            }}
          />
        )}

        {loading && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: 10,
              letterSpacing: '0.18em',
              color: 'var(--muted)',
            }}
          >
            LOADING {range} SERIES…
          </span>
        )}
      </div>

      {/* x-axis labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 2px 0',
        }}
      >
        {xLabels(range).map((l) => (
          <span key={l} style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            {l}
          </span>
        ))}
      </div>

      {/* stats strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          marginTop: 12,
          borderTop: '1px solid var(--hairline)',
        }}
      >
        {stats.map(([label, value], i) => (
          <div
            key={label}
            style={{
              padding: '10px 12px',
              borderLeft: i === 0 ? 'none' : '1px solid var(--hairline)',
              minWidth: 0,
            }}
          >
            <div style={microLabel}>{label}</div>
            <div
              style={{
                fontSize: 12.5,
                marginTop: 3,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
