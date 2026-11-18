export const ORDER_BOOK_MAX_AGE_MS = 5000;

export function isFreshDepthTime(timestamp: number, now = Date.now()): boolean {
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now + 1000 && now - timestamp <= ORDER_BOOK_MAX_AGE_MS;
}

export function isLiveOrderBookView(snapshot: {
  sampledAt?: number;
  orderBookState?: { status?: string; dataValid?: boolean; timestamp?: number; lastReceivedAt?: number };
} | null | undefined, requestedAt: number, now = Date.now()): boolean {
  const book = snapshot?.orderBookState;
  if (book?.status !== 'LIVE' || book.dataValid !== true ||
      !Number.isFinite(snapshot?.sampledAt) || !Number.isFinite(book.timestamp) || !Number.isFinite(book.lastReceivedAt) ||
      !snapshot?.sampledAt || !book.timestamp || !book.lastReceivedAt || !requestedAt || now < requestedAt) return false;
  // Use durations on each machine's clock, and include the full request time
  // conservatively so a slow response cannot make an old book look new again.
  const sourceAge = Math.max(0, snapshot.sampledAt - Math.min(book.timestamp, book.lastReceivedAt));
  return sourceAge + (now - requestedAt) <= ORDER_BOOK_MAX_AGE_MS;
}

/** Numeric, validated public exchange depth levels. Sharing these arrays is
 * safe between readers: personal book mutation/config remains in each worker.
 * The arrays must be treated as read-only after validation. */
export interface NormalizedDepthLevels {
  readonly bids: ReadonlyArray<readonly [number, number]>;
  readonly asks: ReadonlyArray<readonly [number, number]>;
}

export function parseDepthLevels(input: unknown): [number, number][] | null {
  if (!Array.isArray(input)) return null;
  const levels: [number, number][] = [];
  for (const row of input) {
    if (!Array.isArray(row) || row.length < 2 || row[0] === '' || row[1] === '' ||
        !['string', 'number'].includes(typeof row[0]) || !['string', 'number'].includes(typeof row[1])) return null;
    const price = Number(row[0]);
    const quantity = Number(row[1]);
    if (!(price > 0) || quantity < 0 || !Number.isFinite(price * quantity)) return null;
    levels.push([price, quantity]);
  }
  return levels;
}
