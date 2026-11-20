import type { ExchangeId, Kline, MarketType, Timeframe } from '../types';

/** One browser-direct REST request can cover at most fifteen minutes.
 * No VPS proxy, database writes, live streams or new background jobs.
 */
const MAX_SECONDS = 900;
const SIZES: Partial<Record<Timeframe, number>> = { '1m': 60, '5m': 300, '15m': 900 };
export interface ReplaySecondHistory {
  parentTime: number;
  seconds: number;
  /** Individual real observed 1-second OHLC bars. May be sparse. */
  rows: readonly Kline[];
  /** One historical cumulative OHLC snapshot per elapsed second. */
  cumulative: readonly Kline[];
}
export const replaySecondDuration = (tf: Timeframe) => SIZES[tf] ?? 0;
export const supportsReplaySeconds = (exchange: ExchangeId, market: MarketType, tf: Timeframe) =>
  exchange === 'binance' && market === 'spot' && !!SIZES[tf];

function closeEnough(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) &&
    Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-8);
}
export function buildReplaySecondHistory(parent: Kline, rows: readonly Kline[], seconds: number): ReplaySecondHistory | null {
  if (!Number.isInteger(parent.time) || seconds < 1 || seconds > MAX_SECONDS || !rows.length) return null;
  let previousTime = parent.time - 1, high = -Infinity, low = Infinity, totalVolume = 0;
  const ordered: Kline[] = [];
  for (const row of rows) {
    if (!Number.isInteger(row.time) || row.time <= previousTime ||
        row.time < parent.time || row.time >= parent.time + seconds ||
        ![row.open,row.high,row.low,row.close,row.volume].every(Number.isFinite) ||
        row.open <= 0 || row.low <= 0 || row.close <= 0 || row.volume < 0 ||
        row.high < Math.max(row.open,row.close) || row.low > Math.min(row.open,row.close)) return null;
    previousTime = row.time;
    ordered.push(row);
    high = Math.max(high,row.high);
    low = Math.min(low,row.low);
    totalVolume += row.volume;
  }
  if (![parent.open,parent.high,parent.low,parent.close,parent.volume].every(Number.isFinite) ||
      !closeEnough(ordered[0].open,parent.open) || !closeEnough(high,parent.high) ||
      !closeEnough(low,parent.low) || !closeEnough(ordered.at(-1)!.close,parent.close) ||
      Math.abs(totalVolume-parent.volume)>Math.max(1e-8,parent.volume*0.002)) return null;

  let price=parent.open, top=parent.open, bottom=parent.open, volume=0;
  let quoteVolume=0, buyVolume=0, buyQuoteVolume=0, tradeCount=0, index=0;
  const cumulative:Kline[]=[];
  for (let sec=0;sec<seconds;sec++) {
    const timestamp=parent.time+sec;
    while(index<ordered.length && ordered[index].time===timestamp) {
      const row=ordered[index++];
      top=Math.max(top,row.high);bottom=Math.min(bottom,row.low);
      price=row.close;volume+=row.volume;
      quoteVolume+=row.quoteVolume??0;buyVolume+=row.buyVolume??0;
      buyQuoteVolume+=row.buyQuoteVolume??0;tradeCount+=row.tradeCount??0;
    }
    cumulative.push({time:parent.time,open:parent.open,high:top,low:bottom,close:price,volume,
      ...(parent.quoteVolume!==undefined?{quoteVolume}:{}),
      ...(parent.buyVolume!==undefined?{buyVolume}:{}),
      ...(parent.buyQuoteVolume!==undefined?{buyQuoteVolume}:{}),
      ...(parent.tradeCount!==undefined?{tradeCount}:{})});
  }
  return {parentTime:parent.time,seconds,rows:ordered,cumulative};
}
/** UTC second corresponding to the latest already-visible 1s close.
 * Floor to match replaySecondPreview, never round into an unseen second.
 */
export function replaySecondObservedTime(h:ReplaySecondHistory,fraction:number):number {
  const count=Number.isFinite(fraction)?Math.max(0,Math.min(h.seconds,Math.floor(fraction*h.seconds))):0;
  return h.parentTime+Math.max(0,count-1);
}
export function replaySecondPreview(parent:Kline,h:ReplaySecondHistory,fraction:number):Kline {
  const count=Number.isFinite(fraction)?Math.max(0,Math.min(h.seconds,Math.floor(fraction*h.seconds))):0;
  if(count===h.seconds)return parent;
  if(count===0)return {time:parent.time,open:parent.open,high:parent.open,low:parent.open,close:parent.open,volume:0};
  return h.cumulative[count-1];
}
/** Earliest second when a condition occurs; ordering WITHIN each second is unknown. */
export function firstReplaySecondEvent<T>(h:ReplaySecondHistory,start:number,fn:(c:Kline)=>T|null):{time:number;result:T}|null {
  for(const second of h.rows) {
    if(second.time<start)continue;
    const result=fn(second);
    if(result!==null)return{time:second.time,result};
  }
  return null;
}

/** The user browser downloads up to 900 historic 1s candles directly from Binance.
 * A missing/incorrect batch never masquerades as real second-resolution data.
 */
export async function fetchReplaySecondBatch(
  symbol:string,tf:Timeframe,candidates:readonly Kline[],signal?:AbortSignal,
  fetcher:typeof fetch=fetch,
):Promise<Map<number,ReplaySecondHistory|null>>{
  const result=new Map<number,ReplaySecondHistory|null>();
  const duration=replaySecondDuration(tf);
  if(!duration||!candidates.length||!/^[A-Z0-9]{5,24}$/.test(symbol))return result;
  const selected:Kline[]=[];
  for(const row of candidates){
    if(selected.length>=Math.floor(MAX_SECONDS/duration) ||
       (selected.length&&row.time!==selected.at(-1)!.time+duration) ||
       !Number.isInteger(row.time)||row.time<=0||row.time+duration>=Math.floor(Date.now()/1000))break;
    selected.push(row);
  }
  if(!selected.length)return result;
  const start=selected[0].time,end=selected.at(-1)!.time+duration;
  const query=new URLSearchParams({symbol,interval:'1s',startTime:String(start*1000),
    endTime:String(end*1000-1),limit:String(end-start)});
  let records:unknown=null;
  for(const base of ['https://data-api.binance.vision/api/v3/klines','https://api.binance.com/api/v3/klines']){
    if(signal?.aborted)return result;
    try{
      // Cancellation must also have a deadline: a hung provider request
      // cannot leave the Replay clock paused indefinitely.
      const timeout=AbortSignal.timeout(4500);
      const combinedSignal=signal?AbortSignal.any([signal,timeout]):timeout;
      const response=await fetcher(base+'?'+query.toString(),{
        signal:combinedSignal,cache:'force-cache',
      });
      if(!response.ok)continue;
      const parsed=await response.json() as unknown;
      if(!Array.isArray(parsed)||parsed.length>MAX_SECONDS)continue;
      records=parsed;break;
    }catch{
      // Cross-origin restrictions and provider errors are not retried on VPS.
    }
  }
  if(!Array.isArray(records))return result;
  const grouped=new Map<number,Kline[]>();
  for(const raw of records){
    if(!Array.isArray(raw)||raw.length<6)return result;
    const time=Number(raw[0])/1000;
    const bar:Kline={time,open:Number(raw[1]),high:Number(raw[2]),low:Number(raw[3]),
      close:Number(raw[4]),volume:Number(raw[5]),
      quoteVolume:Number(raw[7]??0),tradeCount:Number(raw[8]??0),
      buyVolume:Number(raw[9]??0),buyQuoteVolume:Number(raw[10]??0)};
    const startTime=start+Math.floor((time-start)/duration)*duration;
    if(startTime<start||startTime>=end)return result;
    const list=grouped.get(startTime)??[];
    list.push(bar);grouped.set(startTime,list);
  }
  for(const parent of selected)
    result.set(parent.time,buildReplaySecondHistory(parent,grouped.get(parent.time)??[],duration));
  return result;
}
