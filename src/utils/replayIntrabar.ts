import type { Kline } from '../types';

/**
 * Historical OHLC has no tick ordering. Reconstruct an inexpensive, explicit
 * VISUAL approximation: open → one extreme → the other extreme → close.
 * This is NOT recorded intra-candle price action. No random jitter, requests,
 * future candles, or synthetic price values outside the actual bar range.
 */
export const REPLAY_INTRABAR_PHASES = 8;
export const REPLAY_INTRABAR_TICK_MS = 40;

function normalized(progress: number): number {
  return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
}

function path(candle: Kline): readonly number[] {
  // Deterministic, but not a claim about actual order of High/Low.
  return candle.close >= candle.open
    ? [candle.open, candle.low, candle.high, candle.close]
    : [candle.open, candle.high, candle.low, candle.close];
}

const STOPS = [0, 1 / 3, 2 / 3, 1] as const;

export function replayIntrabarCandle(candle: Kline, fraction: number): Kline {
  const progress = normalized(fraction);
  if (progress >= 1) return candle;
  const nodes = path(candle);
  let segment = 0;
  while (segment < 2 && progress > STOPS[segment + 1]) segment++;
  const within = (progress - STOPS[segment]) / (STOPS[segment + 1] - STOPS[segment]);
  const close = nodes[segment] + (nodes[segment + 1] - nodes[segment]) * within;
  let high = Math.max(candle.open, close);
  let low = Math.min(candle.open, close);
  for (let i = 1; i <= segment; i++) {
    high = Math.max(high, nodes[i]);
    low = Math.min(low, nodes[i]);
  }
  return { ...candle, high, low, close,
    volume: Number.isFinite(candle.volume) ? Math.max(0, candle.volume * progress) : 0,
    // Never expose future volume or taker activity from a closed bar.
    ...(candle.quoteVolume !== undefined ? { quoteVolume: candle.quoteVolume * progress } : {}),
    ...(candle.buyVolume !== undefined ? { buyVolume: candle.buyVolume * progress } : {}),
    ...(candle.buyQuoteVolume !== undefined ? { buyQuoteVolume: candle.buyQuoteVolume * progress } : {}),
    ...(candle.tradeCount !== undefined ? { tradeCount: Math.floor(candle.tradeCount * progress) } : {}),
  };
}

/**
 * Orders created inside an animated bar may only see the synthetic path after
 * their creation. Old OHLC extremes must not retroactively fill a new order.
 * Closed-bar orders continue using the unmodified original historical candle.
 */
export function replayRemainingCandle(candle: Kline, fromProgress: number): Kline {
  const start = normalized(fromProgress);
  if (start <= 0) return candle;
  const nodes = path(candle);
  const first = replayIntrabarCandle(candle, start).close;
  let high = Math.max(first, candle.close);
  let low = Math.min(first, candle.close);
  for (let i = 1; i < STOPS.length; i++) {
    if (STOPS[i] > start) {
      high = Math.max(high, nodes[i]);
      low = Math.min(low, nodes[i]);
    }
  }
  return { ...candle, open: first, high, low,
    volume: Number.isFinite(candle.volume) ? Math.max(0, candle.volume * (1 - start)) : 0 };
}
