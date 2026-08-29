import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Mark } from './Mark';
import { microLabel } from '../styles';

/* ---- shared style fragments ------------------------------------------ */

const pillBtn = (active) => ({
  padding: '6px 14px',
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: active ? '#0a0b0d' : 'var(--text-2)',
  background: active ? 'var(--accent)' : 'transparent',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}`,
  cursor: 'pointer',
  transition: 'all 140ms ease',
});

const cardStyle = {
  border: '1px solid var(--hairline)',
  background: 'rgba(255,255,255,0.02)',
  padding: '20px 22px',
  marginBottom: 12,
  animation: 'fadeIn 0.4s ease both',
};

const factorBarBg = {
  height: 4,
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 2,
  overflow: 'hidden',
  flex: 1,
};

/* ---- subcomponents --------------------------------------------------- */

function TypingDots() {
  return (
    <span
      style={{ display: 'inline-flex', gap: 5, padding: '4px 0' }}
      aria-label="Analyzing candidates"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--text-2)',
            animation: `pulseDot 1.1s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

function ConfidenceDot({ level }) {
  const colors = { high: 'var(--up)', medium: 'var(--amber)', low: 'var(--muted)' };
  return (
    <span
      title={`Confidence: ${level}`}
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: colors[level] || colors.low,
      }}
    />
  );
}

function FactorBar({ name, value, max, label }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ ...microLabel, width: 70, flexShrink: 0 }}>{name}</span>
      <div style={factorBarBg}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: pct > 70 ? 'var(--up)' : pct > 40 ? 'var(--amber)' : 'var(--down)',
            borderRadius: 2,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-2)', minWidth: 50, textAlign: 'right' }}>
        {label}
      </span>
    </div>
  );
}

function ScoreRing({ score }) {
  const r = 20;
  const stroke = 3;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? 'var(--up)' : score >= 40 ? 'var(--amber)' : 'var(--down)';
  return (
    <svg width={50} height={50} style={{ flexShrink: 0 }}>
      <circle
        cx={25} cy={25} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={stroke}
      />
      <circle
        cx={25} cy={25} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 25 25)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text
        x={25} y={25}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text)"
        fontSize={12}
        fontWeight={600}
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

function ResultCard({ result, index }) {
  const [expanded, setExpanded] = useState(false);
  const delay = `${index * 0.08}s`;

  return (
    <div style={{ ...cardStyle, animationDelay: delay }}>
      {/* top row: rank + symbol + score ring */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <span
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: '#0a0b0d',
            background: 'var(--accent)',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          #{result.rank}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{result.symbol}</span>
            <ConfidenceDot level={result.confidence} />
            {result.flagged && (
              <span title="Some numbers in the explanation may not match the input data" style={{ fontSize: 12, color: 'var(--amber)' }}>
                ⚠
              </span>
            )}
          </div>
          {result.profile?.name && (
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{result.profile.name}</span>
          )}
        </div>
        <ScoreRing score={result.score} />
      </div>

      {/* factor bars */}
      <div style={{ marginBottom: 14 }}>
        {Object.entries(result.factors || {}).map(([name, f]) => (
          <FactorBar key={name} name={name} value={f.value} max={f.max} label={f.label} />
        ))}
      </div>

      {/* news snippets */}
      {result.news?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ ...microLabel, display: 'block', marginBottom: 6 }}>Recent news</span>
          {result.news.map((n, i) => (
            <p key={i} style={{ margin: '0 0 4px', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--muted)' }}>[{n.source}]</span> {n.headline}
            </p>
          ))}
        </div>
      )}

      {/* explanation toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          padding: '7px 12px',
          fontSize: 11,
          color: 'var(--text-2)',
          border: '1px solid var(--hairline)',
          transition: 'color 140ms ease, border-color 140ms ease',
          width: '100%',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-2)';
          e.currentTarget.style.borderColor = 'var(--hairline)';
        }}
      >
        {expanded ? '▾ Hide explanation' : '▸ Show explanation'}
      </button>
      {expanded && (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 12.5,
            lineHeight: 1.62,
            color: '#c9ccd0',
            padding: '12px 14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--hairline)',
            animation: 'fadeIn 0.25s ease',
          }}
        >
          {result.explanation}
        </p>
      )}
    </div>
  );
}

/* ---- main component -------------------------------------------------- */

const RISK_OPTIONS = ['conservative', 'moderate', 'aggressive'];
const HORIZON_OPTIONS = ['short', 'medium', 'long'];

export function Recommendations() {
  const [searchParams] = useSearchParams();
  const initialSymbols = searchParams.get('symbols') || '';

  const [symbolInput, setSymbolInput] = useState(initialSymbols);
  const [risk, setRisk] = useState('moderate');
  const [horizon, setHorizon] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const analyze = useCallback(async () => {
    const symbols = symbolInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0) {
      setError('Enter at least one ticker symbol to analyze.');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const result = await api.post('/api/recommend', {
        symbols,
        profile: { riskTolerance: risk, horizon },
      });
      setData(result);
    } catch (err) {
      if (err.status === 503) {
        setError(
          'Recommendation service temporarily unavailable. The scoring engine requires an active LLM connection.'
        );
      } else if (err.status === 404) {
        setError('None of the provided symbols could be found. Check the tickers and try again.');
      } else {
        setError(err.message || 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  }, [symbolInput, risk, horizon]);

  // Auto-analyze if symbols were provided via URL.
  useEffect(() => {
    if (initialSymbols) analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* header */}
      <header className="app-header">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Mark size={19} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>getinvestage</span>
        </span>
        <span style={{ ...microLabel, color: 'var(--text-2)' }}>RECOMMENDATIONS</span>
        <span style={{ flex: 1 }} />
        <Link
          to="/dashboard"
          style={{ ...microLabel, flexShrink: 0, textDecoration: 'none', color: 'var(--text-2)' }}
        >
          ← dashboard
        </Link>
      </header>

      {/* content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 60px' }}>
          {/* input section */}
          <div style={{ marginBottom: 28 }}>
            <label
              htmlFor="rec-symbols"
              style={{ ...microLabel, display: 'block', marginBottom: 8 }}
            >
              Candidate Tickers
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="rec-symbols"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && analyze()}
                placeholder="AAPL, NVDA, MSFT, TSLA, GOOGL"
                aria-label="Enter candidate ticker symbols"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 40,
                  padding: '0 14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--text)',
                  fontSize: 13,
                  outline: 'none',
                  letterSpacing: '0.04em',
                }}
              />
              <button
                id="rec-analyze-btn"
                onClick={analyze}
                disabled={loading}
                style={{
                  height: 40,
                  padding: '0 20px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  background: loading ? 'var(--muted)' : 'var(--accent)',
                  color: '#0a0b0d',
                  border: 'none',
                  cursor: loading ? 'default' : 'pointer',
                  transition: 'background 140ms ease',
                }}
              >
                {loading ? 'Analyzing…' : 'Analyze'}
              </button>
            </div>
          </div>

          {/* profile selectors */}
          <div style={{ display: 'flex', gap: 28, marginBottom: 28, flexWrap: 'wrap' }}>
            <div>
              <span style={{ ...microLabel, display: 'block', marginBottom: 8 }}>
                Risk Tolerance
              </span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {RISK_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRisk(r)}
                    style={pillBtn(risk === r)}
                    onMouseEnter={(e) => {
                      if (risk !== r) e.currentTarget.style.color = 'var(--text)';
                    }}
                    onMouseLeave={(e) => {
                      if (risk !== r) e.currentTarget.style.color = 'var(--text-2)';
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span style={{ ...microLabel, display: 'block', marginBottom: 8 }}>
                Time Horizon
              </span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {HORIZON_OPTIONS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    style={pillBtn(horizon === h)}
                    onMouseEnter={(e) => {
                      if (horizon !== h) e.currentTarget.style.color = 'var(--text)';
                    }}
                    onMouseLeave={(e) => {
                      if (horizon !== h) e.currentTarget.style.color = 'var(--text-2)';
                    }}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* loading state */}
          {loading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '48px 0',
                animation: 'fadeIn 0.3s ease',
              }}
            >
              <TypingDots />
              <span style={{ ...microLabel, color: 'var(--text-2)' }}>
                Scoring candidates and generating analysis…
              </span>
            </div>
          )}

          {/* error state */}
          {error && !loading && (
            <div
              style={{
                padding: '24px 20px',
                border: '1px solid rgba(224,101,92,0.3)',
                background: 'rgba(224,101,92,0.06)',
                marginBottom: 20,
                animation: 'fadeIn 0.3s ease',
              }}
            >
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--down)', lineHeight: 1.55 }}>
                {error}
              </p>
              <button
                onClick={analyze}
                style={{
                  marginTop: 12,
                  padding: '7px 14px',
                  fontSize: 11,
                  color: 'var(--text-2)',
                  border: '1px solid var(--hairline)',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* results */}
          {data && !loading && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                }}
              >
                <span style={microLabel}>
                  {data.results?.length || 0} candidates ranked
                </span>
                {data.cached && (
                  <span style={{ ...microLabel, color: 'var(--amber)' }}>CACHED</span>
                )}
              </div>

              {data.results?.map((r, i) => (
                <ResultCard key={r.symbol} result={r} index={i} />
              ))}
            </div>
          )}

          {/* empty state */}
          {!loading && !error && !data && (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--text-2)',
                animation: 'fadeIn 0.4s ease',
              }}
            >
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 8px' }}>
                Enter ticker symbols above and click <strong>Analyze</strong> to get
                AI-powered recommendations grounded in real market data.
              </p>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                Try: AAPL, NVDA, MSFT, TSLA, GOOGL
              </p>
            </div>
          )}

          {/* disclaimer */}
          <p
            style={{
              ...microLabel,
              textAlign: 'center',
              padding: '20px 0 10px',
              margin: 0,
            }}
          >
            Educational insights — not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
