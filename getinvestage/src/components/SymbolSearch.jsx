import { useEffect, useRef, useState } from 'react';
import { useSearch } from '../useSearch';
import { microLabel } from '../styles';

/* Reusable ticker search. Used in the dashboard watchlist panel and on the
 * Market Analysis page.
 *
 * Keyboard-first on purpose — this is a terminal. Arrow keys move, Enter
 * selects, Escape closes. A search box you can only drive with a mouse is a
 * search box a trader won't use.
 */

export function SymbolSearch({
  onSelect,
  placeholder = 'Search symbol…',
  autoFocus = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const { results, loading, error } = useSearch(query);
  const boxRef = useRef(null);

  // Reset the highlight whenever the result set changes, or the cursor can
  // point past the end of a shorter list and Enter selects nothing.
  useEffect(() => setCursor(0), [results]);

  // Click-away closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const choose = (item) => {
    onSelect(item.symbol);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[cursor]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="symbol-search-results"
        aria-label="Search stock symbol"
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hairline)')}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 12.5,
          fontFamily: 'inherit',
          color: 'var(--text)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--hairline)',
          outline: 'none',
        }}
      />

      {showPanel && (
        <div
          id="symbol-search-results"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 260,
            overflowY: 'auto',
            background: '#0d0e11',
            border: '1px solid var(--hairline)',
          }}
        >
          {loading && <div style={{ ...microLabel, padding: '10px 12px' }}>Searching…</div>}

          {!loading && error && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--down)' }}>
              {error}
            </div>
          )}

          {/* Empty state says what to do, not just that nothing matched. */}
          {!loading && !error && results.length === 0 && (
            <div style={{ ...microLabel, padding: '10px 12px' }}>
              No match for "{query.trim()}"
            </div>
          )}

          {!loading &&
            results.map((item, i) => (
              <div
                key={item.symbol}
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: i === cursor ? 'rgba(255,255,255,0.05)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    minWidth: 52,
                  }}
                >
                  {item.symbol}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11,
                    color: 'var(--muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.description}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
