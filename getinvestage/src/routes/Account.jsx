import { Link } from 'react-router-dom';
import { Mark } from '../components/Mark';
import { useAuth } from '../auth';
import { useWatchlist } from '../useWatchlist';

/* /account — the proof that the persistence layer is real: sign out, come
 * back on another device, and these symbols are still here. */

const microLabel = {
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

export function Account() {
  const { user, logout } = useAuth();
  const { items, loading, error, remove } = useWatchlist();

  return (
    <div style={{ minHeight: '100vh', padding: '0 0 60px' }}>
      <header
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 18px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          <Mark size={19} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>getinvestage</span>
        </Link>
        <span style={{ flex: 1 }} />
        <Link to="/dashboard" style={{ ...microLabel, color: 'var(--text-2)' }}>
          Terminal →
        </Link>
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 24px' }}>Account</h1>

        <section style={{ marginBottom: 40 }}>
          <div style={{ ...microLabel, marginBottom: 10 }}>Signed in as</div>
          <div style={{ fontSize: 14 }}>{user?.display_name || user?.email}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{user?.email}</div>
        </section>

        <section style={{ marginBottom: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <span style={microLabel}>Saved watchlist</span>
            <span style={microLabel}>{items.length} symbols</span>
          </div>

          {error && (
            <p role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>
              {error}
            </p>
          )}

          {loading && items.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Loading…</p>
          )}

          {!loading && items.length === 0 && (
            // Empty state: tell them what to do, not just that it's empty.
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Nothing saved yet. Star a symbol in the{' '}
              <Link to="/dashboard" style={{ color: 'var(--text)' }}>
                terminal
              </Link>{' '}
              and it will show up here.
            </p>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px solid var(--hairline)',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>
                {item.symbol}
              </span>
              <button
                onClick={() => remove(item.symbol).catch(() => {})}
                aria-label={`Remove ${item.symbol} from watchlist`}
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  background: 'transparent',
                  border: '1px solid var(--hairline)',
                  padding: '4px 9px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--down)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
              >
                Remove
              </button>
            </div>
          ))}
        </section>

        <button
          onClick={logout}
          style={{
            padding: '9px 14px',
            fontSize: 11.5,
            fontFamily: 'inherit',
            color: 'var(--text-2)',
            background: 'transparent',
            border: '1px solid var(--hairline)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-2)')}
        >
          Sign out
        </button>
      </main>
    </div>
  );
}
