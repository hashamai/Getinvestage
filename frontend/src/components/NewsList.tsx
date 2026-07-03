import { motion } from 'framer-motion';
import { api } from '../api';
import { usePolled } from '../hooks';

function timeAgo(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

interface Props {
  symbol: string;
}

export function NewsList({ symbol }: Props) {
  const { data, loading } = usePolled(() => api.news(symbol), 5 * 60_000, [symbol]);

  return (
    <section id="news" className="section" aria-label={`News for ${symbol}`}>
      <span className="eyebrow">News</span>
      <h2 className="section-title">Trending on {symbol}</h2>
      <p className="section-sub">The latest coverage moving the name you're watching.</p>

      {loading && (
        <div className="news-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 150 }} />
          ))}
        </div>
      )}
      {!loading && data?.length === 0 && <p className="wl-empty">No recent news for {symbol}.</p>}
      {!loading && Boolean(data?.length) && (
        <div className="news-grid">
          {data!.slice(0, 6).map((n, i) => (
            <motion.a
              key={n.id}
              className="glass news-card hover-lift"
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: (i % 3) * 0.07, ease: 'easeOut' }}
            >
              <span className="news-tag">{n.source || 'Market'}</span>
              <p className="news-headline">{n.headline}</p>
              {n.summary && <p className="news-summary">{n.summary}</p>}
              <span className="news-meta">{timeAgo(n.datetime)}</span>
            </motion.a>
          ))}
        </div>
      )}
    </section>
  );
}
