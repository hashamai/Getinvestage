import { useEffect, useRef, useState } from 'react';
import { generateResponse } from '../assistant';
import { Mark } from './Mark';
import { microLabel } from '../styles';

/* Message bullets stay a plain glyph — the full mark is reserved for the
   brand lockup and the panel header, so it doesn't get diluted. */
const Bullet = () => (
  <span
    aria-hidden="true"
    style={{
      display: 'inline-block',
      width: 6,
      height: 6,
      background: 'var(--accent)',
      transform: 'rotate(45deg)',
      flexShrink: 0,
    }}
  />
);

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 5, padding: '4px 0' }} aria-label="Assistant is thinking">
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

export function Assistant({ market, selectedSymbol, initialAsk }) {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: `Hey — I'm live on your ${market.tickers.length} tickers. Ask why anything's moving, tap a row, or try a suggestion below. I answer in plain English.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [stream, setStream] = useState(null);
  const listRef = useRef(null);
  const marketRef = useRef(market);
  marketRef.current = market;
  const selectedRef = useRef(selectedSymbol);
  selectedRef.current = selectedSymbol;
  const busyRef = useRef(false);
  const timersRef = useRef([]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, stream]);

  const send = (raw) => {
    const text = (raw ?? input).trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setTyping(true);

    const thinkMs = 700 + Math.random() * 700;
    timersRef.current.push(
      setTimeout(() => {
        const m = marketRef.current;
        const selected =
          m.tickers.find((t) => t.symbol === selectedRef.current) ?? m.tickers[0];
        const answer = generateResponse(text, { tickers: m.tickers, selected });
        setTyping(false);

        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setMessages((msgs) => [...msgs, { role: 'ai', text: answer }]);
          busyRef.current = false;
          return;
        }

        // Stream character-by-character with a caret, then commit.
        let i = 0;
        setStream('');
        const step = () => {
          i = Math.min(answer.length, i + 2 + Math.floor(Math.random() * 2));
          setStream(answer.slice(0, i));
          if (i < answer.length) {
            timersRef.current.push(setTimeout(step, 14));
          } else {
            setStream(null);
            setMessages((msgs) => [...msgs, { role: 'ai', text: answer }]);
            busyRef.current = false;
          }
        };
        step();
      }, thinkMs),
    );
  };

  // Auto-ask when arriving via "Watch it think →". Cleanup (not a ref guard)
  // keeps this StrictMode-safe: dev double-mount schedules → clears → schedules.
  useEffect(() => {
    if (!initialAsk) return;
    const id = setTimeout(() => send(initialAsk), 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk]);

  // Contextual suggestion chips.
  const mostMoved = [...market.tickers].sort(
    (a, b) => Math.abs(b.chgPct) - Math.abs(a.chgPct),
  )[0];
  const sel = market.tickers.find((t) => t.symbol === selectedSymbol) ?? market.tickers[0];
  const peer =
    market.tickers.find((t) => t.sector === sel.sector && t.symbol !== sel.symbol) ??
    market.tickers.find((t) => t.symbol !== sel.symbol);
  const chips = [
    `Why is ${mostMoved.symbol} ${mostMoved.chgPct >= 0 ? 'up' : 'down'} today?`,
    'Summarize my watchlist',
    `Compare ${sel.symbol} and ${peer.symbol}`,
  ];

  const aiText = { fontSize: 12.5, lineHeight: 1.62, color: '#c9ccd0' };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '14px 16px 10px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <Mark size={17} pulse />
        <span style={{ ...microLabel, color: 'var(--text-2)' }}>ASSISTANT</span>
        <span style={{ flex: 1 }} />
        <span style={microLabel}>grounded in live quotes</span>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 16px' }}>
        {messages.map((m, i) =>
          m.role === 'ai' ? (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <span style={{ paddingTop: 5 }}>
                <Bullet />
              </span>
              <p style={{ margin: 0, ...aiText }}>{m.text}</p>
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <span
                style={{
                  maxWidth: '86%',
                  padding: '8px 12px',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid var(--hairline)',
                }}
              >
                {m.text}
              </span>
            </div>
          ),
        )}

        {typing && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <span style={{ paddingTop: 5 }}>
              <Bullet />
            </span>
            <TypingDots />
          </div>
        )}

        {stream !== null && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <span style={{ paddingTop: 5 }}>
              <Bullet />
            </span>
            <p style={{ margin: 0, ...aiText }}>
              {stream}
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 13,
                  marginLeft: 2,
                  verticalAlign: '-2px',
                  background: 'var(--accent)',
                  animation: 'blinkCaret 0.9s step-end infinite',
                }}
              />
            </p>
          </div>
        )}
      </div>

      <div style={{ padding: '10px 14px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => send(c)}
            style={{
              padding: '7px 11px',
              fontSize: 11,
              color: 'var(--text-2)',
              border: '1px solid var(--hairline)',
              transition: 'color 140ms ease, border-color 140ms ease',
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
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 14px 6px' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about your watchlist…"
          aria-label="Ask the assistant about your watchlist"
          style={{
            flex: 1,
            minWidth: 0,
            height: 38,
            padding: '0 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--hairline)',
            color: 'var(--text)',
            fontSize: 12.5,
            outline: 'none',
          }}
        />
        <button
          onClick={() => send()}
          aria-label="Send question"
          style={{
            width: 38,
            height: 38,
            background: 'var(--accent)',
            color: '#0a0b0d',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          ↑
        </button>
      </div>

      <p style={{ ...microLabel, textAlign: 'center', padding: '6px 0 10px', margin: 0 }}>
        Educational insights — not financial advice.
      </p>
    </div>
  );
}
