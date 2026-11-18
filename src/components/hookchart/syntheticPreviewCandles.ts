import type { Candle } from './engine';

/**
 * Completely offline, deterministic candles solely for the chart-settings editor.
 * These numbers are illustrative: they are NEVER used by the screener, trading
 * signals, live charts, WebSockets, local storage, or exchange requests.
 */
export function createSyntheticPreviewCandles(count = 900): Candle[] {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.min(1000, Math.floor(count))) : 900;
  const result: Candle[] = [];
  const start = Date.UTC(2026, 0, 1);
  const interval = 15 * 60 * 1000;
  let close = 72_000;
  for (let i = 0; i < safeCount; i++) {
    const open = close;
    // Small-scale noise, a broad market wave and a visible selloff/rebound.
    // Fixed mathematics means the candles never jump on re-render/reopen.
    const wave = Math.sin(i * 0.13) * 58 + Math.sin(i * 0.037) * 113;
    const trend = i > safeCount * .58 && i < safeCount * .77 ? -72
      : i >= safeCount * .77 && i < safeCount * .9 ? 43 : 7;
    const change = wave * .48 + trend;
    close = Math.max(1000, open + change);
    const wick = 21 + Math.abs(Math.sin(i * .43)) * 90;
    const high = Math.max(open, close) + wick;
    const low = Math.max(1, Math.min(open, close) - wick * (.6 + Math.abs(Math.cos(i * .29)) * .4));
    const volume = 20 + Math.abs(change) * .24 + (i % 53 === 0 ? 190 : 0);
    result.push({ t: start + i * interval, o: open, h: high, l: low, c: close, v: volume, n: 0 });
  }
  return result;
}
