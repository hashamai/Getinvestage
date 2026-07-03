import { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { api, fmtPct, fmtPrice } from '../api';
import { useCountUp, usePolled } from '../hooks';

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

function StatValue({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <span className="num">{fmtPrice(animated)}</span>;
}

interface ParticleSpec {
  left: string;
  top: string;
  size: number;
  dx: string;
  dy: string;
  dur: string;
  delay: string;
  glyph?: string;
}

function makeParticles(count: number): ParticleSpec[] {
  const glyphs = ['$', '▲', '▼', '%', '¢'];
  const out: ParticleSpec[] = [];
  for (let i = 0; i < count; i++) {
    // Deterministic pseudo-random layout so renders are stable.
    const r = (n: number) => ((i * 7919 + n * 104729) % 1000) / 1000;
    out.push({
      left: `${4 + r(1) * 92}%`,
      top: `${8 + r(2) * 80}%`,
      size: 3 + r(3) * 5,
      dx: `${(r(4) - 0.5) * 70}px`,
      dy: `${-30 - r(5) * 60}px`,
      dur: `${10 + r(6) * 12}s`,
      delay: `${-r(7) * 12}s`,
      glyph: i % 4 === 0 ? glyphs[i % glyphs.length] : undefined,
    });
  }
  return out;
}

export function Hero({ onSelectSymbol }: Props) {
  const heroRef = useRef<HTMLElement>(null);
  const rafRef = useRef(0);
  const { data: indices, loading } = usePolled(() => api.indices(), 60_000, []);
  const particles = useMemo(() => makeParticles(16), []);

  const onMouseMove = (e: React.MouseEvent) => {
    const el = heroRef.current;
    if (!el) return;
    cancelAnimationFrame(rafRef.current);
    const { clientX, clientY } = e;
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${clientX - rect.left}px`);
      el.style.setProperty('--my', `${clientY - rect.top}px`);
    });
  };

  return (
    <section id="dashboard" className="hero" ref={heroRef} onMouseMove={onMouseMove}>
      <div className="hero-glow" aria-hidden="true" />
      <div className="particles" aria-hidden="true">
        {particles.map((p, i) => (
          <span
            key={i}
            className={`particle${p.glyph ? ' glyph' : ''}`}
            style={{
              left: p.left,
              top: p.top,
              width: p.glyph ? undefined : p.size,
              height: p.glyph ? undefined : p.size,
              ['--dx' as string]: p.dx,
              ['--dy' as string]: p.dy,
              ['--dur' as string]: p.dur,
              ['--delay' as string]: p.delay,
            }}
          >
            {p.glyph}
          </span>
        ))}
      </div>

      <div className="hero-inner">
        <motion.h1
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Markets in focus. <em>Decisions with vantage.</em>
        </motion.h1>
        <motion.p
          className="hero-sub"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: 'easeOut' }}
        >
          GetInvestage brings live quotes, candlestick analytics, portfolio performance and
          market-moving news into one professional workspace.
        </motion.p>
        <motion.div
          className="hero-ctas"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.22, ease: 'easeOut' }}
        >
          <a className="btn btn-primary" href="#markets">
            Explore markets
          </a>
          <a className="btn btn-ghost" href="#portfolio">
            View portfolio
          </a>
        </motion.div>

        <div className="hero-stats">
          {loading &&
            [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 108 }} />)}
          {indices?.map((idx, i) => {
            const q = idx.quote;
            const down = q ? q.change < 0 : false;
            return (
              <motion.button
                key={idx.symbol}
                className={`glass stat-card hover-lift${i === 0 ? ' g-border' : ''}`}
                style={{ textAlign: 'left' }}
                onClick={() => onSelectSymbol(idx.symbol)}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: 'easeOut' }}
                aria-label={`${idx.label}, open chart`}
              >
                <span className="stat-label">
                  {idx.label} <span style={{ opacity: 0.6 }}>· {idx.symbol}</span>
                </span>
                {q ? (
                  <>
                    <div className="stat-value">
                      <StatValue value={q.current} />
                    </div>
                    <span className={`stat-delta num ${down ? 'down' : 'up'}`}>
                      <span className="delta-arrow" key={down ? 'd' : 'u'}>
                        {down ? <CaretDown size={13} weight="fill" /> : <CaretUp size={13} weight="fill" />}
                      </span>
                      {fmtPct(q.percentChange)}
                    </span>
                  </>
                ) : (
                  <div className="stat-value" style={{ color: 'var(--text-3)', fontSize: 16 }}>
                    Unavailable
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
