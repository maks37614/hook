/**
 * Observed (already reported) forced liquidations, not modelled future stops.
 * The server aggregates raw events into exact time bins (5m/15m) and 0.5%
 * logarithmic price bands. All coordinates use HookChart's OWN transforms.
 */
export type LiquidationHeatmapPeriod = '24h' | '7d';
export type LiquidationHeatmapBin = {
  time: number; // epoch milliseconds, start of the provider time bucket
  price: number; // geometric center of the 0.5% price bucket
  side: 'LONG' | 'SHORT';
  usd: number;
  count: number;
};

export type LiquidationHeatmapSnapshot = {
  source: 'observed_liquidations';
  exchange: 'binance' | 'bybit';
  symbol: string;
  hours: 24 | 168;
  bins: LiquidationHeatmapBin[];
  truncated: boolean;
  complete: false;
  caveat: string;
};

export const LIQ_HEATMAP_PRICE_RATIO = 1.005;
const ROOT_RATIO = Math.sqrt(LIQ_HEATMAP_PRICE_RATIO);
export const liquidationsTimeBucketMs = (period: LiquidationHeatmapPeriod) =>
  period === '24h' ? 300_000 : 900_000;

export function validateHeatmapSnapshot(
  input: unknown,
  exchange: string,
  symbol: string,
  period: LiquidationHeatmapPeriod,
): LiquidationHeatmapSnapshot | null {
  if (!input || typeof input !== 'object') return null;
  const data = input as Record<string, unknown>;
  if (data.source !== 'observed_liquidations' ||
      data.exchange !== exchange || data.symbol !== symbol ||
      data.hours !== (period === '24h' ? 24 : 168) ||
      data.complete !== false || !Array.isArray(data.bins)) return null;

  const binMs = liquidationsTimeBucketMs(period);
  const valid: LiquidationHeatmapBin[] = [];
  for (const row of data.bins.slice(0, 6000)) {
    if (!row || typeof row !== 'object') continue;
    const bin = row as Record<string, unknown>;
    if (typeof bin.time !== 'number' || !Number.isSafeInteger(bin.time) ||
        bin.time % binMs !== 0 ||
        typeof bin.price !== 'number' || !Number.isFinite(bin.price) || bin.price <= 0 ||
        (bin.side !== 'LONG' && bin.side !== 'SHORT') ||
        typeof bin.usd !== 'number' || !Number.isFinite(bin.usd) || bin.usd <= 0 ||
        typeof bin.count !== 'number' || !Number.isSafeInteger(bin.count) || bin.count <= 0) continue;
    valid.push({
      time: bin.time, price: bin.price, side: bin.side,
      usd: bin.usd, count: bin.count,
    });
  }
  valid.sort((a,b)=>a.time-b.time);
  return {
    source:'observed_liquidations', exchange:exchange as 'binance' | 'bybit',
    symbol, hours:data.hours as 24 | 168, bins: valid,
    truncated:data.truncated === true, complete:false,
    caveat:typeof data.caveat === 'string' ? data.caveat.slice(0,500) : '',
  };
}

export type HeatmapCoords = {
  plotW: number;
  plotH: number;
  step: number; // current HookChart candle step in CSS pixels
  /** The same time and price scales that candles and densities use. */
  x: (timestampMs: number) => number;
  y: (price: number) => number;
  timeAtX: (x: number) => number;
};

export type HeatmapRect = {
  left: number; top: number; width: number; height: number;
  side: 'LONG' | 'SHORT'; alpha: number;
};

const lowerBoundTime = (bins: readonly LiquidationHeatmapBin[], target: number) => {
  let lo=0, hi=bins.length;
  while (lo<hi) {
    const mid=(lo+hi)>>>1;
    if (bins[mid].time<target) lo=mid+1; else hi=mid;
  }
  return lo;
};

/** Pure viewport transform. No canvases, network calls, timers or allocations
 * when the caller's heatmap is disabled. This is run only inside the guarded
 * chart paint branch.
 */
export function visibleHeatmapRects(
  bins: readonly LiquidationHeatmapBin[],
  period: LiquidationHeatmapPeriod,
  g: HeatmapCoords,
  maxUsd: number,
): HeatmapRect[] {
  if (!bins.length || !(g.plotW>0 && g.plotH>0 && g.step>0) || !(maxUsd>0)) return [];
  const bucketMs=liquidationsTimeBucketMs(period);
  const firstVisible=Math.min(g.timeAtX(0),g.timeAtX(g.plotW));
  const lastVisible=Math.max(g.timeAtX(0),g.timeAtX(g.plotW));
  const start=lowerBoundTime(bins,firstVisible-bucketMs);
  const rectangles:HeatmapRect[]=[];
  const maxLog=Math.log1p(maxUsd);
  for(let i=start;i<bins.length;i++){
    const bin=bins[i];
    if(bin.time>lastVisible)break;
    const x0=g.x(bin.time)-g.step/2;
    const x1=g.x(bin.time+bucketMs)-g.step/2;
    const pLow=bin.price/ROOT_RATIO;
    const pHigh=bin.price*ROOT_RATIO;
    const rawY0=g.y(pHigh),rawY1=g.y(pLow);
    if (![x0,x1,rawY0,rawY1].every(Number.isFinite))continue;
    const l=Math.max(0,Math.min(x0,x1));
    const r=Math.min(g.plotW,Math.max(x0,x1));
    const t=Math.max(0,Math.min(rawY0,rawY1));
    const b=Math.min(g.plotH,Math.max(rawY0,rawY1));
    if(r<=l||b<=t)continue;
    const strength=Math.max(0,Math.min(1,Math.log1p(bin.usd)/maxLog));
    rectangles.push({
      left:l,top:t,width:Math.max(0.65,r-l),height:Math.max(1,b-t),
      side:bin.side,alpha:0.06+strength*0.43,
    });
  }
  return rectangles;
}

/** Heatmap stays below the candles and below all existing volume/depth/Liq
 * markers. No heatmap path executes when its toggle is off.
 */
export function paintObservedLiquidationHeatmap(
  context: CanvasRenderingContext2D,
  bins: readonly LiquidationHeatmapBin[],
  period: LiquidationHeatmapPeriod,
  g: HeatmapCoords,
  maxUsd: number,
) {
  const rectangles=visibleHeatmapRects(bins,period,g,maxUsd);
  if(!rectangles.length)return;
  context.save();
  for(const item of rectangles){
    context.globalAlpha=item.alpha;
    context.fillStyle=item.side==='LONG'?'#f44b66':'#13c99d';
    context.fillRect(item.left,item.top,item.width,item.height);
  }
  context.restore();
}
