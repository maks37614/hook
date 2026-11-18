import type { BookUpdate } from '../../src/utils/binanceOrderBook';
import { normalizeExchangeSymbol } from '../../src/utils/marketSymbols';
import { isFreshDepthTime, parseDepthLevels } from '../../src/utils/orderBookValidation';

// Regular Bybit orderbook streams start with a snapshot. Cross-sequence
// numbers are monotonic, but must not be assumed to increase by exactly one.
export class BybitOrderBookSync {
  private initialized = false;
  private lastSequence = 0;
  private lastUpdateId = 0;

  constructor(private symbol: string, private apply: (update: BookUpdate) => void, private requestSnapshot: () => void) {}

  reset() {
    this.initialized = false;
    this.lastSequence = 0;
    this.lastUpdateId = 0;
  }

  push(message: any) {
    const data = message?.data;
    if (message?.topic !== `orderbook.1000.${normalizeExchangeSymbol(this.symbol)}` ||
        data?.s !== normalizeExchangeSymbol(this.symbol)) return;
    const bids = parseDepthLevels(data.b);
    const asks = parseDepthLevels(data.a);
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
