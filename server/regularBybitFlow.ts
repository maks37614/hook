import type { Kline, MarketType, RegularIndicatorValues } from '../src/types';
import { calculateBinanceQuoteTradeDelta } from '../src/utils/regularFormationIndicators';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import type { RawTradeEvent } from './surveillance/exchangeStream';

const MINUTE = 60_000;
const MAX_MINUTES = 320;
const MAX_IDS_PER_MINUTE = 8192;
type Bucket = { total: number; quantity: number; buy: number; ids?: Set<string>; incomplete: boolean };

/** Reuses already subscribed Bybit trades. Closed exchange volume and turnover
 * independently verify coverage before the accumulator can supply taker flow. */
export class BybitFormationFlow {
  private readonly buckets = new Map<number, Bucket>();
  private newestMinute = 0;

  add(trade: RawTradeEvent) {
    const notional = trade.price * trade.quantity;
    if (!trade.id || trade.id.length > 80 || !Number.isFinite(notional) || notional <= 0
      || !Number.isFinite(trade.time) || trade.time <= 0 || trade.quantity <= 0
      || (trade.side !== 'BUY' && trade.side !== 'SELL')) return;
    const minute = Math.floor(trade.time / MINUTE) * MINUTE;
    if (minute < this.newestMinute - MINUTE) return;
    if (minute > this.newestMinute) {
      this.newestMinute = minute;
      for (const [start, bucket] of this.buckets) {
        if (start < minute - (MAX_MINUTES - 1) * MINUTE) this.buckets.delete(start);
        else if (start < minute - MINUTE) bucket.ids = undefined;
      }
    }
    let bucket = this.buckets.get(minute);
    if (!bucket) {
      bucket = { total: 0, quantity: 0, buy: 0, ids: new Set(), incomplete: false };
      this.buckets.set(minute, bucket);
    }
    if (bucket.incomplete || bucket.ids?.has(trade.id)) return;
    if (!bucket.ids || bucket.ids.size >= MAX_IDS_PER_MINUTE) {
      bucket.incomplete = true;
      bucket.ids = undefined;
      return;
    }
    bucket.ids.add(trade.id);
    bucket.total += notional;
    bucket.quantity += trade.quantity;
    if (trade.side === 'BUY') bucket.buy += notional;
  }

  calculate(candles: Kline[], seconds: number): Partial<RegularIndicatorValues> {
    const interval = seconds * 1000;
    if (!(interval > 0 && interval % MINUTE === 0 && interval <= MAX_MINUTES * MINUTE)) return {};
    const complete = (value: number, expected: number) => Math.abs(value - expected) <= Math.max(1e-9, expected * 1e-6);
    const checked = candles.slice(-20).map(candle => {
      const unverified = candle.buyQuoteVolume === undefined ? candle : { ...candle, buyQuoteVolume: undefined };
      const start = candle.time * 1000;
      const turnover = candle.quoteVolume;
      let total = 0, quantity = 0, buy = 0;
      if (!Number.isFinite(turnover) || start % interval !== 0) return unverified;
      for (let minute = start; minute < start + interval; minute += MINUTE) {
        const bucket = this.buckets.get(minute);
        if (!bucket) continue;
        if (bucket.incomplete) return unverified;
        total += bucket.total;
        quantity += bucket.quantity;
        buy += bucket.buy;
      }
      return complete(total, turnover!) && complete(quantity, candle.volume)
        ? { ...candle, buyQuoteVolume: Math.min(buy, turnover!) } : unverified;
    });
    const flow = calculateBinanceQuoteTradeDelta(checked);
    return flow.deltaPct !== undefined || flow.cvd20Pct !== undefined ? { ...flow, tradeFlowSource: 'bybit-trades' } : {};
  }
}

const active = new Map<string, BybitFormationFlow>();
const keyFor = (market: MarketType, symbol: string) => `${market}:${normalizeExchangeSymbol(symbol)}`;

export function registerBybitFormationFlow(market: MarketType, symbol: string) {
  const key = keyFor(market, symbol);
  const flow = new BybitFormationFlow();
  active.set(key, flow);
  return { add: (trade: RawTradeEvent) => flow.add(trade), release: () => {
    if (active.get(key) === flow) active.delete(key);
  } };
}

export function readBybitFormationFlow(market: MarketType, symbol: string, candles: Kline[], seconds: number) {
  return active.get(keyFor(market, symbol))?.calculate(candles, seconds) ?? {};
}
