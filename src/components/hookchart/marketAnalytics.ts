export type Candle={t:number,o:number,h:number,l:number,c:number,v:number,n:number};
export type LevelTf='5m'|'15m'|'30m'|'1h'|'4h'|'1d';
export type AutoLevel={
  id:string;p:number;tf:LevelTf;kind:'SUPPORT'|'RESIST';score:number;
  firstTime:number;confirmedAt:number;lastTouch:number;visits:number;
  zoneLow:number;zoneHigh:number;broken:boolean;brokenAt:number|null;strength:number
};
export type LevelSettings={count:number;allowedDiffPct:number;historyDepth:number;breakPct:number;minSeparationBars:number;pivotBars:number;allowWickPenetration:boolean};
export type MarketPrint={id:string,side:'BUY'|'SELL',t:number,p:number,usd:number,count:number,touches:number,lastTouch:number,score:number,segments?:{t:number,usd:number}[]};
/** usd is a historical field name; on the supported charts the raw value is USDT, not USD. */
export type OrderBookDensityLevel={p:number;q:number;usd:number;side:'BID'|'ASK'};
export type RawOrderBookLevel=readonly [number|string,number|string];

export const normalizeDensityDistance = (value?: number) =>
  Math.max(.1, Math.min(20, Number.isFinite(value) ? value! : 5));

/** Convert public exchange depth rows into quote-asset notionals near the current price. */
export function getOrderBookDensityLevels(
  bids: readonly RawOrderBookLevel[],
  asks: readonly RawOrderBookLevel[],
  price: number,
  distancePct = 5,
): OrderBookDensityLevel[] {
  if (!Number.isFinite(price) || price <= 0) return [];
  const distance = normalizeDensityDistance(distancePct) / 100;
  const convert = (rows: readonly RawOrderBookLevel[], side: OrderBookDensityLevel['side']) => rows.flatMap(([rawPrice, rawQty]) => {
    const p = Number(rawPrice), q = Number(rawQty), usd = p * q;
    if (!Number.isFinite(p) || !Number.isFinite(q) || !Number.isFinite(usd) || p <= 0 || q <= 0) return [];
    const inRange = side === 'BID'
      ? p <= price && p >= price * (1 - distance)
      : p >= price && p <= price * (1 + distance);
    return inRange ? [{ p, q, usd, side }] : [];
  });
  return [
    ...convert(bids, 'BID').sort((a, b) => b.p - a.p),
    ...convert(asks, 'ASK').sort((a, b) => a.p - b.p),
  ];
}

/** Keep price levels whose exchange-reported quantity has the requested quote-asset notional. */
export function filterOrderBookDensities(levels: readonly OrderBookDensityLevel[], thresholdUsd: number): OrderBookDensityLevel[] {
  const threshold = Math.max(1, Number.isFinite(thresholdUsd) ? thresholdUsd : 1);
  return levels.filter(level => level.usd >= threshold);
}

/** Estimate an exceptional USDT-sized level from this market's ordinary depth. */
export function orderBookAutoThreshold(notionals: readonly number[]): number {
  const sorted = notionals.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length < 2) return 0;
  // Exclude the largest 10% (at least one level), so a wall does not set its own baseline.
  const ordinary = sorted.slice(0, sorted.length - Math.max(1, Math.floor(sorted.length * .1)));
  const middle = quantile(ordinary, .5);
  const low = quantile(ordinary, .25), high = quantile(ordinary, .75);
  // No upper-percentile cap: an ordinary book is allowed to have no densities at all.
  return Math.max(1, middle * 4, high + (high - low) * 3);
}

/**
 * Minimum size of a REAL price-level order for a target fraction of nearby
 * same-side liquidity. The chart does not combine nearby levels into fake walls.
 */
export function orderBookLocalShareFloor(
  levels: readonly OrderBookDensityLevel[],
  candidate: OrderBookDensityLevel,
  widthPct = .5,
  share = .25,
): number {
  const width = Math.max(0, widthPct) / 100;
  const target = Math.max(0, Math.min(.95, share));
  const other = levels.reduce((sum, level) => (
    level.side === candidate.side && level.p !== candidate.p &&
    Math.abs(level.p - candidate.p) <= candidate.p * width
      ? sum + level.usd : sum
  ), 0);
  return other * target / (1 - target);
}

/**
 * Batch equivalent of orderBookLocalShareFloor. The old per-candidate scan
 * performs O(levels × candidates) work on every depth refresh. This lookup
 * groups prices by side, builds prefix USD sums once and answers each query
 * with two binary searches. Same-price levels are excluded exactly as before.
 */
export function createOrderBookLocalShareFloorLookup(
  levels: readonly OrderBookDensityLevel[],
  widthPct = .5,
  share = .25,
): (candidate: OrderBookDensityLevel) => number {
  const width = Math.max(0, widthPct) / 100;
  const target = Math.max(0, Math.min(.95, share));
  const build = (side: OrderBookDensityLevel['side']) => {
    const sorted = levels.filter(level => level.side === side).sort((a, b) => a.p - b.p);
    const prices: number[] = [];
    const totals: number[] = [0];
    const byPrice = new Map<number, number>();
    for (const row of sorted) {
      prices.push(row.p);
      totals.push(totals.at(-1)! + row.usd);
      byPrice.set(row.p, (byPrice.get(row.p) || 0) + row.usd);
    }
    return { prices, totals, byPrice };
  };
  const indexed = { BID: build('BID'), ASK: build('ASK') };
  const bound = (prices: readonly number[], value: number, upper: boolean) => {
    let lo = 0, hi = prices.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (prices[mid] < value || (upper && prices[mid] === value)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return candidate => {
    const { prices, totals, byPrice } = indexed[candidate.side];
    if (!prices.length || target === 0 || !(candidate.p > 0)) return 0;
    const deviation = candidate.p * width;
    const left = bound(prices, candidate.p - deviation, false);
    const right = bound(prices, candidate.p + deviation, true);
    if (right <= left) return 0;
    const others = Math.max(0, totals[right] - totals[left] - (byPrice.get(candidate.p) || 0));
    return others * target / (1 - target);
  };
}

export const median=(a:number[])=>{if(!a.length)return 0;const x=[...a].sort((m,n)=>m-n),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2};
export const quantile=(a:number[],q:number)=>{if(!a.length)return 0;const x=[...a].sort((m,n)=>m-n),pos=(x.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(pos-lo)};
export const robustThreshold=(values:number[],q=.965,madMult=5)=>{const v=values.filter(x=>Number.isFinite(x)&&x>0);if(v.length<12)return v.length?Math.max(quantile(v,.9),median(v)*3):0;const logs=v.map(x=>Math.log1p(x)),m=median(logs),mad=median(logs.map(x=>Math.abs(x-m)))||.01;const robust=Math.expm1(m+madMult*1.4826*mad);return Math.max(quantile(v,q),robust)};
export const adaptiveCut = (values: number[], loQ = .97, hiQ = .995, madMult = 3.2) => {
  const valid = values.filter(value => Number.isFinite(value) && value > 0);
  if (!valid.length) return 0;
  if (valid.length < 20) return Math.max(1, quantile(valid, .8) * 1.35);
  const lo = quantile(valid, loQ);
  const hi = Math.max(lo, quantile(valid, hiQ));
  const raw = robustThreshold(valid, loQ, madMult) || lo;
  return Math.max(1, Math.min(hi, Math.max(lo, raw)));
};
export const atr=(c:readonly Candle[],n=40)=>{const x=c.slice(-Math.max(2,n));if(x.length<2)return 0;let s=0,k=0;for(let i=1;i<x.length;i++){const p=x[i-1].c,z=x[i];s+=Math.max(z.h-z.l,Math.abs(z.h-p),Math.abs(z.l-p));k++}return k?s/k:0};
/** Last-candle-relative 24h chart stats without allocating candle arrays every tick.
 * Klines reach the chart sorted by time, so a binary search skips old history.
 */
export function chartMarketStatistics(candles: readonly Candle[], natrPeriod = 14) {
  const last = candles.at(-1);
  if (!last) return { vol24: 0, high: 0, low: 0, natr: NaN };
  const cutoff = last.t - 86_400_000;
  let left = 0, right = candles.length;
  while (left < right) {
    const mid = (left + right) >>> 1;
    if (candles[mid].t < cutoff) left = mid + 1;
    else right = mid;
  }
  let vol24 = 0, high = -Infinity, low = Infinity;
  for (let i = left; i < candles.length; i++) {
    const candle = candles[i];
    vol24 += (candle.v || 0) * candle.c;
    if (candle.h > high) high = candle.h;
    if (candle.l < low) low = candle.l;
  }
  // ATR already reads only its requested trailing window.
  return {
    vol24,
    high: high === -Infinity ? last.h : high,
    low: low === Infinity ? last.l : low,
    natr: last.c > 0 ? atr(candles, Math.max(2, natrPeriod || 14)) / last.c * 100 : NaN,
  };
}

export const formatUsd=(n:number)=>{const a=Math.abs(n);if(a>=1e9)return `${(n/1e9).toFixed(a>=1e10?1:2)}B`;if(a>=1e6)return `${(n/1e6).toFixed(a>=1e7?1:2)}M`;if(a>=1e3)return `${(n/1e3).toFixed(a>=1e4?0:1)}K`;return n.toFixed(0)};

// Exact structural extrema. The ray price is NEVER averaged: p is the actual wick high/low.
type Candidate={p:number;t:number;i:number;kind:'SUPPORT'|'RESIST';prominence:number};
function structuralCandidates(c:Candle[],tf:LevelTf,pivotBars=15):Candidate[]{
  const out:Candidate[]=[];
  const span=Math.max(2,Math.min(6,Math.round(pivotBars/6)));
  const A=Math.max(atr(c,60),1e-12);
  for(let i=span;i<c.length-span;i++){
    const z=c[i],left=c.slice(i-span,i),right=c.slice(i+1,i+span+1);
    const leftHigh=Math.max(...left.map(x=>x.h)),rightHigh=Math.max(...right.map(x=>x.h));
    const leftLow=Math.min(...left.map(x=>x.l)),rightLow=Math.min(...right.map(x=>x.l));
    if(z.h>leftHigh&&z.h>=rightHigh){
      const base=Math.max(leftHigh,rightHigh),prom=Math.max(0,(z.h-base)/A);
      out.push({p:z.h,t:z.t,i,kind:'RESIST',prominence:prom});
    }
    if(z.l<leftLow&&z.l<=rightLow){
      const base=Math.min(leftLow,rightLow),prom=Math.max(0,(base-z.l)/A);
      out.push({p:z.l,t:z.t,i,kind:'SUPPORT',prominence:prom});
    }
  }
  return out;
}

function independentVisits(c:Candle[],candidate:Candidate,allowedDiffPct:number,minSeparationBars:number){
  const half=Math.max(candidate.p*allowedDiffPct/100,1e-12),zoneLow=candidate.p-half,zoneHigh=candidate.p+half;
  const visits:{i:number;t:number}[]=[];
  let inZone=false,outsideRun=minSeparationBars;
  for(let i=candidate.i;i<c.length;i++){
    const z=c[i],hit=candidate.kind==='RESIST'?z.h>=zoneLow&&z.l<=zoneHigh:z.l<=zoneHigh&&z.h>=zoneLow;
    if(hit){if(!inZone&&outsideRun>=minSeparationBars)visits.push({i,t:z.t});inZone=true;outsideRun=0}
    else{if(inZone)inZone=false;outsideRun++}
  }
  return{visits,zoneLow,zoneHigh};
}

export function deriveAutoLevels(c:Candle[],tf:LevelTf,settings?:Partial<LevelSettings>):AutoLevel[]{
  const cfg:LevelSettings={count:3,allowedDiffPct:.18,historyDepth:500,breakPct:.35,minSeparationBars:2,pivotBars:15,allowWickPenetration:true,...settings};
  const h=c.slice(-Math.max(80,Math.min(1500,cfg.historyDepth)));if(h.length<40)return[];
  const candidates=structuralCandidates(h,tf,cfg.pivotBars),last=h.at(-1)!.c,tfWeight=tf==='1d'?3:tf==='4h'?2:tf==='1h'?1:tf==='30m'?.85:tf==='15m'?.7:.5,out:AutoLevel[]=[];
  const barMs=tf==='1d'?86400000:tf==='4h'?14400000:tf==='1h'?3600000:tf==='30m'?1800000:tf==='15m'?900000:300000;
  for(const candidate of candidates){
    const v=independentVisits(h,candidate,cfg.allowedDiffPct,cfg.minSeparationBars);if(v.visits.length<cfg.count)continue;
    const confirmed=v.visits[cfg.count-1],lastVisit=v.visits.at(-1)!;
    const breakFrac=Math.max(0,cfg.breakPct)/100;let broken=false,brokenAt:number|null=null,run=0;
    for(let i=confirmed.i+1;i<h.length;i++){
      const z=h[i],close=z.c;
      const beyond=cfg.allowWickPenetration?(candidate.kind==='SUPPORT'?close<candidate.p*(1-breakFrac):close>candidate.p*(1+breakFrac)):(candidate.kind==='SUPPORT'?z.l<candidate.p*(1-breakFrac):z.h>candidate.p*(1+breakFrac));
      run=beyond?run+1:0;if(run>=2){broken=true;brokenAt=h[i].t;break}
    }
    // Keep recently broken levels, like Watchlist's grey rays, but do not flood the chart with ancient breaks.
    if(broken&&brokenAt!==null){const recent=(h.at(-1)!.t-brokenAt)<=barMs*140,near=Math.abs(last-candidate.p)/Math.max(last,1e-12)<=.055;if(!recent&&!near)continue}
    const recency=Math.max(0,1-(h.at(-1)!.t-lastVisit.t)/(barMs*(tf==='1d'?180:tf==='4h'?150:120)));
    const lifeBars=Math.max(1,(lastVisit.t-candidate.t)/barMs);
    const testQuality=Math.min(1,Math.max(0,(v.visits.length-cfg.count+1)/4));
    const prominenceQuality=Math.min(1,candidate.prominence/2.2);
    const longevityQuality=Math.min(1,Math.log1p(lifeBars)/Math.log(tf==='1d'?140:tf==='4h'?180:220));
    const strength=Math.max(0,Math.min(100,Math.round(100*(
      .38*testQuality+.24*prominenceQuality+.20*recency+.18*longevityQuality
    )*(broken?.72:1))));
    const score=tfWeight*1.8+strength/18+(broken?-.8:.7);
    out.push({id:`${tf}:${candidate.kind}:${candidate.t}:${candidate.p}`,p:candidate.p,tf,kind:candidate.kind,score,firstTime:candidate.t,confirmedAt:confirmed.t,lastTouch:lastVisit.t,visits:v.visits.length,zoneLow:v.zoneLow,zoneHigh:v.zoneHigh,broken,brokenAt,strength});
  }
  // De-duplicate only genuinely overlapping candidates on the SAME TF/kind. Exact wick price of the winner is preserved.
  const picked:AutoLevel[]=[];
  for(const l of out.sort((a,b)=>(Number(a.broken)-Number(b.broken))||b.score-a.score)){
    const overlap=picked.some(x=>x.tf===l.tf&&x.kind===l.kind&&Math.abs(x.p-l.p)/Math.max(1e-12,l.p)*100<=cfg.allowedDiffPct*.72);
    if(!overlap)picked.push(l);
  }
  const active=picked.filter(x=>!x.broken).sort((a,b)=>b.score-a.score),broken=picked.filter(x=>x.broken).sort((a,b)=>(b.brokenAt||0)-(a.brokenAt||0));
  const cap=tf==='1d'?10:tf==='4h'?12:tf==='1h'?14:16;
  return [...active,...broken.slice(0,6)].slice(0,cap);
}


/** Reuse pure structural-level analysis when higher-timeframe candle history
 * is unchanged. The cache is scoped to the immutable candle array identity;
 * a live update, data correction, new timeframe, or new settings gets fresh
 * results. WeakMap prevents old market histories from being retained.
 */
const autoLevelCache = new WeakMap<Candle[], Map<string, AutoLevel[]>>();
const AUTO_LEVEL_SETTINGS_CACHE_LIMIT = 16;

export function memoizedAutoLevels(candles: Candle[], tf: LevelTf, settings?: Partial<LevelSettings>): AutoLevel[] {
  // Normalize effective configuration before keying. Identical settings from
  // separate Terminal charts must map to the same cached computation.
  const config: LevelSettings = {
    count: 3, allowedDiffPct: .18, historyDepth: 500,
    breakPct: .35, minSeparationBars: 2, pivotBars: 15,
    allowWickPenetration: true, ...settings,
  };
  const key = [
    tf, config.count, config.allowedDiffPct, config.historyDepth,
    config.breakPct, config.minSeparationBars, config.pivotBars,
    config.allowWickPenetration,
  ].join(':');
  let variants = autoLevelCache.get(candles);
  if (!variants) {
    variants = new Map();
    autoLevelCache.set(candles, variants);
  }
  const cached = variants.get(key);
  if (cached) return cached;
  const calculated = deriveAutoLevels(candles, tf, config);
  variants.set(key, calculated);
  // A single chart history can appear under many edited preferences.
  while (variants.size > AUTO_LEVEL_SETTINGS_CACHE_LIMIT)
    variants.delete(variants.keys().next().value!);
  return calculated;
}
