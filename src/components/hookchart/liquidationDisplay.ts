/** The server ID includes packet identity and occurrence within that packet.
 * Preserve it: equal time, side, price and size do not identify one order. */
export function canonicalLiquidationId(id: string): string {
  return id;
}

/** Deduplicate the chart feed too: labels and cascade calculations must not
 * count a replayed exchange event more than once. Preserve the largest
 * cumulative fill if a Binance liquidation order is updated. */
export function deduplicateLiquidations<T extends { id: string; usd: number }>(rows: readonly T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const id = canonicalLiquidationId(row.id);
    const previous = unique.get(id);
    if (!previous || row.usd > previous.usd) unique.set(id, { ...row, id });
  }
  return [...unique.values()];
}

/** Liquidation mark visibility. Never modifies the received/source rows. */
export type LiquidationDisplayPreferences = {
  showLiquidationLong?: boolean;
  showLiquidationShort?: boolean;
  /** null/undefined = automatic adaptive cutoff; 0 = show all. */
  liquidationLongMinUsd?: number | null;
  liquidationShortMinUsd?: number | null;
};

export type VisibleLiquidation = { side: 'LONG' | 'SHORT'; usd: number };

export function filterVisibleLiquidations<T extends VisibleLiquidation>(
  rows: readonly T[],
  automaticCut: number,
  preferences: LiquidationDisplayPreferences,
  maxRows = 160,
): T[] {
  const filtered = rows.filter(row => {
    if (!Number.isFinite(row.usd) || row.usd <= 0) return false;
    const isLong = row.side === 'LONG';
    if (isLong ? preferences.showLiquidationLong === false : preferences.showLiquidationShort === false) return false;
    const manual = isLong ? preferences.liquidationLongMinUsd : preferences.liquidationShortMinUsd;
    if (manual == null) return automaticCut > 0 && row.usd >= automaticCut;
    return Number.isFinite(manual) && manual >= 0 && row.usd >= manual;
  });
  const limit = Number.isFinite(maxRows) ? Math.max(0, Math.floor(maxRows)) : 160;
  return limit === 0 ? [] : filtered.slice(-limit);
}


/**
 * Position observed Liq amounts relative to the candle's lower wick.
 * Preserve the original arrow-on placement, but when arrows are disabled
 * remove the empty arrow shaft gap. Keep the L/S detail below the total.
 * All coordinates are canvas CSS pixels; no extra chart data is needed.
 */
export function liquidationTextPosition(
  wickY: number,
  plotHeight: number,
  totalFontSize: number,
  detailFontSize: number,
  hasDetail: boolean,
  showArrow: boolean,
): { baseY: number; totalY: number } {
  const detailOffset = hasDetail ? detailFontSize + 1 : 0;
  const baseY = showArrow
    ? Math.max(totalFontSize + detailFontSize + 7,
      Math.min(plotHeight - 7, wickY + totalFontSize + detailFontSize + 25))
    : Math.max(totalFontSize + detailOffset + 5,
      Math.min(plotHeight - 7, wickY + totalFontSize + detailOffset + 4));
  return { baseY, totalY: baseY - detailOffset };
}
