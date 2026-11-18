import type { Kline } from '../types';

type PriceClose = Pick<Kline, 'time' | 'close'>;

export interface BtcCorrelation {
  value: number;
  pairs: number;
}

/** Pearson correlation of aligned, completely closed candle-to-candle log returns.
 * Both markets must use the same exchange, market and timeframe (enforced by
 * the caller). Missing/unfinished candles are not imputed or interpolated. */
export function calculateBtcCorrelation(
  altCandles: PriceClose[],
  btcCandles: PriceClose[],
  timeframeMs: number,
  nowMs: number = Date.now(),
  minReturns = 20,
): BtcCorrelation | null {
  if (!Number.isFinite(timeframeMs) || timeframeMs <= 0) return null;
  if (!Number.isFinite(nowMs)) return null;
  const valid = (c: PriceClose) =>
    Number.isSafeInteger(c.time) && c.time > 0 &&
    Number.isFinite(c.close) && c.close > 0 &&
    c.time * 1000 + timeframeMs <= nowMs;
  const prices = new Map<number, number>();
  for (const c of btcCandles) if (valid(c)) prices.set(c.time, c.close);
  const paired = new Map<number, { alt: number; btc: number }>();
  for (const c of altCandles) {
    const btc = prices.get(c.time);
    if (valid(c) && btc !== undefined) paired.set(c.time, { alt: c.close, btc });
  }
  const entries = [...paired].sort(([a], [b]) => a - b).slice(-121);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 1; i < entries.length; i++) {
    const [prevTime, prev] = entries[i - 1];
    const [time, current] = entries[i];
    if ((time - prevTime) * 1000 !== timeframeMs) continue;
    const rAlt = Math.log(current.alt / prev.alt);
    const rBtc = Math.log(current.btc / prev.btc);
    if (!Number.isFinite(rAlt) || !Number.isFinite(rBtc)) continue;
    x.push(rAlt);
    y.push(rBtc);
  }
  if (x.length < minReturns) return null;
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx < 1e-16 || vy < 1e-16) return null;
  const correlation = cov / Math.sqrt(vx * vy);
  if (!Number.isFinite(correlation)) return null;
  return { value: Math.max(-1, Math.min(1, correlation)), pairs: x.length };
}

/** Reuses the selected coin's quote currency instead of comparing unrelated pairs. */
export function btcBenchmarkSymbol(symbol: string): string | null {
  const normalized = symbol.toUpperCase().replace('/', '').trim();
  const quote = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD'].find(q => normalized.endsWith(q));
  if (!quote || normalized.length <= quote.length) return null;
  return 'BTC' + quote;
}
