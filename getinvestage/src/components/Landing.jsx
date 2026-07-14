import { AmbientCanvas } from './AmbientCanvas';
import { TickerTape } from './TickerTape';
import { Mark } from './Mark';

const microLabel = {
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

const FEATURES = [
  {
    n: '01',
    title: 'LIVE ANSWERS',
    copy: 'Ask about any ticker on the tape and get a grounded read of what just printed — price, range, momentum.',
  },
  {
    n: '02',
    title: 'PLAIN ENGLISH',
    copy: 'No jargon walls. The assistant explains moves the way a friend who happens to be an analyst would.',
  },
  {
    n: '03',
    title: 'ANNOTATED WATCHLIST',
    copy: 'Fourteen names, live sparklines, and one question away from “why is this moving?”',
  },
];

export function Landing({ instruments, onLaunch, ambientMotion }) {
  const maskLine = (children, delay) => (
    <span style={{ display: 'block', overflow: 'hidden' }}>
      <span
        style={{
          display: 'block',
          opacity: 0,
          animation: `riseIn 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) ${delay}s forwards`,
        }}
      >
        {children}
      </span>
    </span>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      {/* ---- above the fold ---- */}
      <section
        style={{
          position: 'relative',
          height: '100vh',
          minHeight: 560,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {ambientMotion && <AmbientCanvas active />}

        {/* nav */}
        <nav
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '22px 34px',
            opacity: 0,
            animation: 'fadeIn 0.9s ease 0.1s forwards',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <Mark size={20} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.01em' }}>
              getinvestage
            </span>
          </span>
          <span style={{ flex: 1 }} />
          <span style={microLabel}>RETAIL · LIVE DATA · PLAIN ENGLISH</span>
          <button
            onClick={() => onLaunch()}
            style={{
              minHeight: 44,
              padding: '0 20px',
              border: '1px solid var(--hairline)',
              color: 'var(--text)',
              fontSize: 13,
              transition: 'border-color 160ms ease, background 160ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--hairline)')}
          >
            Open dashboard
          </button>
        </nav>

        {/* hero */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 34px',
            maxWidth: 1080,
          }}
        >
          <div
            style={{
              height: 1,
              width: 'min(560px, 86vw)',
              background: 'var(--hairline)',
              transformOrigin: 'left',
              transform: 'scaleX(0)',
              animation: 'growX 1.1s cubic-bezier(0.2, 0.7, 0.2, 1) 0.35s forwards',
              marginBottom: 26,
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              marginBottom: 22,
              opacity: 0,
              animation: 'fadeIn 0.8s ease 0.55s forwards',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--up)',
                animation: 'pulseDot 2s ease-in-out infinite',
              }}
            />
            <span style={{ ...microLabel, color: 'var(--text-2)' }}>
              AI MARKET ASSISTANT — LIVE
            </span>
          </div>

          <h1
            style={{
              margin: 0,
              fontWeight: 500,
              fontSize: 'clamp(44px, 7.6vw, 92px)',
              lineHeight: 1.04,
              letterSpacing: '-0.02em',
            }}
          >
            {maskLine('The market,', 0.7)}
            {maskLine(<span style={{ color: 'var(--text-2)' }}>thinking out loud.</span>, 0.86)}
          </h1>

          <p
            style={{
              maxWidth: 560,
              marginTop: 26,
              fontSize: 16,
              lineHeight: 1.6,
              color: 'var(--text-2)',
              opacity: 0,
              animation: 'fadeIn 0.9s ease 1.15s forwards',
            }}
          >
            Getinvestage puts a live AI analyst beside your watchlist. It reads every tick as it
            prints — and tells you why it matters, in plain English.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 34,
              opacity: 0,
              animation: 'fadeIn 0.9s ease 1.35s forwards',
            }}
          >
            <button
              onClick={() => onLaunch()}
              style={{
                minHeight: 46,
                padding: '0 24px',
                background: 'var(--accent)',
                color: '#0a0b0d',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Launch the dashboard
            </button>
            <button
              onClick={() => onLaunch({ ask: 'Why is NVDA moving right now?' })}
              style={{
                minHeight: 46,
                padding: '0 22px',
                border: '1px solid var(--hairline)',
                color: 'var(--text-2)',
                fontSize: 14,
                transition: 'color 160ms ease, border-color 160ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-2)';
                e.currentTarget.style.borderColor = 'var(--hairline)';
              }}
            >
              Watch it think →
            </button>
          </div>
        </div>

        {/* tape pinned at the bottom of the fold */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            opacity: 0,
            animation: 'fadeIn 1s ease 1.5s forwards',
          }}
        >
          <TickerTape instruments={instruments} size="lg" />
        </div>
      </section>

      {/* ---- below the fold ---- */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 0,
          padding: '64px 34px',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={f.n}
            style={{
              padding: '28px 26px',
              borderTop: '1px solid var(--hairline)',
              borderLeft: i === 0 ? 'none' : '1px solid var(--hairline)',
            }}
          >
            <div style={{ ...microLabel, marginBottom: 14 }}>
              {f.n} · {f.title}
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--text-2)' }}>
              {f.copy}
            </p>
          </div>
        ))}
      </section>

      <footer
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          padding: '26px 34px 34px',
          borderTop: '1px solid var(--hairline)',
        }}
      >
        <span style={microLabel}>© 2026 GETINVESTAGE</span>
        <span style={microLabel}>EDUCATIONAL TOOL — NOT FINANCIAL ADVICE</span>
      </footer>
    </div>
  );
}
