import type { PatternBias, RoundNumberContext, RoundNumberDensity } from '../src/types';

export interface PriceLevelSnapshot {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}

const positive = (n: number) => Number.isFinite(n) && n > 0;
const pct = (a: number, b: number) => Math.abs(a - b) / Math.max(b, 1e-12) * 100;

/**
 * Standard-mode snapshot only: do not mistake an ASK sell wall for LONG
 * support or a BID buy wall for SHORT resistance. Compare liquidity against
 * other orders on the SAME side, not a possibly tiny opposite-side median.
 *
 * This snapshot is not evidence that the wall persists or that an order fills.
 */
export function inspectRegularRoundNumberDensity(
  orderbook: PriceLevelSnapshot, context: RoundNumberContext | undefined, marketPrice: number,
  bias: PatternBias,
): { checked: boolean; density?: RoundNumberDensity } {
  if (!context?.detected || !positive(context.level ?? 0) || !positive(marketPrice) || bias === 'neutral')
    return { checked: false };
  const level = context.level!;
  const tolerancePct = Math.min(.35, context.tolerancePct ?? .12);
  const bullish = bias === 'bullish';
  // BID support should be on/below current price; ASK resistance on/above.
  if (bullish ? level > marketPrice : level < marketPrice) return { checked: false };
  const side = bullish ? 'BID' as const : 'ASK' as const;
  const rows = bullish ? orderbook.bids : orderbook.asks;
  if (!Array.isArray(rows)) return { checked: false };
  const validRows = rows.map(([price, quantity]) => ({
    price, quantity, notional: price * quantity,
  })).filter(x => positive(x.price) && positive(x.quantity) && positive(x.notional)
  );
  if (validRows.length < 8 || !validRows.some(row => row.price >= level) || !validRows.some(row => row.price <= level))
    return { checked: false };
  const medianSorted = validRows.map(x => x.notional).sort((a,b) => a - b);
  const median = medianSorted[Math.floor(medianSorted.length / 2)];
  if (!positive(median)) return { checked: false };
  const near = validRows
    .filter(x => pct(x.price, level) <= tolerancePct)
    .sort((a,b) => b.notional - a.notional);
  const wall = near[0];
  if (!wall || wall.notional < 5000 || wall.notional / median < 6) return { checked: true };
  const multiple = wall.notional / median;
  const quality = Math.round(Math.max(0, Math.min(100, 35 + Math.log10(multiple) * 45)));
  if (quality < 70) return { checked: true };
  return { checked: true, density: {
    level: Number(level.toPrecision(12)), side,
    notionalUsd: Number(wall.notional.toFixed(2)),
    distancePct: Number(pct(wall.price, level).toFixed(3)), quality,
  } };
}
