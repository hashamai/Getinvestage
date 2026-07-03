import { useEffect, useRef, useState } from 'react';
import { List, MagnifyingGlass, Moon, Sun, X } from '@phosphor-icons/react';
import { api } from '../api';
import { useDebounced, type Theme } from '../hooks';
import type { SearchResult } from '../types';
import { Logo } from './Logo';

const LINKS = [
  { label: 'Dashboard', href: '#dashboard' },
  { label: 'Markets', href: '#markets' },
  { label: 'Portfolio', href: '#portfolio' },
  { label: 'News', href: '#news' },
  { label: 'Watchlist', href: '#watchlist' },
  { label: 'Pricing', href: '#pricing' },
];

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onSelectSymbol: (symbol: string) => void;
  demoMode: boolean;
}

export function NavBar({ theme, onToggleTheme, onSelectSymbol, demoMode }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const debounced = useDebounced(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    api
      .search(q)
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const select = (symbol: string) => {
    onSelectSymbol(symbol.toUpperCase());
    setQuery('');
    setResults(null);
    setOpen(false);
    inputRef.current?.blur();
    document.getElementById('markets')?.scrollIntoView({ behavior: 'smooth' });
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (!results?.length) {
      if (e.key === 'Enter' && query.trim()) select(query.trim());
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      select(results[active].symbol);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div className="nav-wrap">
      <nav className="nav" aria-label="Primary" style={{ position: 'relative' }}>
        <button
          className="icon-btn nav-menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={20} /> : <List size={20} />}
        </button>

        <a className="brand" href="#dashboard">
          <Logo />
          <span className="brand-name">
            Get<em>Investage</em>
          </span>
        </a>

        <div className="nav-links">
          {LINKS.map((l) => (
            <a key={l.href} className="nav-link" href={l.href}>
              {l.label}
            </a>
          ))}
        </div>

        <div className="nav-actions">
          {demoMode && (
            <span
              className="demo-badge"
              title="No Finnhub key configured — quotes and charts use Yahoo data; search, profile and news are simulated. Set FINNHUB_API_KEY on the backend."
            >
              No API key
            </span>
          )}

          <div className="search" ref={wrapRef}>
            <div className="search-input-wrap">
              <MagnifyingGlass size={17} aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                placeholder="Search…"
                aria-label="Search stock symbols"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setActive(0);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={onInputKey}
              />
              <span className="search-kbd" aria-hidden="true">
                Ctrl K
              </span>
            </div>

            {showDropdown && (
              <div className="search-results" role="listbox" aria-label="Search results">
                {searching && !results && <div className="search-empty">Searching…</div>}
                {results?.length === 0 && !searching && (
                  <div className="search-empty">No matches for “{query.trim()}”</div>
                )}
                {results?.map((r, i) => (
                  <button
                    key={r.symbol}
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    className="search-result"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => select(r.symbol)}
                  >
                    <span className="sym">{r.symbol}</span>
                    <span className="desc">{r.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>

        <div className="nav-mobile glass" data-open={menuOpen}>
          {LINKS.map((l) => (
            <a key={l.href} className="nav-link" href={l.href} onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
