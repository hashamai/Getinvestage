import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { ChartBar, ChartLine, WarningCircle } from '@phosphor-icons/react';
import { api, fmtChange, fmtPct, fmtPrice } from '../api';
import { usePolled, type Theme } from '../hooks';
import type { CandleResponse, ChartType, Profile, Quote, RangeKey } from '../types';

const RANGES: RangeKey[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

/** Read theme token values from CSS so the chart always matches the app theme. */
function chartColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    text: v('--text-3'),
    border: v('--border'),
    up: v('--up'),
    down: v('--down'),
    accent: v('--brand'),
  };
}

function applyData(
  series: ISeriesApi<'Candlestick'> | ISeriesApi<'Area'>,
  chartType: ChartType,
  data: CandleResponse,
  colors: ReturnType<typeof chartColors>,
) {
  if (chartType === 'candles') {
    (series as ISeriesApi<'Candlestick'>).setData(
      data.candles.map((c) => ({
        time: c.t as UTCTimestamp,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      })),
    );
  } else {
    const first = data.candles[0]?.c ?? 0;
    const last = data.candles[data.candles.length - 1]?.c ?? 0;
    const color = last >= first ? colors.up : colors.down;
    (series as ISeriesApi<'Area'>).applyOptions({
      lineColor: color,
      topColor: `${color}44`,
      bottomColor: `${color}05`,
    });
    (series as ISeriesApi<'Area'>).setData(
      data.candles.map((c) => ({ time: c.t as UTCTimestamp, value: c.c })),
    );
  }
}

interface Props {
  symbol: string;
  quote: Quote | null;
  profile: Profile | null;
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  chartType: ChartType;
  onChartTypeChange: (t: ChartType) => void;
  theme: Theme;
}

export function ChartPanel({
  symbol,
  quote,
  profile,
  range,
  onRangeChange,
  chartType,
  onChartTypeChange,
  theme,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null);
  const lastDataRef = useRef<CandleResponse | null>(null);
  const fitKeyRef = useRef('');

  const { data, loading, error, refetch } = usePolled(
    () => api.candles(symbol, range),
    60_000,
    [symbol, range],
  );

  // Create the chart once per chartType/theme; polls only call setData below,
  // so user zoom/pan survives background refreshes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const colors = chartColors();
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.text,
        fontFamily: 'Inter, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.border },
        horzLines: { color: colors.border },
      },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border, secondsVisible: false },
      crosshair: {
        horzLine: { labelBackgroundColor: colors.accent },
        vertLine: { labelBackgroundColor: colors.accent },
      },
    });

    const series =
      chartType === 'candles'
        ? chart.addSeries(CandlestickSeries, {
            upColor: colors.up,
            downColor: colors.down,
            borderUpColor: colors.up,
            borderDownColor: colors.down,
            wickUpColor: colors.up,
            wickDownColor: colors.down,
          })
        : chart.addSeries(AreaSeries, { lineWidth: 2 });

    chartRef.current = chart;
    seriesRef.current = series;

    // Re-apply the current data after a rebuild (theme/chart-type switch).
    if (lastDataRef.current) {
      applyData(series, chartType, lastDataRef.current, colors);
      chart.timeScale().fitContent();
    }

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartType, theme]);

  // Data updates: setData on the existing series; fit only when symbol/range change.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !data?.candles.length) return;

    lastDataRef.current = data;
    applyData(series, chartType, data, chartColors());
    chart.timeScale().applyOptions({ timeVisible: data.range === '1D' || data.range === '1W' });

    const fitKey = `${symbol}:${data.range}:${chartType}`;
    if (fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      chart.timeScale().fitContent();
    }
  }, [data, chartType, symbol]);

  const dirClass = quote && quote.change < 0 ? 'down' : 'up';

  return (
    <section className="glass chart-panel" aria-label={`Price chart for ${symbol}`}>
      <div className="chart-head">
        <span className="chart-symbol">{symbol}</span>
        {profile && <span className="chart-name">{profile.name}</span>}
        {quote && (
          <span className="num" style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <span className="chart-price">{fmtPrice(quote.current)}</span>{' '}
            <span className={`chart-change ${dirClass}`}>
              {fmtChange(quote.change)} ({fmtPct(quote.percentChange)})
            </span>
          </span>
        )}
      </div>

      <div className="chart-toolbar">
        <div className="seg-group" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r}
              className="seg-btn"
              aria-pressed={r === range}
              onClick={() => onRangeChange(r)}
            >
              {r === 'ALL' ? 'All' : r}
            </button>
          ))}
        </div>
        <div className="seg-group" role="group" aria-label="Chart type">
          <button
            className="seg-btn"
            aria-pressed={chartType === 'candles'}
            aria-label="Candlestick chart"
            onClick={() => onChartTypeChange('candles')}
          >
            <ChartBar size={16} style={{ verticalAlign: '-3px' }} /> Candles
          </button>
          <button
            className="seg-btn"
            aria-pressed={chartType === 'area'}
            aria-label="Area chart"
            onClick={() => onChartTypeChange('area')}
          >
            <ChartLine size={16} style={{ verticalAlign: '-3px' }} /> Area
          </button>
        </div>
      </div>

      <div className="chart-container">
        <div ref={containerRef} className="chart-canvas" data-ready={Boolean(data)} />
        {loading && (
          <div className="chart-overlay">
            <div className="skeleton" style={{ position: 'absolute', inset: 0 }} />
            <div className="spinner" role="status" aria-label="Loading chart" style={{ zIndex: 1 }} />
          </div>
        )}
        {error && !loading && (
          <div className="chart-overlay">
            <div className="error-box">
              <WarningCircle size={28} aria-hidden="true" />
              <span>Couldn’t load chart data. {error.message}</span>
              <button className="retry-btn" onClick={refetch}>
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      {data && data.source.startsWith('synthetic') && (
        <p className="chart-note">
          Market data provider unreachable — showing simulated history
          {data.source === 'synthetic-anchored' ? ' anchored to the live quote' : ''}.
        </p>
      )}
    </section>
  );
}
