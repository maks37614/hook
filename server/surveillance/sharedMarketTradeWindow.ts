import type { RawTradeEvent } from './exchangeStream';

export interface MarketTradeTotals {
  aggressiveBuyUsd: number;
  aggressiveSellUsd: number;
  totalTradeCount: number;
  largeTradeCount: number;
}
type TradeNotional = { time: number; buy: number; sell: number; large: number };

/** One exact sliding 60-second market-trade accumulator per exchange/market/symbol.
 * Does not store user preferences, OI snapshots or personal Delta history.
 * A head index avoids Array.shift() for every busy-market tick.
 */
export class SharedMarketTradeWindow {
  private trades: TradeNotional[] = [];
  private head = 0;
  private buyUsd = 0;
  private sellUsd = 0;
  private largeTrades = 0;

  constructor(private readonly now: () => number = Date.now) {}

  private expire(now: number) {
    const cutoff = now - 60_000;
    while (this.head < this.trades.length && this.trades[this.head].time < cutoff) {
      const removed = this.trades[this.head++];
      this.buyUsd -= removed.buy;
      this.sellUsd -= removed.sell;
      this.largeTrades -= removed.large;
    }
    if (this.head > 2048 && this.head * 2 >= this.trades.length) {
      this.trades = this.trades.slice(this.head);
      this.head = 0;
    }
    if (this.head === this.trades.length && this.head !== 0) {
      this.trades = [];
      this.head = 0;
      this.buyUsd = 0;
      this.sellUsd = 0;
      this.largeTrades = 0;
    }
  }

  addTrade(trade: RawTradeEvent): void {
    const now = this.now();
    this.expire(now);
    const notional = trade.price * trade.quantity;
    if (!Number.isFinite(notional) || notional <= 0 ||
      !Number.isFinite(trade.time) || trade.time < now - 60_000 ||
      trade.time > now + 2_000 || (trade.side !== 'BUY' && trade.side !== 'SELL')) return;
    const buy = trade.side === 'BUY' ? notional : 0;
    const sell = trade.side === 'SELL' ? notional : 0;
    const large = notional >= 50_000 ? 1 : 0;
    this.trades.push({ time: trade.time, buy, sell, large });
    this.buyUsd += buy;
    this.sellUsd += sell;
    this.largeTrades += large;
  }

  snapshot(): MarketTradeTotals {
    this.expire(this.now());
    return {
      aggressiveBuyUsd: Math.max(0, this.buyUsd),
      aggressiveSellUsd: Math.max(0, this.sellUsd),
      totalTradeCount: this.trades.length - this.head,
      largeTradeCount: this.largeTrades,
    };
  }
  size(): number {
    this.expire(this.now());
    return this.trades.length - this.head;
  }
}
