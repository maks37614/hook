import type { Kline, Timeframe } from '../types';

const SECONDS_PER_CANDLE: Record<Timeframe, number> = { '5s': 5, '30s': 30,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export interface BtcCorrelationResult {
  value: number;
  samples: number;
}

/** Pearson correlation of aligned, completed candle-to-candle log returns. */
export function calculateBtcCorrelation(
  asset: Kline[],
  btc: Kline[],
  timeframe: Timeframe,
  nowSeconds = Date.now() / 1000,
): BtcCorrelationResult | null {
  const interval = SECONDS_PER_CANDLE[timeframe];
  const lastClosedStart = Math.floor(nowSeconds / interval) * interval - interval;
  const validCloses = (candles: Kline[]) => new Map(
    candles
      .filter(({ time, close }) => Number.isInteger(time) && time <= lastClosedStart &&
        time % interval === 0 && Number.isFinite(close) && close > 0)
      .map(({ time, close }) => [time, close] as const),
  );

  const assetCloses = validCloses(asset);
  const btcCloses = validCloses(btc);
  const times = [...assetCloses.keys()]
    .filter((time) => assetCloses.has(time - interval) &&
      btcCloses.has(time) && btcCloses.has(time - interval))
    .sort((a, b) => a - b);

  // A stale quote should never be presented as a current correlation.
  if (!times.length || times.at(-1)! < lastClosedStart - interval) return null;
  const recent = times.slice(-80);
  if (recent.length < 30) return null;

  const returns = recent.map((time) => [
    Math.log(assetCloses.get(time)! / assetCloses.get(time - interval)!),
    Math.log(btcCloses.get(time)! / btcCloses.get(time - interval)!),
  ]);
  if (returns.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b))) return null;

  const meanAsset = returns.reduce((sum, row) => sum + row[0], 0) / returns.length;
  const meanBtc = returns.reduce((sum, row) => sum + row[1], 0) / returns.length;
  let covariance = 0;
  let assetVariance = 0;
  let btcVariance = 0;
  for (const [assetReturn, btcReturn] of returns) {
    const a = assetReturn - meanAsset;
    const b = btcReturn - meanBtc;
    covariance += a * b;
    assetVariance += a * a;
    btcVariance += b * b;
  }
  if (assetVariance < 1e-18 || btcVariance < 1e-18) return null;
  const value = covariance / Math.sqrt(assetVariance * btcVariance);
  return { value: Math.max(-1, Math.min(1, value)), samples: recent.length };
}
