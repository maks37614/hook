/**
 * Validate Binance aggregate-trade ID continuity before replaying missing
 * public trades. No caller may count these rows until the page is COMPLETE.
 * The Binance futures endpoint has substantial IP-based request weight:
 * reject unbounded gaps rather than inventing a zero delta.
 */
export type BinanceRecoveryTrade = {
  id: string;
  t: number;
  p: number;
  q: number;
  side: 'BUY' | 'SELL';
};

export type BinanceGapRecoveryResult =
  | { status: 'complete'; rows: BinanceRecoveryTrade[] }
  | { status: 'incomplete'; reason: 'invalid-range' | 'too-many' | 'missing-id' | 'invalid-row' | 'aborted' | 'request-failed' };

export type BinanceRawTrade = { a?: unknown; T?: unknown; p?: unknown; q?: unknown; m?: unknown };

/** Strictly finite, positive public aggregate-trade values. */
export function parseBinanceAggregateTrade(raw: BinanceRawTrade): BinanceRecoveryTrade | null {
  const id = Number(raw?.a);
  const t = Number(raw?.T);
  const p = Number(raw?.p);
  const q = Number(raw?.q);
  if (!Number.isSafeInteger(id) || id < 0 || !Number.isSafeInteger(t) || t <= 0 ||
      !Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0 ||
      typeof raw?.m !== 'boolean') return null;
  return { id: String(id), t, p, q, side: raw.m ? 'SELL' : 'BUY' };
}

/**
 * Read [previousId+1, currentId-1] via inclusive Binance fromId pages.
 * Reject missing/out-of-order IDs and any response larger than the budget.
 * Successful result is ordered and complete, ready to merge with buffered
 * live events using the tracker's existing trade-ID deduplication.
 */
export async function recoverBinanceTradeGap(options: {
  previousId: number;
  currentId: number;
  load: (fromId: number, limit: number, signal?: AbortSignal) => Promise<readonly BinanceRawTrade[]>;
  signal?: AbortSignal;
  maxPages?: number;
}): Promise<BinanceGapRecoveryResult> {
  const { previousId, currentId, load, signal } = options;
  if (!Number.isSafeInteger(previousId) || !Number.isSafeInteger(currentId) ||
      previousId < 0 || currentId <= previousId) return { status: 'incomplete', reason: 'invalid-range' };
  if (signal?.aborted) return { status: 'incomplete', reason: 'aborted' };
  const count = currentId - previousId - 1;
  if (count === 0) return { status: 'complete', rows: [] };
  const maxPages = Math.max(1, Math.min(3, Math.trunc(options.maxPages ?? 2)));
  if (count > 1000 * maxPages) return { status: 'incomplete', reason: 'too-many' };
  const rows: BinanceRecoveryTrade[] = [];
  let next = previousId + 1;
  for (let page = 0; page < maxPages && next < currentId; page++) {
    if (signal?.aborted) return { status: 'incomplete', reason: 'aborted' };
    let raw: readonly BinanceRawTrade[];
    try {
      raw = await load(next, Math.min(1000, currentId - next), signal);
    } catch {
      return { status: 'incomplete', reason: signal?.aborted ? 'aborted' : 'request-failed' };
    }
    if (!Array.isArray(raw) || !raw.length || raw.length > 1000) {
      return { status: 'incomplete', reason: 'missing-id' };
    }
    for (const item of raw) {
      const trade = parseBinanceAggregateTrade(item);
      if (!trade) return { status: 'incomplete', reason: 'invalid-row' };
      const id = Number(trade.id);
      if (id < next) continue;
      if (id >= currentId) break;
      if (id !== next) return { status: 'incomplete', reason: 'missing-id' };
      rows.push(trade);
      next++;
    }
  }
  return next === currentId ? { status: 'complete', rows } : { status: 'incomplete', reason: 'missing-id' };
}
