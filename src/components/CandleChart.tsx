/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';

interface CandleChartProps {
  /** Live price the candles track (the last bar follows this). */
  price: number;
  /** Market symbol — changing it reseeds the whole series. */
  symbol: string;
  /** Extra class for the wrapper. */
  className?: string;
}

interface Bar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BAR_SECONDS = 60; // 1-minute candles
const HISTORY_BARS = 90;

/** Read the app's CSS theme variables so the chart always matches the active skin. */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    accent: v('--theme-kaspa', '#14b8a6'),
    up: v('--theme-kaspa', '#14b8a6'),
    down: '#f43f5e',
    text: '#8b98b8',
    grid: 'rgba(100, 116, 139, 0.10)',
    border: 'rgba(100, 116, 139, 0.25)',
  };
}

/** Deterministic-ish random walk history so the chart opens looking lived-in. */
function seedHistory(basePrice: number, now: number): Bar[] {
  const bars: Bar[] = [];
  const lastBucket = Math.floor(now / BAR_SECONDS) * BAR_SECONDS;
  let open = basePrice * (1 + (Math.random() - 0.5) * 0.015);
  for (let i = HISTORY_BARS - 1; i >= 0; i--) {
    const time = (lastBucket - i * BAR_SECONDS) as UTCTimestamp;
    // Gentle drift pulled back toward the live price so the seed ends where reality is.
    const pull = (basePrice - open) * 0.06;
    const change = pull + (Math.random() - 0.5) * 0.006 * open;
    const close = i === 0 ? basePrice : open + change;
    const wickUp = Math.random() * 0.0025 * open;
    const wickDown = Math.random() * 0.0025 * open;
    bars.push({
      time,
      open,
      close,
      high: Math.max(open, close) + wickUp,
      low: Math.min(open, close) - wickDown,
      volume: Math.round((Math.random() * 420000 + 90000) * (1 + Math.abs(change) / (0.004 * open))),
    });
    open = close;
  }
  return bars;
}

function fmtPrice(p: number): string {
  return p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6);
}

/**
 * Professional candlestick chart built on TradingView's lightweight-charts.
 * Simulated 1m candles whose last bar tracks the real live price.
 */
export default function CandleChart({ price, symbol, className }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef(price);
  priceRef.current = price;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const colors = themeColors();
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.text,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.border, labelBackgroundColor: '#172237' },
        horzLine: { color: colors.border, labelBackgroundColor: '#172237' },
      },
      rightPriceScale: {
        borderColor: 'transparent',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: 'transparent',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        barSpacing: 7,
      },
    });
    chartRef.current = chart;

    const candles: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      priceLineColor: colors.accent,
      priceLineStyle: 2,
      priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
    });

    const volume: ISeriesApi<'Histogram'> = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay scale pinned to the bottom
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const volColor = (b: Bar) =>
      b.close >= b.open ? 'rgba(20, 184, 166, 0.30)' : 'rgba(244, 63, 94, 0.30)';

    let bars = seedHistory(priceRef.current, Date.now() / 1000);
    candles.setData(bars);
    volume.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: volColor(b) })));
    chart.timeScale().fitContent();

    // --- OHLC legend (TradingView-style readout, hovered bar or the live bar) ---
    const renderLegend = (b: Bar) => {
      if (!legendRef.current) return;
      const up = b.close >= b.open;
      const chg = b.open > 0 ? ((b.close - b.open) / b.open) * 100 : 0;
      const c = up ? colors.up : colors.down;
      legendRef.current.innerHTML =
        `<span style="color:#e2e8f0;font-weight:700">${symbol}/USDT</span>` +
        `<span style="color:#64748b"> · 1m</span>` +
        `<span style="color:#64748b">  O </span><span style="color:${c}">${fmtPrice(b.open)}</span>` +
        `<span style="color:#64748b"> H </span><span style="color:${c}">${fmtPrice(b.high)}</span>` +
        `<span style="color:#64748b"> L </span><span style="color:${c}">${fmtPrice(b.low)}</span>` +
        `<span style="color:#64748b"> C </span><span style="color:${c}">${fmtPrice(b.close)}</span>` +
        `<span style="color:${c}"> ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>`;
    };
    renderLegend(bars[bars.length - 1]);

    chart.subscribeCrosshairMove((param) => {
      const hovered = param.time != null && candles.data
        ? (bars.find((b) => b.time === param.time) ?? bars[bars.length - 1])
        : bars[bars.length - 1];
      renderLegend(hovered);
    });

    // --- Live ticks: last bar follows the real price; a new bar opens each minute ---
    const tick = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const bucket = (Math.floor(now / BAR_SECONDS) * BAR_SECONDS) as UTCTimestamp;
      const jitter = (Math.random() - 0.5) * 0.0006 * priceRef.current;
      const live = priceRef.current + jitter;
      const last = bars[bars.length - 1];

      // The seed can be anchored to a stale cached price until the first live fetch
      // lands. A >15% snap is a re-anchor, not a candle — rebuild the series around
      // the real price instead of drawing a chart-breaking mega-wick.
      if (last.close > 0 && Math.abs(live - last.close) / last.close > 0.15) {
        bars = seedHistory(live, Date.now() / 1000);
        candles.setData(bars);
        volume.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: volColor(b) })));
        chart.timeScale().fitContent();
        renderLegend(bars[bars.length - 1]);
        return;
      }

      if (bucket > last.time) {
        const fresh: Bar = {
          time: bucket,
          open: last.close,
          close: live,
          high: Math.max(last.close, live),
          low: Math.min(last.close, live),
          volume: Math.round(Math.random() * 60000 + 15000),
        };
        bars.push(fresh);
        if (bars.length > HISTORY_BARS + 60) bars = bars.slice(-HISTORY_BARS);
        candles.update(fresh);
        volume.update({ time: fresh.time, value: fresh.volume, color: volColor(fresh) });
        renderLegend(fresh);
      } else {
        const updated: Bar = {
          ...last,
          close: live,
          high: Math.max(last.high, live),
          low: Math.min(last.low, live),
          volume: last.volume + Math.round(Math.random() * 9000),
        };
        bars[bars.length - 1] = updated;
        candles.update(updated);
        volume.update({ time: updated.time, value: updated.volume, color: volColor(updated) });
        renderLegend(updated);
      }
    }, 1500);

    return () => {
      clearInterval(tick);
      chart.remove();
      chartRef.current = null;
    };
    // Recreate the whole chart when the market changes.
  }, [symbol]);

  return (
    <div className={`relative w-full h-full ${className ?? ''}`}>
      <div ref={containerRef} className="absolute inset-0" />
      <div
        ref={legendRef}
        className="absolute top-1.5 left-2 z-10 pointer-events-none font-mono text-[10px] leading-tight whitespace-pre"
      />
    </div>
  );
}
