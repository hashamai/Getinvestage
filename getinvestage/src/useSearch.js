import { useEffect, useState } from 'react';
import { api } from './api';

/* Debounced symbol search against /api/search.
 *
 * The debounce isn't cosmetic: Finnhub's free tier is 60 calls/min, and firing
 * a request per keystroke would burn that budget typing one ticker. 250ms is
 * below the threshold where a search box feels laggy and well above per-key.
 */

const DEBOUNCE_MS = 250;

export function useSearch(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    let alive = true;

    const timer = setTimeout(() => {
      api
        .get(`/api/search?q=${encodeURIComponent(q)}`)
        .then((data) => {
          // `alive` guards the out-of-order response: type "AA" then "AAPL"
          // and the slower "AA" request can land last, overwriting the results
          // the user is actually looking at.
          if (!alive) return;
          setResults(data);
          setError(null);
        })
        .catch((err) => {
          if (!alive) return;
          setResults([]);
          setError(err.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  return { results, loading, error };
}
