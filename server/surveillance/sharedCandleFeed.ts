import type { ExchangeId, MarketType } from '../../src/types';
import { normalizeExchangeSymbol } from '../../src/utils/marketSymbols';
import { fetchKlines } from '../marketService';
import { acquireExchangeStream, type SharedExchangeStreamHandle } from './sharedExchangeStream';
import { MultiTimeframeEngine } from './multiTimeframeEngine';
import type { RawTradeEvent } from './exchangeStream';
import { SharedMarketTradeWindow } from './sharedMarketTradeWindow';
import { TradeRingBuffer } from './tradeRingBuffer';
import { registerBybitFormationFlow } from '../regularBybitFlow';

interface SharedCandleEntry {
  key: string;
  refs: number;
  engine: MultiTimeframeEngine;
  tradeWindow: SharedMarketTradeWindow;
  generation: number;
  revision: number;
  source: SharedExchangeStreamHandle;
  ready: Promise<void>;
  initialized: boolean;
  destroyed: boolean;
  pending: TradeRingBuffer<RawTradeEvent>;
  bybitFlow?: ReturnType<typeof registerBybitFormationFlow>;
}
const candleFeeds = new Map<string,SharedCandleEntry>();
let nextFeedGeneration = 0;

async function prime(entry: SharedCandleEntry, exchange: ExchangeId,
  market: MarketType, symbol: string): Promise<void> {
  try {
    const frameSpecs = [
      ['1d',80],['4h',100],['1h',100],['15m',80],['5m',80],
    ] as const;
    const data = await Promise.all(frameSpecs.map(([tf,n])=>
      fetchKlines(exchange,market,symbol,tf,n).catch(()=>[])));
    if (entry.destroyed) return;
    for (let i=0;i<frameSpecs.length;i++) if(data[i].length) {
      entry.engine.setCandles(frameSpecs[i][0],data[i]);
      entry.revision++;
    }
  } catch { /* Missing history must not prevent live candle updates. */ }
  finally {
    if (!entry.destroyed) {
      entry.initialized=true;
      // Trades received during historical hydration are replayed exactly once.
      const lastSnapshotBucket = entry.engine.getCandles('5m').at(-1)?.time ?? 0;
      for (const trade of entry.pending.drain()) {
        // An initial historical request can complete after a newer candle.
        // Never replay older buffered trades backwards into the candle timeline.
        if (trade.time >= lastSnapshotBucket) {
          entry.engine.updateWithTrade(trade);
          entry.revision++;
        }
      }
    }
    entry.pending.clear();
  }
}

export interface SharedCandleFeedHandle {
  readonly engine: MultiTimeframeEngine;
  readonly tradeWindow: SharedMarketTradeWindow;
  readonly ready: Promise<void>;
  /** Cheap immutable version token shared by all subscribers of one OHLCV engine. */
  fingerprint(): string;
  destroy(): void;
}

/** One trade-to-OHLCV update and one initial candle download per instrument,
 * regardless of the number of users with 24/7 alerts on that instrument. */
export function acquireSharedCandleFeed(symbol: string,exchange: ExchangeId,
  market: MarketType): SharedCandleFeedHandle {
  const clean=normalizeExchangeSymbol(symbol);
  const key=`${exchange}:${market}:${clean}`;
  let entry=candleFeeds.get(key);
  if(!entry) {
    const source=acquireExchangeStream(clean,exchange,market);
    const created:SharedCandleEntry={
      key,refs:0,source,engine:new MultiTimeframeEngine(),
      tradeWindow:new SharedMarketTradeWindow(),
      generation:++nextFeedGeneration,revision:0,
      ready:Promise.resolve(),initialized:false,destroyed:false,
      pending:new TradeRingBuffer<RawTradeEvent>(5000),
      bybitFlow: exchange === 'bybit' ? registerBybitFormationFlow(market, clean) : undefined,
    };
    candleFeeds.set(key,created);
    source.on('trade',(trade:RawTradeEvent)=>{
      if(created.destroyed) return;
      created.tradeWindow.addTrade(trade);
      created.bybitFlow?.add(trade);
      if(created.initialized) {
        created.engine.updateWithTrade(trade);
        created.revision++;
      } else {
        created.pending.push(trade);
      }
    });
    created.ready=prime(created,exchange,market,clean);
    entry=created;
  }
  entry.refs++;
  const current=entry;
  let released=false;
  return {
    engine:current.engine,tradeWindow:current.tradeWindow,ready:current.ready,
    fingerprint() { return `${current.generation}:${current.revision}`; },
    destroy() {
      if(released) return;
      released=true;
      if(--current.refs===0 && candleFeeds.get(key)===current){
        current.destroyed=true;
        current.pending.clear();
        current.bybitFlow?.release();
        candleFeeds.delete(key);
        current.source.destroy();
      }
    },
  };
}
export function sharedCandleFeedStats() {
  return { markets:candleFeeds.size, subscribers:[...candleFeeds.values()]
    .reduce((sum,e)=>sum+e.refs,0),
    recentMarketTrades:[...candleFeeds.values()].reduce((sum,e)=>sum+e.tradeWindow.size(),0) };
}
