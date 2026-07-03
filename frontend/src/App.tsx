import { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from './api';
import { useLocalStorage, usePolled, useQuoteMap, useTheme } from './hooks';
import type { ChartType, RangeKey } from './types';
import { NavBar } from './components/NavBar';
import { TickerTape } from './components/TickerTape';
import { Hero } from './components/Hero';
import { ChartPanel } from './components/ChartPanel';
import { Heatmap } from './components/Heatmap';
import { Watchlist } from './components/Watchlist';
import { SymbolCard } from './components/SymbolCard';
import { TrendsGrid } from './components/TrendsGrid';
import { NewsList } from './components/NewsList';
import { PortfolioSection, PORTFOLIO_SYMBOLS } from './components/PortfolioSection';
import { Screener } from './components/Screener';
import { PricingSection } from './components/PricingSection';
import { Footer } from './components/Footer';
import { Notifications } from './components/Notifications';

const DEFAULT_WATCHLIST = ['APP', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META'];

/** Universe behind the ticker tape, heatmap, screener and alerts. */
const MARKET_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX',
  'AMD', 'MU', 'JPM', 'V', 'XOM', 'WMT', 'DIS', 'KO',
];

function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [symbol, setSymbol] = useState('AAPL');
  const [range, setRange] = useState<RangeKey>('1M');
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [watchlist, setWatchlist] = useLocalStorage<string[]>('watchlist', DEFAULT_WATCHLIST);

  const selectSymbol = (s: string) => setSymbol(s.toUpperCase());

  const { data: health } = usePolled(() => api.health(), 0, []);
  const { data: quote, loading: quoteLoading } = usePolled(
    () => api.quote(symbol),
    30_000,
    [symbol],
  );
  const { data: profile } = usePolled(() => api.profile(symbol), 0, [symbol]);

  // One batched request feeds ticker tape, heatmap, screener and alerts.
  const universe = useQuoteMap(MARKET_UNIVERSE, 45_000);
  const portfolioQuotes = useQuoteMap(PORTFOLIO_SYMBOLS, 60_000);

  const inWatchlist = watchlist.includes(symbol);
  const toggleWatchlist = () =>
    setWatchlist(
      inWatchlist ? watchlist.filter((s) => s !== symbol) : [...watchlist, symbol],
    );

  return (
    <div className="app">
      <NavBar
        theme={theme}
        onToggleTheme={toggle}
        onSelectSymbol={selectSymbol}
        demoMode={health?.demoMode ?? false}
      />

      <TickerTape quotes={universe.data} onSelectSymbol={selectSymbol} />

      <Hero onSelectSymbol={selectSymbol} />

      <Section>
        <section id="markets" className="section">
          <span className="eyebrow">Markets</span>
          <h2 className="section-title">Charts & market map</h2>
          <p className="section-sub">
            Candlestick and area charts with smooth zoom and pan, next to a live heat view of the
            broader market.
          </p>

          <div className="markets-layout">
            <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
              <ChartPanel
                symbol={symbol}
                quote={quote}
                profile={profile}
                range={range}
                onRangeChange={setRange}
                chartType={chartType}
                onChartTypeChange={setChartType}
                theme={theme}
              />
              <div className="glass" style={{ padding: 18 }}>
                <h3 className="panel-title" style={{ margin: '0 0 14px' }}>
                  Market heatmap
                </h3>
                <Heatmap
                  quotes={universe.data}
                  loading={universe.loading}
                  onSelectSymbol={selectSymbol}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <SymbolCard
                symbol={symbol}
                quote={quote}
                profile={profile}
                loading={quoteLoading}
                inWatchlist={inWatchlist}
                onToggleWatchlist={toggleWatchlist}
              />
              <TrendsGrid onSelectSymbol={selectSymbol} />
            </div>
          </div>
        </section>
      </Section>

      <Section>
        <PortfolioSection
          quotes={portfolioQuotes.data}
          loading={portfolioQuotes.loading}
          onSelectSymbol={selectSymbol}
        />
      </Section>

      <Section>
        <NewsList symbol={symbol} />
      </Section>

      <Section>
        <section id="watchlist" className="section">
          <span className="eyebrow">Watchlist</span>
          <h2 className="section-title">Your list, plus a screener</h2>
          <p className="section-sub">
            Track the names you care about and screen the market by move, price and symbol.
          </p>
          <div className="split-2">
            <Watchlist
              symbols={watchlist}
              selected={symbol}
              onSelect={selectSymbol}
              onRemove={(s) => setWatchlist(watchlist.filter((x) => x !== s))}
            />
            <Screener
              quotes={universe.data}
              loading={universe.loading}
              selected={symbol}
              onSelectSymbol={selectSymbol}
            />
          </div>
        </section>
      </Section>

      <Section>
        <PricingSection />
      </Section>

      <Footer />

      <Notifications quotes={universe.data} />
    </div>
  );
}
