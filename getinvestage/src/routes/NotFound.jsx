import { Link } from 'react-router-dom';

/* Now that routes are real URLs, a typo'd path is reachable. Give it a real
 * page rather than a blank screen. */

export function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 10,
          }}
        >
          404
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>No such page</h1>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 20px' }}>
          That route doesn't exist.
        </p>
        <Link
          to="/"
          style={{
            display: 'inline-block',
            padding: '9px 14px',
            fontSize: 11.5,
            color: 'var(--text-2)',
            border: '1px solid var(--hairline)',
            textDecoration: 'none',
          }}
        >
          ← Back to site
        </Link>
      </div>
    </div>
  );
}
