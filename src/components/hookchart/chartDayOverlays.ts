import type { Candle } from './engine';
import { haveSameCandlePrefix } from './aggregationCache';

interface DayOverlays {
  prev: { h: number; l: number; t: number } | null;
  dayOpen: { p: number; t: number } | null;
  vwap: { t: number; p: number }[];
}

/** Reuse immutable daily data during forming-candle updates and same-day rollovers. */
export function createChartDayOverlayCalculator(
  dayKey: (timestamp: number) => string,
  options: { previousDay: boolean; dayOpen: boolean; vwap: boolean },
) {
  let previous: {
    candles: Candle[];
    key: string;
    dayStart: number;
    volumeBeforeLast: number;
    valueBeforeLast: number;
    overlays: DayOverlays;
  } | undefined;

  return (candles: Candle[]): DayOverlays => {
    if (candles === previous?.candles) return previous.overlays;
    const last = candles.at(-1);
    if (!last) {
      previous = undefined;
      return { prev: null, dayOpen: null, vwap: [] };
    }
    const key = dayKey(last.t);
    const previousLast = (previous?.candles.length ?? 0) - 1;
    const reusable = previous && key === previous.key &&
      candles.length <= previous.candles.length + 1 &&
      candles[previousLast]?.t === previous.candles[previousLast].t &&
      haveSameCandlePrefix(previous.candles, candles, previousLast) ? previous : undefined;

    let dayStart = reusable?.dayStart ?? candles.length - 1;
    let prev = reusable?.overlays.prev ?? null;
    if (!reusable) {
      while (dayStart > 0 && dayKey(candles[dayStart - 1].t) === key) dayStart--;
      if (options.previousDay && dayStart > 0) {
        const previousDayKey = dayKey(candles[dayStart - 1].t);
        let start = dayStart - 1;
        let { h, l } = candles[start];
        while (start > 0 && dayKey(candles[start - 1].t) === previousDayKey) {
          const candle = candles[--start];
          h = Math.max(h, candle.h);
          l = Math.min(l, candle.l);
        }
        prev = { h, l, t: candles[start].t };
      }
    }

    const openingCandle = candles[dayStart];
    const dayOpen = options.dayOpen ? { p: openingCandle.o, t: openingCandle.t } : null;
    const vwap = reusable?.overlays.vwap.slice(0, -1) ?? [];
    let volume = reusable?.volumeBeforeLast ?? 0;
    let value = reusable?.valueBeforeLast ?? 0;
    let volumeBeforeLast = 0;
    let valueBeforeLast = 0;
    if (options.vwap) {
      for (let index = dayStart + vwap.length; index < candles.length; index++) {
        const { t, h, l, c, v } = candles[index];
        volumeBeforeLast = volume;
        valueBeforeLast = value;
        value += ((h + l + c) / 3) * v;
        volume += v;
        vwap.push({ t, p: volume ? value / volume : c });
      }
    }
    const overlays = { prev, dayOpen, vwap };
    previous = { candles, key, dayStart, volumeBeforeLast, valueBeforeLast, overlays };
    return overlays;
  };
}
