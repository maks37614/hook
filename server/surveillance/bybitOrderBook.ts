import type { BookUpdate } from '../../src/utils/binanceOrderBook';
import { normalizeExchangeSymbol } from '../../src/utils/marketSymbols';
import { isFreshDepthTime, parseDepthLevels } from '../../src/utils/orderBookValidation';

// Regular Bybit orderbook streams start with a snapshot. Cross-sequence
// numbers are monotonic, but must not be assumed to increase by exactly one.
export class BybitOrderBookSync {
  private initialized = false;
  private lastSequence = 0;
  private lastUpdateId = 0;

  constructor(private symbol: string, private apply: (update: BookUpdate) => void, private requestSnapshot: () => void, private includeRpi = false) {}

  reset() {
    this.initialized = false;
    this.lastSequence = 0;
    this.lastUpdateId = 0;
  }

  push(message: any) {
    const data = message?.data;
    if (message?.topic !== `orderbook.${this.includeRpi ? 'rpi' : '1000'}.${normalizeExchangeSymbol(this.symbol)}` ||
        data?.s !== normalizeExchangeSymbol(this.symbol)) return;
    const parse = this.includeRpi ? parseBybitInclusiveRpiLevels : parseDepthLevels;
    const bids = parse(data.b);
    const asks = parse(data.a);
    const eventTime = message.cts ?? message.ts;
    const snapshot = message.type === 'snapshot' || data.u === 1;
    if (!['snapshot', 'delta'].includes(message.type) || !bids || !asks ||
        !Number.isSafeInteger(data.seq) || data.seq <= 0 || !Number.isSafeInteger(data.u) || data.u <= 0 ||
        !isFreshDepthTime(eventTime) || (snapshot && (!bids.length || !asks.length))) {
      this.reset();
      this.requestSnapshot();
      return;
    }
    if (!snapshot && !this.initialized) {
      this.requestSnapshot();
      return;
    }
    if (!snapshot && (data.seq < this.lastSequence || data.u <= this.lastUpdateId)) return;
    this.initialized = true;
    this.lastSequence = data.seq;
    this.lastUpdateId = data.u;
    this.apply({ bids, asks, isSnapshot: snapshot, sequence: data.seq, eventTime });
  }
}

/** Bybit transmits ordinary and RPI quantities separately; sum once. */
export function parseBybitInclusiveRpiLevels(input: unknown): [number, number][] | null {
  if (!Array.isArray(input)) return null;
  const output: [number, number][] = [];
  for (const row of input) {
    if (!Array.isArray(row) || row.length !== 3) return null;
    const normal = parseDepthLevels([[row[0], row[1]]]);
    const rpi = parseDepthLevels([[row[0], row[2]]]);
    if (!normal || !rpi) return null;
    const total = normal[0][1] + rpi[0][1];
    if (!Number.isFinite(normal[0][0] * total)) return null;
    output.push([normal[0][0], total]);
  }
  return output;
}
