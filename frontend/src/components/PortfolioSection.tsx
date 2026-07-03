import { Briefcase, CaretDown, CaretUp, ChartPieSlice, TrendUp, Wallet } from '@phosphor-icons/react';
import { fmtPct, fmtPrice } from '../api';
import { useCountUp } from '../hooks';
import type { Quote } from '../types';

/** Sample portfolio — valued live against real quotes. */
const HOLDINGS = [
  { symbol: 'AAPL', shares: 12, cost: 228.4 },
  { symbol: 'MSFT', shares: 6, cost: 412.1 },
  { symbol: 'NVDA', shares: 25, cost: 121.6 },
  { symbol: 'META', shares: 4, cost: 505.2 },
  { symbol: 'AMZN', shares: 10, cost: 186.3 },
];

export const PORTFOLIO_SYMBOLS = HOLDINGS.map((h) => h.symbol);

interface Props {
  quotes: Record<string, Quote | null> | null;
  loading: boolean;
  onSelectSymbol: (symbol: string) => void;
}

function Metric({
  icon,
  label,
  value,
  prefix = '',
  suffix = '',
  tone,
  decimals = 2,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  tone?: 'up' | 'down';
  decimals?: number;
}) {
  const animated = useCountUp(value);
  return (
    <div className="glass metric-card hover-lift">
      <div className="metric-icon">{icon}</div>
      <div className={`metric-value num ${tone ?? ''}`}>
        {prefix}
        {animated.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
        {suffix}
      </div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

export function PortfolioSection({ quotes, loading, onSelectSymbol }: Props) {
  const rows = HOLDINGS.map((h) => {
    const q = quotes?.[h.symbol] ?? null;
    const price = q?.current ?? h.cost;
    const value = h.shares * price;
    const dayPL = q ? h.shares * q.change : 0;
    const totalPL = h.shares * (price - h.cost);
    return { ...h, q, price, value, dayPL, totalPL };
  });

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalDay = rows.reduce((s, r) => s + r.dayPL, 0);
  const totalPL = rows.reduce((s, r) => s + r.totalPL, 0);
  const totalCost = rows.reduce((s, r) => s + r.shares * r.cost, 0);
  const returnPct = totalCost ? (totalPL / totalCost) * 100 : 0;

  return (
    <section id="portfolio" className="section">
      <span className="eyebrow">Portfolio</span>
      <h2 className="section-title">Your performance at a glance</h2>
      <p className="section-sub">
        A sample portfolio valued in real time against live market prices.
      </p>

      {loading && !quotes ? (
        <div className="metric-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 140 }} />
          ))}
        </div>
      ) : (
        <div className="metric-grid">
          <Metric icon={<Wallet size={20} />} label="Total value" value={totalValue} prefix="$" />
          <Metric
            icon={<TrendUp size={20} />}
            label="Day P/L"
            value={totalDay}
            prefix={totalDay < 0 ? '-$' : '+$'}
            tone={totalDay < 0 ? 'down' : 'up'}
          />
          <Metric
            icon={<ChartPieSlice size={20} />}
            label="Total return"
            value={Math.abs(returnPct)}
            prefix={returnPct < 0 ? '-' : '+'}
            suffix="%"
            tone={returnPct < 0 ? 'down' : 'up'}
          />
          <Metric
            icon={<Briefcase size={20} />}
            label="Positions"
            value={rows.length}
            decimals={0}
          />
        </div>
      )}

      <div className="glass table-card">
        <div className="panel-head">
          <h3 className="panel-title">Holdings</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gi-table">
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Shares</th>
                <th scope="col">Price</th>
                <th scope="col">Value</th>
                <th scope="col">Day P/L</th>
                <th scope="col">Total P/L</th>
                <th scope="col">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const alloc = totalValue ? (r.value / totalValue) * 100 : 0;
                const dayDown = r.dayPL < 0;
                const plDown = r.totalPL < 0;
                return (
                  <tr
                    key={r.symbol}
                    className="gi-row"
                    onClick={() => onSelectSymbol(r.symbol)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectSymbol(r.symbol)}
                  >
                    <td>{r.symbol}</td>
                    <td className="num">{r.shares}</td>
                    <td className="num">{r.q ? fmtPrice(r.price) : '—'}</td>
                    <td className="num">${fmtPrice(r.value)}</td>
                    <td className={`num ${dayDown ? 'down' : 'up'}`}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {dayDown ? <CaretDown size={12} weight="fill" /> : <CaretUp size={12} weight="fill" />}
                        ${fmtPrice(Math.abs(r.dayPL))}
                      </span>
                    </td>
                    <td className={`num ${plDown ? 'down' : 'up'}`}>
                      {plDown ? '-' : '+'}${fmtPrice(Math.abs(r.totalPL))}
                    </td>
                    <td>
                      <span className="num" style={{ fontSize: 12.5, color: 'var(--text-3)', marginRight: 8 }}>
                        {fmtPct(alloc).replace('+', '')}
                      </span>
                      <span className="alloc-track">
                        <span className="alloc-fill" style={{ width: `${alloc}%` }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
