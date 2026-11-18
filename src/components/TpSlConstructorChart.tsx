import React, { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries, ColorType, createChart, LineStyle,
  type IChartApi, type IPriceLine, type ISeriesApi, type Time,
} from 'lightweight-charts';
import type { Kline } from '../types';

export interface BuilderLevels { entry: number; stop: number; target: number }
interface Props {
  candles: Kline[];
  levels: BuilderLevels | null;
  onDrag: (level: keyof BuilderLevels, price: number) => void;
}
const spec = {
  entry: { color: '#3b82f6', label: 'Entry' },
  stop: { color: '#ef4444', label: 'SL' },
  target: { color: '#16a34a', label: 'TP' },
} as const;
const keys = ['entry', 'stop', 'target'] as const;

/** One chart ONLY while the modal is open. No polling, websocket or timers. */
export function TpSlConstructorChart({ candles, levels, onDrag }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLines = useRef<Partial<Record<keyof BuilderLevels, IPriceLine>>>({});
  const drag = useRef<keyof BuilderLevels | null>(null);
  const callback = useRef(onDrag);
  callback.current = onDrag;
  const [positions, setPositions] = useState<Partial<Record<keyof BuilderLevels, number>>>({});

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const instance = createChart(container, {
      width: Math.max(200, container.clientWidth),
      height: Math.max(300, container.clientHeight),
      layout: { background: { type: ColorType.Solid, color: '#080f1e' }, textColor: '#94a3b8',
        fontSize: 12 },
      grid: { vertLines: { color: '#172034' }, horzLines: { color: '#172034' } },
      timeScale: { borderColor: '#26354e', timeVisible: true, rightOffset: 8 },
      rightPriceScale: { borderColor: '#26354e', minimumWidth: 76 },
      crosshair: { vertLine: { color: '#64748b' }, horzLine: { color: '#64748b' } },
    });
    chart.current = instance;
    series.current = instance.addSeries(CandlestickSeries, {
      upColor: '#16b8a4', downColor: '#ef5361', borderVisible: false,
      wickUpColor: '#16b8a4', wickDownColor: '#ef5361',
    });
    const sync = () => {
      if (!series.current) return;
      const next: Partial<Record<keyof BuilderLevels, number>> = {};
      for (const level of keys) {
        const current = priceLines.current[level];
        if (current) {
          const p = series.current.priceToCoordinate((current as unknown as { options(): {price:number} }).options().price);
          if (p !== null) next[level] = p;
        }
      }
      setPositions(previous => {
        const unchanged = keys.every(key => {
          const a = previous[key], b = next[key];
          return a === b || (a !== undefined && b !== undefined && Math.abs(a - b) < .5);
        });
        return unchanged ? previous : next;
      });
    };
    const observer = new ResizeObserver(() => {
      instance.resize(Math.max(200, container.clientWidth), Math.max(300, container.clientHeight));
      sync();
    });
    observer.observe(container);
    instance.timeScale().subscribeVisibleLogicalRangeChange(sync);
    // Vertical price scale changes do not emit time-range events. Crosshair updates
    // keep draggable Entry/TP/SL handles attached to real chart price lines.
    instance.subscribeCrosshairMove(sync);
    return () => {
      observer.disconnect();
      instance.timeScale().unsubscribeVisibleLogicalRangeChange(sync);
      instance.unsubscribeCrosshairMove(sync);
      instance.remove();
      chart.current = null;
      series.current = null;
      priceLines.current = {};
    };
  }, []);

  useEffect(() => {
    if (!series.current) return;
    // Never display stale BTC candles when the user changes the symbol/timeframe
    // or when the newly requested market feed is unavailable.
    if (!candles.length) {
      series.current.setData([]);
      setPositions({});
      return;
    }
    const sorted = [...candles].sort((a, b) => a.time - b.time)
      .filter((c, i, all) => Number.isFinite(c.time) && c.high >= c.low && c.low > 0 &&
        (i === 0 || c.time !== all[i - 1].time));
    if (!sorted.length) return;
    series.current.setData(sorted.map(c => ({
      time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    })));
    chart.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const candleSeries = series.current;
    if (!candleSeries) return;
    if (!levels) {
      for (const key of keys) {
        if (priceLines.current[key]) candleSeries.removePriceLine(priceLines.current[key]!);
        delete priceLines.current[key];
      }
      setPositions(previous => Object.keys(previous).length ? {} : previous);
      return;
    }
    const pos: Partial<Record<keyof BuilderLevels, number>> = {};
    for (const key of keys) {
      const value = levels[key];
      if (!(value > 0)) continue;
      if (!priceLines.current[key]) {
        priceLines.current[key] = candleSeries.createPriceLine({
          price: value, color: spec[key].color, lineWidth: 2, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: spec[key].label,
        });
      } else priceLines.current[key]?.applyOptions({ price: value });
      const y = candleSeries.priceToCoordinate(value);
      if (y !== null) pos[key] = y;
    }
    setPositions(pos);
  }, [levels, candles]);

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const key = drag.current;
    if (!key || !host.current || !series.current) return;
    const rect = host.current.getBoundingClientRect();
    const price = series.current.coordinateToPrice(event.clientY - rect.top);
    if (price !== null && price > 0 && Number.isFinite(price)) callback.current(key, price);
  };
  return (
    <div className="relative h-[400px] sm:h-[530px] w-full overflow-hidden rounded-xl border border-slate-800 bg-[#080f1e]">
      <div ref={host} className="absolute inset-0" />
      {levels && keys.map(key => {
        const top = positions[key];
        if (top === undefined) return null;
        return (
          <button key={key} type="button" aria-label={`Перетягнути ${spec[key].label}`}
            title={`${spec[key].label}: ${levels[key].toPrecision(8)} — перетягніть лінію будь-де`}
            className="absolute inset-x-0 z-20 h-6 cursor-ns-resize touch-none select-none text-right pr-[76px] text-[10px] font-bold"
            style={{ top: Math.max(0, Math.min((host.current?.clientHeight || 530) - 24, top - 12)) }}
            onPointerDown={event => { event.preventDefault(); drag.current = key; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={handlePointerMove}
            onPointerUp={event => { handlePointerMove(event); drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => { drag.current = null; }}>
            <span className="inline-block rounded border px-2 py-1 shadow-md pointer-events-none"
              style={{ background: '#101c30', borderColor: spec[key].color, color: spec[key].color }}>
              {spec[key].label} ⠿
            </span>
          </button>
        );
      })}
    </div>
  );
}
