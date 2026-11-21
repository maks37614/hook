// Canvas chart and indicator panels extracted from the user's hookchart archive.
import { translateHookChartPhrase } from '../../locales/hookchartLanguage';
import type { SupportedLanguage } from '../../locales';
import type { VisualChartProfile } from './visualProfiles';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useImperativeHandle, useId } from 'react';
import { ChartBarCountdown } from './ChartBarCountdown';
import { createPortal } from 'react-dom';
import { CalendarDays, Pencil, Trash2 } from 'lucide-react';
import { drawingActionsPosition, drawingTextHitDistance, freeDrawingPoint, rayEndPoint, translateDrawingPoints } from './drawingManipulation';
import { drawTouchMagnifier, magnifierZoomFromPriceDrag, TOUCH_MAGNIFIER_DEFAULT_ZOOM } from './touchMagnifier';
import { createChartFrameScheduler } from './frameScheduler';
import { createChartViewportNotifier } from './viewportNotifier';
import { sameTimeAxisInputs } from './timeAxisMemo';
import { createAutoPocZoneCache } from './autoPoc';
import { closestActiveDensityPrices, rankAutoLevelsForPrice } from './chartPanPrecompute';
import { createVolumeProfileHistogramCache } from './volumeProfileHistogram';
import { createChartVisibleWindowCache } from './visibleWindowCache';
import { chartDiagnosticsEnabled, recordChartPaint } from './chartDiagnostics';
import { DEFAULT_CROSSHAIR_LINE_WIDTH, paintChartCrosshair, paintChartRuler } from './chartCursor';
import { DEFAULT_MAX_CANVAS_DPR, effectiveCanvasDpr } from './canvasDpr';
import { measurementStats, measurementHit, paintMeasurement, measurementActionPosition } from './measurementTool';
import { rulerDragThresholdMet, rulerHasRange, isRangeDrawingTool, isPointDrawingTool } from './rulerGestures';
import { createChartTouchHold, isChartControlTarget } from './touchHold';
import { CrosshairTimeLabel } from './CrosshairTimeLabel';
import type { ChartCrosshairStore, CrosshairPosition } from './crosshairState';
import { quantile, atr, formatUsd, type AutoLevel, type MarketPrint } from './marketAnalytics';
import { hookChartDensityQuote, formatHookChartDensityNotional } from '../../utils/densityNotional';
import { aggregateMarketPrintsByCandle, filterMarketPrintCandleBuckets } from './marketPrintBuckets';
import { createSupportResistanceCalculator } from './supportResistance';
import { createChartDayOverlayCalculator } from './chartDayOverlays';
import type { StrategyResult } from './strategyEngine';
import { scalperLabel, scalperLineDash, type ScalperScene, type ScalperLine, type ScalperLineStyle } from './scalperMode';
import { normalizeScalperLineWidth, scalperRenderedLineEndX, scalperRasterStrokeWidth, scalperPixelCenteredHorizontalY, cascadeLineIsActive, scalperDiagonalIsActive, cascadeStrokeAppearance } from './scalperLineProjection';
import type { MarketRecurrenceMark } from './marketRecurrence';
import { INDICATOR_META, indicatorData, type IndicatorId, type OIPoint } from './indicatorEngine';
import type { ArchivedAutoOverlayScene, ChartMarkerInfo, DetectedFormation } from '../../types';
import { formatCryptoPrice } from '../../utils/formatters';
import { coalesceNecklinePriceMarkers, hookChartHorizontalRange, hookChartIndexAtTime, hookChartTimeAtIndex, resizeHookChartViewport, restoredHookViewport, terminalHookViewport } from '../../utils/hookchartData';
import { drawHookTimeMarkers, type HookTimeMarker } from './timeMarkers';
import { paintObservedLiquidationHeatmap, type LiquidationHeatmapBin, type LiquidationHeatmapPeriod } from './liquidationHeatmap';
import { liquidationTextPosition } from './liquidationDisplay';
import { hasObservedLiquidationCascade, liquidationHudPreferenceKey, LIQUIDATION_HUD_PREFERENCE_EVENT, readLiquidationHudExpanded, saveLiquidationHudExpanded } from './liquidationHudPreferences';
import { paintHistoricalLiqRecurrence, type HistoricalRecurrenceBand } from './historicalLiqRecurrence';
import { terminalCandlePriceRange, terminalSafeVerticalZoomRange, terminalSafeManualPriceViewport, terminalViewportHistoryPhase, terminalReadableCandleExtrema } from './terminalAutoScale';
import { latestCandleResetViewport } from './resetViewport';
import { visibleArchivedDensityScene } from '../../utils/archiveChartSnapshot';
import { HOOKCHART_PRICE_SCALE_WIDTH, HOOKCHART_PRICE_LABEL_HEIGHT, hookChartPlotWidth, layoutPriceScaleLabels } from './priceScale';
export interface HookChartHandle { takeScreenshot(): string | null; takeArchiveScreenshot?(): string | null; captureArchiveSnapshot?(): import('../../types').ArchivedChartSnapshot | null; takeArchiveDensityScene?(): import('../../types').ArchivedDensityScene | undefined; takeArchiveOverlayScene?(): ArchivedAutoOverlayScene | undefined; takeArchiveVisibleSrMarkers?(): boolean; fitContent(): void; zoomToLatest(): void; focusLatest(): void; zoom(factor: number): void; }
export type Candle={t:number,o:number,h:number,l:number,c:number,v:number,n:number,tb?:number};

export type Density={id:string,side:'ASK'|'BID',p:number,q:number,usd:number,peakUsd:number,first:number,last:number,active:boolean,reacted?:boolean,reaction?:number,touches:number,lastTouch:number,replenishments:number,updates:number,score:number,mmScore:number;reactionScore?:number;reactionTier?:'strong'|'potential';executedUsd90s?:number;lastAbsorptionAt?:number;unexplainedReductions?:number};

export type Liquidation={id:string,side:'LONG'|'SHORT',t:number,p:number,q:number,usd:number};

export type LiquidationHeatmapChartData = {
  bins: LiquidationHeatmapBin[];
  period: LiquidationHeatmapPeriod;
  maxUsd: number;
};

export type CascadeRisk={
  score:number;
  level:'LOW'|'MED'|'HIGH'|'CRIT';
  total5:number;
  count5:number;
  longUsd:number;
  shortUsd:number;
  total1?:number;
  count1?:number;
  threshold?:number;
  observedTotal5?:number;
  observedCount5?:number;
  acceleration?:number;
  hasData?:boolean;
  lastEventAt?:number|null;
};

export type LiquidationCandleBucket={
  index:number;
  t:number;
  totalUsd:number;
  longUsd:number;
  shortUsd:number;
  count:number;
};

export const aggregateLiquidationsByCandle=(candles:Candle[],rows:Liquidation[],intervalMs:number):LiquidationCandleBucket[]=>{
  if(!candles.length||!rows.length||!(intervalMs>0))return[];
  const buckets=new Map<number,LiquidationCandleBucket>();
  const indexAt=(t:number)=>{
    let lo=0,hi=candles.length-1,best=-1;
    while(lo<=hi){const mid=(lo+hi)>>1;if(candles[mid].t<=t){best=mid;lo=mid+1}else hi=mid-1}
    return best;
  };
  for(const row of rows){
    if(!Number.isFinite(row.t)||!Number.isFinite(row.usd)||row.usd<=0)continue;
    const index=indexAt(row.t),c=candles[index];
    if(index<0||!c||row.t<c.t||row.t>=c.t+intervalMs)continue;
    const bucket=buckets.get(index)||{index,t:c.t,totalUsd:0,longUsd:0,shortUsd:0,count:0};
    bucket.totalUsd+=row.usd;
    if(row.side==='LONG')bucket.longUsd+=row.usd;else bucket.shortUsd+=row.usd;
    bucket.count+=1;
    buckets.set(index,bucket);
  }
  return[...buckets.values()].sort((a,b)=>a.index-b.index);
};

export type Drawing={id:string,type:string,pts:{t:number,p:number}[],text?:string};

export type Alert={id:string,p:number,kind:'level'|'ray',created:number,fired?:boolean};

const FIB_LEVELS=[0,.236,.382,.5,.618,.786,1] as const;

const FIB_COLORS=['#9ca8b8','#63a7e6','#58be9c','#d5ad58','#e68d58','#cc6f91','#9ca8b8'] as const;

const CHART_THEME={bg:'#131722',scaleBg:'#131722',scaleDivider:'#2b3748',scaleText:'#94a3b8',grid:'rgba(42,46,57,.74)',gridSoft:'rgba(42,46,57,.42)',axis:'#B2B5BE',axisMuted:'#787B86',crosshair:'#758696',divider:'#2A2E39'} as const;

const TF_MS:{[k:string]:number}={'1s':1000,'5s':5000,'15s':15000,'30s':30000,'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000};

const zoneFormatters=new Map<string,Intl.DateTimeFormat>();
const zonePartsCache=new Map<string,{y:number;m:number;d:number;h:number;mi:number;s:number}>();
const zoneParts=(ts:number,tz:string)=>{const key=tz+':'+Math.floor(ts/1000),cached=zonePartsCache.get(key);if(cached)return cached;let formatter=zoneFormatters.get(tz);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});zoneFormatters.set(tz,formatter)}const parts=formatter.formatToParts(ts),o:any={};for(const x of parts)if(x.type!=='literal')o[x.type]=x.value;const result={y:+o.year,m:+o.month,d:+o.day,h:+o.hour,mi:+o.minute,s:+o.second};zonePartsCache.set(key,result);if(zonePartsCache.size>20000)zonePartsCache.delete(zonePartsCache.keys().next().value!);return result};

const zoneDateKey=(ts:number,tz:string)=>{const z=zoneParts(ts,tz);return`${z.y}-${String(z.m).padStart(2,'0')}-${String(z.d).padStart(2,'0')}`};

const zoneDateOffset=(daysAgo:number,tz:string)=>{const z=zoneParts(Date.now(),tz),u=new Date(Date.UTC(z.y,z.m-1,z.d)-daysAgo*86400000);return`${u.getUTCFullYear()}-${String(u.getUTCMonth()+1).padStart(2,'0')}-${String(u.getUTCDate()).padStart(2,'0')}`};

const zonedLocalTs=(date:string,time:string,tz:string)=>{const dm=date.match(/^(\d{4})-(\d{2})-(\d{2})$/),tm=time.match(/^(\d{2}):(\d{2})$/);if(!dm||!tm)return NaN;const want=[+dm[1],+dm[2],+dm[3],+tm[1],+tm[2],0],wantUtc=Date.UTC(want[0],want[1]-1,want[2],want[3],want[4],0);let guess=wantUtc;for(let i=0;i<6;i++){const z=zoneParts(guess,tz),seen=Date.UTC(z.y,z.m-1,z.d,z.h,z.mi,z.s),diff=wantUtc-seen;if(Math.abs(diff)<1000)break;guess+=diff}const final=zoneParts(guess,tz);return final.y===want[0]&&final.m===want[1]&&final.d===want[2]&&final.h===want[3]&&final.mi===want[4]?guess:NaN};

const priceFormatters = new Map<number, Intl.NumberFormat>();
const fmt = (n: number, digits = 2) => {
  if (!Number.isFinite(n)) return '—';
  let formatter = priceFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
    priceFormatters.set(digits, formatter);
  }
  return formatter.format(n);
};

const nicePriceStep=(range:number,plotH:number)=>{const safe=Math.max(Math.abs(range),1e-12),target=Math.max(3,Math.min(14,Math.round(Math.max(120,plotH)/56))),raw=safe/target,pow=Math.pow(10,Math.floor(Math.log10(raw))),norm=raw/pow,nice=norm<=1?1:norm<=2?2:norm<=2.5?2.5:norm<=5?5:10;return nice*pow};

const priceTickDecimals=(step:number)=>{if(!(step>0))return 2;if(step>=1)return Math.abs(step-Math.round(step))<1e-10?0:2;return Math.max(2,Math.min(12,Math.ceil(-Math.log10(step))+1))};

const levelPrice=(n:number)=>formatCryptoPrice(n);

export const roundPriceIncrement=(price:number,roundness=2)=>{
  const magnitude=Math.pow(10,Math.floor(Math.log10(Math.max(Math.abs(price),1e-12))));
  return magnitude*(roundness>=3?.1:roundness===2?.05:.01);
};

export const isRoundPrice=(value:number,_referencePrice:number,_roundness=2)=>{
  if(!Number.isFinite(value)||value===0)return false;
  const abs=Math.abs(value);
  const integer=Math.round(abs);
  const isWhole=Math.abs(abs-integer)<1e-7;
  if(isWhole&&integer%5===0)return true;
  const magnitude=Math.pow(10,Math.floor(Math.log10(abs)));
  const leading=abs/magnitude;
  return leading>=1&&leading<=9&&Math.abs(leading-Math.round(leading))<1e-7;
};

const cascadeRiskLabel=(level:CascadeRisk['level'])=>level==='CRIT'?'Крит.':level==='HIGH'?'Вис.':level==='MED'?'Сер.':'Низ.';

const cascadeRiskFullLabel=(level:CascadeRisk['level'])=>level==='CRIT'?'Критичний':level==='HIGH'?'Високий':level==='MED'?'Середній':'Низький';

const uid=()=>Math.random().toString(36).slice(2);

const load=<T,>(k:string,d:T):T=>{try{return JSON.parse(localStorage.getItem(k)||'')||d}catch{return d}};

export const calcCascadeRisk=(rows:Liquidation[],cut:number,price:number,now=Date.now()):CascadeRisk=>{
  const observed=rows.filter(x=>x.usd>0&&now-x.t>=0&&now-x.t<=300000);
  const lastEventAt=observed.length?Math.max(...observed.map(x=>x.t)):null;
  if(!observed.length)return{
    score:0,level:'LOW',total5:0,count5:0,longUsd:0,shortUsd:0,total1:0,count1:0,
    threshold:Math.max(0,cut||0),observedTotal5:0,observedCount5:0,acceleration:0,hasData:false,lastEventAt,
  };
  const threshold=Math.max(1,cut||quantile(observed.map(x=>x.usd),.75)||1);
  const large5=observed.filter(x=>x.usd>=threshold);
  const large1=large5.filter(x=>now-x.t<=60000);
  const previous4=large5.filter(x=>now-x.t>60000);
  const total5=large5.reduce((a,x)=>a+x.usd,0);
  const total1=large1.reduce((a,x)=>a+x.usd,0);
  const longUsd=large5.filter(x=>x.side==='LONG').reduce((a,x)=>a+x.usd,0);
  const shortUsd=large5.filter(x=>x.side==='SHORT').reduce((a,x)=>a+x.usd,0);
  const observedTotal5=observed.reduce((a,x)=>a+x.usd,0);
  const previous4Usd=previous4.reduce((a,x)=>a+x.usd,0);
  const previousMinuteAverage=previous4Usd/4;
  const acceleration=large1.length?total1/Math.max(threshold,previousMinuteAverage||threshold):0;
  const intensity=Math.min(1,total5/Math.max(threshold*5,1));
  const burst=Math.min(1,total1/Math.max(threshold*2,1));
  const accelScore=Math.min(1,Math.max(0,(acceleration-1)/3));
  const countScore=Math.min(1,large5.length/6);
  const imbalance=total5?Math.abs(longUsd-shortUsd)/total5:0;
  const nearUsd=price>0?large5.filter(x=>Math.abs(x.p-price)/price<=.006).reduce((a,x)=>a+x.usd,0):0;
  const proximity=total5?Math.min(1,nearUsd/Math.max(threshold*2,total5*.35)):0;
  let score=Math.round(100*(.28*intensity+.25*burst+.18*accelScore+.12*countScore+.1*proximity+.07*imbalance));
  if(!large1.length)score=Math.round(score*.55);
  if(!large5.length)score=0;
  // A single large forced order is not a liquidation cascade. Require
  // independent events clustered within 1m before advertising elevated
  // cascade risk; the score remains a heuristic, never an exchange fact.
  if(large1.length<2)score=Math.min(score,33);
  else if(large1.length<3)score=Math.min(score,57);
  score=Math.max(0,Math.min(100,score));
  const level:('LOW'|'MED'|'HIGH'|'CRIT')=score>=78?'CRIT':score>=58?'HIGH':score>=34?'MED':'LOW';
  return{
    score,level,total5,count5:large5.length,longUsd,shortUsd,total1,count1:large1.length,threshold,
    observedTotal5,observedCount5:observed.length,acceleration,hasData:true,lastEventAt,
  };
};

type AutoChannelModel={t0:number,t1:number,c0:number,c1:number,up0:number,up1:number,dn0:number,dn1:number,slope:number,touches:number,sourceTf:string,score:number};

export const buildStructuralChannel=(series:Record<string,Candle[]>,currentPrice=0):AutoChannelModel|null=>{
 type Pivot={kind:'H'|'L';p:number;i:number;t:number;prom:number};
 const tfOrder=['1m','3m','5m','15m','30m','1h','4h','1d'];
 const wantedByTf:Record<string,number>={'5m':360,'15m':340,'1h':300,'4h':240,'1d':180};
 const pivotWindow:Record<string,number>={'5m':5,'15m':5,'1h':4,'4h':3,'1d':2};
 const tfBonus:Record<string,number>={'5m':0,'15m':1.2,'1h':2.6,'4h':3.4,'1d':2.8};
 let globalBest:AutoChannelModel|null=null;
 const cluster=(pts:Pivot[],m:number,tol:number)=>{
   let best:{center:number;members:Pivot[];weight:number}|null=null;
   for(const seed of pts){
     const seedB=seed.p-m*seed.i,members=pts.filter(x=>Math.abs((x.p-m*x.i)-seedB)<=tol);
     if(!members.length)continue;
     const weight=members.reduce((a,x)=>a+(1+Math.min(2.5,x.prom/Math.max(tol,1e-12)))*(0.55+0.45*x.i/Math.max(1,pts.at(-1)?.i||1)),0);
     const center=members.reduce((a,x)=>a+(x.p-m*x.i),0)/members.length;
     if(!best||weight>best.weight)best={center,members,weight};
   }
   return best;
 };
 for(const z of tfOrder){
   const src=series[z]||[];if(src.length<55)continue;
   const len=Math.min(wantedByTf[z]||260,src.length),rows=src.slice(-len),last=rows.at(-1)!;
   const A=Math.max(atr(rows,50),Math.abs(last.c||currentPrice||1)*.00012,1e-12),pw=pivotWindow[z]||3,piv:Pivot[]=[];
   for(let i=pw;i<rows.length-pw;i++){
     const k=rows[i];let hi=true,lo=true;
     for(let j=i-pw;j<=i+pw;j++){if(j===i)continue;if(rows[j].h>=k.h)hi=false;if(rows[j].l<=k.l)lo=false;if(!hi&&!lo)break}
     if(!hi&&!lo)continue;
     const local=rows.slice(Math.max(0,i-pw*2),Math.min(rows.length,i+pw*2+1));
     const med=quantile(local.map(x=>(x.h+x.l+x.c)/3),.5),p=hi?k.h:k.l,prom=Math.abs(p-med);
     if(prom>=A*.22)piv.push({kind:hi?'H':'L',p,i,t:k.t,prom});
   }
   const highs=piv.filter(x=>x.kind==='H').slice(-20),lows=piv.filter(x=>x.kind==='L').slice(-20);
   if(highs.length<2||lows.length<2)continue;
   const minSep=Math.max(8,Math.round(len*.04)),maxSlope=A*.85,slopes:number[]=[];
   const addSlopes=(a:Pivot[])=>{for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const di=a[j].i-a[i].i;if(di<minSep)continue;const m=(a[j].p-a[i].p)/di;if(Number.isFinite(m)&&Math.abs(m)<=maxSlope)slopes.push(m)}};
   addSlopes(highs);addSlopes(lows);
   const recentRows=rows.slice(-Math.min(120,rows.length)),n=recentRows.length,sx=(n-1)*n/2,sy=recentRows.reduce((a,k)=>a+k.c,0),sxx=(n-1)*n*(2*n-1)/6,sxy=recentRows.reduce((a,k,i)=>a+i*k.c,0),den=n*sxx-sx*sx||1,reg=(n*sxy-sx*sy)/den;
   if(Number.isFinite(reg))slopes.push(Math.max(-maxSlope,Math.min(maxSlope,reg)));
   if(!slopes.length)continue;
   slopes.sort((a,b)=>a-b);const uniq:number[]=[];
   for(const m of slopes)if(!uniq.length||Math.abs(m-uniq[uniq.length-1])>A*.025)uniq.push(m);
   let best:any=null;
   for(const m of uniq){
     const baseTol=Math.max(A*.32,Math.abs(last.c)*.00022),hc=cluster(highs,m,baseTol),lc=cluster(lows,m,baseTol);
     if(!hc||!lc||hc.members.length<2||lc.members.length<2)continue;
     let up=hc.center,dn=lc.center;if(up<=dn)continue;
     const width=up-dn;if(width<A*.9||width>A*26)continue;
     const tol=Math.max(baseTol,width*.035),hTouch=highs.filter(x=>Math.abs((x.p-m*x.i)-up)<=tol),lTouch=lows.filter(x=>Math.abs((x.p-m*x.i)-dn)<=tol);
     if(hTouch.length<2||lTouch.length<2)continue;
     const allTouch=[...hTouch,...lTouch],startI=Math.max(0,Math.min(...allTouch.map(x=>x.i))-2),segment=rows.slice(startI),segN=Math.max(1,segment.length);
     let violations=0,severe=0;for(let j=0;j<segment.length;j++){const i=startI+j,k=segment[j],u=up+m*i,d=dn+m*i;if(k.h>u+tol||k.l<d-tol)violations++;if(k.h>u+tol*2.4||k.l<d-tol*2.4)severe++}
     const recentStart=Math.max(startI,len-Math.max(20,Math.round(len*.18))),recentSeg=rows.slice(recentStart);let recentViol=0;for(let j=0;j<recentSeg.length;j++){const i=recentStart+j,k=recentSeg[j],u=up+m*i,d=dn+m*i;if(k.h>u+tol||k.l<d-tol)recentViol++}
     const end=len-1,upperNow=up+m*end,lowerNow=dn+m*end,px=currentPrice||last.c,outside=px>upperNow?px-upperNow:px<lowerNow?lowerNow-px:0;if(outside>A*2.5)continue;
     const lastTouchI=Math.max(...allTouch.map(x=>x.i)),freshness=Math.max(0,1-(end-lastTouchI)/Math.max(18,len*.22)),balance=Math.min(hTouch.length,lTouch.length)/Math.max(hTouch.length,lTouch.length),touchCount=hTouch.length+lTouch.length;
     const violationRate=violations/segN,recentViolationRate=recentViol/Math.max(1,recentSeg.length);if(violationRate>.18||recentViolationRate>.22)continue;
     const normalizedSlope=Math.abs(m)/A,widthAtr=width/A,tooWide=Math.max(0,widthAtr-12),tooFlat=normalizedSlope<.012?.7:0;
     const score=42+Math.min(28,touchCount*4.5)+balance*9+freshness*10+(tfBonus[z]||0)-violationRate*70-recentViolationRate*90-severe*1.5-Math.max(0,outside/A-.35)*8-tooWide*.65-tooFlat;
     if(!best||score>best.score)best={m,up,dn,score,hTouch,lTouch,startI};
   }
   if(!best)continue;
   const ext=z==='5m'?34:z==='15m'?28:z==='1h'?22:z==='4h'?18:12,endI=len-1+ext,startI=best.startI,center=(best.up+best.dn)/2,ms=TF_MS[z]||3600000;
   const candidate:AutoChannelModel={t0:rows[startI].t,t1:rows[len-1].t+ms*ext,c0:center+best.m*startI,c1:center+best.m*endI,up0:best.up+best.m*startI,up1:best.up+best.m*endI,dn0:best.dn+best.m*startI,dn1:best.dn+best.m*endI,slope:best.m,touches:best.hTouch.length+best.lTouch.length,sourceTf:z,score:best.score};
   if(!globalBest||candidate.score>globalBest.score)globalBest=candidate;
 }
 return globalBest;
};

function indicatorIndexAtTime(candles:Candle[],t:number){if(candles.length<2)return 0;if(t<=candles[0].t){const dt=candles[1].t-candles[0].t||1;return(t-candles[0].t)/dt}const n=candles.length-1;if(t>=candles[n].t){const dt=candles[n].t-candles[n-1].t||1;return n+(t-candles[n].t)/dt}let lo=0,hi=n;while(lo+1<hi){const m=(lo+hi)>>1;if(candles[m].t<=t)lo=m;else hi=m}const dt=candles[hi].t-candles[lo].t||1;return lo+(t-candles[lo].t)/dt}

export function IndicatorDock({ids,candles,oi,viewport,rightPadding=0,rightPaddingBars=0,onToggle}:{ids:IndicatorId[],candles:Candle[],oi:{binance:OIPoint[];bybit:OIPoint[]},viewport:Viewport,rightPadding?:number,rightPaddingBars?:number,onToggle:(id:IndicatorId)=>void}){
 const svgId=useId().replace(/:/g,'');
 const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(1000),[hover,setHover]=useState<{id:IndicatorId;t:number}|null>(null);
 const indicatorCache=useRef<{
   candles:Candle[]; oi:{binance:OIPoint[];bybit:OIPoint[]};
   idsKey:string; startI:number; endI:number;
   results:Map<IndicatorId,ReturnType<typeof indicatorData>>;
 }|null>(null);
 const hasIndicators=ids.length>0,hasIndicatorCandles=candles.length>0;
 useEffect(()=>{const el=ref.current;if(!el)return;const update=()=>setWidth(Math.max(HOOKCHART_PRICE_SCALE_WIDTH+40,el.getBoundingClientRect().width||1000));update();const ro=new ResizeObserver(update);ro.observe(el);return()=>ro.disconnect()},[hasIndicators,hasIndicatorCandles]);
 if(!ids.length||!candles.length)return null;
 const AX=HOOKCHART_PRICE_SCALE_WIDTH,plotW=hookChartPlotWidth(width),{step,virtualEnd,virtualStart}=hookChartHorizontalRange(candles.length,plotW,viewport,rightPaddingBars,rightPadding),startI=Math.max(0,Math.floor(virtualStart)-2),endI=Math.min(candles.length,Math.ceil(virtualEnd)+2),startT=candles[startI]?.t??-Infinity,endT=candles[Math.max(startI,endI-1)]?.t??Infinity;
 // Hovering OI updates only its crosshair/labels. Do not recompute every
 // active indicator from hundreds of candles for each pointer movement.
 const idsKey=ids.join(',');
 const cached=indicatorCache.current;
 // An OI-only update must not re-run RSI, MACD, ATR, CMF and other
 // candle indicators; they do not depend on OI. Viewport/candle changes
 // still invalidate the complete visible-range result as before.
 if(!cached||cached.candles!==candles||cached.idsKey!==idsKey||cached.startI!==startI||cached.endI!==endI){
   const calcCandles=candles.slice(Math.max(0,startI-320),endI);
   indicatorCache.current={
     candles,oi,idsKey,startI,endI,
     results:new Map(ids.map(id=>[id,indicatorData(id,calcCandles,oi)] as const)),
   };
 }else if(cached.oi!==oi){
   const results=new Map(cached.results);
   if(ids.includes('oi'))results.set('oi',indicatorData('oi',[],oi));
   indicatorCache.current={...cached,oi,results};
 }
 const computedIndicators=indicatorCache.current!.results;
 const fmtV=(v:number,kind?:string)=>{if(!Number.isFinite(v))return'—';if(kind==='percent')return`${v>=0?'+':''}${fmt(v,2)}%`;if(kind==='compact')return`${v<0?'-':''}${formatUsd(Math.abs(v))}`;if(kind==='usd')return`$${formatUsd(v)}`;if(kind==='price')return fmt(v,Math.abs(v)<1?5:Math.abs(v)<10?4:2);return fmt(v,2)};
 const nearestAt=(values:{t:number;v:number}[],t:number)=>{if(!values.length)return undefined;let lo=0,hi=values.length-1;while(lo<hi){const m=(lo+hi)>>1;if(values[m].t<t)lo=m+1;else hi=m}const a=values[lo],b=lo>0?values[lo-1]:a;return Math.abs(a.t-t)<Math.abs(b.t-t)?a:b};
 return <div className="indicatorDock" ref={ref}>{ids.map(id=>{
  const meta=INDICATOR_META.find(x=>x.id===id)!;
  const data=computedIndicators.get(id)!,rows=data.series.map(z=>({...z,values:z.values.filter(p=>p.t>=startT&&p.t<=endT)})).filter(z=>z.values.length);
  let vals=rows.flatMap(z=>z.values.map(p=>p.v)).filter(Number.isFinite),lo=vals.length?Math.min(...vals):0,hi=vals.length?Math.max(...vals):1;
  if(id==='rsi'||id==='stoch'){lo=0;hi=100}else if(id==='cmf'){lo=Math.min(-.1,lo);hi=Math.max(.1,hi)}else if(id==='vr'){lo=0;hi=Math.max(2,hi)}else{for(const guide of data.guides||[]){lo=Math.min(lo,guide);hi=Math.max(hi,guide)}if(hi===lo){hi+=1;lo-=1}const pad=(hi-lo)*(id==='oi'?.055:.08);lo-=pad;hi+=pad}
  const W=Math.max(HOOKCHART_PRICE_SCALE_WIDTH+40,width),H=id==='oi'?112:92,L=0,R=AX,T=id==='oi'?22:18,B=10,innerW=hookChartPlotWidth(W),plotH=H-T-B,x=(t:number)=>L+(indicatorIndexAtTime(candles,t)-virtualStart+.5)*step,y=(v:number)=>T+(hi-v)/(hi-lo)*plotH;
  const compactValues=(values:{t:number;v:number}[])=>{if(step>=1||values.length<=innerW*1.5)return values;const out:{t:number;v:number}[]=[],seen=new Map<number,number>();for(const p of values){const px=Math.max(0,Math.min(Math.floor(innerW),Math.round(x(p.t))));const at=seen.get(px);if(at==null){seen.set(px,out.length);out.push(p)}else out[at]=p}return out};
  const linePath=(values:{t:number;v:number}[])=>compactValues(values).map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  const latest=rows.map(r=>({name:r.name,v:r.values.at(-1)?.v})).filter(z=>Number.isFinite(z.v));
  const hoverT=hover?.id===id?hover.t:null;
  const shown=hoverT!=null?rows.map(r=>({name:r.name,v:nearestAt(r.values,hoverT)?.v})).filter(z=>Number.isFinite(z.v)):latest;
  const totalRow=id==='oi'?rows.find(r=>r.name==='Σ'):undefined,totalLast=totalRow?.values.at(-1),totalShown=hoverT!=null&&totalRow?nearestAt(totalRow.values,hoverT):totalLast;
  const oiValues=totalRow?compactValues(totalRow.values):[],oiArea=oiValues.length>1?`${oiValues.map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ')} L${x(oiValues.at(-1)!.t).toFixed(2)},${(H-B).toFixed(2)} L${x(oiValues[0].t).toFixed(2)},${(H-B).toFixed(2)} Z`:'';
  const oiTicks=id==='oi'?[hi,(hi+lo)/2,lo]:[],seriesClass=(name:string,si:number)=>id==='oi'?(name==='Σ'?'series-total':name==='BIN'?'series-bin':'series-byb'):`series-${si}`;
  const pointerMove=(e:React.PointerEvent<SVGSVGElement>)=>{if(id!=='oi')return;const rect=e.currentTarget.getBoundingClientRect(),px=(e.clientX-rect.left)/Math.max(1,rect.width)*W;if(px<0||px>W){setHover(null);return}const idx=virtualStart+(px-L)/step-.5,ci=Math.max(0,Math.min(candles.length-1,Math.round(idx)));setHover({id,t:candles[ci].t})};
  const markerY=totalLast?Math.max(T+8,Math.min(H-B-8,y(totalLast.v))):0;
  return <div className={`indicatorPanel${id==='oi'?' oiPanel':''}`} key={id}>
   <div className="indicatorPanelHead">
    <b>{meta.name}{id==='oi'&&<i> · USD</i>}</b>
    {id==='oi'&&totalLast&&<small className="indicatorLiveBadge">OI</small>}
    <span>{meta.description}</span>
    <div className="indicatorLatest">{shown.map((z,i)=><em key={z.name} className={seriesClass(z.name,i)}>{z.name} {fmtV(z.v!,data.format)}</em>)}</div>
    <button title="Прибрати індикатор" onClick={()=>onToggle(id)}>×</button>
   </div>
   <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={meta.name} onPointerMove={pointerMove} onPointerLeave={()=>id==='oi'&&setHover(null)}>
    <defs>{id==='oi'&&<linearGradient id={`${svgId}-oi-total-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2962FF" stopOpacity=".18"/><stop offset="100%" stopColor="#2962FF" stopOpacity="0"/></linearGradient>}</defs>
    <clipPath id={`${svgId}-ind-clip-${id}`}><rect x={L} y={0} width={innerW} height={H}/></clipPath>
    <g clipPath={`url(#${svgId}-ind-clip-${id})`}>
     {id==='oi'?oiTicks.map((g,i)=><line key={'oit'+i} x1={L} x2={W} y1={y(g)} y2={y(g)} className="oiGrid"/>):(data.guides||[]).filter(g=>g>=lo&&g<=hi).map((g,i)=><line key={'g'+i} x1={L} x2={W} y1={y(g)} y2={y(g)} className="indicatorGuide"/>)}
     {id==='oi'&&oiArea&&<path d={oiArea} className="oiArea" style={{fill:`url(#${svgId}-oi-total-fill)`}}/>}
     {rows.map((r,si)=>r.kind==='bar'?<g key={r.name} className={`indicatorBars series-${si}`}>{compactValues(r.values).map((p,i,vis)=>{const next=vis[i+1],prev=vis[i-1],nextX=next?x(next.t):x(p.t)+(prev?x(p.t)-x(prev.t):Math.max(1,step)),bw=Math.max(1.4,Math.min(8,(nextX-x(p.t))*.72||3)),yy=y(p.v),zero=y(Math.max(lo,Math.min(hi,0)));return <rect key={`${r.name}-${p.t}`} x={x(p.t)-bw/2} y={Math.min(yy,zero)} width={bw} height={Math.max(.7,Math.abs(zero-yy))} className={p.v>=0?'pos':'neg'}/>})}</g>:<React.Fragment key={r.name}><path d={linePath(r.values)} className={`indicatorLine ${seriesClass(r.name,si)}`}/>{id==='oi'&&r.values.length>0&&(()=>{const lp=r.values.at(-1)!;return <circle cx={x(lp.t)} cy={y(lp.v)} r={r.name==='Σ'?2.8:1.9} className={`indicatorLiveDot ${seriesClass(r.name,si)}`}/>})()}</React.Fragment>)}
     {id==='oi'&&hoverT!=null&&<><line x1={x(hoverT)} x2={x(hoverT)} y1={T} y2={H-B} className="oiCrosshair"/>{totalShown&&<line x1={L} x2={W} y1={y(totalShown.v)} y2={y(totalShown.v)} className="oiCrosshair horizontal"/>}</>}
    </g>
    {id==='oi'?oiTicks.map((g,i)=><text key={'oia'+i} x={W-R+2} y={Math.max(10,Math.min(H-4,y(g)+3))} textLength={Math.min(R-4,fmtV(g,data.format).length*5)} lengthAdjust="spacingAndGlyphs" className="indicatorAxis">{fmtV(g,data.format)}</text>):<><text x={W-R+2} y={T+8} textLength={Math.min(R-4,fmtV(hi,data.format).length*5)} lengthAdjust="spacingAndGlyphs" className="indicatorAxis">{fmtV(hi,data.format)}</text><text x={W-R+2} y={H-B} textLength={Math.min(R-4,fmtV(lo,data.format).length*5)} lengthAdjust="spacingAndGlyphs" className="indicatorAxis">{fmtV(lo,data.format)}</text></>}
    {id==='oi'&&totalLast&&<g className="oiLastValue"><rect x={W-R+2} y={markerY-8} width={R-4} height={16} rx={2}/><text x={W-R+3} y={markerY+3} textLength={Math.min(R-6,fmtV(totalLast.v,data.format).length*5)} lengthAdjust="spacingAndGlyphs">{fmtV(totalLast.v,data.format)}</text></g>}
   </svg>
  </div>
 })}</div>
}

export type { CrosshairPosition } from './crosshairState';

export function ChartTimeAxis({candles,tf,timezone,language='uk',viewport,rightPadding=0,rightPaddingBars=0,countdownRef,crosshair}:{candles:Candle[],tf:string,timezone:string,language?:SupportedLanguage,viewport:Viewport,rightPadding?:number,rightPaddingBars?:number,countdownRef?:React.Ref<HTMLDivElement>,crosshair?:ChartCrosshairStore}){
 const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(1000);
 useEffect(()=>{const el=ref.current;if(!el)return;const update=()=>setWidth(Math.max(HOOKCHART_PRICE_SCALE_WIDTH+40,el.getBoundingClientRect().width||1000));update();const ro=new ResizeObserver(update);ro.observe(el);return()=>ro.disconnect()},[]);
 const barMs=TF_MS[tf]||300000;
 const {timeFmt,dateFmt,monthFmt,yearFmt}=useMemo(()=>({
  timeFmt:new Intl.DateTimeFormat(language,{timeZone:timezone,hour:'2-digit',minute:'2-digit',...(barMs<60000?{second:'2-digit' as const}:{}),hour12:false}),
  dateFmt:new Intl.DateTimeFormat(language,{timeZone:timezone,day:'numeric',month:'short'}),
  monthFmt:new Intl.DateTimeFormat(language,{timeZone:timezone,month:'short'}),
  yearFmt:new Intl.DateTimeFormat(language,{timeZone:timezone,year:'numeric'}),
 }),[timezone,language,barMs]);
 if(!candles.length)return <div className="chartTimeAxis" ref={ref}/>;
 const AX=HOOKCHART_PRICE_SCALE_WIDTH,plotW=hookChartPlotWidth(width),{step,virtualEnd,virtualStart}=hookChartHorizontalRange(candles.length,plotW,viewport,rightPaddingBars,rightPadding),startI=Math.max(0,Math.floor(virtualStart)-3),endI=Math.min(candles.length,Math.ceil(virtualEnd)+3);

 const targetPx=step>=18?86:step>=10?76:68,desiredMs=Math.max(barMs,barMs*Math.max(1,targetPx/step)),niceIntervals=[1000,5000,15000,30000,60_000,5*60_000,15*60_000,30*60_000,60*60_000,2*60*60_000,4*60*60_000,6*60*60_000,12*60*60_000,24*60*60_000,2*24*60*60_000,7*24*60*60_000,14*24*60*60_000,30*24*60*60_000,90*24*60*60_000,180*24*60*60_000,365*24*60*60_000],regularMs=niceIntervals.find(v=>v>=desiredMs)??niceIntervals.at(-1)!;
 const wallMs=(t:number)=>{const z=zoneParts(t,timezone);return Date.UTC(z.y,z.m-1,z.d,z.h,z.mi,barMs<60000?z.s:0)},labelWidth=(label:string,major:boolean)=>Math.max(major?40:34,label.length*(major?6.5:6.1)+8);
 type Tick={x:number,label:string,major:boolean,priority:number,align:'left'|'center'|'right',l:number,r:number};const candidates:Tick[]=[],labelRight=plotW;
 const scanStride=viewport.fitAll?Math.max(1,Math.floor(Math.max(1,endI-startI)/Math.max(240,plotW*2))):1;for(let gi=startI;gi<endI;gi+=scanStride){const k=candles[gi],x=(gi-virtualStart+.5)*step;if(x<1||x>plotW-1)continue;const prevI=Math.max(0,gi-scanStride),z=zoneParts(k.t,timezone),prev=gi>0?zoneParts(candles[prevI].t,timezone):null;let priority=0,label='',major=false;
  if(prev&&z.y!==prev.y){priority=4;label=yearFmt.format(k.t);major=true}
  else if(prev&&z.m!==prev.m){priority=3;label=monthFmt.format(k.t);major=true}
  else if(barMs<86400000&&prev&&(z.d!==prev.d||z.m!==prev.m||z.y!==prev.y)){priority=2;label=dateFmt.format(k.t);major=true}
  else{const prevWall=gi>0?wallMs(candles[prevI].t):wallMs(k.t)-barMs,curBucket=Math.floor(wallMs(k.t)/regularMs),prevBucket=Math.floor(prevWall/regularMs);if(curBucket!==prevBucket){priority=1;label=barMs>=86400000?dateFmt.format(k.t):timeFmt.format(k.t)}}
  if(!priority)continue;const w=labelWidth(label,major),edge=5;let align:'left'|'center'|'right'='center',l=x-w/2,r=x+w/2;if(l<edge){align='left';l=x+4;r=l+w}else if(r>labelRight-edge){align='right';r=x-4;l=r-w}if(l<edge||r>labelRight-edge)continue;candidates.push({x,label,major,priority,align,l,r})
 }
 const accepted:Tick[]=[];for(const priority of [4,3,2,1]){for(const c of candidates.filter(x=>x.priority===priority).sort((a,b)=>a.x-b.x)){if(accepted.some(a=>c.l<a.r+10&&c.r>a.l-10))continue;accepted.push(c)}}accepted.sort((a,b)=>a.x-b.x);
 return <div className="chartTimeAxis" ref={ref}><div className="chartTimePlot" style={{width:plotW}}>{accepted.map((t,i)=><div key={`${t.x}-${i}`} className={`chartTimeTick ${t.major?'major ':''}align-${t.align}`} style={{left:t.x}}><i/><span>{t.label}</span></div>)}{crosshair&&<CrosshairTimeLabel store={crosshair} plotWidth={plotW} timezone={timezone} language={language} seconds={barMs<60000}/>}</div><div className="chartTimeScaleSpacer" ref={countdownRef} style={{width:AX}} aria-hidden={countdownRef?undefined:true}/></div>
}

// The time axis uses horizontal viewport geometry only. Vertical price scale
// gestures must not make it rescan history or rebuild time labels.
// Horizontal pan/zoom and time-data changes still rebuild it normally.
export const MemoChartTimeAxis=React.memo(ChartTimeAxis,sameTimeAxisInputs);

export type Viewport={barWidth:number;rightOffset:number;autoY:boolean;manualCenter:number|null;manualRange:number|null;fitAll?:boolean;yZoom?:number;candleFit?:boolean};
export type ViewportGesture='pan'|'zoom'|'price'|'focus';

export function Chart({candles,symbol,tf,interactionScope,tool,drawings,setDrawings,alerts,setAlerts,onCreatePriceAlert,onSelectPriceAlert,densities,marketPrints,liquidations,autoLevels,levelLabelMode,levelLabelColor='#2090F0',levelLabelSize=9,levelLineWidth=.3,levelLabelStyle='text',levelLineStyle='solid',crosshairLineWidth=DEFAULT_CROSSHAIR_LINE_WIDTH,maxCanvasDpr=DEFAULT_MAX_CANVAS_DPR,horizontalDrawingLineWidth=0.4,trendDrawingLineWidth=0.4,scalperLineWidth=0.4,rightPadding=0,rightPaddingBars=0,roundGrid=false,roundness=2,gridHorizontal=false,gridVertical=false,showMarketPrintSums=false,showMarketPrintArrows=true,marketPrintArrowSize=4,marketPrintFontSize=10,marketPrintMinUsd=0,showVolumes=true,showLiquidations=true,showLiquidationCandleSums=true,showLiquidationDetailSums=true,showLiquidationArrows=true,liquidationArrowSize=5,liquidationSumFontSize=10,liquidationDetailFontSize=9,showLiquidationLong=true,showLiquidationShort=true,sessionLiquidationsUsd=0,cascadeRisk,liquidationCut=0,liquidationSource='',liquidationStreamLive=false,liquidationLastEventAt=null,liquidationHeatmap=null,modeledLiquidationBands=null,timezone='Europe/Warsaw',language='uk',showDensityLines=true,showDensityLabels=true,showDensityAmounts=true,highlightDensityReaction=false,autoSR=false,showSRLabels=true,autoPrevDay=false,autoDayOpen=false,autoVWAP=false,autoLocalHL=false,autoRoundLevels=false,autoPOC=false,autoChannel=false,autoStops=false,showLiqRiskBlock=true,liquidationHudOwner,channelModel=null,strategyResult=null,scalperResult=null,marketRecurrenceMarks=[],scalperLineStyle='auto',showScalperTouchPoints=true,showScalperLabels=true,hideTimeJump=false,hideBarCountdown=hideTimeJump,controlsContainer,countdownContainer,candleLongColor='#0ECB81',candleShortColor='#F6465D',densityLineColor='#7B61FF',densityLabelColor='#C4B5FD',densityLineWidth=.5,densityLineStyle='solid',densityLabelSize=8,onViewportChange,onViewportGesture,onCrosshairChange,onCrosshairPriceChange,onNeedHistory,markers=[],timeMarkers=[],splitVolumes=false,transientRuler=false,backgroundColor=CHART_THEME.bg,gridColor,controlRef,initialViewport,initialLogicalRange,archivedOverlayScene,densityReferenceTime,visualProfile,visualProfileKey,visualProfileCaptureVersion=0,terminalMode=false,terminalAutoScale=false,terminalHistoryReady=false,terminalFitAllRequest=0,formationAutoScale=false,keyboardMagnifierActive=false,expandPriceScaleToMarkers=false,focusFormation,textLabel='Нотатка'}:{candles:Candle[],symbol:string,tf:string,interactionScope?:string,tool:string,drawings:Drawing[],setDrawings:React.Dispatch<React.SetStateAction<Drawing[]>>,alerts:Alert[],setAlerts:React.Dispatch<React.SetStateAction<Alert[]>>,onCreatePriceAlert?:(price:number)=>void,onSelectPriceAlert?:(markerId:string,action?:'edit'|'delete')=>void,densities:Density[],marketPrints:MarketPrint[],liquidations:Liquidation[],autoLevels:AutoLevel[],levelLabelMode:'always'|'hover'|'off',levelLabelColor?:string,levelLabelSize?:number,levelLineWidth?:number,levelLabelStyle?:'text'|'filled'|'outline',levelLineStyle?:'solid'|'dash'|'dot',crosshairLineWidth?:number,maxCanvasDpr?:number,horizontalDrawingLineWidth?:number,trendDrawingLineWidth?:number,scalperLineWidth?:number,rightPadding?:number,rightPaddingBars?:number,roundGrid?:boolean,roundness?:number,gridHorizontal?:boolean,gridVertical?:boolean,showMarketPrintSums?:boolean,showMarketPrintArrows?:boolean,marketPrintArrowSize?:number,marketPrintFontSize?:number,marketPrintMinUsd?:number,showVolumes?:boolean,showLiquidations?:boolean,showLiquidationCandleSums?:boolean,showLiquidationDetailSums?:boolean,showLiquidationArrows?:boolean,liquidationArrowSize?:number,liquidationSumFontSize?:number,liquidationDetailFontSize?:number,showLiquidationLong?:boolean,showLiquidationShort?:boolean,sessionLiquidationsUsd?:number,cascadeRisk:CascadeRisk,liquidationCut?:number,liquidationSource?:string,liquidationStreamLive?:boolean,liquidationLastEventAt?:number|null,liquidationHeatmap?:LiquidationHeatmapChartData|null,modeledLiquidationBands?:readonly HistoricalRecurrenceBand[]|null,timezone?:string,language?:SupportedLanguage,showDensityLines?:boolean,showDensityLabels?:boolean,showDensityAmounts?:boolean,highlightDensityReaction?:boolean,autoSR?:boolean,showSRLabels?:boolean,autoPrevDay?:boolean,autoDayOpen?:boolean,autoVWAP?:boolean,autoLocalHL?:boolean,autoRoundLevels?:boolean,autoPOC?:boolean,autoChannel?:boolean,autoStops?:boolean,showLiqRiskBlock?:boolean,liquidationHudOwner?:string,channelModel?:AutoChannelModel|null,strategyResult?:StrategyResult|null,scalperResult?:ScalperScene|null,marketRecurrenceMarks?:readonly MarketRecurrenceMark[],scalperLineStyle?:ScalperLineStyle,showScalperTouchPoints?:boolean,showScalperLabels?:boolean,hideTimeJump?:boolean,hideBarCountdown?:boolean,controlsContainer?:HTMLElement|null,countdownContainer?:HTMLElement|null,candleLongColor?:string,candleShortColor?:string,densityLineColor?:string,densityLabelColor?:string,densityLineWidth?:number,densityLineStyle?:'solid'|'dash'|'dot',densityLabelSize?:number,onViewportChange?:(v:Viewport)=>void,onViewportGesture?:(v:Viewport,kind:ViewportGesture)=>void,onCrosshairChange?:(position:CrosshairPosition|null)=>void,onCrosshairPriceChange?:(price:number)=>void,onNeedHistory?:(targetTs:number)=>Promise<boolean>;markers?:ChartMarkerInfo[];timeMarkers?:HookTimeMarker[];splitVolumes?:boolean;transientRuler?:boolean;backgroundColor?:string;gridColor?:string;controlRef?:React.Ref<HookChartHandle>;initialViewport?:Viewport;initialLogicalRange?:{from:number;to:number};archivedOverlayScene?:ArchivedAutoOverlayScene;densityReferenceTime?:number;visualProfile?:VisualChartProfile;visualProfileKey?:string;visualProfileCaptureVersion?:number;terminalMode?:boolean;terminalAutoScale?:boolean;terminalHistoryReady?:boolean;terminalFitAllRequest?:number;formationAutoScale?:boolean;keyboardMagnifierActive?:boolean;expandPriceScaleToMarkers?:boolean;focusFormation?:DetectedFormation|null;textLabel?:string}){
 const ref=useRef<HTMLCanvasElement>(null),interactionRef=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null);
 // One cache per chart. It is invalidated by new immutable candles or a viewport change.
 const autoPocCache = useRef(createAutoPocZoneCache());
 // Reuse price bins on pointer movement; screen coordinates still update.
 const volumeProfileCache = useMemo(createVolumeProfileHistogramCache, []);
 // Pan/zoom often moves by a few pixels without entering another candle.
 // Retain the same visible rows and OHLC extremes until the bar range changes.
 const visibleWindowCache = useMemo(()=>createChartVisibleWindowCache<Candle>(), []);
 // Only the painted representation is deduplicated. Underlying markers
 // still contain Entry and the neckline separately for TP/SL and archives.
 const paintedMarkers = useMemo(() => coalesceNecklinePriceMarkers(markers), [markers]);
 const [vp,setVp]=useState<Viewport>(()=>initialViewport||{barWidth:9,rightOffset:0,autoY:true,manualCenter:null,manualRange:null,fitAll:false});
 const visualAppliedRef=useRef<string|null>(null);
 // Do not override a user's pan/zoom if full history lands after interaction.
 const viewportAdjustedByUserRef=useRef(false);
 // A manual drag/wheel on the price axis temporarily takes priority over
 // Terminal's global auto-fit, without changing the shared account setting.
 // Restore automatic price fitting on an explicit reset/re-enable.
 const manualPriceAxisOverride=useRef(false);
 // A deliberate fit-to-history view belongs to one coin/exchange/timeframe.
 const fitAllScopeRef=useRef<string|null>(null);
 const lastTerminalFitAllRequestRef=useRef<{request:number;scope:string}|null>(null);
 const fitAllScopeKey=`${interactionScope||symbol}:${tf}`;
 const lastVisualCaptureRef=useRef(visualProfileCaptureVersion);
 const lastVisualGapRef=useRef(rightPaddingBars);
 const [visualCanvasWidth,setVisualCanvasWidth]=useState(0);
 const gestureKindRef=useRef<ViewportGesture|null>(null);
 // The shared axis / indicator panels need the latest viewport at display
 // frequency, not one parent React commit per high-rate pointer event.
 const viewportNotifier=useMemo(()=>createChartViewportNotifier<Viewport,ViewportGesture>(),[]);
 const setGestureVp=(update:React.SetStateAction<Viewport>,kind:ViewportGesture)=>{
   if(kind!=='focus')fitAllScopeRef.current=null;
   gestureKindRef.current=kind;
   if(kind==='price')manualPriceAxisOverride.current=true;
   viewportAdjustedByUserRef.current=true;
   setVp(update);
 };
 // A high-rate pointer stream can deliver several drag events before one
 // display frame. Only the FINAL absolute gesture position is needed: it is
 // anchored to the pointer-down viewport, not the preceding pointer event.
 // Keep wheel/button zoom immediate and preserve the full-fidelity Canvas DPR.
 const pendingTerminalPointerGesture=useRef<{update:React.SetStateAction<Viewport>;kind:ViewportGesture}|null>(null);
 const terminalPointerGestureFrame=useRef<number|null>(null);
 const flushTerminalPointerGesture=()=>{
   if(terminalPointerGestureFrame.current!==null){
     window.cancelAnimationFrame(terminalPointerGestureFrame.current);
     terminalPointerGestureFrame.current=null;
   }
   const pending=pendingTerminalPointerGesture.current;
   pendingTerminalPointerGesture.current=null;
   if(pending)setGestureVp(pending.update,pending.kind);
 };
 const schedulePointerGestureVp=(update:React.SetStateAction<Viewport>,kind:ViewportGesture)=>{
   if(!terminalMode){setGestureVp(update,kind);return}
   // Preserve manual price-scale priority even before React commits the frame.
   if(kind==='price')manualPriceAxisOverride.current=true;
   viewportAdjustedByUserRef.current=true;
   pendingTerminalPointerGesture.current={update,kind};
   if(terminalPointerGestureFrame.current!==null)return;
   terminalPointerGestureFrame.current=window.requestAnimationFrame(()=>{
     terminalPointerGestureFrame.current=null;
     const pending=pendingTerminalPointerGesture.current;
     pendingTerminalPointerGesture.current=null;
     if(pending)setGestureVp(pending.update,pending.kind);
   });
 };
 useEffect(()=>()=>{ // A removed or replaced chart must never apply an old gesture.
   if(terminalPointerGestureFrame.current!==null)
     window.cancelAnimationFrame(terminalPointerGestureFrame.current);
   terminalPointerGestureFrame.current=null;
   pendingTerminalPointerGesture.current=null;
 },[fitAllScopeKey]);
 useEffect(()=>{
   const kind=gestureKindRef.current;
   gestureKindRef.current=null;
   const notification={viewport:vp,kind,onChange:onViewportChange,onGesture:onViewportGesture};
   if(kind&&kind!=='focus')viewportNotifier.request(notification);
   else viewportNotifier.flush(notification);
 },[vp,onViewportChange,onViewportGesture,viewportNotifier]);
 useEffect(()=>()=>viewportNotifier.cancel(),[viewportNotifier]);
 // Request older exchange candles only when a user approaches the left edge.
 // Do not prefetch every Terminal card: up to 50 charts may be mounted.
 const olderHistoryAttempt = useRef<{ key:string; at:number; pending:boolean } | null>(null);
 const oldestCandleTime=candles[0]?.t,loadedCandleCount=candles.length;
 useEffect(()=>{
   if(!onNeedHistory||oldestCandleTime===undefined||!loadedCandleCount||vp.fitAll)return;
   const width=ref.current?.getBoundingClientRect().width||0;
   if(width<=0)return;
   const visibleBars=hookChartPlotWidth(width)/Math.max(.12,vp.barWidth);
   if(loadedCandleCount-vp.rightOffset-visibleBars>25)return;
   const oldestTime=oldestCandleTime;
   const key=`${interactionScope||symbol}:${tf}:${oldestTime}`;
   const previous=olderHistoryAttempt.current;
   if(previous?.key===key&&(previous.pending||Date.now()-previous.at<15_000))return;
   olderHistoryAttempt.current={key,at:Date.now(),pending:true};
   void onNeedHistory(oldestTime-1).catch(()=>false).finally(()=>{
     if(olderHistoryAttempt.current?.key===key)olderHistoryAttempt.current.pending=false;
   });
 },[oldestCandleTime,loadedCandleCount,symbol,tf,interactionScope,vp.rightOffset,vp.barWidth,vp.fitAll,onNeedHistory]);
 const terminalNavigation=useRef(false),terminalFocusKey=useRef<string|null>(null);
 const autoFollowCandleRef=useRef<string|null>(null);
 const lastCandleTime=candles.at(-1)?.t;
 // Render-time refs keep the latest geometry without refitting per live tick.
 const hasVisualProfile=Boolean(visualProfile),hasHistoryCandles=candles.length>0;
 const visualProfileRef=useRef(visualProfile);
 visualProfileRef.current=visualProfile;
 const latestViewportInputs=useRef({candles,focusFormation});
 latestViewportInputs.current={candles,focusFormation};
 const profileVisibleBars=visualProfile?.visibleBars;
 const profileZoom=visualProfile?.verticalZoom;
 const profileAutoPrice=visualProfile?.autoPriceScale;
 const profileRightGap=visualProfile?.rightGapBars;
 const wasTerminalAutoScaleEnabled=useRef(terminalAutoScale);
 useEffect(()=>{
   // Switching auto-fit ON is an explicit request to restore automatic prices.
   if(terminalAutoScale&&!wasTerminalAutoScaleEnabled.current)
     manualPriceAxisOverride.current=false;
   wasTerminalAutoScaleEnabled.current=terminalAutoScale;
 },[terminalAutoScale]);
 // Follow new candles without polling, touching feeds, or recalculating all blocks.
 useEffect(()=>{
   if(!terminalAutoScale){autoFollowCandleRef.current=null;return}
   if(lastCandleTime===undefined)return;
   const key=`${interactionScope||symbol}:${tf}:${lastCandleTime}`;
   if(autoFollowCandleRef.current===key)return;
   autoFollowCandleRef.current=key;
   terminalNavigation.current=true;
   setVp(previous=>{
     if(previous.fitAll&&fitAllScopeRef.current===fitAllScopeKey)return previous;
     // Keep manual price-axis zoom during candle rollover. Only the time
     // position continues auto-following; manual price zoom stays chart-local.
     const keepManualPrice=manualPriceAxisOverride.current&&!previous.autoY
       &&previous.manualCenter!==null&&previous.manualRange!==null;
     if(keepManualPrice)return previous.rightOffset===0&&!previous.fitAll
       ?previous:{...previous,rightOffset:0,fitAll:false};
     return previous.rightOffset===0&&previous.autoY&&previous.manualCenter===null&&previous.manualRange===null&&!previous.fitAll&&(previous.yZoom??1)===1
       ?previous:{...previous,rightOffset:0,autoY:true,manualCenter:null,manualRange:null,fitAll:false,yZoom:1};
   });
 },[terminalAutoScale,symbol,tf,interactionScope,lastCandleTime,fitAllScopeKey]);
 useEffect(()=>{if(!hasVisualProfile){visualAppliedRef.current=null;if(terminalMode&&!terminalAutoScale) terminalNavigation.current=false}},[hasVisualProfile,terminalMode,terminalAutoScale]);
 // Profile editing may finish while the canvas is hidden or has zero width
 // (tabs, fullscreen transitions, Terminal cards). Reapply when measurable.
 // ResizeObserver runs on geometry changes only; no extra market requests.
 useLayoutEffect(()=>{
   if(!hasVisualProfile||!visualProfileKey||typeof ResizeObserver==='undefined')return;
   const canvas=ref.current;
   if(!canvas)return;
   const update=()=>{
     const measured=Math.round(canvas.getBoundingClientRect().width);
     if(measured>0)setVisualCanvasWidth(previous=>previous===measured?previous:measured);
   };
   update();
   const observer=new ResizeObserver(update);
   observer.observe(canvas);
   return()=>observer.disconnect();
 },[hasVisualProfile,visualProfileKey]);
 const rangeRestored=useRef(false);
 const focusFormationId=focusFormation?.id;
 useLayoutEffect(()=>{
   if(!terminalMode||hasVisualProfile||!hasHistoryCandles||initialLogicalRange)return;
   const key=focusFormationId||'latest';
   if(terminalFocusKey.current!==key){terminalFocusKey.current=key;terminalNavigation.current=false}
   const canvas=ref.current;if(!canvas)return;
   const fit=()=>{
     const width=canvas.getBoundingClientRect().width;
     if(width>0&&!terminalNavigation.current) {
       const {candles: latestCandles,focusFormation: latestFocus}=latestViewportInputs.current;
       setVp(terminalHookViewport(latestCandles,hookChartPlotWidth(width),latestFocus,rightPaddingBars));
     }
   };
   fit();const observer=new ResizeObserver(fit);observer.observe(canvas);
   return()=>observer.disconnect();
 },[terminalMode,hasVisualProfile,hasHistoryCandles,focusFormationId,initialLogicalRange,rightPaddingBars]);
 // Apply only on profile changes, first data load, or the initial history arrival.
 // Replay passes no visualProfile, so its original viewport logic is untouched.
 const terminalHistoryPhase=terminalViewportHistoryPhase(tf,candles.length,
   terminalMode||!!visualProfileKey?.startsWith('terminal'),terminalHistoryReady);
 useLayoutEffect(()=>{
   const profile=visualProfileRef.current,latestCandles=latestViewportInputs.current.candles;
   if(!profile||!visualProfileKey||!latestCandles.length)return;
   const width=ref.current?.getBoundingClientRect().width||0;
   if(width<=0)return;
   // Include the coin and timeframe: switching markets must restore the
   // selected profile even when its numeric settings have not changed.
   const profilePrefix=[interactionScope||symbol,symbol,tf,visualProfileKey,profile.visibleBars,profile.verticalZoom,profile.autoPriceScale,profile.rightGapBars,terminalAutoScale].join(':');
   const historyPhase=terminalHistoryPhase;
   const signature=`${profilePrefix}:${historyPhase}:${Math.round(width)}`;
   // Saving a gesture-edited preview must preserve its exact viewport, rather
   // than rerunning initial preset placement and jumping back.
   if(lastVisualCaptureRef.current!==visualProfileCaptureVersion){
     lastVisualCaptureRef.current=visualProfileCaptureVersion;
     visualAppliedRef.current=signature;
     // During gesture capture, preserve candle positions when the empty
     // right-hand slots are converted into a saved profile value.
     const gapDelta=rightPaddingBars-lastVisualGapRef.current;
     lastVisualGapRef.current=rightPaddingBars;
     if(gapDelta)setVp(current=>({...current,rightOffset:current.rightOffset+gapDelta}));
     return;
   }
   if(visualAppliedRef.current===signature)return;
   // A resize changes the available pixels, not the user's fit-all choice.
   // A changed coin, TF or saved preset must still restore its own profile.
   const oldSignature=visualAppliedRef.current;
   // A late historical batch needs a second price fit for saved manual zoom.
   // Keep an intentional pan/zoom (or show-all-history mode) untouched.
   if(oldSignature?.startsWith(`${profilePrefix}:seed:`)&&historyPhase==='ready'&&
      viewportAdjustedByUserRef.current){
     visualAppliedRef.current=signature;
     return;
   }
   if(fitAllScopeRef.current===fitAllScopeKey&&oldSignature&&
      oldSignature.startsWith(`${profilePrefix}:`)&&
      lastVisualCaptureRef.current===visualProfileCaptureVersion){
     visualAppliedRef.current=signature;
     return;
   }
   fitAllScopeRef.current=null;
   visualAppliedRef.current=signature;
   lastVisualGapRef.current=rightPaddingBars;
   terminalNavigation.current=true;
   const plotWidth=hookChartPlotWidth(width);
   // A saved request for hundreds of visible latestCandles needs sub-3px bars.
   // The canvas already uses aggregated rasterization for tiny bar widths.
   const minBar=.12;
   // Fit the requested number of latestCandles AND the right-hand empty slots.
   // Previously a 144-candle view + an 81-bar gap displayed only ~63 latestCandles.
   const visibleSlots=Math.max(1,profile.visibleBars+Math.max(0,rightPaddingBars));
   const barWidth=Math.max(minBar,Math.min(34,plotWidth/visibleSlots));
   const count=Math.max(1,Math.min(latestCandles.length,Math.ceil(profile.visibleBars)));
   const recent=latestCandles.slice(-count);
   let low=Infinity,high=-Infinity;
   for(const candle of recent){low=Math.min(low,candle.l);high=Math.max(high,candle.h)}
   const spread=Number.isFinite(low)&&Number.isFinite(high)?Math.max(high-low,Math.abs(high)*.01,1e-10):1;
   const center=Number.isFinite(high)&&Number.isFinite(low)?(high+low)/2:1;
   const priceAuto=terminalAutoScale||profile.autoPriceScale;
   // Restore the saved Terminal profile when auto-scale turns OFF. Extreme
   // manual zoom must not clip visible wicks or overlap the volume band.
   const terminalManualProfile=!priceAuto&&(terminalMode||visualProfileKey.startsWith('terminal'));
   const manualPrice=terminalManualProfile&&Number.isFinite(low)&&Number.isFinite(high)
     ? terminalSafeManualPriceViewport(low,high,Math.max(40,ref.current?.getBoundingClientRect().height||80),
         showVolumes,profile.verticalZoom)
     : null;
   setVp({
     // The Graph-tab rightGapBars is applied exactly once by rightPaddingBars.
     barWidth,rightOffset:0,autoY:priceAuto,
     manualCenter:priceAuto?null:(manualPrice?.manualCenter??center),
     manualRange:priceAuto?null:(manualPrice?.manualRange??spread*(terminalMode?1.32:1.16)/profile.verticalZoom),
     // With auto price scaling enabled, Terminal profiles should prioritize the
     // visible candle range (including wicks) over distant DOM/target markers.
     // Use the existing volume-safe price fit with no extra market requests.
     yZoom:terminalAutoScale?1:profile.verticalZoom,fitAll:false,
     candleFit:priceAuto && (terminalMode || visualProfileKey.startsWith('terminal')),
   });
 },[symbol,tf,interactionScope,visualProfileKey,visualProfileCaptureVersion,profileVisibleBars,profileZoom,profileAutoPrice,profileRightGap,hasHistoryCandles,terminalHistoryPhase,initialLogicalRange,terminalMode,terminalAutoScale,visualCanvasWidth,fitAllScopeKey,rightPaddingBars,showVolumes]);
 useLayoutEffect(()=>{if(hasVisualProfile||rangeRestored.current||!candles.length||!initialLogicalRange)return;const width=ref.current?.getBoundingClientRect().width||800,restored=restoredHookViewport(candles.length,hookChartPlotWidth(width),initialLogicalRange);if(restored){rangeRestored.current=true;setVp({...restored,rightOffset:restored.rightOffset+Math.max(0,rightPaddingBars)+Math.max(0,rightPadding)/Math.max(3,restored.barWidth)})}},[candles.length,initialLogicalRange,rightPaddingBars,rightPadding,hasVisualProfile]);
 const [draft,setDraft]=useState<{t:number,p:number}|null>(null),[selectedDrawingId,setSelectedDrawingId]=useState<string|null>(null),[editingDrawingId,setEditingDrawingId]=useState<string|null>(null);
 const [drawingActions,setDrawingActions]=useState<{id:string;x:number;y:number}|null>(null);
 const [alertActions,setAlertActions]=useState<{id:string;x:number;y:number}|null>(null),suppressDrawingClick=useRef(false);
 const jumpVersion=useRef(0);
 const [zoomPanelOpen,setZoomPanelOpen]=useState<boolean>(()=>false),[jumpOpen,setJumpOpen]=useState(false),[jumpMode,setJumpMode]=useState<'day'|'time'>('day'),[jumpDate,setJumpDate]=useState(()=>zoneDateKey(Date.now(),timezone)),[jumpTime,setJumpTime]=useState('12:00'),[jumpBusy,setJumpBusy]=useState(false),[jumpMessage,setJumpMessage]=useState(''),[pendingJump,setPendingJump]=useState<{t:number,fitDay:boolean}|null>(null);
 const liqHudKey=liquidationHudPreferenceKey(liquidationHudOwner);
 // Terminal cards must not share their Liq/cascade expanded state, even when
 // they show the same market. Other HookCharts retain their account-wide choice.
 const [liqHudOpen,setLiqHudOpen]=useState<boolean>(()=>terminalMode?false:readLiquidationHudExpanded(liqHudKey));
 useEffect(()=>{
   if(terminalMode){
     // Terminal: a local state per mounted chart, with no shared preference
     // listener or storage updates. All other cards remain untouched.
     setLiqHudOpen(false);
     return;
   }
   setLiqHudOpen(readLiquidationHudExpanded(liqHudKey));
   const onShared=(event:Event)=>{
     const detail=(event as CustomEvent<{key:string;expanded:boolean}>).detail;
     if(detail?.key===liqHudKey)setLiqHudOpen(detail.expanded);
   };
   const onStorage=(event:StorageEvent)=>{
     if(event.key===liqHudKey||event.key===null)setLiqHudOpen(readLiquidationHudExpanded(liqHudKey));
   };
   window.addEventListener(LIQUIDATION_HUD_PREFERENCE_EVENT,onShared);
   window.addEventListener('storage',onStorage);
   return()=>{
     window.removeEventListener(LIQUIDATION_HUD_PREFERENCE_EVENT,onShared);
     window.removeEventListener('storage',onStorage);
   };
 },[liqHudKey,terminalMode]);
 const toggleLiqHud=()=>{
   if(terminalMode){
     setLiqHudOpen(open=>!open);
     return;
   }
   const next=!liqHudOpen;
   setLiqHudOpen(next);
   saveLiquidationHudExpanded(liqHudKey,next);
 };
 const touchHold=useRef<ReturnType<typeof createChartTouchHold>|null>(null),touchCursorVisible=useRef(false),suppressTouchClick=useRef(false);
 if(!touchHold.current)touchHold.current=createChartTouchHold();
 const magnifierPointer=useRef<number|null>(null),magnifierSample=useRef<HTMLCanvasElement|null>(null);
 const magnifierZoom=useRef(TOUCH_MAGNIFIER_DEFAULT_ZOOM);
 const magnifierPriceDrag=useRef<{id:number;startY:number;startZoom:number}|null>(null);
 const cancelTouchHold=()=>touchHold.current?.cancel();

 const lastCrosshair=useRef<CrosshairPosition|null>(null);
 const lastSentCrosshairPrice=useRef<number|null>(null);
 const transient=useRef<{t:number;p:number}|null>(null);
 const hoveredMeasurement=useRef<string|null>(null);
 const drag=useRef<any>(null),geom=useRef<any>(null),pointers=useRef(new Map<number,{x:number,y:number}>()),lastTap=useRef(0),mouseRef=useRef<{x:number,y:number}|null>(null),drawRef=useRef<()=>void>(()=>{}),interactionDrawRef=useRef<()=>void>(()=>{});
 const frames=useRef<ReturnType<typeof createChartFrameScheduler>|null>(null);
 const chartOnScreen=useRef(true);
 // Captured chart gestures keep their original canvas position until the page
 // scrolls or the chart resizes, avoiding a layout read on every pointermove.
 const activePointerRect=useRef<DOMRect|null>(null);
 if(!frames.current)frames.current=createChartFrameScheduler({scene:()=>{const start=chartDiagnosticsEnabled()?performance.now():0;drawRef.current();if(start)recordChartPaint(performance.now()-start)},interaction:()=>interactionDrawRef.current()});
 const resetInteraction=()=>{
   const owner=box.current,ids=[...pointers.current.keys()];
   cancelTouchHold();magnifierPointer.current=null;magnifierPriceDrag.current=null;magnifierZoom.current=TOUCH_MAGNIFIER_DEFAULT_ZOOM;touchCursorVisible.current=false;suppressTouchClick.current=false;
   mouseRef.current=null;transient.current=null;hoveredMeasurement.current=null;drag.current=null;geom.current=null;lastTap.current=0;pointers.current.clear();activePointerRect.current=null;
   if(box.current?.style)box.current.style.cursor='';
   // Clear ownership before releasing capture: a lost-capture event must not
   // revive an interaction belonging to a previous coin, timeframe or tool.
   for(const id of ids)if(owner?.hasPointerCapture(id))owner.releasePointerCapture(id);
 };
 const resetInteractionRef=useRef(resetInteraction);
 resetInteractionRef.current=resetInteraction;
 useLayoutEffect(()=>{fitAllScopeRef.current=null;manualPriceAxisOverride.current=false},[symbol,tf,interactionScope]);
 useLayoutEffect(()=>{resetInteractionRef.current();setDraft(null);setDrawingActions(null);setAlertActions(null);setSelectedDrawingId(null);setEditingDrawingId(null);return()=>resetInteractionRef.current()},[symbol,tf,tool,interactionScope]);
 useLayoutEffect(()=>{jumpVersion.current++;setPendingJump(null);setJumpBusy(false);setJumpMessage('')},[symbol,tf,interactionScope]);

 useEffect(()=>{
   if(!transientRuler)return;
   const stop=()=>{transient.current=null;scheduleDraw()},keydown=(e:KeyboardEvent)=>{
     const c=ref.current,g=geom.current,m=mouseRef.current,target=e.target as HTMLElement|null;
     if(e.key!=='Shift'||e.repeat||!c||!g||!m||m.x<0||m.x>g.plotW||m.y<0||m.y>g.plotH||target?.matches('input,textarea,select,[contenteditable="true"]'))return;
     transient.current={t:g.timeAtX(m.x),p:g.p(m.y)};scheduleDraw();
   },keyup=(e:KeyboardEvent)=>{if(e.key==='Shift')stop()};
   window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);window.addEventListener('blur',stop);window.addEventListener('pointerup',stop);
   return()=>{stop();window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);window.removeEventListener('blur',stop);window.removeEventListener('pointerup',stop)};
 },[transientRuler]);
 useEffect(()=>{if(!jumpOpen)setJumpDate(zoneDateKey(Date.now(),timezone))},[timezone,jumpOpen]);useEffect(()=>{if(hideTimeJump&&jumpOpen)setJumpOpen(false)},[hideTimeJump,jumpOpen]);
 const intervalMs=TF_MS[tf]||300000;
 // Bucket labels only when prints/candle data changes, not on every cursor
 // frame or mouse movement while the chart is being drawn.
 const marketPrintBuckets=useMemo(
   ()=>showMarketPrintSums?aggregateMarketPrintsByCandle(candles,marketPrints,intervalMs):[],
   [showMarketPrintSums,candles,marketPrints,intervalMs],
 );
 const visibleMarketPrintBuckets=useMemo(
   ()=>filterMarketPrintCandleBuckets(marketPrintBuckets,marketPrintMinUsd),
   [marketPrintBuckets,marketPrintMinUsd],
 );
 // Real exchange liquidations are grouped by candle once per data change.
 // Mouse movement / pan / redraw must not re-scan every event or re-sort
 // candle buckets for each animation frame in a multi-chart Terminal.
 const liquidationBuckets=useMemo(
   ()=>showLiquidations?aggregateLiquidationsByCandle(candles,liquidations,intervalMs):[],
   [showLiquidations,candles,liquidations,intervalMs],
 );
 const axisTimeFmt=useMemo(()=>new Intl.DateTimeFormat(language,{timeZone:timezone,hour:'2-digit',minute:'2-digit',...(intervalMs<60000?{second:'2-digit' as const}:{}),hour12:false}),[timezone,language,intervalMs]);
 const axisDateFmt=useMemo(()=>new Intl.DateTimeFormat(language,{timeZone:timezone,day:'2-digit',month:'2-digit'}),[timezone,language]);
 const axisFullFmt=useMemo(()=>new Intl.DateTimeFormat(language,{timeZone:timezone,day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',...(intervalMs<60000?{second:'2-digit' as const}:{}),hour12:false}),[timezone,language,intervalMs]);
 const axisDayKeyFmt=useMemo(()=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}),[timezone]);
 const calculateDayOverlays = useMemo(() => autoPrevDay || autoDayOpen || autoVWAP
   ? createChartDayOverlayCalculator(time => zoneDateKey(time, timezone), {
     previousDay: autoPrevDay, dayOpen: autoDayOpen, vwap: autoVWAP,
   })
   : undefined, [timezone, autoPrevDay, autoDayOpen, autoVWAP]);
 const calculateSupportResistance = useMemo(() => autoSR ? createSupportResistanceCalculator(tf) : undefined, [autoSR, tf]);
 const autoOverlay=useMemo(()=>{
   if (archivedOverlayScene) {
     // Frozen observations, NOT an automatic rescan of later exchange candles.
     return {
       sr: archivedOverlayScene.sr || [], prev: archivedOverlayScene.prevDay || null,
       dayOpen: archivedOverlayScene.dayOpen || null,
       vwap: archivedOverlayScene.vwap || [], local: archivedOverlayScene.localHL || [],
       round: archivedOverlayScene.roundLevels || [], stops: archivedOverlayScene.stops || [],
       channel: archivedOverlayScene.channel || null,
     };
   }
   const out:any={sr:[],prev:null,dayOpen:null,vwap:[],local:[],round:[],stops:[],channel:autoChannel?channelModel:null};
   const n=candles.length,last=candles[n-1];
   if(!last)return out;
   if(calculateDayOverlays)Object.assign(out,calculateDayOverlays(candles));
   if(calculateSupportResistance)out.sr=calculateSupportResistance(candles);
   if(autoRoundLevels&&last.c>0){const mag=Math.pow(10,Math.floor(Math.log10(last.c))),step=mag*(roundness>=3?.1:roundness===2?.05:.01),center=Math.round(last.c/step)*step;for(let i=-3;i<=3;i++)out.round.push(center+i*step)}
   if(autoLocalHL||autoStops){
     const recent=candles.slice(-520),baseIndex=n-recent.length,pw=tf==='1m'||tf==='3m'?4:tf==='5m'||tf==='15m'?5:6,piv:any[]=[];
     for(let i=pw;i<recent.length-pw;i++){const k=recent[i];let hi=true,lo=true;for(let j=i-pw;j<=i+pw;j++){if(j===i)continue;if(recent[j].h>=k.h)hi=false;if(recent[j].l<=k.l)lo=false;if(!hi&&!lo)break}if(hi||lo){const around=recent.slice(i-pw,i+pw+1),avg=around.reduce((a,x)=>a+x.c,0)/around.length,prom=Math.abs((hi?k.h:k.l)-avg)/Math.max(avg,1e-12);piv.push({kind:hi?'R':'S',p:hi?k.h:k.l,t:k.t,prom,idx:baseIndex+i})}}
     if(autoLocalHL){const tail=piv.filter(x=>x.idx>=Math.max(0,n-180));const rh=[...tail].reverse().find(x=>x.kind==='R'),rl=[...tail].reverse().find(x=>x.kind==='S');out.local=[rh,rl].filter(Boolean)}
     if(autoStops&&piv.length){const A=Math.max(atr(candles,14),last.c*.0005),ranked=piv.filter(x=>x.idx>=Math.max(0,n-360)).sort((a,b)=>(b.prom-a.prom)||b.idx-a.idx),picked:any[]=[];for(const z of ranked){const off=Math.max(A*.10,z.p*.0002),p=z.kind==='S'?z.p-off:z.p+off,start=Math.max(0,z.idx+1),after=candles.slice(start),swept=z.kind==='S'?after.some(k=>k.l<=p):after.some(k=>k.h>=p);if(swept)continue;const side=z.kind==='S'?'LONG':'SHORT';if(picked.some(x=>x.side===side&&Math.abs(x.p-p)/Math.max(p,1e-12)<.0015))continue;picked.push({side,p,t:z.t,pivot:z.p,prom:z.prom});if(picked.filter(x=>x.side==='LONG').length>=3&&picked.filter(x=>x.side==='SHORT').length>=3)break}out.stops=picked}
   }

   return out
 },[candles,tf,roundness,calculateDayOverlays,calculateSupportResistance,autoLocalHL,autoRoundLevels,autoStops,autoChannel,channelModel,archivedOverlayScene]);
 // Precompute market-dependent orderings once per change in depth/close/levels,
 // not on each viewport frame while a user moves the chart.
 const lastCloseForPan=candles.at(-1)?.c;
 const cachedNearDensityPrices=useMemo(
   ()=>lastCloseForPan===undefined?[]:closestActiveDensityPrices(densities,lastCloseForPan),
   [densities,lastCloseForPan],
 );
 // The legacy midpoint fallback remains for charts whose last price is zero.
 const rankedAutoLevelsForPan=useMemo(
   ()=>lastCloseForPan?rankAutoLevelsForPrice(autoLevels,lastCloseForPan):null,
   [autoLevels,lastCloseForPan],
 );
 // Market-dependent cascade invalidation runs only when candles or the
 // detected scene change; panning/zooming must not rescan price history.
 const activeCascadeLines = useMemo(() => {
   const active = new Set<ScalperLine>();
   if (!scalperResult?.setups.length || !candles.length) return active;
   for (const setup of scalperResult.setups) {
     if (setup.kind !== 'cascade') continue;
     const side = setup.lines.some(line => line.role === 'upper') ? 'upper' : 'lower';
     for (const line of setup.lines) {
       if (cascadeLineIsActive(line, setup.touches, candles, side)) active.add(line);
     }
   }
   return active;
 }, [scalperResult, candles]);
 // The same OHLC-scoped cache rejects stale diagonals without rescanning
 // candles during mouse drags, pan/zoom or other canvas-only redraws.
 const activeDiagonalLines = useMemo(() => {
   const active = new Set<ScalperLine>();
   if (!scalperResult?.setups.length || !candles.length) return active;
   for (const setup of scalperResult.setups) {
     if (setup.kind === 'cascade') continue;
     for (const line of setup.lines) {
       if (line.from.p === line.to.p) continue;
       const side = line.role === 'upper' ? 'upper' : 'lower';
       if (scalperDiagonalIsActive(line, setup.touches, candles, side, setup.kind === 'trend')) {
         active.add(line);
       }
     }
   }
   return active;
 }, [scalperResult, candles]);
 const AX=HOOKCHART_PRICE_SCALE_WIDTH,TX=0;
 const geometry=()=>{
  const c=ref.current;if(!c||!candles.length)return null;
  const r=c.getBoundingClientRect(),plotW=hookChartPlotWidth(r.width),priceX=plotW,plotH=Math.max(40,r.height-TX);
  const {step,virtualEnd,virtualStart}=hookChartHorizontalRange(candles.length,plotW,vp,rightPaddingBars,rightPadding);
  const dataStart=Math.max(0,Math.floor(virtualStart)-2),dataEnd=Math.min(candles.length,Math.ceil(virtualEnd)+2);
  const visibleWindow=visibleWindowCache.get(candles,dataStart,dataEnd);
  const data=visibleWindow.rows;
  const scaleWindow=data.length?visibleWindow:visibleWindowCache.get(candles,Math.max(0,candles.length-80),candles.length);
  const scaleData=scaleWindow.rows;
  // Do not let distant support/resistance markers flatten candles in Formations.
  // A price-axis gesture must take priority over automatic Terminal fitting.
  // Otherwise the manual viewport changes while rendering still uses the
  // auto-fit range, making mobile drags appear broken.
  const candleAutoScale=(terminalAutoScale&&!manualPriceAxisOverride.current)
    ||(formationAutoScale&&vp.autoY)||(vp.autoY&&vp.candleFit===true);
  // Avoid letting one flash wick flatten the compact Terminal price scale.
  // No source candle, chart overlay, or backend value is changed.
  const readableExtrema=terminalMode&&candleAutoScale?terminalReadableCandleExtrema(scaleData):null;
  // Same minimum/maximum as the original per-event scan, now cached by the
  // immutable candle input and integer visible range.
  let lo=readableExtrema?.low??scaleWindow.low,hi=readableExtrema?.high??scaleWindow.high;
  if(!Number.isFinite(lo)||!Number.isFinite(hi)){lo=0;hi=1}
  if(!candleAutoScale&&vp.autoY&&candles.length&&cachedNearDensityPrices.length){
    // Exact same nearest four levels / 3% gate; only the selection is cached.
    for(const price of cachedNearDensityPrices){if(price<lo)lo=price;if(price>hi)hi=price}
  }
  if(!candleAutoScale&&(terminalMode||expandPriceScaleToMarkers)&&vp.autoY){for(const marker of markers){if(Number.isFinite(marker.price)&&marker.price>0){lo=Math.min(lo,marker.price);hi=Math.max(hi,marker.price)}}}
  if(candleAutoScale){
    // Price-only auto fit: reserve the bottom volume band and a visible gap.
    // Skip distant TP/SL markers and densities so tiny charts prioritize candles.
    const fitted=terminalCandlePriceRange(lo,hi,plotH,showVolumes);
    // Terminal auto price fit may combine 0.76x zoom-out or >1x zoom-in with
    // the chosen viewport. Restrict zoom-in to a wick-safe, volume-safe range
    // so large candles cannot be clipped at the top/bottom of compact charts.
    // Keep the global auto-fit toggle's existing priority over manual zoom.
    const range=!terminalAutoScale&&vp.autoY&&vp.candleFit&&
      (terminalMode||visualProfileKey?.startsWith('terminal'))
      ? terminalSafeVerticalZoomRange(fitted,lo,hi,plotH,showVolumes,vp.yZoom??1)
      : fitted;
    lo=range.low;hi=range.high;
  }else{
    const pad=(hi-lo||Math.abs(hi)*.01||1)*(terminalMode ? .16 : .08);lo-=pad;hi+=pad;
    if(vp.autoY&&vp.yZoom&&vp.yZoom!==1){const mid=(hi+lo)/2,half=(hi-lo)/(2*Math.max(.01,Math.min(100,vp.yZoom)));lo=mid-half;hi=mid+half}
    if(!vp.autoY&&vp.manualCenter!=null&&vp.manualRange!=null){lo=vp.manualCenter-vp.manualRange/2;hi=vp.manualCenter+vp.manualRange/2}
  }
  const y=(p:number)=>plotH-(p-lo)/(hi-lo)*plotH,p=(yy:number)=>lo+(plotH-yy)/plotH*(hi-lo);
  const nearestIndex=(t:number)=>{let loI=0,hiI=candles.length-1;while(loI<hiI){const m=Math.floor((loI+hiI)/2);if(candles[m].t<t)loI=m+1;else hiI=m}const a=Math.max(0,loI-1),b=Math.min(candles.length-1,loI);return Math.abs(candles[a].t-t)<=Math.abs(candles[b].t-t)?a:b};
  const indexAtTime=(t:number)=>hookChartIndexAtTime(candles,t,intervalMs);
  const x=(t:number)=>(indexAtTime(t)-virtualStart+.5)*step;
  const candleX=(localIndex:number)=>(dataStart+localIndex-virtualStart+.5)*step;
  const timeAtX=(xx:number)=>hookChartTimeAtIndex(candles,virtualStart+xx/step-.5,intervalMs);
  return{r,plotW,priceX,plotH,data,dataStart,dataEnd,virtualStart,virtualEnd,lo,hi,step,x,candleX,y,p,nearestIndex,indexAtTime,timeAtX};
 };
 const candleIndexAtOrBefore=(target:number)=>{if(!candles.length)return 0;if(target<=candles[0].t)return 0;let lo=0,hi=candles.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(candles[mid].t<=target)lo=mid;else hi=mid-1}return lo};
 const focusAtTime=(target:number,fitDay=false)=>{
   const g=geometry();if(!g)return;
   // A deliberate time jump during the first history load wins over late refit.
   viewportAdjustedByUserRef.current=true;
   manualPriceAxisOverride.current=false;
   const targetIndex=candleIndexAtOrBefore(target);
   const step=fitDay?Math.max(3,Math.min(34,g.plotW/Math.max(20,86400000/intervalMs+8))):Math.max(.12,g.step);
   const slots=g.plotW/step,padding=Math.max(0,rightPaddingBars)+Math.max(0,rightPadding)/step;
   const rightOffset=candles.length+padding-slots/2-targetIndex-.5;
   setVp(v=>({...v,barWidth:step,rightOffset,autoY:true,manualCenter:null,manualRange:null,fitAll:false}));
 };
 const focusAtTimeRef=useRef(focusAtTime);
 focusAtTimeRef.current=focusAtTime;
 useEffect(()=>{if(!pendingJump||!candles.length)return;if(pendingJump.t>=candles[0].t-intervalMs){focusAtTimeRef.current(pendingJump.t,pendingJump.fitDay);setPendingJump(null);setJumpBusy(false);setJumpOpen(false);setJumpMessage('')}},[candles,pendingJump,intervalMs]);
 const requestJump=async(date:string,mode:'day'|'time'=jumpMode,time=jumpTime)=>{const version=++jumpVersion.current;const clock=mode==='day'?'12:00':time;let target=zonedLocalTs(date,clock,timezone);if(!Number.isFinite(target)){setJumpBusy(false);setJumpMessage('Цей локальний час не існує або введений некоректно');return}setJumpDate(date);setJumpMode(mode);setJumpBusy(true);setJumpMessage('');const latest=candles.at(-1)?.t;if(latest){const latestDate=zoneDateKey(latest,timezone);if(date>latestDate){setJumpBusy(false);setJumpMessage('Для майбутньої дати ще немає свічок');return}if(mode==='time'&&target>latest+intervalMs){setJumpBusy(false);setJumpMessage('Для цього часу ще немає свічки');return}if(mode==='day'&&date===latestDate&&target>latest)target=latest}if(candles.length&&target>=candles[0].t){focusAtTime(target,mode==='day');setJumpBusy(false);setJumpOpen(false);return}setPendingJump({t:target,fitDay:mode==='day'});const ok=onNeedHistory?await onNeedHistory(target):false;if(version!==jumpVersion.current)return;if(!ok){setPendingJump(null);setJumpBusy(false);setJumpMessage('Не вдалося завантажити цю ділянку історії')}};
 const quickJump=(daysAgo:number)=>{const d=zoneDateOffset(daysAgo,timezone);void requestJump(d,'day','12:00')};
 const zone=(x:number,y:number,g:any)=>x>=g.priceX?'price':y>=g.plotH?'time':'plot';
 const snap=(x:number,y:number,g:any)=>{
   // Convert the cursor X to a virtual bar index without clamping it to the
   // last real candle. This makes the right-side future area a real drawing
   // surface for Trend/Profile/Ruler/Ray/Rect/Fib.
   const vi=Math.round(g.virtualStart+x/g.step-.5),n=candles.length,last=n-1;
   const inside=vi>=0&&vi<n,k=inside?candles[vi]:null;
   let t:number;
   if(inside)t=k!.t;
   else if(vi>last)t=candles[last].t+(vi-last)*intervalMs;
   else t=candles[0].t+vi*intervalMs;
   let p=g.p(Math.min(Math.max(0,y),g.plotH));
   // OHLC magnet only exists where an actual candle exists. Future space
   // remains freely drawable instead of snapping back to the final candle.
   if(k){const vals=[k.o,k.h,k.l,k.c];const q=vals.reduce((a,b)=>Math.abs(g.y(b)-y)<Math.abs(g.y(a)-y)?b:a);if(Math.abs(g.y(q)-y)<12)p=q}
   return{t,p}
 };
 const zoomX=(factor:number,anchorX:number,plotWidth:number)=>setGestureVp(v=>({
   ...v,...resizeHookChartViewport(candles.length,plotWidth,v,factor,anchorX,rightPaddingBars,rightPadding),
 }),'zoom');
 const zoomY=(factor:number,anchorY:number,g:any)=>setGestureVp(v=>{
   const range=v.autoY?(g.hi-g.lo):(v.manualRange||g.hi-g.lo),anchor=g.p(anchorY),nr=Math.max(1e-14,range/factor);
   const ratio=(anchorY/g.plotH)-.5,nc=anchor+ratio*nr;
   return{...v,autoY:false,manualRange:nr,manualCenter:nc}
 },'price');
 const panXWheel=(pixels:number,plotWidth:number)=>setGestureVp(v=>{
   // Preserve the displayed candle width when the user first pans a fitted view.
   const view=resizeHookChartViewport(candles.length,plotWidth,v,1,plotWidth/2,rightPaddingBars,rightPadding);
   return {...v,...view,rightOffset:view.rightOffset+pixels/view.barWidth};
 },'pan');
 // Offscreen Terminal cards continue to receive current data, but their
 // costly raster paint is deferred until they enter the viewport again.
 const scheduleDraw=(scene=true)=>{
   if(chartOnScreen.current&&document.visibilityState!=='hidden')frames.current?.request(scene);
 };
 const profileData=(d:Drawing,g:any)=>{
  if(d.type!=='profile'||!d.pts[1]||!candles.length)return null;
  const t0=Math.min(d.pts[0].t,d.pts[1].t),t1=Math.max(d.pts[0].t,d.pts[1].t);
  const firstT=candles[0].t,lastT=candles.at(-1)!.t;
  // The selection rectangle may extend into future empty space, but volume
  // is calculated only from the real candles that overlap the selection.
  if(t1<firstT||t0>lastT)return null;
  let i0=g.nearestIndex(Math.max(t0,firstT)),i1=g.nearestIndex(Math.min(t1,lastT));if(i0>i1){const z=i0;i0=i1;i1=z}
  // Preserve the exact selected time coordinates, including empty future space.
  const xA=g.x(t0),xB=g.x(t1),xL=Math.max(0,Math.min(g.plotW,Math.min(xA,xB))),xR=Math.max(0,Math.min(g.plotW,Math.max(xA,xB)));
  const binCount=Math.max(20,Math.min(40,Math.round(22+Math.min(18,Math.abs(xR-xL)/22))));
  const histogram=volumeProfileCache.get(candles,i0,i1,binCount);
  if(!histogram)return null;
  const {pLo,pHi,step,bins,maxV,poc}=histogram;
  const yTop=g.y(pHi),yBottom=g.y(pLo),profileW=Math.max(48,Math.min(150,Math.max(64,Math.abs(xR-xL)*.46)));
  return{t0,t1,i0,i1,pLo,pHi,step,bins,maxV,poc,xL,xR,yTop,yBottom,profileW};
 };
 const lineActionLayout=(d:Drawing,g:any)=>{if(!d.pts[1])return null;const b=d.pts[1],x2=g.x(b.t),y2=g.y(b.p);if(x2<0||x2>g.plotW||y2<0||y2>g.plotH)return null;const y=Math.max(14,Math.min(g.plotH-14,y2-18)),editX=Math.max(14,Math.min(g.plotW-38,x2+16)),deleteX=Math.max(36,Math.min(g.plotW-14,editX+24));return{editX,deleteX,y}};
 const hitLineAction=(d:Drawing,g:any,x:number,y:number)=>{const a=lineActionLayout(d,g);if(!a)return null;if(Math.hypot(x-a.editX,y-a.y)<=11)return'edit';if(Math.hypot(x-a.deleteX,y-a.y)<=11)return'delete';return null};
 const profileActionLayout=(d:Drawing,g:any)=>{const pd=profileData(d,g);if(!pd)return null;const anchor=Math.max(pd.xL+8,pd.xR),y=Math.max(14,Math.min(g.plotH-14,Math.max(16,pd.yTop+12))),editX=Math.max(14,Math.min(g.plotW-38,anchor+16)),deleteX=Math.max(36,Math.min(g.plotW-14,editX+24));return{...pd,editX,deleteX,y}};
 const hitProfileAction=(d:Drawing,g:any,x:number,y:number)=>{const a=profileActionLayout(d,g);if(!a)return null;if(Math.hypot(x-a.editX,y-a.y)<=11)return'edit';if(Math.hypot(x-a.deleteX,y-a.y)<=11)return'delete';return null};
 const rulerPct=(a:{p:number},b:{p:number})=>a.p===0?0:(b.p-a.p)/a.p*100;
 const selectDrawingAt=(d:Drawing,x:number,y:number,g:any)=>{
   setSelectedDrawingId(d.id);setAlertActions(null);
   setDrawingActions(prev=>prev?.id===d.id?prev:{id:d.id,...drawingActionsPosition(x,y,g.plotW,g.plotH)});
 };
 const selectAlertAt=(id:string,x:number,y:number,g:any)=>{
   setSelectedDrawingId(null);setEditingDrawingId(null);setDrawingActions(null);
   setAlertActions(prev=>prev?.id===id?prev:{id,...drawingActionsPosition(x,y,g.plotW,g.plotH)});
 };
 const hitAlertAt=(x:number,y:number,g:any):Alert|null=>{
   if(zone(x,y,g)!=='plot')return null;
   let nearest:Alert|null=null,dist=13;
   for(const a of alerts){
     if(!a.id.startsWith(symbol+':'))continue;
     const delta=Math.abs(y-g.y(a.p));
     if(delta<dist){dist=delta;nearest=a}
   }
   return nearest;
 };
 const editHandleAt=(d:Drawing,x:number,y:number,g:any):number|null=>{
   if(!d.pts.length)return null;
   if(d.type==='level')return Math.abs(y-g.y(d.pts[0].p))<=18?0:null;
   if(d.type==='profile'&&d.pts[1]){
     const pd=profileData(d,g),top=pd?pd.yTop:0,bottom=pd?pd.yBottom:g.plotH;
     if(y<Math.min(top,bottom)-18||y>Math.max(top,bottom)+18)return null;
     const a=Math.abs(x-g.x(d.pts[0].t)),b=Math.abs(x-g.x(d.pts[1].t));
     return Math.min(a,b)<=18?(a<=b?0:1):null;
   }
   const distances=d.pts.slice(0,2).map(p=>Math.hypot(x-g.x(p.t),y-g.y(p.p)));
   const m=Math.min(...distances);return m<=18?distances.indexOf(m):null;
 };
 useEffect(()=>{
   const c=ref.current;
   if(!c)return;
   const invalidatePointerRect=()=>{activePointerRect.current=null};
   const ro=new ResizeObserver(()=>{invalidatePointerRect();scheduleDraw()});
   const onVisible=()=>{if(document.visibilityState==='visible'&&chartOnScreen.current)frames.current?.flush()};
   const onResize=()=>{invalidatePointerRect();scheduleDraw()};
   let intersection:IntersectionObserver|null=null;
   if(typeof IntersectionObserver!=='undefined'){
     intersection=new IntersectionObserver(entries=>{
       const visible=entries.some(entry=>entry.isIntersecting);
       const wasVisible=chartOnScreen.current;
       chartOnScreen.current=visible;
       if(!visible)frames.current?.cancel();
       else if(!wasVisible&&document.visibilityState==='visible')frames.current?.request(true);
     },{rootMargin:'100px'});
     intersection.observe(c);
   }
   ro.observe(c);
   document.addEventListener('visibilitychange',onVisible);
   window.addEventListener('resize',onResize,{passive:true});
   window.addEventListener('scroll',invalidatePointerRect,true);
   window.visualViewport?.addEventListener('resize',onResize,{passive:true});
   scheduleDraw();
   return()=>{
     intersection?.disconnect();ro.disconnect();
     document.removeEventListener('visibilitychange',onVisible);
     window.removeEventListener('resize',onResize);
     window.removeEventListener('scroll',invalidatePointerRect,true);
     window.visualViewport?.removeEventListener('resize',onResize);
     frames.current?.cancel();
   };
 },[]);
 useEffect(()=>{setDraft(null);if(tool!=='cursor'&&tool!=='trend'&&tool!=='profile'&&tool!=='ruler'&&tool!=='fib'){setSelectedDrawingId(null);setEditingDrawingId(null)}},[tool]);
 const drawInteraction=()=>{
   const source=ref.current,canvas=interactionRef.current,g=geom.current;
   if(!source||!canvas||!g){
     if(canvas){if(canvas.width!==1)canvas.width=1;if(canvas.height!==1)canvas.height=1}
     if(lastCrosshair.current!==null){lastCrosshair.current=null;onCrosshairChange?.(null)}
     return;
   }
   const mouse=mouseRef.current;
   const cursorVisible=!!mouse&&mouse.x>=0&&mouse.x<g.plotW&&mouse.y>=0&&mouse.y<g.plotH&&drag.current?.kind!=='pinch'&&!(drag.current?.kind==='touchCursor'&&(drag.current.panning||!drag.current.inspecting));
   const pointerMagnifier=magnifierPointer.current!==null&&pointers.current.has(magnifierPointer.current)&&(pointers.current.size===1||magnifierPriceDrag.current!==null)&&(drag.current?.kind==='touchCursor'||drag.current?.kind==='drawingPlacement')&&drag.current.inspecting;
   const magnifierVisible=!!mouse&&(pointerMagnifier||(keyboardMagnifierActive&&tool==='cursor'&&cursorVisible));
   const rulerAnchor=transient.current;
   const cursorPosition=cursorVisible?{x:mouse!.x,time:g.timeAtX(mouse!.x)}:null;
   // Emit the real vertical price of the crosshair for an optional alert form.
   // No additional chart state, renders or market requests are needed.
   if(cursorVisible&&tool==='cursor'&&onCrosshairPriceChange){
     const hoveredPrice=g.p(mouse!.y);
     if(Number.isFinite(hoveredPrice)&&hoveredPrice>0&&hoveredPrice!==lastSentCrosshairPrice.current){
       lastSentCrosshairPrice.current=hoveredPrice;
       onCrosshairPriceChange(hoveredPrice);
     }
   } else lastSentCrosshairPrice.current=null;
   if(cursorPosition?.x!==lastCrosshair.current?.x||cursorPosition?.time!==lastCrosshair.current?.time){lastCrosshair.current=cursorPosition;onCrosshairChange?.(cursorPosition)}
   // Untouched terminal cards keep a 1x1 transparent bitmap instead of allocating
   // another full-resolution canvas for every chart.
   if(!cursorVisible&&!magnifierVisible&&!(rulerAnchor&&mouse)){if(canvas.width!==1)canvas.width=1;if(canvas.height!==1)canvas.height=1;return}
   const w=Math.max(1,g.r.width),h=Math.max(1,g.r.height),dpr=effectiveCanvasDpr(window.devicePixelRatio,maxCanvasDpr);
   const pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));
   if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;
   const context=canvas.getContext('2d');if(!context)return;
   context.setTransform(pw/w,0,0,ph/h,0,0);context.clearRect(0,0,w,h);
   const geometry={width:w,height:h,plotWidth:g.plotW,plotHeight:g.plotH};
   const priceText=cursorVisible?formatCryptoPrice(g.p(mouse!.y)):'';
   const ruler=rulerAnchor&&mouse?{x:g.x(rulerAnchor.t),y:g.y(rulerAnchor.p),pct:rulerPct(rulerAnchor,{p:g.p(mouse.y)}),seconds:Math.abs((g.timeAtX(mouse.x)-rulerAnchor.t)/1000)}:null;
   const rulerText=ruler?`${ruler.pct>=0?'+':''}${ruler.pct.toFixed(4)}% · ${ruler.seconds.toFixed(1)}с`:'';
   const paintPointer=(cursorVisible||ruler)?((target:CanvasRenderingContext2D)=>{
     if(ruler)paintChartRuler(target,geometry,ruler,mouse!,rulerText);
     if(cursorVisible)paintChartCrosshair(target,geometry,mouse!,priceText,CHART_THEME.crosshair,crosshairLineWidth);
   }):undefined;
   paintPointer?.(context);
   if(magnifierVisible){
     magnifierSample.current??=document.createElement('canvas');
     // Cursor inspection retains the original lens-centred sampling.
     // Drawing placement centres the enlargement on the obscured fingertip
     // and adds a target precisely above that anchor inside the floating lens.
     // Never sample the interaction layer: it would magnify itself.
     drawTouchMagnifier(source,context,magnifierSample.current,w,h,mouse!,backgroundColor,undefined,magnifierZoom.current,drag.current?.kind==='drawingPlacement');
   }
 };
 interactionDrawRef.current=drawInteraction;
 const draw=(archiveCapture=false)=>{
  const c=ref.current,g=geometry();geom.current=g;
  if(!c){interactionDrawRef.current();return}
  if(!g){
    resetInteraction();
    const context=c.getContext('2d',{alpha:false});
    if(context){context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';context.fillStyle=backgroundColor;context.fillRect(0,0,c.width,c.height)}
    interactionDrawRef.current();
    return;
  }
 const mouse=mouseRef.current,dpr=effectiveCanvasDpr(window.devicePixelRatio,maxCanvasDpr),w=Math.max(1,g.r.width),h=Math.max(1,g.r.height),pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));if(c.width!==pw||c.height!==ph){c.width=pw;c.height=ph}const q=c.getContext('2d',{alpha:false})!;const scaleX=pw/w,scaleY=ph/h;q.setTransform(scaleX,0,0,scaleY,0,0);q.imageSmoothingEnabled=false;q.globalCompositeOperation='source-over';q.lineCap='butt';q.lineJoin='miter';const strokeX=(v:number)=>(Math.round(v*scaleX)+.5)/scaleX,strokeY=(v:number)=>(Math.round(v*scaleY)+.5)/scaleY,hairX=1/scaleX,hairY=1/scaleY,hair=Math.max(hairX,hairY);// Most charts use a solid hex background. Painting an opaque full-canvas
  // rect already overwrites every pixel: avoid an extra DPR-scaled clear pass.
  // Preserve the old clear-then-paint behavior for potentially translucent CSS colors.
  q.globalAlpha=1;
  if(!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(backgroundColor))q.clearRect(0,0,w,h);
  q.fillStyle=backgroundColor;q.fillRect(0,0,w,h);
  // Clip all candles, drawings, volume and overlays to the region left of the price scale.
  q.save();q.beginPath();q.rect(0,0,g.plotW,g.plotH);q.clip();
  // TradingView-style adaptive price scale: tick spacing follows the current Y range.
  // When the user stretches/compresses the price scale, both grid density and labels rescale naturally.
  const priceStep=nicePriceStep(g.hi-g.lo,g.plotH),priceDecimals=priceTickDecimals(priceStep),firstPriceTick=Math.ceil((g.lo-1e-12)/priceStep)*priceStep;
  if(gridHorizontal){q.strokeStyle=gridColor||CHART_THEME.grid;q.lineWidth=hair;let priceTickCount=0;for(let p=firstPriceTick;p<=g.hi+priceStep*.25&&priceTickCount<64;p=firstPriceTick+(++priceTickCount)*priceStep){const yy=g.y(p);if(yy<-2||yy>g.plotH+2)continue;q.beginPath();q.moveTo(0,strokeY(yy));q.lineTo(g.plotW,strokeY(yy));q.stroke()}}
  if(gridVertical){const gridEvery=Math.max(1,Math.ceil(92/Math.max(3,g.step)));let lastGridX=-1e9;for(let i=0;i<g.data.length;i++){const globalI=g.dataStart+i;if(globalI%gridEvery!==0)continue;const xx=g.candleX(i);if(xx<0||xx>g.plotW||xx-lastGridX<58)continue;q.strokeStyle=gridColor||CHART_THEME.gridSoft;q.lineWidth=hair;q.beginPath();q.moveTo(strokeX(xx),0);q.lineTo(strokeX(xx),g.plotH);q.stroke();lastGridX=xx}}
  if(roundGrid){const cp=candles.at(-1)?.c||1,rs=roundPriceIncrement(cp,roundness);if(rs>0){let n=0;for(let rp=Math.ceil(g.lo/rs)*rs;rp<=g.hi&&n<80;rp+=rs,n++){const yy=g.y(rp),major=Math.round(rp/rs)%5===0;q.strokeStyle=major?'rgba(120,123,134,.30)':'rgba(42,46,57,.48)';q.lineWidth=major?Math.max(hair,.8):hair;q.beginPath();q.moveTo(0,yy);q.lineTo(g.plotW,yy);q.stroke()}}}
  // Observed liquidation heatmap uses the SAME X(time) and Y(price) transforms
  // as candles, drawings and DOM. Behind all candles/volumes/Liq markers.
  // OFF by default: no loop, fetch, canvas allocation or timer on this path.
  if (liquidationHeatmap?.bins.length) {
    paintObservedLiquidationHeatmap(q,liquidationHeatmap.bins,liquidationHeatmap.period,{
      plotW:g.plotW,plotH:g.plotH,step:g.step,x:g.x,y:g.y,timeAtX:g.timeAtX,
    },liquidationHeatmap.maxUsd);
    // Forecast-like recurrence bands are optional *relative* historical
    // intensity, never actual future USD liquidation amounts. They share
    // the chart's price transform and remain behind candles / ordinary Liq.
    if (modeledLiquidationBands?.length) {
      paintHistoricalLiqRecurrence(q,modeledLiquidationBands,{
        plotW:g.plotW,plotH:g.plotH,y:g.y,
      });
    }
  }

  // Candles are rasterized in physical pixels. At overview-scale several source candles
  // may share one physical X column; merge only for drawing so ALL-history stays fast and crisp
  // while the underlying candle data / hit-testing / indicators remain untouched.
  const denseBars=g.step*scaleX<1.15,candleRows:{k:Candle;rawX:number}[]=[];
  if(!denseBars){for(let i=0;i<g.data.length;i++)candleRows.push({k:g.data[i],rawX:g.candleX(i)})}
  else{let bucketPx=Number.NaN,agg:Candle|null=null,aggX=0;const flush=()=>{if(agg)candleRows.push({k:agg,rawX:aggX})};for(let i=0;i<g.data.length;i++){const k=g.data[i],rawX=g.candleX(i);if(rawX<-1||rawX>g.plotW+1)continue;const px=Math.round(rawX*scaleX);if(px!==bucketPx){flush();bucketPx=px;agg={...k};aggX=px/scaleX}else if(agg){const prevAgg:Candle=agg;agg={...prevAgg,h:Math.max(prevAgg.h,k.h),l:Math.min(prevAgg.l,k.l),c:k.c,v:prevAgg.v+k.v,n:(prevAgg.n||0)+(k.n||0),tb:(prevAgg.tb||0)+(k.tb||0),t:k.t}}}flush()}
  q.save();
  q.setTransform(1,0,0,1,0,0);
  for(let i=0;i<candleRows.length;i++){
    const row=candleRows[i],k=row.k,rawX=row.rawX,up=k.c>=k.o;
    const col=up?candleLongColor:candleShortColor;
    const centerPx=Math.round(rawX*scaleX);
    const stepPx=denseBars?1:Math.max(2,Math.round(g.step*scaleX));
    const oneCssPx=Math.max(1,Math.round(scaleX));
    const gapPx=denseBars?0:Math.max(1,oneCssPx);
    const desiredBodyPx=denseBars?1:Math.max(1,Math.round(g.step*.78*scaleX));
    const bodyPx=denseBars?1:Math.max(1,Math.min(stepPx-gapPx,desiredBodyPx));
    const bodyLeftPx=Math.round(centerPx-bodyPx/2);
    const wickPx=denseBars?1:Math.max(1,Math.round(scaleX*.85));
    const wickLeftPx=Math.round(centerPx-wickPx/2);
    const yHighPx=Math.round(g.y(k.h)*scaleY),yLowPx=Math.round(g.y(k.l)*scaleY),yOpenPx=Math.round(g.y(k.o)*scaleY),yClosePx=Math.round(g.y(k.c)*scaleY);
    const wickTopPx=Math.min(yHighPx,yLowPx),wickBottomPx=Math.max(yHighPx,yLowPx);
    const bodyTopPx=Math.min(yOpenPx,yClosePx),bodyBottomPx=Math.max(yOpenPx,yClosePx);
    const bodyHPx=Math.max(denseBars?1:Math.max(1,Math.round(scaleY*.75)),bodyBottomPx-bodyTopPx);
    const wickHPx=Math.max(1,wickBottomPx-wickTopPx);
    q.fillStyle=col;
    q.fillRect(wickLeftPx,wickTopPx,wickPx,wickHPx);
    q.fillRect(bodyLeftPx,bodyTopPx,bodyPx,bodyHPx);
  }
  q.restore();
  // Optional historical recurrence markers share the current X(time) plot.
  // On a 1m chart a weekly 5m observation covers a FIVE-MINUTE INTERVAL:
  // draw a slender bracket, not an exact minute-point that the data cannot prove.
  // The only work when disabled is one empty-array length check.
  if(!archiveCapture && marketRecurrenceMarks.length) {
    q.save();q.lineWidth=.85;
    const painted=new Set<string>();
    for(const mark of marketRecurrenceMarks){
      const x=g.x(mark.t),endX=g.x(mark.t+mark.windowMs);
      if(!Number.isFinite(x)||!Number.isFinite(endX))continue;
      const left=Math.max(2,Math.min(g.plotW-2,Math.min(x,endX)));
      const right=Math.max(2,Math.min(g.plotW-2,Math.max(x,endX)));
      if(Math.max(x,endX)<2||Math.min(x,endX)>g.plotW-2)continue;
      const key=Math.round(x)+':'+mark.kind;
      if(painted.has(key))continue;
      painted.add(key);
      q.globalAlpha=mark.status==='repeat'?.87:.47;
      q.strokeStyle=mark.kind==='impulse'?'#76c5cd':'#e3ba79';
      q.fillStyle=q.strokeStyle;
      if(mark.windowMs>intervalMs) {
        // Less than 4px cannot display a meaningful interval: omit rather
        // than misleading the user with a pinpoint on an extreme zoom-out.
        if(right-left<4)continue;
        q.beginPath();q.moveTo(left,5);q.lineTo(right,5);q.stroke();
        q.beginPath();q.moveTo(left,2);q.lineTo(left,9);
        q.moveTo(right,2);q.lineTo(right,9);q.stroke();
      } else {
        if(x<5||x>g.plotW-5)continue;
        q.beginPath();q.moveTo(x,2);q.lineTo(x,10);q.stroke();
        q.beginPath();q.arc(x,12,1.75,0,Math.PI*2);q.fill();
      }
    }
    q.restore();
  }
  // Automatic intraday reference overlays toggled from the top toolbar.
  const autoH=(p:number,label:string,col:string,dash:number[]=[4,4],x0=0,showLabel=true)=>{const yy=g.y(p);if(yy<0||yy>g.plotH)return;q.save();q.strokeStyle=col;q.fillStyle=col;q.globalAlpha=.86;q.lineWidth=.9;q.setLineDash(dash);q.beginPath();q.moveTo(Math.max(0,x0),yy);q.lineTo(g.plotW,yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;q.font='600 10px system-ui';if(showLabel)q.fillText(label,Math.max(4,Math.min(g.plotW-70,Math.max(4,x0+4))),Math.max(11,yy-3));q.restore()};
  if(autoSR)for(const z of autoOverlay.sr){autoH(z.p,`${z.kind} ${tf}`,z.kind==='R'?'#d67a86':'#5fb9a8',[5,4],g.x(z.t),showSRLabels)}
  if(autoPrevDay&&autoOverlay.prev){autoH(autoOverlay.prev.h,'PDH','#c2a85d',[6,4],g.x(autoOverlay.prev.t));autoH(autoOverlay.prev.l,'PDL','#c2a85d',[6,4],g.x(autoOverlay.prev.t))}
  if(autoDayOpen&&autoOverlay.dayOpen)autoH(autoOverlay.dayOpen.p,'OPEN','#9da9b8',[3,4],g.x(autoOverlay.dayOpen.t));
  if(autoLocalHL)for(const z of autoOverlay.local){autoH(z.p,z.kind==='R'?'Local H':'Local L',z.kind==='R'?'#e08b91':'#70bfae',[2,3],g.x(z.t))}
  if(autoRoundLevels)for(const rp of autoOverlay.round)autoH(rp,'RN','#737f90',[2,5],0);
  if(autoStops)for(const st of autoOverlay.stops){const yy=g.y(st.p),xx=Math.max(4,Math.min(g.plotW-70,g.x(st.t))),col=st.side==='LONG'?'#ff6d78':'#e8c257';if(yy<0||yy>g.plotH)continue;q.save();q.strokeStyle=col;q.globalAlpha=.72;q.lineWidth=1;q.setLineDash([3,4]);q.beginPath();q.moveTo(xx,yy);q.lineTo(Math.min(g.plotW,xx+64),yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;q.fillStyle=col;q.beginPath();if(st.side==='LONG'){q.moveTo(xx+3,yy-4);q.lineTo(xx+8,yy-4);q.lineTo(xx+5.5,yy+1);q.closePath()}else{q.moveTo(xx+3,yy+4);q.lineTo(xx+8,yy+4);q.lineTo(xx+5.5,yy-1);q.closePath()}q.fill();q.font='700 9px system-ui';const txt=`Stop ${st.side}`;q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(txt,xx+11,Math.max(10,Math.min(g.plotH-3,yy-3)));q.fillStyle=col;q.fillText(txt,xx+11,Math.max(10,Math.min(g.plotH-3,yy-3)));q.restore()}
  if(autoPOC){
    const start=g.data.length?g.dataStart:Math.max(0,candles.length-220);
    const end=g.data.length?g.dataEnd:candles.length;
    const pocZone=archivedOverlayScene ? (archivedOverlayScene.poc || null) : autoPocCache.current.get(candles,start,end);
    if(pocZone){
      const y0=g.y(pocZone.pHi),y1=g.y(pocZone.pLo),ym=g.y(pocZone.pMid);
      if(y1>=0&&y0<=g.plotH){
        q.save();
        q.fillStyle='rgba(207,164,88,.105)';
        q.fillRect(0,Math.max(0,y0),g.plotW,Math.max(1,Math.min(g.plotH,y1)-Math.max(0,y0)));
        q.strokeStyle='rgba(218,178,101,.9)';
        q.lineWidth=1.05;
        q.setLineDash([]);
        q.beginPath();
        q.moveTo(0,ym);
        q.lineTo(g.plotW,ym);
        q.stroke();
        q.fillStyle='#d7b16a';
        q.font='700 10px system-ui';
        q.fillText('POC',Math.max(4,g.plotW-30),Math.max(11,Math.min(g.plotH-3,ym-3)));
        q.restore();
      }
    }
  }
  if(autoVWAP&&autoOverlay.vwap.length>1){q.save();q.strokeStyle='#d2a95a';q.lineWidth=1.25;q.setLineDash([]);q.beginPath();let started=false;for(const z of autoOverlay.vwap){const xx=g.x(z.t),yy=g.y(z.p);if(xx<0||xx>g.plotW||yy<0||yy>g.plotH)continue;if(!started){q.moveTo(xx,yy);started=true}else q.lineTo(xx,yy)}if(started)q.stroke();const lastV=autoOverlay.vwap.at(-1);if(lastV){const yy=g.y(lastV.p);if(yy>=0&&yy<=g.plotH){q.fillStyle='#d2a95a';q.font='600 10px system-ui';q.fillText('VWAP',Math.max(4,g.plotW-42),Math.max(11,yy-3))}}q.restore()}
  if(autoChannel&&autoOverlay.channel){const ch=autoOverlay.channel,rawX0=g.x(ch.t0),rawX1=g.x(ch.t1),x0=Math.max(0,rawX0),x1=Math.min(g.plotW,rawX1),dx=rawX1-rawX0;q.save();q.lineWidth=1;q.setLineDash([5,4]);if(x1>x0&&Math.abs(dx)>.001){for(const [p0,p1,a] of [[ch.up0,ch.up1,.82],[ch.dn0,ch.dn1,.82],[ch.c0,ch.c1,.34]] as any[]){const at=(x:number)=>p0+(p1-p0)*((x-rawX0)/dx);q.globalAlpha=a;q.strokeStyle='#7d9cc4';q.beginPath();q.moveTo(x0,g.y(at(x0)));q.lineTo(x1,g.y(at(x1)));q.stroke()}}q.globalAlpha=1;q.setLineDash([]);q.restore()}

  // Volume lives in its own fixed band at the bottom of the plot. It never follows price Y-pan/zoom.
  // It can be hidden independently from Settings without affecting candle geometry or indicators.
  if(showVolumes){
    const volumeBandH=Math.max(56,Math.min(108,g.plotH*.14)),volumeBaseY=g.plotH-3,volumeTopY=volumeBaseY-volumeBandH;
    let maxV=1;for(const z of g.data)if(z.v>maxV)maxV=z.v;
    q.save();q.beginPath();q.rect(0,volumeTopY,g.plotW,volumeBandH+2);q.clip();
    q.strokeStyle='rgba(135,147,164,.12)';q.lineWidth=hair;q.beginPath();q.moveTo(0,strokeY(volumeTopY));q.lineTo(g.plotW,strokeY(volumeTopY));q.stroke();
    q.save();q.setTransform(1,0,0,1,0,0);q.globalAlpha=.82;
    const volumeStepPx=Math.max(2,Math.round(g.step*scaleX));
    const volumeBarPx=Math.max(1,Math.min(volumeStepPx-1,Math.round(g.step*.72*scaleX)));
    const volumeBasePx=Math.round(volumeBaseY*scaleY);
    for(let i=0;i<g.data.length;i++){
      const k=g.data[i],rawX=g.candleX(i),centerPx=Math.round(rawX*scaleX),barPx=volumeBarPx;
      const hhPx=Math.max(2,Math.round(((k.v/maxV)*(volumeBandH-5))*scaleY)),leftPx=Math.round(centerPx-barPx/2),basePx=volumeBasePx;
      if(splitVolumes&&Number.isFinite(k.tb)){
        const buyPx=Math.round(hhPx*Math.min(1,Math.max(0,(k.tb||0)/Math.max(k.v,1e-30))));
        q.fillStyle=candleLongColor;q.fillRect(leftPx,basePx-buyPx,barPx,buyPx);
        q.fillStyle=candleShortColor;q.fillRect(leftPx,basePx-hhPx,barPx,hhPx-buyPx);
      }else{q.fillStyle=k.c>=k.o?candleLongColor:candleShortColor;q.fillRect(leftPx,basePx-hhPx,barPx,hhPx);}
    }
    q.restore();q.restore();q.globalAlpha=1;
  }
  const now=densityReferenceTime ?? Date.now();
  const tfPriority=(z:AutoLevel['tf'])=>z==='1d'?3:z==='4h'?2:z==='1h'?1:z==='30m'?.85:z==='15m'?.7:.5;
  const tfRank:{[k:string]:number}={'1m':1,'3m':1,'5m':1,'15m':1,'30m':1,'1h':1,'4h':2,'1d':3};
  const chartRank=tfRank[tf]||1;
  const allowedLevel=(l:AutoLevel)=>chartRank===3?l.tf==='1d':chartRank===2?(l.tf==='4h'||l.tf==='1d'):true;
  const currentPrice=candles.at(-1)?.c||((g.hi+g.lo)/2);
  // Sorting every frame produced the same order until price or levels change.
  // A price-range filter preserves stable rank among visible levels.
  const rawLevels=(rankedAutoLevelsForPan||autoLevels).filter(l=>allowedLevel(l)&&l.p>=g.lo&&l.p<=g.hi);
  const quota:{[k:string]:number}=chartRank===3?{'1d':6}:chartRank===2?{'4h':4,'1d':4}:{'5m':3,'15m':3,'30m':3,'1h':3,'4h':3,'1d':3};
  const rankedLevels=rankedAutoLevelsForPan?rawLevels:[...rawLevels].sort((a,b)=>{
    const quality=(l:AutoLevel)=>l.strength*.72+tfPriority(l.tf)*6+(l.broken?-18:0)+Math.max(0,12-Math.abs(l.p-currentPrice)/Math.max(currentPrice,1e-12)*220);
    return quality(b)-quality(a)
  });
  const perTf:{[k:string]:number}={},preselected:AutoLevel[]=[];
  for(const l of rankedLevels){const max=quota[l.tf]||0;if(!max||((perTf[l.tf]||0)>=max))continue;if(l.broken&&preselected.filter(x=>x.broken).length>=2)continue;preselected.push(l);perTf[l.tf]=(perTf[l.tf]||0)+1}
  // Keep enough vertical air between rays. When zooming in, more levels naturally fit.
  // Fractional desktop sizes can become invisible strokes on a phone. Keep mobile captions readable.
  const levelFontSize=Math.max(8,Math.min(24,Number.isFinite(levelLabelSize)?levelLabelSize:9));
  const autoLevelLineWidth=Math.max(.2,Math.min(5,Number.isFinite(levelLineWidth)?levelLineWidth:.3));
  const levelMinGap=Math.max(levelFontSize+(levelLabelStyle==='text'?8:16),20,Math.min(38,26+(9-vp.barWidth)*.35));
  const scaleAwareLevels:AutoLevel[]=[];
  for(const l of preselected){const yy=g.y(l.p);const conflict=scaleAwareLevels.find(x=>Math.abs(g.y(x.p)-yy)<levelMinGap);if(!conflict)scaleAwareLevels.push(l)}
  scaleAwareLevels.sort((a,b)=>a.p-b.p).forEach(l=>{
    const yy=g.y(l.p),origin=g.x(l.firstTime);const x0=origin>g.plotW?0:Math.max(0,origin),broken='#777B80',col=l.broken?broken:levelLabelColor;
    q.strokeStyle=col;q.globalAlpha=l.broken?.62:.96;q.lineWidth=autoLevelLineWidth;q.setLineDash(levelLineStyle==='dash'?[7,5]:levelLineStyle==='dot'?[2,4]:[]);q.beginPath();q.moveTo(x0,yy);q.lineTo(g.plotW,yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;
    const showLabel=levelLabelMode==='always'||(levelLabelMode==='hover'&&mouse&&Math.abs(mouse.y-yy)<9);
    if(showLabel){
      q.save();q.textAlign='left';q.textBaseline='middle';q.font=`${l.strength>=72?'600':'400'} ${levelFontSize}px system-ui`;
      const txt=`${levelPrice(l.p)}  ${l.tf}`,tw=q.measureText(txt).width,boxed=levelLabelStyle!=='text',pad=boxed?4:0;
      const labelW=tw+pad*2,labelH=levelFontSize+(boxed?6:0),lx=Math.max(3,Math.min(g.plotW-labelW-3,origin<0?6:origin+4));
      // Keep the price and timeframe together, centered inside the same label.
      const top=Math.max(2,Math.min(g.plotH-labelH-2,boxed?yy-labelH/2:l.kind==='RESIST'?yy-labelH-5:yy+2));
      if(boxed){
        q.fillStyle=levelLabelStyle==='filled'?col:CHART_THEME.bg;q.fillRect(lx,top,labelW,labelH);
        if(levelLabelStyle==='outline'){q.strokeStyle=col;q.lineWidth=1;q.strokeRect(lx,top,labelW,labelH)}
      }
      const rgb=parseInt(col.slice(1),16),light=((rgb>>16)*.299+((rgb>>8)&255)*.587+(rgb&255)*.114)>150;
      q.fillStyle=levelLabelStyle==='filled'?(light?CHART_THEME.bg:'#ffffff'):col;
      q.fillText(txt,lx+pad,top+labelH/2);q.restore();
    }
  });
   const densityQuote = densities.length ? hookChartDensityQuote(symbol) : null;
   if(showDensityLines||showDensityLabels)for(const d of densities){
     // Unsupported quote/contract units must not be mislabeled as USDT.
     if(!densityQuote)continue;
     // Same inclusive price gate and original order, without a temporary
     // visible-depth array on every full DPR Canvas paint.
     if(!(d.p>=g.lo&&d.p<=g.hi))continue;
     const yy=g.y(d.p), origin=g.x(d.first);
     const xx=origin>g.plotW?Math.max(0,g.plotW-g.step):Math.max(0,origin);
     const age=Math.max(0,Math.floor((now-d.first)/1000));
     const potential=highlightDensityReaction && d.reactionTier==='potential';
     const strong=highlightDensityReaction && !potential;
     const lineColor=potential?'#F2C35A':densityLineColor;
     const labelColor=potential?'#FFE3A0':densityLabelColor;
     if(showDensityLines){
       q.strokeStyle=lineColor;
       q.lineWidth=potential?Math.max(1.5,densityLineWidth*1.8):Math.max(.5,densityLineWidth)*(d.active?1:.75);
       q.globalAlpha=d.active?(strong ? .68 : 1):.45;
       q.setLineDash(densityLineStyle==='dash'?[7,5]:densityLineStyle==='dot'?[2,4]:[]);
       q.beginPath();q.moveTo(xx,yy);q.lineTo(g.plotW,yy);q.stroke();
       q.setLineDash([]);q.globalAlpha=1;
     }
     if(showDensityLabels){
       q.font=`${potential?'700':'600'} ${Math.max(8,densityLabelSize)}px system-ui`;
       const ageTxt=age<60?`${age}s`:age<3600?`${Math.floor(age/60)}m`:`${Math.floor(age/3600)}h`;
       const core=potential?`★ ${d.side} ${d.reactionScore ?? 0}/100`:d.touches>0?`x${d.touches}`:d.side;
       const details=showDensityAmounts?` · ${formatHookChartDensityNotional(d.usd,densityQuote,language)} · ${ageTxt}`:'';
       const txt=`${core}${details}`;
       const tw=q.measureText(txt).width;
       const lx=Math.max(5,Math.min(g.plotW-tw-5,origin<0?6:origin+4));
       q.fillStyle=labelColor;q.globalAlpha=d.active?(strong ? .75 : 1):.55;
       q.fillText(txt,lx,Math.max(12,yy-5));q.globalAlpha=1;
     }
   }
  if(showMarketPrintSums && marketPrints.length){
    // One per-candle summary, not the three largest individual bursts.
    // Keep BUY and SELL separate inside the same label and avoid text collisions
    // on compressed Terminal grids. Bucketing uses the candle open/close, not
    // nearest-index snapping (which misassigned end-of-candle executions).
    q.save();
    const printFontSize=Math.max(8,Math.min(22,marketPrintFontSize));
    const printArrowSize=Math.max(2,Math.min(16,marketPrintArrowSize));
    q.font=`700 ${printFontSize}px system-ui`;
    const buckets=visibleMarketPrintBuckets;
    const placed:{x:number,y:number,width:number}[]=[];
    const candidates=buckets.map(bucket=>{
      const candle=candles[bucket.index],x=g.x(candle.t);
      const parts=[
        ...(bucket.buyUsd>0?[{text:'B $'+formatUsd(bucket.buyUsd),color:candleLongColor}]:[]),
        ...(bucket.sellUsd>0?[{text:'S $'+formatUsd(bucket.sellUsd),color:candleShortColor}]:[]),
      ];
      const width=parts.reduce((sum,part)=>sum+q.measureText(part.text).width,0)+(parts.length-1)*7;
      const anchorY=Math.max(1,Math.min(g.plotH-2,g.y(candle.l)));
      const y=Math.max(printFontSize+2,Math.min(g.plotH-7,anchorY+printFontSize+7));
      return {bucket,x,anchorY,y,parts,width};
    }).filter(item=>item.x>=0&&item.x<=g.plotW&&item.width>0)
      .sort((a,b)=>b.bucket.totalUsd-a.bucket.totalUsd);
    for(const item of candidates){
      const x=Math.max(item.width/2+2,Math.min(g.plotW-item.width/2-2,item.x));
      if(placed.some(other=>Math.abs(other.x-x)<(other.width+item.width)/2+5&&Math.abs(other.y-item.y)<printFontSize+3))continue;
      placed.push({x,y:item.y,width:item.width});
      if(showMarketPrintArrows){
        q.strokeStyle=item.bucket.buyUsd>=item.bucket.sellUsd?candleLongColor:candleShortColor;
        q.lineWidth=1;q.beginPath();q.moveTo(item.x,item.anchorY+1);
        q.lineTo(item.x,Math.max(item.anchorY+2,item.y-printFontSize-2));q.stroke();
        // Arrow points to the candle, not to the label.
        const arrowY=Math.max(2,Math.min(g.plotH-7,item.anchorY+2));
        q.beginPath();q.moveTo(item.x-printArrowSize,arrowY+printArrowSize);
        q.lineTo(item.x,arrowY);q.lineTo(item.x+printArrowSize,arrowY+printArrowSize);q.stroke();
      }
      let textX=x-item.width/2;
      for(const part of item.parts){
        q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;
        q.strokeText(part.text,textX,item.y);
        q.fillStyle=part.color;q.fillText(part.text,textX,item.y);
        textX+=q.measureText(part.text).width+7;
      }
    }
    q.restore();
  }
  if(showLiquidations){
    // The feed contains events passing each side's own display preference/threshold.
    // Bucket real exchange events into their actual candle and show observed notional below it.
    for(const bucket of liquidationBuckets){
      const c=candles[bucket.index];if(!c)continue;
      const xx=g.x(c.t);if(xx<0||xx>g.plotW)continue;
      const anchorY=Math.max(1,Math.min(g.plotH-2,g.y(c.l)));
      const summary=`${formatUsd(bucket.totalUsd)}`;
      const detail=showLiquidationDetailSums?[showLiquidationLong?`L ${formatUsd(bucket.longUsd)}`:null,
        showLiquidationShort?`S ${formatUsd(bucket.shortUsd)}`:null].filter(Boolean).join(' · '):'';
      const col=bucket.longUsd>=bucket.shortUsd?'#ff6677':'#f0c95a';
      if (!showLiquidationCandleSums) {
        // Arrow and numeric amounts can be toggled independently.
        if(showLiquidationArrows){
          const size=Math.max(2,Math.min(16,liquidationArrowSize));
          q.save();q.fillStyle=col;q.globalAlpha=.92;
          const y=Math.max(3,Math.min(g.plotH-size*2-2,anchorY+4));
          q.beginPath();q.moveTo(xx,y);q.lineTo(xx-size,y+size*2);q.lineTo(xx+size,y+size*2);q.closePath();q.fill();q.restore();
        }
        continue;
      }
      q.save();q.textAlign='center';q.textBaseline='alphabetic';
      const liqTotalFont=Math.max(8,Math.min(22,liquidationSumFontSize));
      const liqDetailFont=Math.max(8,Math.min(22,liquidationDetailFontSize));
      q.font=`800 ${liqTotalFont}px system-ui`;const summaryW=q.measureText(summary).width;
      q.font=`700 ${liqDetailFont}px system-ui`;const detailW=q.measureText(detail).width,maxW=Math.max(summaryW,detailW);
      const tx=Math.max(maxW/2+2,Math.min(g.plotW-maxW/2-2,xx));
      const {baseY,totalY}=liquidationTextPosition(anchorY,g.plotH,liqTotalFont,liqDetailFont,Boolean(detail),showLiquidationArrows);
      // Arrowhead is at the candle, rather than an unmarked connecting line.
      const tipY=Math.max(3,Math.min(g.plotH-10,anchorY+2));
      const tailY=Math.min(g.plotH-3,Math.max(tipY+9,baseY-23));
      if(showLiquidationArrows&&tailY>tipY+6){
        const angle=Math.atan2(tipY-tailY,xx-tx),head=Math.max(2,Math.min(16,liquidationArrowSize));
        q.strokeStyle=col;q.lineWidth=1.25;q.globalAlpha=.9;
        q.beginPath();q.moveTo(tx,tailY);q.lineTo(xx,tipY);
        q.moveTo(xx-head*Math.cos(angle-.55),tipY-head*Math.sin(angle-.55));q.lineTo(xx,tipY);
        q.lineTo(xx-head*Math.cos(angle+.55),tipY-head*Math.sin(angle+.55));q.stroke();
      }
      q.globalAlpha=1;q.font=`800 ${liqTotalFont}px system-ui`;q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;
      
      q.strokeText(summary,tx,totalY);q.fillStyle=col;q.fillText(summary,tx,totalY);
      if(detail){q.font=`700 ${liqDetailFont}px system-ui`;q.strokeText(detail,tx,baseY+2);q.fillStyle='#c7d0dc';q.fillText(detail,tx,baseY+2);}
      q.restore();
    }
  }

  if(strategyResult&&!archiveCapture){const events=strategyResult.events.slice().sort((a,b)=>a.t-b.t);q.save();for(const e of events){if(e.zone){const y0=g.y(e.zone.high),y1=g.y(e.zone.low),top=Math.max(0,Math.min(y0,y1)),bot=Math.min(g.plotH,Math.max(y0,y1));if(bot>top){q.fillStyle=e.direction==='bullish'?'rgba(38,166,154,.055)':e.direction==='bearish'?'rgba(239,83,80,.055)':'rgba(123,145,171,.045)';q.fillRect(0,top,g.plotW,Math.max(1,bot-top))}}if(e.lines)for(const ln of e.lines){const x0=g.x(ln.t0),x1=g.x(ln.t1),y0=g.y(ln.p0),y1=g.y(ln.p1);q.strokeStyle='#8aa4c3';q.globalAlpha=.78;q.lineWidth=1;q.setLineDash([5,4]);q.beginPath();q.moveTo(x0,y0);q.lineTo(x1,y1);q.stroke()}const xx=g.x(e.t),yy=e.p!=null?g.y(e.p):NaN;if(xx<0||xx>g.plotW||!Number.isFinite(yy)||yy<0||yy>g.plotH)continue;const col=e.type==='OVERHEAT'?'#f0a45d':e.type==='FAILED_BREAKOUT'?'#ef6b73':e.direction==='bullish'?'#56c5aa':e.direction==='bearish'?'#e8787e':'#91a4bd';q.globalAlpha=.95;q.fillStyle=col;q.beginPath();q.arc(xx,yy,2.6,0,Math.PI*2);q.fill();q.font='700 9px system-ui';const text=`${translateHookChartPhrase(language,e.label)} ${e.score}`,tw=q.measureText(text).width,tx=Math.max(3,Math.min(g.plotW-tw-3,xx+5)),ty=Math.max(11,Math.min(g.plotH-4,yy+(e.direction==='bearish'?14:-7)));q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(text,tx,ty);q.fillStyle=col;q.fillText(text,tx,ty)}q.setLineDash([]);q.globalAlpha=1;q.restore()}
  // Opt-in scalp geometry belongs to the market scene, not the user's drawings.
  // Strictly bounded: at most two structures, four lines and sixteen touch dots.
  // All Scalper-only circular markers (filled contacts and outlined breakout rings)
  // are presentation gated by one preference, never by separate saved layers.
  // Every automatic Scalper line uses one preference; touch dots and text remain unchanged.
  // Keep the configured CSS width; only the raster stroke resolves to physical pixels.
  const scalperStrokeWidth = scalperRasterStrokeWidth(normalizeScalperLineWidth(scalperLineWidth), scaleX, scaleY);
  const cascadeStroke = cascadeStrokeAppearance(scalperLineWidth, scaleX, scaleY);
  if (scalperResult?.setups.length) {
    q.save();
    for (const setup of scalperResult.setups) {
      // Use the same visible-line subset for drawing, contact dots and labels.
      // Otherwise the first (expired) level can leave ghost captions/markers
      // even when only another cascade tier is still active.
      const visibleLines = setup.lines.filter(line =>
        setup.kind === 'cascade' ? activeCascadeLines.has(line)
          : line.from.p === line.to.p || activeDiagonalLines.has(line));
      if (!visibleLines.length) continue;
      const color = setup.status === 'failed' ? '#f0a66d'
        : setup.status === 'confirmed' ? '#57c9a4'
        : setup.status === 'possible' ? '#ead178' : '#8baac8';
      const setupAlpha = setup.status === 'forming' ? .67 : .92;
      q.globalAlpha = setupAlpha;
      for (const line of setup.lines) {
        if (setup.kind === 'cascade' && !activeCascadeLines.has(line)) continue;
        if (setup.kind !== 'cascade' && line.from.p !== line.to.p &&
            !activeDiagonalLines.has(line)) continue;
        const x0 = g.x(line.from.t), x1 = g.x(line.to.t);
        const rawY0 = g.y(line.from.p), rawY1 = g.y(line.to.p);
        // Cascade levels alone are 0.1 CSS px thinner; diagonal geometry and
        // other Scalper styles retain the user's existing line-width setting.
        const drawStrokeWidth = setup.kind === 'cascade' ? cascadeStroke.width : scalperStrokeWidth;
        const horizontalLine = line.from.p === line.to.p;
        const y0 = horizontalLine ? scalperPixelCenteredHorizontalY(rawY0, drawStrokeWidth, scaleY) : rawY0;
        const y1 = horizontalLine ? y0 : rawY1;
        if (![x0,x1,y0,y1].every(Number.isFinite)) continue;
        q.beginPath();
        q.setLineDash(scalperLineDash(scalperLineStyle, setup.status));
        q.lineWidth = scalperStrokeWidth;
        if (setup.kind === 'cascade') q.lineWidth = cascadeStroke.width;
        q.globalAlpha = setupAlpha * (setup.kind === 'cascade' ? cascadeStroke.coverage : 1);
        q.strokeStyle = color;
        // Project horizontal cascade tiers and the breakout boundary all
        // the way to the price-scale divider, independently of future candles.
        // Preserve the detector's original time/price coordinates.
        const renderedEndX = scalperRenderedLineEndX(setup.kind, line, x1, g.plotW);
        const cascadeRay = setup.kind === 'cascade' && renderedEndX === g.plotW
          && line.from.p === line.to.p;
        if (cascadeRay && x0 > g.plotW) continue; // Do not paint before the pivot exists.
        // A surviving cascade starts at its real historical wick pivot.
        // The ray spans the existing chart all the way to the price scale;
        // a later crossing has already removed it from activeCascadeLines.
        q.moveTo(cascadeRay ? Math.max(0, x0) : x0, y0);
        q.lineTo(renderedEndX, y1);
        q.stroke();
        if (cascadeRay && y1 >= 0 && y1 <= g.plotH) {
          // With a dashed style the last dash can be a gap, looking as though
          // the cascade stops short of the scale. Finish with a tiny solid tip.
          q.setLineDash([]);
          q.beginPath();
          q.moveTo(Math.max(0, g.plotW - 2), y1);
          q.lineTo(g.plotW, y1);
          q.stroke();
        }
      }
      q.globalAlpha = setupAlpha;
      q.setLineDash([]);
      if (showScalperTouchPoints) for (const touch of setup.touches) {
        // Cascade tier annotations cannot outlive their own removed rays.
        // Exact wick prices are used, with only a floating-point tolerance.
        if (setup.kind === 'cascade' && !visibleLines.some(line =>
          Math.abs(line.from.p - touch.p) <= Math.max(1e-12, Math.abs(touch.p) * 1e-12))) continue;
        const x = g.x(touch.t), y = g.y(touch.p);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < -3 || x > g.plotW + 3 || y < -3 || y > g.plotH + 3) continue;
        q.beginPath(); q.arc(x,y,2.3,0,Math.PI*2);
        q.fillStyle = color; q.fill();
      }
      // The outlined breakout ring is also a Scalper point. It must follow
      // the same per-profile visibility switch as filled wick-contact dots.
      // Only the canvas annotation is hidden: keep the detected breakout and
      // its status, line geometry and optional text intact.
      if (showScalperTouchPoints && setup.breakout) {
        const x = g.x(setup.breakout.t), y = g.y(setup.breakout.p);
        if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= g.plotW && y >= 0 && y <= g.plotH) {
          q.beginPath(); q.arc(x,y,4,0,Math.PI*2);
          q.lineWidth = 1.5; q.strokeStyle = color; q.stroke();
        }
      }
      const anchor = visibleLines[0]?.to;
      if (anchor && showScalperLabels) {
        const y = g.y(anchor.p), x = g.x(anchor.t);
        if (Number.isFinite(x) && Number.isFinite(y) && y > 9 && y < g.plotH - 9) {
          const message = scalperLabel(setup.kind,language) + ' · ' + scalperLabel(setup.status,language);
          q.font = '600 9px system-ui';
          const width = q.measureText(message).width;
          const tx = Math.max(4, Math.min(g.plotW - width - 4, x + 7));
          const ty = Math.max(12, Math.min(g.plotH - 5, y - 7));
          q.lineWidth = 3; q.strokeStyle = CHART_THEME.bg;
          q.strokeText(message,tx,ty); q.fillStyle = color; q.fillText(message,tx,ty);
        }
      }
    }
    q.restore();
  }
  drawHookTimeMarkers(q,g,timeMarkers,mouse);
  const priceTags:{price:number;label:string;bg:string;fg:string;y:number;current?:boolean}[]=[];
  const priceTag=(price:number,label:string,bg:string,fg='#ffffff')=>{const yy=g.y(price);if(yy>=0&&yy<=g.plotH)priceTags.push({price,label,bg,fg,y:yy})};
  // Mark the actionable outer tier at its actual price on the right axis.
  // One badge per cascade, rather than one per closely packed inner shelf,
  // keeps compact Terminal charts and price-scale labels readable.
  if (scalperResult?.setups.length) for (const setup of scalperResult.setups) {
    if (setup.kind !== 'cascade') continue;
    const boundary = setup.lines.find(line => line.role === 'upper' || line.role === 'lower');
    if (!boundary || !activeCascadeLines.has(boundary) ||
        boundary.from.p !== boundary.to.p || g.x(boundary.from.t) > g.plotW) continue;
    const color = setup.status === 'failed' ? '#f0a66d'
      : setup.status === 'confirmed' ? '#57c9a4'
      : setup.status === 'possible' ? '#ead178' : '#8baac8';
    priceTag(boundary.from.p, '', color, '#101722');
  }
  for(const marker of paintedMarkers){
    const isSupportResistance=marker.type==='support'||marker.type==='resistance';
    if(isSupportResistance&&!autoSR)continue;
    if(!Number.isFinite(marker.price)||marker.price<=0)continue;
    const yy=g.y(marker.price);if(yy<0||yy>g.plotH)continue;
    q.save();q.strokeStyle=marker.color;q.fillStyle=marker.color;q.lineWidth=marker.lineWidth||1;
    q.setLineDash(marker.lineStyle==='solid'?[]:marker.lineStyle==='dotted'?[2,4]:[6,4]);
    if(marker.type==='pattern_point'&&marker.time!=null){
      const xx=g.x(marker.time*1000);if(xx>=0&&xx<=g.plotW){q.beginPath();q.arc(xx,yy,4,0,Math.PI*2);q.fill();q.font='10px system-ui';q.fillText(translateHookChartPhrase(language,marker.label),Math.min(g.plotW-70,xx+7),Math.max(12,yy-8))}
    }else{
      q.beginPath();q.moveTo(0,yy);q.lineTo(g.plotW,yy);q.stroke();q.setLineDash([]);
      if(!isSupportResistance||showSRLabels){
        q.font='600 10px system-ui';const label=isSupportResistance?`${translateHookChartPhrase(language,marker.label)} ${marker.timeframe||tf}`:translateHookChartPhrase(language,marker.label),tx=6,ty=Math.max(12,Math.min(g.plotH-4,yy-5));q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(label,tx,ty);q.fillText(label,tx,ty);
        priceTag(marker.price,'',marker.color);
      }
    }
    q.restore();
  }
  const horizontalStrokeWidth=Math.max(0.2,Math.min(5,Number.isFinite(horizontalDrawingLineWidth)?horizontalDrawingLineWidth:0.4));
  const trendStrokeWidth=Math.max(0.2,Math.min(5,Number.isFinite(trendDrawingLineWidth)?trendDrawingLineWidth:0.4));
  drawings.filter(d=>d.id.startsWith(symbol+':')).forEach(d=>{
    if(!d.pts.length)return;
    const selected=d.id===selectedDrawingId;
    q.strokeStyle=selected?'#dce5ef':'#aeb8c6';q.fillStyle='#aeb8c6';q.lineWidth=d.type==='trend'?trendStrokeWidth:d.type==='level'?horizontalStrokeWidth:(selected?1.6:1.25);
    const a=d.pts[0],x1=g.x(a.t),y1=g.y(a.p);
    if(d.type==='level'){
      q.beginPath();q.moveTo(0,y1);q.lineTo(g.plotW,y1);q.stroke();priceTag(a.p,'L','#3b4655','#dce5ef');
    }else if(d.type==='text'){
      q.fillText(d.text||'Note',x1,y1);
    }else if(d.type==='profile'&&d.pts[1]){
      const pd=profileData(d,g);if(!pd)return;
      const anchor=Math.max(pd.xL+8,pd.xR),barMax=Math.min(pd.profileW,Math.max(44,anchor-pd.xL));
      q.save();q.beginPath();q.rect(0,0,g.plotW,g.plotH);q.clip();
      q.strokeStyle=selected?'rgba(220,229,239,.55)':'rgba(174,184,198,.28)';q.lineWidth=selected?1:0.7;q.setLineDash([3,4]);
      q.strokeRect(pd.xL+.5,Math.max(0,pd.yTop)+.5,Math.max(1,pd.xR-pd.xL),Math.max(1,pd.yBottom-pd.yTop));q.setLineDash([]);
      for(let i=0;i<pd.bins.length;i++){
        const bin=pd.bins[i];if(!bin.total||!pd.maxV)continue;
        const p0=pd.pLo+i*pd.step,p1=p0+pd.step,yt=Math.max(0,g.y(p1)),yb=Math.min(g.plotH,g.y(p0));if(yb<0||yt>g.plotH)continue;
        const hh=Math.max(1,yb-yt),ww=Math.max(1,barMax*(bin.total/pd.maxV)),buyW=ww*(bin.buy/bin.total),sellW=ww-buyW,x0=anchor-ww;
        q.globalAlpha=i===pd.poc?.92:.62;
        if(sellW>0){q.fillStyle='#EF5350';q.fillRect(x0,yt+1,sellW,Math.max(1,hh-1))}
        if(buyW>0){q.fillStyle='#26A69A';q.fillRect(x0+sellW,yt+1,buyW,Math.max(1,hh-1))}
      }
      q.globalAlpha=1;
      const pocPrice=pd.pLo+(pd.poc+.5)*pd.step,pocY=g.y(pocPrice);
      if(pocY>=0&&pocY<=g.plotH){q.strokeStyle='#d7ad55';q.lineWidth=1.15;q.beginPath();q.moveTo(pd.xL,pocY);q.lineTo(anchor,pocY);q.stroke();q.fillStyle='#d7ad55';q.font='600 10px system-ui';q.fillText(`POC ${fmt(pocPrice,pocPrice<10?4:2)}`,Math.max(pd.xL+3,anchor-88),Math.max(11,pocY-3))}
      // Unified DOM action dock paints the edit/delete controls for every shape.
      q.restore();
    }else if(d.pts[1]){
      const b=d.pts[1],x2=g.x(b.t),y2=g.y(b.p);
      if(d.type==='ruler'){
        paintMeasurement(q,g,a,b,measurementStats(candles,a,b,intervalMs),language,hoveredMeasurement.current===d.id,selected);

      }else if(d.type==='fib'){
        const lx=Math.max(0,Math.min(g.plotW,Math.min(x1,x2))),rx=Math.max(0,Math.min(g.plotW,Math.max(x1,x2))),span=Math.max(1,rx-lx),dp=b.p-a.p;
        q.save();q.beginPath();q.rect(0,0,g.plotW,g.plotH);q.clip();q.font='600 10px system-ui';q.textBaseline='bottom';
        for(let fi=0;fi<FIB_LEVELS.length;fi++){const r=FIB_LEVELS[fi],price=a.p+dp*r,yy=g.y(price);if(yy<0||yy>g.plotH)continue;const col=FIB_COLORS[fi];q.strokeStyle=col;q.globalAlpha=selected?.95:.72;q.lineWidth=r===.5||r===.618?1.15:.85;q.setLineDash([]);q.beginPath();q.moveTo(lx,yy);q.lineTo(rx,yy);q.stroke();const label=`${r.toFixed(r===0||r===1?0:3)}  ${formatCryptoPrice(price)}`;q.globalAlpha=1;q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(label,Math.min(g.plotW-110,rx+5),Math.max(11,yy-2));q.fillStyle=col;q.fillText(label,Math.min(g.plotW-110,rx+5),Math.max(11,yy-2))}
        q.globalAlpha=1;q.strokeStyle=selected?'rgba(220,229,239,.48)':'rgba(174,184,198,.24)';q.lineWidth=.7;q.setLineDash([3,4]);q.strokeRect(lx+.5,Math.min(y1,y2)+.5,span,Math.max(1,Math.abs(y2-y1)));q.setLineDash([]);
        q.fillStyle=editingDrawingId===d.id?'#ffffff':(selected?'#dce5ef':'#aeb8c6');for(const [xx,yy] of [[x1,y1],[x2,y2]]){q.beginPath();q.arc(xx,yy,editingDrawingId===d.id?4:2.5,0,Math.PI*2);q.fill()}q.restore();
      }else{
        if(d.type==='rect'){
          // A rectangle is four edges: do not draw a diagonal between anchors.
          q.strokeRect(x1,y1,x2-x1,y2-y1);
        }else{
          const end=d.type==='ray'?rayEndPoint(x1,y1,x2,y2,g.plotW,g.plotH):{x:x2,y:y2};
          q.beginPath();q.moveTo(x1,y1);q.lineTo(end.x,end.y);q.stroke();
        }
        if(d.type==='trend'){q.fillStyle=editingDrawingId===d.id?'#ffffff':(selected?'#dce5ef':'#aeb8c6');q.beginPath();q.arc(x1,y1,editingDrawingId===d.id?4:2.5,0,Math.PI*2);q.fill();q.beginPath();q.arc(x2,y2,editingDrawingId===d.id?4:2.5,0,Math.PI*2);q.fill()}
      }
      // Actions are accessible HTML buttons; canvas only paints drawing handles.
    }
    if(selected&&editingDrawingId===d.id){
      q.save();q.fillStyle='#f0c95a';q.strokeStyle='#131722';q.lineWidth=1.5;
      const bounds=d.type==='profile'?profileData(d,g):null;
      for(const p of d.pts.slice(0,2)){
        const xx=Math.max(6,Math.min(g.plotW-6,g.x(p.t)));
        const yy=d.type==='profile'&&bounds?bounds.yTop+2:g.y(p.p);
        if(yy<-6||yy>g.plotH+6)continue;
        q.beginPath();q.arc(xx,Math.max(6,Math.min(g.plotH-6,yy)),5,0,Math.PI*2);q.fill();q.stroke();
      }
      q.restore();
    }
  });
  const previewAnchor=drag.current?.kind==='drawingRangePlacement'?drag.current.first:draft;
  if(isRangeDrawingTool(tool)&&previewAnchor&&mouse&&mouse.x>=0&&mouse.x<=g.plotW&&mouse.y>=0&&mouse.y<=g.plotH){
    const end=tool==='ruler'?freeDrawingPoint(mouse.x,mouse.y,g):snap(mouse.x,mouse.y,g),x1=g.x(previewAnchor.t),y1=g.y(previewAnchor.p),x2=g.x(end.t),y2=g.y(end.p);q.save();
    if(tool==='profile'){const lx=Math.min(x1,x2),rx=Math.max(x1,x2);q.fillStyle='rgba(100,126,156,.08)';q.fillRect(lx,0,Math.max(1,rx-lx),g.plotH);q.strokeStyle='rgba(220,229,239,.65)';q.lineWidth=1;q.setLineDash([4,4]);q.strokeRect(lx+.5,.5,Math.max(1,rx-lx),g.plotH-1)}
    else if(tool==='fib'){const lx=Math.min(x1,x2),rx=Math.max(x1,x2),dp=end.p-draft.p;q.font='600 10px system-ui';for(let fi=0;fi<FIB_LEVELS.length;fi++){const r=FIB_LEVELS[fi],price=draft.p+dp*r,yy=g.y(price),col=FIB_COLORS[fi];q.strokeStyle=col;q.globalAlpha=.78;q.lineWidth=r===.5||r===.618?1.1:.8;q.setLineDash([4,3]);q.beginPath();q.moveTo(lx,yy);q.lineTo(rx,yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;q.fillStyle=col;q.fillText(r.toFixed(r===0||r===1?0:3),Math.min(g.plotW-35,rx+4),Math.max(11,yy-2))}q.fillStyle='#dce5ef';for(const [xx,yy] of [[x1,y1],[x2,y2]]){q.beginPath();q.arc(xx,yy,2.5,0,Math.PI*2);q.fill()}}
    else if(tool==='ruler'){
      paintMeasurement(q,g,previewAnchor,end,measurementStats(candles,previewAnchor,end,intervalMs),language,false,false);
    }else{
      q.strokeStyle='#dce5ef';q.lineWidth=tool==='trend'?trendStrokeWidth:1.25;q.setLineDash([4,3]);
      if(tool==='rect')q.strokeRect(x1,y1,x2-x1,y2-y1);
      else{
        const end=tool==='ray'?rayEndPoint(x1,y1,x2,y2,g.plotW,g.plotH):{x:x2,y:y2};
        q.beginPath();q.moveTo(x1,y1);q.lineTo(end.x,end.y);q.stroke();
      }
      q.fillStyle='#dce5ef';
      for(const [xx,yy] of [[x1,y1],[x2,y2]]){q.beginPath();q.arc(xx,yy,2.5,0,Math.PI*2);q.fill()}
    }
    q.setLineDash([]);q.restore();
  }
  // A first tap leaves a visible first anchor for every two-point tool.
  if(isRangeDrawingTool(tool)&&draft&&!mouse){
    const x=g.x(draft.t),y=g.y(draft.p);
    if(x>=0&&x<=g.plotW&&y>=0&&y<=g.plotH){
      q.save();q.fillStyle='#ffffff';q.strokeStyle='#34cda7';q.lineWidth=1.5;
      q.beginPath();q.arc(x,y,5,0,Math.PI*2);q.fill();q.stroke();q.restore();
    }
  }
  // Light preview for single-point tools while positioning by a finger.
  if(drag.current?.kind==='drawingPointPlacement'&&mouse&&mouse.x>=0&&mouse.x<=g.plotW&&mouse.y>=0&&mouse.y<=g.plotH){
    const point=snap(mouse.x,mouse.y,g),yy=g.y(point.p);
    q.save();q.strokeStyle=tool==='alert'?'#d95763':'#60a5fa';q.fillStyle=q.strokeStyle;q.lineWidth=1;q.setLineDash([4,4]);
    if(tool==='text'){
      q.setLineDash([]);q.font='600 11px system-ui';
      q.fillText(textLabel||'Note',Math.max(2,mouse.x),Math.max(12,mouse.y));
    }else{
      q.beginPath();q.moveTo(0,yy);q.lineTo(g.plotW,yy);q.stroke();
    }
    q.restore();
  }
  (archiveCapture ? [] : alerts).filter(a=>a.id.startsWith(symbol+':')).forEach(a=>{const yy=g.y(a.p);if(yy<0||yy>g.plotH)return;const col=a.fired?'#5c6673':'#d95763';q.strokeStyle=col;q.lineWidth=1;q.globalAlpha=a.fired?.45:.72;q.setLineDash([3,5]);q.beginPath();q.moveTo(0,yy);q.lineTo(g.plotW,yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;q.fillStyle=col;q.beginPath();q.moveTo(g.plotW-7,yy);q.lineTo(g.plotW-1,yy-4);q.lineTo(g.plotW-1,yy+4);q.closePath();q.fill()});
  // Live current-price guide: a fine dotted ray from the latest candle to the price scale,
  // plus a filled price badge using the current candle direction color.
  {const last=candles.at(-1);if(last){const py=g.y(last.c),lastX=g.x(last.t),priceCol=last.c>=last.o?candleLongColor:candleShortColor;if(py>=0&&py<=g.plotH){q.save();q.strokeStyle=priceCol;q.globalAlpha=.92;q.lineWidth=1;q.setLineDash([2,3]);if(lastX<=g.plotW){q.beginPath();q.moveTo(Math.max(0,lastX+Math.max(2,g.step*.32)),py+.5);q.lineTo(g.plotW,py+.5);q.stroke()}q.restore();priceTags.push({price:last.c,label:'',bg:priceCol,fg:'#ffffff',y:py,current:true})}}}
  // Restore the plot clip before painting a separate opaque price-scale column.
  q.restore();
  q.save();q.globalAlpha=1;q.setLineDash([]);
  q.fillStyle=backgroundColor;q.fillRect(g.priceX,0,AX,g.plotH);
  q.strokeStyle=CHART_THEME.scaleDivider;q.lineWidth=hair;
  q.beginPath();q.moveTo(strokeX(g.priceX),0);q.lineTo(strokeX(g.priceX),g.plotH);q.stroke();
  q.textAlign='left';q.fillStyle=CHART_THEME.scaleText;let priceTickCount=0;
  const roundReference=candles.at(-1)?.c||Math.max(Math.abs(firstPriceTick),priceStep,1);
  for(let p=firstPriceTick;p<=g.hi+priceStep*.25&&priceTickCount<64;p=firstPriceTick+(++priceTickCount)*priceStep){
    const value=Math.abs(p)<priceStep*1e-9?0:p,yy=g.y(value);if(yy<-2||yy>g.plotH+2)continue;
    const round=isRoundPrice(value,roundReference,roundness);
    q.font=round?'700 14px Arial,sans-serif':'400 13px Arial,sans-serif';
    const label=fmt(value,priceDecimals),labelX=g.priceX+4,labelY=Math.max(14,Math.min(g.plotH-5,yy+5));q.lineWidth=3;q.strokeStyle='rgba(19,23,34,.88)';q.strokeText(label,labelX,labelY,AX-8);q.fillStyle=CHART_THEME.scaleText;q.fillText(label,labelX,labelY,AX-8);
  }
  const tagTops=layoutPriceScaleLabels(priceTags,g.plotH),tagW=AX-2;
  q.font='700 12px system-ui';q.textAlign='center';q.textBaseline='middle';
  priceTags.forEach((tag,index)=>{const top=tagTops[index],text=`${tag.label} ${formatCryptoPrice(tag.price)}`.trim();q.fillStyle=tag.bg;q.fillRect(g.priceX+1,top,tagW,HOOKCHART_PRICE_LABEL_HEIGHT);q.fillStyle=tag.fg;q.fillText(text,g.priceX+1+tagW/2,top+HOOKCHART_PRICE_LABEL_HEIGHT/2+.5,tagW-2)});
  q.restore();
  interactionDrawRef.current();
  // Date/time axis is rendered as a dedicated synchronized row below indicator panels.
 };
 drawRef.current=draw;
 // Every HookChart can receive multiple market/viewport commits per display frame.
 // Paint the freshest complete scene once per RAF, including the standalone chart:
 // synchronous fullscreen/Replay paints used to block mouse drag and zoom input.
 // The actual candles remain drawn at the selected native Canvas DPR.
 useLayoutEffect(()=>{
   if(document.visibilityState==='hidden'||!chartOnScreen.current){frames.current?.cancel();return}
   frames.current?.request(true);
 },[candles,vp,drawings,alerts,densities,marketPrints,liquidations,autoLevels,markers,timeMarkers,splitVolumes,backgroundColor,gridColor,levelLabelMode,levelLabelColor,levelLabelSize,levelLineWidth,levelLabelStyle,levelLineStyle,crosshairLineWidth,maxCanvasDpr,horizontalDrawingLineWidth,trendDrawingLineWidth,scalperLineWidth,symbol,tf,draft,selectedDrawingId,editingDrawingId,tool,rightPadding,rightPaddingBars,roundGrid,roundness,gridHorizontal,gridVertical,showMarketPrintSums,showMarketPrintArrows,marketPrintArrowSize,marketPrintFontSize,marketPrintMinUsd,showVolumes,showLiquidations,showLiquidationCandleSums,showLiquidationDetailSums,showLiquidationArrows,liquidationArrowSize,liquidationSumFontSize,liquidationDetailFontSize,liquidationHeatmap,modeledLiquidationBands,showDensityLines,showDensityLabels,showDensityAmounts,highlightDensityReaction,candleLongColor,candleShortColor,densityLineColor,densityLabelColor,densityLineWidth,densityLineStyle,densityLabelSize,autoSR,showSRLabels,autoPrevDay,autoDayOpen,autoVWAP,autoLocalHL,autoRoundLevels,autoPOC,autoStops,autoChannel,channelModel,strategyResult,scalperResult,scalperLineStyle,showScalperTouchPoints,showScalperLabels,marketRecurrenceMarks,cascadeRisk.score,cascadeRisk.level,cascadeRisk.total5,cascadeRisk.count5,liquidationCut,timezone,language,terminalMode,keyboardMagnifierActive]);
 useEffect(()=>{
   const cancel=()=>{resetInteractionRef.current();scheduleDraw()};
   const visibility=()=>{if(document.visibilityState==='hidden')cancel()};
   window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',visibility);
   return()=>{window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',visibility)};
 },[]);
 const point=(e:React.PointerEvent<HTMLElement>)=>{
   if(!candles.length)return null;
   // Hover must follow layout changes immediately; captured drags use their
   // pointer-down rectangle, invalidated by scroll/resize above.
   const captured=pointers.current.has(e.pointerId);
   const r=(captured?activePointerRect.current:null)
     ||ref.current?.getBoundingClientRect();if(!r)return null;
   if(captured&&!activePointerRect.current)activePointerRect.current=r;
   const cached=geom.current,g=cached&&cached.r.width===r.width&&cached.r.height===r.height?cached:geometry();
   if(!g)return null;
   return{g,x:e.clientX-r.left,y:e.clientY-r.top,rect:r};
 };
 const handlePointerDown=(e:React.PointerEvent<HTMLElement>)=>{
   if(isChartControlTarget(e.target))return;
   // Never inspect geometry retained from the previous coin while new candles load.
   if(!candles.length){resetInteraction();scheduleDraw();return}
   const z=point(e);if(!z||z.x<0||z.x>z.g.r.width||z.y<0||z.y>z.g.r.height)return;
   terminalNavigation.current=true;
   if(terminalMode||e.pointerType==='touch'||e.pointerType==='pen')e.preventDefault();
   e.currentTarget.setPointerCapture(e.pointerId);
   activePointerRect.current=z.rect;
   // A second finger on the right price scale adjusts ONLY the active lens.
   // Keep the first finger's crosshair and the main chart viewport untouched.
   if(e.pointerType==='touch'&&magnifierPointer.current!==null
      &&pointers.current.has(magnifierPointer.current)&&pointers.current.size===1
      &&drag.current?.kind==='touchCursor'&&drag.current.inspecting
      &&zone(z.x,z.y,z.g)==='price'){
     cancelTouchHold();
     magnifierPriceDrag.current={id:e.pointerId,startY:z.y,startZoom:magnifierZoom.current};
     pointers.current.set(e.pointerId,{x:z.x,y:z.y});
     suppressTouchClick.current=true;
     scheduleDraw();
     return;
   }
   // Desktop: press and hold the middle mouse button for the same magnifier.
   // The browser's native middle-click auto-scroll must not start.
   if(e.pointerType==='mouse'&&e.button===1&&tool==='cursor'&&zone(z.x,z.y,z.g)==='plot'){
     e.preventDefault();
     cancelTouchHold();
     magnifierPointer.current=e.pointerId;
     magnifierZoom.current=TOUCH_MAGNIFIER_DEFAULT_ZOOM;
     magnifierPriceDrag.current=null;
     touchCursorVisible.current=true;
     suppressTouchClick.current=true;
     mouseRef.current={x:z.x,y:z.y};
     pointers.current.set(e.pointerId,{x:z.x,y:z.y});
     drag.current={kind:'touchCursor',x:z.x,y:z.y,vp:{...vp},g:z.g,panning:false,inspecting:true,startRightPaddingBars:rightPaddingBars};
     scheduleDraw();
     return;
   }
   cancelTouchHold();
   const previousCursor=mouseRef.current;
   const resumeCursor=tool==='cursor'&&zone(z.x,z.y,z.g)==='plot'&&(e.pointerType==='pen'||(e.pointerType==='touch'&&touchCursorVisible.current&&previousCursor&&(Math.abs(z.x-previousCursor.x)<=24||Math.abs(z.y-previousCursor.y)<=24)));
   touchCursorVisible.current=!!resumeCursor;
   if(!pointers.current.size)suppressTouchClick.current=!!resumeCursor;
   mouseRef.current={x:z.x,y:z.y};
   pointers.current.set(e.pointerId,{x:z.x,y:z.y});
   scheduleDraw();
   if(pointers.current.size>=2){
     // A second finger cancels unfinished geometry, then pinches normally.
     if(isRangeDrawingTool(tool))setDraft(null);
     magnifierPointer.current=null;transient.current=null;touchCursorVisible.current=false;suppressTouchClick.current=true;
     const a=[...pointers.current.values()];
     drag.current={kind:'pinch',distX:Math.max(1,Math.abs(a[0].x-a[1].x)),bar:vp.fitAll?Math.max(.001,z.g.step):vp.barWidth,anchor:z.g.virtualStart+(a[0].x+a[1].x)/2/z.g.step};
     return;
   }
   // Measurements can be resized from either endpoint or moved by dragging their
   // shaded range / label. Keep ordinary plotting and pinch gestures unchanged.
   if((tool==='cursor'||tool==='ruler')&&e.button===0&&zone(z.x,z.y,z.g)==='plot'){
     // Hit topmost ruler first without allocating a reversed drawings array.
     // The hit kind is reused to decide which endpoint is being dragged.
     let found:Drawing|undefined;
     let hit:ReturnType<typeof measurementHit>=null;
     for(let i=drawings.length-1;i>=0;i--){
       const item=drawings[i];
       if(item.type!=='ruler'||!item.id.startsWith(symbol+':')||!item.pts[1])continue;
       const candidate=measurementHit(z.g,item.pts[0],item.pts[1],z.x,z.y);
       if(candidate){found=item;hit=candidate;break}
     }
     if(found){
       hoveredMeasurement.current=found.id;
       if(typeof drawingActions!=='undefined')selectDrawingAt(found,z.x,z.y,z.g);
       else setSelectedDrawingId(found.id);
       setEditingDrawingId(null);
       drag.current={kind:'measurementDrag',drawingId:found.id,pointIndex:hit==='start'?0:hit==='end'?1:null,x:z.x,y:z.y,pts:found.pts.slice(0,2).map(p=>({...p})),moved:false};
       cancelTouchHold();scheduleDraw();return;
     }
   }
   // All two-point tools behave like the ruler: press, drag, release.
   // A short tap still sets the first anchor for a second tap. No tool adds
   // a magnifier or steals a chart gesture from a different active tool.
   if(isRangeDrawingTool(tool)&&e.button===0&&zone(z.x,z.y,z.g)==='plot'){
     const first=draft??(tool==='ruler'?freeDrawingPoint(z.x,z.y,z.g):snap(z.x,z.y,z.g));
     drag.current={kind:'drawingRangePlacement',tool,pointerId:e.pointerId,
       first,hadDraft:!!draft,x:z.x,y:z.y,moved:false};
     suppressTouchClick.current=e.pointerType!=='mouse';
     scheduleDraw(true);
     return;
   }
   // Horizontal level, text, and price alert have ONE anchor. Position it
   // precisely under the finger at release (tap or drag), never on press.
   if(isPointDrawingTool(tool)&&e.button===0&&zone(z.x,z.y,z.g)==='plot'){
     const existingAlertId=tool==='alert'&&onSelectPriceAlert
       ? hitAlertAt(z.x,z.y,z.g)?.id??null : null;
     drag.current={kind:'drawingPointPlacement',tool,pointerId:e.pointerId,
       x:z.x,y:z.y,moved:false,existingAlertId};
     suppressTouchClick.current=e.pointerType!=='mouse';
     scheduleDraw(true);
     return;
   }
   // Drag the selected anchors or reposition a whole shape; ruler retains
   // its independent measurement touch targets immediately above.
   if(tool==='cursor'&&drawings.some(item=>item.type!=='ruler')&&zone(z.x,z.y,z.g)==='plot'){
     const selected=editingDrawingId?drawings.find(d=>d.id===editingDrawingId&&d.id.startsWith(symbol+':')):null;
     const handle=selected?editHandleAt(selected,z.x,z.y,z.g):null;
     if(selected&&handle!==null){
       selectDrawingAt(selected,z.x,z.y,z.g);
       drag.current={kind:'editDrawingPoint',drawingId:selected.id,pointIndex:handle,x:z.x,y:z.y,moved:false};
       cancelTouchHold();return;
     }
     const hit=hitDrawing(z.x,z.y,z.g,e.pointerType==='mouse'?9:18);
     if(hit&&hit.type!=='ruler'){
       selectDrawingAt(hit,z.x,z.y,z.g);
       if(editingDrawingId!==hit.id)setEditingDrawingId(null);
       drag.current={kind:'moveDrawing',drawingId:hit.id,points:hit.pts.map(p=>({...p})),x:z.x,y:z.y,moved:false};
       cancelTouchHold();return;
     }
   }
   // Selecting a signal must not silently change the live server alert.
   if(tool==='cursor'&&e.pointerType!=='mouse'&&typeof alerts!=='undefined'&&alerts.length>0&&zone(z.x,z.y,z.g)==='plot'){
     const priceMarker=hitAlertAt(z.x,z.y,z.g);
     if(priceMarker){
       selectAlertAt(priceMarker.id,z.x,z.y,z.g);
       suppressTouchClick.current=true;
       drag.current={kind:'selectedPriceMarker'};
       cancelTouchHold();return;
     }
   }
   // Two-stage touch/pen inspection: a short hold reveals the freely movable
   // crosshair. Only a longer *stationary* hold adds the magnifier above it.
   // A normal immediate swipe still pans; moving after the short hold keeps
   // the cursor free and cancels the delayed magnifier activation.
   // Hold-to-inspect belongs to the plot only. On iOS a slow swipe on the
   // narrow right price scale otherwise arms the cursor hold and replaces the
   // price drag before it can resize the Y-axis.
   if((e.pointerType==='touch'||e.pointerType==='pen')&&tool==='cursor'
      &&zone(z.x,z.y,z.g)==='plot'){
     touchHold.current?.start(e.pointerId,{x:z.x,y:z.y},position=>{
       if(pointers.current.size!==1||!pointers.current.has(e.pointerId))return;
       drag.current={kind:'touchCursor',x:position.x,y:position.y,vp:{...vp},g:z.g,panning:false,inspecting:true,startRightPaddingBars:rightPaddingBars};
       magnifierPointer.current=null;
       touchCursorVisible.current=true;suppressTouchClick.current=true;
       mouseRef.current={x:position.x,y:position.y};
       if(transientRuler)transient.current={t:z.g.timeAtX(position.x),p:z.g.p(position.y)};
       scheduleDraw();
     },position=>{
       if(pointers.current.size!==1||!pointers.current.has(e.pointerId)||
          drag.current?.kind!=='touchCursor'||!drag.current.inspecting)return;
       mouseRef.current={x:position.x,y:position.y};
       magnifierPointer.current=e.pointerId;
       magnifierZoom.current=TOUCH_MAGNIFIER_DEFAULT_ZOOM;
       touchCursorVisible.current=true;
       scheduleDraw();
     });
   }

   const zn=zone(z.x,z.y,z.g);
   if((e.pointerType==='touch'||e.pointerType==='pen')&&tool==='cursor'&&zn==='plot'){
     drag.current={kind:'touchCursor',x:z.x,y:z.y,vp:{...vp},g:z.g,panning:false,inspecting:!!resumeCursor,startRightPaddingBars:rightPaddingBars};
     if(resumeCursor&&transientRuler)transient.current={t:z.g.timeAtX(z.x),p:z.g.p(z.y)};
     return;
   }
   drag.current={kind:zn,x:z.x,y:z.y,vp:{...vp},g:z.g,baseCenter:(z.g.hi+z.g.lo)/2,baseRange:z.g.hi-z.g.lo,startRightPaddingBars:rightPaddingBars};
 };
 const handlePointerMove=(e:React.PointerEvent<HTMLElement>)=>{
   if(!pointers.current.has(e.pointerId)&&isChartControlTarget(e.target))return;
   const z=point(e);if(!z)return;
   const priceGesture=magnifierPriceDrag.current;
   if(priceGesture?.id===e.pointerId){
     e.preventDefault();
     pointers.current.set(e.pointerId,{x:z.x,y:z.y});
     magnifierZoom.current=magnifierZoomFromPriceDrag(priceGesture.startZoom,z.y-priceGesture.startY);
     scheduleDraw();
     return;
   }
   if((drag.current?.kind==='drawingRangePlacement'||drag.current?.kind==='drawingPointPlacement')
      &&drag.current.pointerId===e.pointerId){
     // One captured pointer owns the entire draw gesture, even if it leaves
     // the candle plot. Clamp only the final point, not chart pan/zoom.
     e.preventDefault();
     const d=drag.current;
     const x=Math.max(0,Math.min(z.g.plotW-1,z.x)),y=Math.max(0,Math.min(z.g.plotH-1,z.y));
     d.moved=d.moved||rulerDragThresholdMet(d,{x,y});
     if(d.moved)suppressTouchClick.current=true;
     mouseRef.current={x,y};
     pointers.current.set(e.pointerId,{x,y});
     scheduleDraw(true);
     return;
   }
   if(transientRuler&&e.shiftKey&&!transient.current){const m=mouseRef.current||z;transient.current={t:z.g.timeAtX(m.x),p:z.g.p(m.y)}}
   mouseRef.current={x:z.x,y:z.y};
   scheduleDraw(!!draft||(levelLabelMode==='hover'&&autoLevels.length>0)||timeMarkers.length>0);
   if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:z.x,y:z.y});
   if(touchHold.current?.move(e.pointerId,{x:z.x,y:z.y}))return;
   if(transient.current){e.preventDefault();return}
   const d=drag.current;
   if(!d&&(tool==='cursor'||tool==='ruler')){
     let hit:Drawing|undefined;
     let action:ReturnType<typeof measurementHit>=null;
     if(zone(z.x,z.y,z.g)==='plot'){
       // Hover is a hot path: do not copy/reverse all drawing objects or
       // measure the same ruler twice just to identify its drag action.
       for(let i=drawings.length-1;i>=0;i--){
         const item=drawings[i];
         if(item.type!=='ruler'||!item.id.startsWith(symbol+':')||!item.pts[1])continue;
         const candidate=measurementHit(z.g,item.pts[0],item.pts[1],z.x,z.y);
         if(candidate){hit=item;action=candidate;break}
       }
     }
     if(hoveredMeasurement.current!==(hit?.id||null)){hoveredMeasurement.current=hit?.id||null;scheduleDraw()}
     if(hit&&typeof drawingActions!=='undefined'&&hit.id!==selectedDrawingId)selectDrawingAt(hit,z.x,z.y,z.g);
     if(box.current?.style)box.current.style.cursor=action==='start'||action==='end'?'crosshair':action==='body'?'move':'';
   }
   if(!d&&tool==='cursor'&&e.pointerType==='mouse'&&zone(z.x,z.y,z.g)==='plot'){
     const hit=drawings.some(item=>item.type!=='ruler')?hitDrawing(z.x,z.y,z.g):null;
     if(hit&&hit.id!==selectedDrawingId){selectDrawingAt(hit,z.x,z.y,z.g);setEditingDrawingId(null);}
     if(!hit&&alerts.length){const marker=hitAlertAt(z.x,z.y,z.g);if(marker&&marker.id!==alertActions?.id)selectAlertAt(marker.id,z.x,z.y,z.g);}
   }
   if(!d)return;
   if(d.kind==='measurementDrag'){
     const dx=z.x-d.x,dy=z.y-d.y;
     if(Math.hypot(dx,dy)<3&&!d.moved)return;
     d.moved=true;suppressTouchClick.current=true;
     // Measurement anchors use the same non-magnetic drawing coordinates
     // as trend/rectangle handles. Moving the whole range translates both
     // original anchors together without snapping to the nearest candle.
     const nextPoints = d.pointIndex===null
       ? translateDrawingPoints(d.pts,{x:d.x,y:d.y},{x:z.x,y:z.y},z.g)
       : d.pts.map((p:{t:number;p:number},i:number)=>
           i===d.pointIndex?freeDrawingPoint(z.x,z.y,z.g):p);
     setDrawings(list=>list.map(item=>item.id!==d.drawingId?item:{...item,pts:nextPoints}));
     return;
   }
   const gestureUpdate=(update:React.SetStateAction<Viewport>)=>schedulePointerGestureVp(update,d.kind==='pinch'||d.kind==='time'?'zoom':d.kind==='price'?'price':'pan');
   if(d.kind==='editDrawingPoint'){
     if(Math.hypot(z.x-d.x,z.y-d.y)<2&&!d.moved)return;
     d.moved=true;suppressDrawingClick.current=true;
     if(e.pointerType!=='mouse')suppressTouchClick.current=true;
     const p=freeDrawingPoint(z.x,z.y,z.g);
     setDrawings(list=>list.map(item=>item.id!==d.drawingId?item:{...item,pts:item.pts.map((pt,i)=>i===d.pointIndex?p:pt)}));
     return;
   }
   if(d.kind==='moveDrawing'){
     if(Math.hypot(z.x-d.x,z.y-d.y)<3&&!d.moved)return;
     d.moved=true;suppressDrawingClick.current=true;
     if(e.pointerType!=='mouse')suppressTouchClick.current=true;
     const pts=translateDrawingPoints(d.points,{x:d.x,y:d.y},{x:z.x,y:z.y},z.g);
     setDrawings(list=>list.map(item=>item.id!==d.drawingId?item:{...item,pts}));
     return;
   }
   // The price axis always owns vertical scaling, including while a drawing
   // tool is selected. Do not let touch-hold inspection or plot tools steal it.
   if(d.kind==='price'){
     const dy=z.y-d.y;
     if(Math.abs(dy)<2)return;
     e.preventDefault();
     d.moved=true;
     if(e.pointerType!=='mouse')suppressTouchClick.current=true;
     // Anchor to the range actually displayed when the finger landed, not
     // a stale saved manual range that Terminal auto-fit may have overridden.
     const base=Math.max(1e-14,d.baseRange||d.g.hi-d.g.lo);
     const nr=Math.max(1e-14,base*Math.exp(Math.max(-5,Math.min(5,dy/180))));
     const anchorY=Math.max(0,Math.min(d.g.plotH,d.y));
     const anchorPrice=d.g.p(anchorY);
     const anchorRatio=anchorY/Math.max(1,d.g.plotH)-.5;
     const center=anchorPrice+anchorRatio*nr;
     gestureUpdate(v=>({...v,autoY:false,manualCenter:center,manualRange:nr}));
     return;
   }
   if(d.kind==='pinch'&&pointers.current.size>=2&&(tool==='cursor'||isRangeDrawingTool(tool)||isPointDrawingTool(tool))){
     const a=[...pointers.current.values()],distX=Math.max(1,Math.abs(a[0].x-a[1].x)),ratio=terminalMode?distX/(d.distX||1):Math.max(.35,Math.min(3.2,distX/(d.distX||1)));
     const barWidth=Math.max(.12,Math.min(34,d.bar*ratio));
     const midX=(a[0].x+a[1].x)/2;
     gestureUpdate(v=>({...v,fitAll:false,barWidth,...(terminalMode?{rightOffset:candles.length+rightPaddingBars+rightPadding/barWidth-d.anchor-(z.g.plotW-midX)/barWidth}:{})}));return
   }
   if(tool!=='cursor')return;
   if(d.kind==='touchCursor'){
     const dx=z.x-d.x,dy=z.y-d.y;
     // Hold to inspect without moving the candles; a normal swipe still pans both axes.
     if(d.inspecting)return;
     if(!d.panning&&Math.hypot(dx,dy)>=5){d.panning=true;cancelTouchHold();suppressTouchClick.current=true}
     if(d.panning){
       const center=d.g.p(d.g.plotH/2-dy);
       gestureUpdate(v=>({...v,barWidth:d.vp.fitAll?Math.max(.12,d.g.step):v.barWidth,rightOffset:d.vp.rightOffset+dx/Math.max(.001,d.g.step)+rightPaddingBars-(d.startRightPaddingBars??rightPaddingBars),autoY:false,manualCenter:center,manualRange:d.vp.manualRange||d.g.hi-d.g.lo,fitAll:false}))
     }
     return
   }
   if(d.kind==='plot'){
     const dx=z.x-d.x,dy=z.y-d.y,nextOffset=d.vp.rightOffset+dx/Math.max(.001,d.vp.fitAll?d.g.step:d.vp.barWidth)+rightPaddingBars-(d.startRightPaddingBars??rightPaddingBars);
     const movedY=Math.abs(dy)>1.5||!d.vp.autoY;
     if(movedY){
       const center=d.baseCenter+(dy/Math.max(1,d.g.plotH))*d.baseRange;
       gestureUpdate(v=>({...v,barWidth:d.vp.fitAll?Math.max(.12,d.g.step):v.barWidth,rightOffset:nextOffset,autoY:false,manualCenter:center,manualRange:d.vp.manualRange||d.baseRange,fitAll:false}))
     }else gestureUpdate(v=>({...v,barWidth:d.vp.fitAll?Math.max(.12,d.g.step):v.barWidth,rightOffset:nextOffset,fitAll:false}))
   }else if(d.kind==='time'){
     const dx=z.x-d.x,baseBar=d.vp.fitAll?Math.max(.001,d.g.step):d.vp.barWidth;gestureUpdate(v=>({...v,fitAll:false,barWidth:Math.max(.12,Math.min(34,baseBar*Math.exp(dx/180)))}))
   }
 };
 const handlePointerUp=(e:React.PointerEvent<HTMLElement>)=>{
   // Commit the final pointer position; the last event must not be discarded.
   flushTerminalPointerGesture();
   const wasLensPointer=magnifierPointer.current===e.pointerId;
   const wasPriceGesture=magnifierPriceDrag.current?.id===e.pointerId;
   if(wasLensPointer){
     magnifierPointer.current=null;
     magnifierPriceDrag.current=null;
     magnifierZoom.current=TOUCH_MAGNIFIER_DEFAULT_ZOOM;
     touchCursorVisible.current=false;
   }else if(wasPriceGesture){
     magnifierPriceDrag.current=null;
   }
   transient.current=null;cancelTouchHold();
   if(e.type==='pointercancel'||e.type==='lostpointercapture'){
     touchCursorVisible.current=false;mouseRef.current=null;transient.current=null;
   }
   pointers.current.delete(e.pointerId);
   if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
   if(!pointers.current.size){
     activePointerRect.current=null;
     drag.current=null;
     if(e.pointerType==='touch'||e.pointerType==='pen'){
       touchCursorVisible.current=false;
       mouseRef.current=null;
     }
   }else if(wasLensPointer){
     // Lifting the inspecting finger ends the lens even if the scale finger remains.
     // Suppress incidental cursor drawing until the remaining finger is released.
     drag.current={kind:'pinch'};
     mouseRef.current=null;
   }else if(wasPriceGesture){
     // The price finger can be lifted and used again without losing lens zoom.
     const selected=magnifierPointer.current===null?null:pointers.current.get(magnifierPointer.current);
     if(selected)mouseRef.current={...selected};
   }else if(drag.current?.kind==='pinch'&&pointers.current.size===1){
     const p=[...pointers.current.values()][0],g=geometry();
     drag.current=g?{kind:'touchCursor',x:p.x,y:p.y,vp:{...vp},g,panning:true,inspecting:false}:null;
   }
   scheduleDraw();
 };
 const focusChart=()=>{const canvas=ref.current;if(canvas&&document.activeElement!==canvas)canvas.focus({preventScroll:true})};
 const handleWheel=(e:WheelEvent)=>{
   flushTerminalPointerGesture();
   terminalNavigation.current=true;
   e.preventDefault();
   e.stopPropagation();
   focusChart();
   const g=geometry();if(!g)return;
   const x=e.clientX-g.r.left,y=e.clientY-g.r.top,z=zone(x,y,g);
   const ax=Math.min(g.plotW,Math.max(0,x)),ay=Math.min(g.plotH,Math.max(0,y));
   // Trackpads can emit very small deltas, while mouse wheels emit larger steps.
   // Exponential scaling keeps both smooth and predictable.
   const dy=Math.max(-240,Math.min(240,e.deltaY||0));
   const dx=Math.max(-240,Math.min(240,e.deltaX||0));
   const factor=Math.max(.72,Math.min(1.38,Math.exp(-dy*.0018)));

   // Price scale behaves independently: wheel changes only vertical price scale.
   if(z==='price'){zoomY(factor,ay,g);return}

   // TradingView-style horizontal navigation:
   // Shift + wheel, or a native horizontal trackpad gesture, pans through time.
   if(e.shiftKey||Math.abs(dx)>Math.abs(dy)){
     const scroll=e.shiftKey?(e.deltaY||e.deltaX):e.deltaX;
     panXWheel(scroll*.55,g.plotW);
     return
   }

   // Alt/Option + wheel over the plot mirrors TradingView price-scale zoom without
   // requiring the pointer to be exactly over the narrow right axis.
   if(z==='plot'&&e.altKey){zoomY(factor,ay,g);return}

   // Time scale always zooms horizontally around the cursor.
   if(z==='time'){zoomX(factor,ax,g.plotW);return}

   // Main chart:
   // regular wheel -> time zoom, keeping the right edge stable;
   // Ctrl/Cmd + wheel -> focused zoom around the candle under the cursor.
   const anchor=(e.ctrlKey||e.metaKey)?ax:g.plotW;
   zoomX(factor,anchor,g.plotW);
 };
 // Capture at the chart root: HUDs and the separate time axis can receive wheel
 // input instead of the canvas. Keep menus and editable controls scrollable.
 const wheelHandlerRef=useRef(handleWheel);
 useLayoutEffect(()=>{wheelHandlerRef.current=handleWheel});
 useLayoutEffect(()=>{
   const host=box.current?.closest<HTMLElement>('.hookchart-root')||box.current;if(!host)return;
   const onWheel=(event:WheelEvent)=>{
     const target=event.target as Element|null;
     if(!target?.closest)return;
     const surface=target.closest('.chartStage,.chartWrap,.chartTimeAxis');
     if(!surface||!host.contains(surface))return;
     // Embedded settings preview and main chart share .hookchart-root: only
     // the owning engine should receive wheel gestures.
     const ownPreview=box.current?.closest('.hookchart-visual-preview');
     if(ownPreview ? !ownPreview.contains(surface) : !!surface.closest('.hookchart-visual-preview'))return;
     if(target.closest('input,textarea,select,[contenteditable],.floatingDrawTools,.indicatorDrawer,.timeJumpPopover,.densityQuickPopup'))return;
     // The interactive HookChart *inside* settings must accept wheel zoom.
     // Other modal controls remain excluded from the global wheel listener.
     if(target.closest('.originalSettingsBackdrop')&&!target.closest('.hookchart-visual-preview'))return;
     wheelHandlerRef.current(event);
   };
   host.addEventListener('wheel',onWheel,{capture:true,passive:false});
   return()=>host.removeEventListener('wheel',onWheel,true);
 },[]);
  const hitDrawing=(x:number,y:number,g:any,tolerance=9):Drawing|null=>{
    let hit:Drawing|null=null,best=tolerance;
    // Topmost drawings win; increase hit tolerance for touch without
    // hijacking empty chart areas that should still pan.
    for(let i=drawings.length-1;i>=0;i--){
      const d=drawings[i];
      if(!d.id.startsWith(symbol+':')||!d.pts[0])continue;
      const a=d.pts[0],b=d.pts[1],x1=g.x(a.t),y1=g.y(a.p);
      let dist=Infinity;
      if((d.type==='trend'||d.type==='ruler'||d.type==='ray')&&b){
        const x2=g.x(b.t),y2=g.y(b.p);
        const tip=d.type==='ray'?rayEndPoint(x1,y1,x2,y2,g.plotW,g.plotH):{x:x2,y:y2};
        const vx=tip.x-x1,vy=tip.y-y1,len=vx*vx+vy*vy||1;
        const t=Math.max(0,Math.min(1,((x-x1)*vx+(y-y1)*vy)/len));
        dist=Math.hypot(x-(x1+t*vx),y-(y1+t*vy));
      }else if(d.type==='level'){
        dist=Math.abs(y-y1);
      }else if(d.type==='text'){
        dist=drawingTextHitDistance(x,y,x1,y1,d.text||'Note');
      }else if(d.type==='fib'&&b){
        const x2=g.x(b.t);
        if(x>=Math.min(x1,x2)-tolerance&&x<=Math.max(x1,x2)+tolerance)
          for(const level of FIB_LEVELS)dist=Math.min(dist,Math.abs(y-g.y(a.p+(b.p-a.p)*level)));
      }else if(d.type==='profile'&&b){
        // Avoid scanning every historical candle on each pointer movement
        // while the cursor is nowhere near this volume-profile selection.
        const xx=g.x(b.t),left=Math.max(0,Math.min(g.plotW,Math.min(x1,xx))),
          right=Math.max(0,Math.min(g.plotW,Math.max(x1,xx)));
        if(x>=left-tolerance&&x<=right+tolerance){
          const pd=profileData(d,g);
          if(pd&&y>=pd.yTop-tolerance&&y<=pd.yBottom+tolerance)dist=0;
        }
      }else if(d.type==='rect'&&b){
        const x2=g.x(b.t),y2=g.y(b.p);
        const left=Math.min(x1,x2),right=Math.max(x1,x2),top=Math.min(y1,y2),bottom=Math.max(y1,y2);
        if(x>=left-tolerance&&x<=right+tolerance&&y>=top-tolerance&&y<=bottom+tolerance)
          dist=Math.min(Math.abs(x-left),Math.abs(x-right),Math.abs(y-top),Math.abs(y-bottom));
      }
      if(dist<best){best=dist;hit=d;}
    }
    return hit;
  };
 const placeDrawingPoint=(x:number,y:number,g:any)=>{
   const p=snap(x,y,g);
   // Single-anchor marks get the same finger-clear precision lens as
   // two-anchor drawings. Both paths commit only on pointer release.
   if(tool==='level'||tool==='text'){
     const id=symbol+':'+uid();
     setDrawings(a=>[...a,{id,type:tool,pts:[p],text:tool==='text'?textLabel:''}]);
     setSelectedDrawingId(id);
     setDrawingActions({id,...drawingActionsPosition(x,y,g.plotW,g.plotH)});
     return;
   }
   if(!draft){setDraft(p);setSelectedDrawingId(null)}
   else{const id=symbol+':'+uid();setDrawings(a=>[...a,{id,type:tool,pts:[draft,p]}]);setDraft(null);setSelectedDrawingId(id);setDrawingActions({id,...drawingActionsPosition(x,y,g.plotW,g.plotH)});setEditingDrawingId(null)}
 };
 const handleClick=(e:React.MouseEvent<HTMLElement>)=>{if(suppressDrawingClick.current){suppressDrawingClick.current=false;return}if(suppressTouchClick.current){suppressTouchClick.current=false;return}if(isRangeDrawingTool(tool)||isPointDrawingTool(tool))return;const g=geometry();if(!g)return;const x=e.clientX-g.r.left,y=e.clientY-g.r.top;if(x<0||x>g.r.width||y<0||y>g.r.height||zone(x,y,g)!=='plot')return;
   // Marker lines are clickable in cursor, alert and eraser modes (mouse or tap).
   // The parent shows a delete confirmation for real Telegram alerts.
   if(onSelectPriceAlert&&(tool==='cursor'||tool==='alert'||tool==='erase')){
     const hit=alerts.filter(a=>a.id.startsWith(symbol+':'))
       .map(a=>({id:a.id,distance:Math.abs(y-g.y(a.p))}))
       .filter(a=>a.distance<=9)
       .sort((a,b)=>a.distance-b.distance)[0];
     if(hit){if(tool==='cursor')selectAlertAt(hit.id,x,y,g);else onSelectPriceAlert(hit.id,'delete');return}
   }
   if(tool==='erase'){const hit=hitDrawing(x,y,g);if(hit){setDrawings(a=>a.filter(d=>d.id!==hit.id));setSelectedDrawingId(null);setEditingDrawingId(null);setDrawingActions(null)}return}
   if(tool==='cursor'||tool==='ruler'){
     const measurement=[...drawings].reverse().find(d=>d.type==='ruler'&&d.id.startsWith(symbol+':')&&d.pts[1]&&measurementHit(g,d.pts[0],d.pts[1],x,y));
     if(measurement){
       selectDrawingAt(measurement,x,y,g);setEditingDrawingId(null);return;
     }
   }
   if(tool==='cursor'){
     const hit=hitDrawing(x,y,g);
     if(hit){selectDrawingAt(hit,x,y,g);if(editingDrawingId!==hit.id)setEditingDrawingId(null);}
     else{setSelectedDrawingId(null);setEditingDrawingId(null);setDrawingActions(null);setAlertActions(null);}
     return;
   }
   const p=snap(x,y,g);
   if(tool==='alert'){
     if(onCreatePriceAlert) onCreatePriceAlert(p.p);
     else setAlerts(a=>[...a,{id:symbol+':'+uid(),p:p.p,kind:'level',created:Date.now()}]);
     return
   }
   if(tool==='level'||tool==='text'){
     const id=symbol+':'+uid();setDrawings(a=>[...a,{id,type:tool,pts:[p],text:tool==='text'?textLabel:''}]);
     setSelectedDrawingId(id);setDrawingActions({id,...drawingActionsPosition(x,y,g.plotW,g.plotH)});return;
   }
   placeDrawingPoint(x,y,g);
 };
 const reset=()=>{
  viewportAdjustedByUserRef.current=true;
  fitAllScopeRef.current=null;
  manualPriceAxisOverride.current=false;
  terminalNavigation.current=true;
  const width=hookChartPlotWidth(ref.current?.getBoundingClientRect().width||800);
  const candleView=latestCandleResetViewport(width,candles.length,visualProfile?.visibleBars??(formationAutoScale?78:65),rightPaddingBars);
  // A reset should focus the current candles, not force distant DOM levels or
  // TP/SL markers into the price range. Preserve Terminal's formation anchor.
  setVp(terminalMode
    ? {...(focusFormation?terminalHookViewport(candles,width,focusFormation,rightPaddingBars):candleView),yZoom:1,candleFit:true}
    : formationAutoScale?candleView
    : visualProfile?candleView
    : {barWidth:9,rightOffset:0,autoY:true,manualCenter:null,manualRange:null,yZoom:1,fitAll:false,candleFit:false});
 };
 const fitAllHistory=()=>{terminalNavigation.current=true;manualPriceAxisOverride.current=false;fitAllScopeRef.current=fitAllScopeKey;setGestureVp(v=>({...v,rightOffset:0,autoY:true,manualCenter:null,manualRange:null,yZoom:1,fitAll:true,...(terminalMode?{candleFit:true}:{})}),'focus')};
 const fitAllHistoryRef=useRef(fitAllHistory);
 fitAllHistoryRef.current=fitAllHistory;
 // The Terminal drawer's Apply button uses exactly the same action as the
 // per-chart "Show all history" control. Run after the saved profile layout
 // effect so fitting all candles wins over the just-applied startup view.
 // Off-screen lazy charts honor the command once their candles load.
 useLayoutEffect(()=>{
  if(!terminalFitAllRequest){
    lastTerminalFitAllRequestRef.current=null;
    return;
  }
  if(!candles.length)return;
  const previousFit=lastTerminalFitAllRequestRef.current;
  if(previousFit?.request===terminalFitAllRequest&&previousFit.scope===fitAllScopeKey)return;
  lastTerminalFitAllRequestRef.current={request:terminalFitAllRequest,scope:fitAllScopeKey};
  fitAllHistoryRef.current();
 },[terminalFitAllRequest,candles.length,fitAllScopeKey]);
 const zoomButton=(factor:number)=>{
   terminalNavigation.current=true;
   const plotW=hookChartPlotWidth(ref.current?.getBoundingClientRect().width||800);
   setGestureVp(v=>({
     ...v,...resizeHookChartViewport(candles.length,plotW,v,factor,v.fitAll?plotW/2:plotW,rightPaddingBars,rightPadding),
   }),'zoom');
 };
 const handleDoubleClick=(e:React.MouseEvent<HTMLElement>)=>{const g=geometry();if(!g)return;const x=e.clientX-g.r.left,y=e.clientY-g.r.top;if(x<0||x>g.r.width||y<0||y>g.r.height)return;if(zone(x,y,g)==='price'){viewportAdjustedByUserRef.current=true;manualPriceAxisOverride.current=false;setVp(v=>({...v,autoY:true,manualCenter:null,manualRange:null,yZoom:1,candleFit:terminalMode?true:v.candleFit}))}else reset()};
 const handleTouchEnd=(e:React.PointerEvent<HTMLElement>)=>{
   if((drag.current?.kind==='drawingRangePlacement'||drag.current?.kind==='drawingPointPlacement')
      &&drag.current.pointerId===e.pointerId){
     const d=drag.current,z=point(e);
     if(e.type==='pointerup'&&z){
       const x=Math.max(0,Math.min(z.g.plotW-1,z.x));
       const y=Math.max(0,Math.min(z.g.plotH-1,z.y));
       const last=d.tool==='ruler'?freeDrawingPoint(x,y,z.g):snap(x,y,z.g);
       if(d.kind==='drawingRangePlacement'){
         if((d.moved||d.hadDraft)&&rulerHasRange(d.first,last)){
           const id=symbol+':'+uid();
           setDrawings(list=>[...list,{id,type:d.tool,pts:[d.first,last]}]);
           setDraft(null);setSelectedDrawingId(id);setEditingDrawingId(null);
           setAlertActions(null);
           setDrawingActions({id,...drawingActionsPosition(x,y,z.g.plotW,z.g.plotH)});
         }else if(!d.hadDraft){
           setDraft(d.first);setSelectedDrawingId(null);setDrawingActions(null);
         }
       }else if(d.tool==='alert'){
         // Preserve the existing delete-confirmation behavior when tapping
         // an alert marker, but dragging places a new level at release.
         if(d.existingAlertId&&!d.moved&&onSelectPriceAlert)onSelectPriceAlert(d.existingAlertId,'delete');
         else if(onCreatePriceAlert)onCreatePriceAlert(last.p);
         else setAlerts(rows=>[...rows,{id:symbol+':'+uid(),p:last.p,kind:'level',created:Date.now()}]);
       }else{
         const id=symbol+':'+uid();
         setDrawings(rows=>[...rows,{id,type:d.tool,pts:[last],text:d.tool==='text'?textLabel:''}]);
         setSelectedDrawingId(id);setEditingDrawingId(null);setAlertActions(null);
         setDrawingActions({id,...drawingActionsPosition(x,y,z.g.plotW,z.g.plotH)});
       }
       suppressTouchClick.current=true;
     }else if(d.kind==='drawingRangePlacement'){
       setDraft(null);
     }
     handlePointerUp(e);
     return;
   }
   if(e.pointerType==='mouse'||drag.current?.kind==='pinch'||drag.current?.panning||drag.current?.inspecting||(drag.current?.kind==='price'&&drag.current?.moved)){handlePointerUp(e);return}const now=Date.now();if(now-lastTap.current<320){const g=geometry();if(g){const x=e.clientX-g.r.left,y=e.clientY-g.r.top;if(zone(x,y,g)==='price'){viewportAdjustedByUserRef.current=true;manualPriceAxisOverride.current=false;setVp(v=>({...v,autoY:true,manualCenter:null,manualRange:null}))}}}lastTap.current=now;handlePointerUp(e)};
 // On-demand compact capture of the chart itself, without alerts or strategy signals.
 // No background image work, exchange request or extra subscription.
 const archiveScreenshotRef=useRef<() => string | null>(() => null);
 const archiveDensityRef=useRef<() => import('../../types').ArchivedDensityScene | undefined>(() => undefined);
 const archiveOverlayRef=useRef<() => ArchivedAutoOverlayScene | undefined>(() => undefined);
 const archiveSrMarkerRef=useRef<() => boolean>(() => false);
 // The viewport is computed by the chart itself, so the stored markers
 // exactly match those painted inside the visible price range. This runs only
 // when the user explicitly saves the formation, never during live updates.
 // The original renderer and this capture use the same geometry. Store
 // only automatic tools that actually painted on screen at the save click.
 // This callback is never invoked by normal animation frames or live ticks.
 archiveOverlayRef.current=()=>{
   if(!candles.length)return undefined;
   const g=geometry();if(!g)return undefined;
   const inY=(p:number)=>Number.isFinite(p)&&p>=g.lo&&p<=g.hi;
   const inX=(t:number)=>Number.isFinite(t)&&g.x(t)<=g.plotW;
   const scene:ArchivedAutoOverlayScene={};
   if(autoSR){
     const rows=autoOverlay.sr.filter((z:any)=>inY(z.p)&&inX(z.t));
     if(rows.length)scene.sr=rows.map((z:any)=>({kind:z.kind,p:z.p,t:z.t}));
   }
   if(autoPrevDay&&autoOverlay.prev&&inX(autoOverlay.prev.t)&&
     (inY(autoOverlay.prev.h)||inY(autoOverlay.prev.l))){
     scene.prevDay={...autoOverlay.prev};
   }
   if(autoDayOpen&&autoOverlay.dayOpen&&inY(autoOverlay.dayOpen.p)&&inX(autoOverlay.dayOpen.t))
     scene.dayOpen={...autoOverlay.dayOpen};
   if(autoVWAP&&autoOverlay.vwap.length>1){
     const rows=autoOverlay.vwap.filter((z:any)=>inY(z.p)&&g.x(z.t)>=0&&inX(z.t));
     if(rows.length>=2)scene.vwap=rows.map((z:any)=>({t:z.t,p:z.p}));
   }
   if(autoLocalHL){
     const rows=autoOverlay.local.filter((z:any)=>inY(z.p)&&inX(z.t));
     if(rows.length)scene.localHL=rows.map((z:any)=>({kind:z.kind,p:z.p,t:z.t}));
   }
   if(autoRoundLevels){
     const rows=autoOverlay.round.filter(inY);
     if(rows.length)scene.roundLevels=[...rows];
   }
   if(autoStops){
     const rows=autoOverlay.stops.filter((z:any)=>inY(z.p)&&inX(z.t));
     if(rows.length)scene.stops=rows.map((z:any)=>({side:z.side,p:z.p,t:z.t}));
   }
   if(autoChannel&&autoOverlay.channel){
     const ch=autoOverlay.channel,x0=g.x(ch.t0),x1=g.x(ch.t1);
     if(x1>0&&x0<g.plotW&&x1>x0 &&
       [ch.c0,ch.c1,ch.up0,ch.up1,ch.dn0,ch.dn1].some(inY))
       scene.channel={t0:ch.t0,t1:ch.t1,up0:ch.up0,up1:ch.up1,
         dn0:ch.dn0,dn1:ch.dn1,c0:ch.c0,c1:ch.c1};
   }
   if(autoPOC){
     const start=g.data.length?g.dataStart:Math.max(0,candles.length-220);
     const end=g.data.length?g.dataEnd:candles.length;
     const poc=autoPocCache.current.get(candles,start,end);
     if(poc&&poc.pHi>=g.lo&&poc.pLo<=g.hi)
       scene.poc={pLo:poc.pLo,pHi:poc.pHi,pMid:poc.pMid};
   }
   return scene;
 };
 archiveSrMarkerRef.current=()=>{
   const g=geometry();
   return !!g && autoSR && markers.some(marker =>
     (marker.type === 'support' || marker.type === 'resistance') &&
     Number.isFinite(marker.price) && marker.price >= g.lo && marker.price <= g.hi);
 };
 archiveDensityRef.current=()=>{
   if(!candles.length)return undefined;
   const g=geometry();
   return visibleArchivedDensityScene(densities, {
     lines:showDensityLines,labels:showDensityLabels,amounts:showDensityAmounts,
   },g ? {low:g.lo,high:g.hi} : null);
 };
 const takeArchiveScreenshot=():string|null=>{
   const source=ref.current;
   if(!source||!candles.length)return null;
   try{
     draw(true);
     const target=document.createElement('canvas');
     for(const maxWidth of [940,760,620,480,360]){
       const scale=Math.min(1,maxWidth/source.width,620/source.height);
       target.width=Math.max(1,Math.round(source.width*scale));
       target.height=Math.max(1,Math.round(source.height*scale));
       const ctx=target.getContext('2d');
       if(!ctx)break;
       ctx.drawImage(source,0,0,target.width,target.height);
       for(const quality of [.72,.60,.48]){
         const jpeg=target.toDataURL('image/jpeg',quality);
         if(jpeg.length<=130000&&jpeg.startsWith('data:image/jpeg;base64,'))return jpeg;
       }
     }
   }catch{return null}
   finally{draw(false)}
   return null;
 };
 archiveScreenshotRef.current=takeArchiveScreenshot;
 const chartControlActionsRef=useRef({fitAllHistory,reset,zoomButton});
 chartControlActionsRef.current={fitAllHistory,reset,zoomButton};
 useImperativeHandle(controlRef,()=>({takeScreenshot:()=>{try{return ref.current?.toDataURL('image/png')||null}catch{return null}},takeArchiveScreenshot:()=>archiveScreenshotRef.current(),takeArchiveDensityScene:()=>archiveDensityRef.current(),takeArchiveOverlayScene:()=>archiveOverlayRef.current(),takeArchiveVisibleSrMarkers:()=>archiveSrMarkerRef.current(),fitContent:()=>chartControlActionsRef.current.fitAllHistory(),zoomToLatest:()=>chartControlActionsRef.current.reset(),focusLatest:()=>{fitAllScopeRef.current=null;manualPriceAxisOverride.current=false;setVp(v=>({...v,rightOffset:0,autoY:true,manualCenter:null,manualRange:null,yZoom:1,fitAll:false,candleFit:terminalMode?true:v.candleFit}))},zoom:(factor:number)=>chartControlActionsRef.current.zoomButton(factor)}),[]);
 const actionDrawing=drawingActions?.id===selectedDrawingId?drawings.find(d=>d.id===selectedDrawingId&&d.id.startsWith(symbol+':')):null;
 // Ruler actions belong to its measurement label, not to the point last tapped.
 // Compute only for the selected ruler and reuse the same geometry as its canvas.
 const rulerActionPosition=actionDrawing?.type==='ruler'&&actionDrawing.pts[1]&&drawingActions
   ? (()=>{
       const g=geometry();
       return g?measurementActionPosition(g,actionDrawing.pts[0],actionDrawing.pts[1]):null;
     })() : null;
 const barCountdown=!hideBarCountdown?<ChartBarCountdown tf={tf} intervalMs={intervalMs} lastBarStart={candles.at(-1)?.t}/>:null;
 const scaleControls=(<div role="toolbar" aria-label={translateHookChartPhrase(language,"Керування масштабом графіка")} className={'chartScaleDock '+(zoomPanelOpen?'expanded':'collapsed')}>
   {countdownContainer===undefined&&barCountdown}
   {zoomPanelOpen&&<div className="scaleTools"><button type="button" aria-label={translateHookChartPhrase(language,"Збільшити масштаб")} title={translateHookChartPhrase(language,"Збільшити масштаб")} onClick={()=>zoomButton(1.2)}>+</button><button type="button" aria-label={translateHookChartPhrase(language,"Зменшити масштаб")} title={translateHookChartPhrase(language,"Зменшити масштаб")} onClick={()=>zoomButton(1/1.2)}>−</button><button type="button" className="scaleReset" onClick={reset}>{translateHookChartPhrase(language,"Скинути масштаб")}</button><button type="button" className={vp.fitAll?'scaleHistory active':'scaleHistory'} title={translateHookChartPhrase(language,vp.fitAll?'Вся історія: увімкнено':'Вся завантажена історія поточного таймфрейму')} aria-label={translateHookChartPhrase(language,'Показати всю історію')} onClick={fitAllHistory}><svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 3v12M15.5 3v12M5 9h8"/><path d="M7 7 5 9l2 2M11 7l2 2-2 2"/></svg></button></div>}
   <button type="button" className="scaleDockToggle" title={translateHookChartPhrase(language,zoomPanelOpen?'Згорнути масштабування':'Розгорнути масштабування')} aria-label={translateHookChartPhrase(language,zoomPanelOpen?'Згорнути масштабування':'Розгорнути масштабування')} onClick={()=>setZoomPanelOpen(v=>!v)}>{zoomPanelOpen?'›':'‹'}</button>
  </div>);
 return <div className="chartWrap" ref={box}
  onClick={e=>{if(!isChartControlTarget(e.target))handleClick(e)}}
  onDoubleClick={e=>{if(!isChartControlTarget(e.target))handleDoubleClick(e)}}
  onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
  onAuxClick={e=>{if(e.button===1&&!isChartControlTarget(e.target))e.preventDefault()}}
  onPointerUp={e=>{if(pointers.current.has(e.pointerId))handleTouchEnd(e)}}
  onPointerCancel={e=>{if(pointers.current.has(e.pointerId)){if(drag.current?.kind==='drawingRangePlacement')setDraft(null);handlePointerUp(e)}}}
  onLostPointerCapture={e=>{if(pointers.current.has(e.pointerId)){if(drag.current?.kind==='drawingRangePlacement')setDraft(null);handlePointerUp(e)}}}
  onContextMenu={e=>{if(isChartControlTarget(e.target))return;e.preventDefault();if(touchCursorVisible.current||touchHold.current?.pending())return;setDraft(null);setSelectedDrawingId(null);setEditingDrawingId(null);setDrawingActions(null);setAlertActions(null)}}
  onPointerLeave={()=>{if(!pointers.current.size&&!touchCursorVisible.current){mouseRef.current=null;transient.current=null;hoveredMeasurement.current=null;if(box.current?.style)box.current.style.cursor='';scheduleDraw()}}}>
  {strategyResult&&<div className="strategyHud"><div><b>{strategyResult.presetName}</b><span className={strategyResult.directionScore>0?'bull':strategyResult.directionScore<0?'bear':'neutral'}>{translateHookChartPhrase(language,strategyResult.directionScore>0?'Бичачий':strategyResult.directionScore<0?'Ведмежий':'Нейтральний')} {Math.abs(strategyResult.directionScore)}</span><span>{translateHookChartPhrase(language,'Ризик')} {strategyResult.riskScore}</span></div><small>{strategyResult.hint}</small><em>{strategyResult.context}</em></div>}
  {showLiqRiskBlock&&<div className={'liqRiskHud '+(liqHudOpen?'open':'collapsed')} style={{right:AX+8,maxWidth:`calc(100% - ${AX+18}px)`}}>
   <button
     type="button"
     className="liqRiskToggle"
     title={translateHookChartPhrase(language,liqHudOpen?'Сховати Liq / каскад':'Показати Liq / каскад')}
     aria-label={translateHookChartPhrase(language,liqHudOpen?'Сховати блок ліквідацій':'Показати блок ліквідацій')}
     aria-expanded={liqHudOpen}
     onClick={toggleLiqHud}
   >{liqHudOpen?'▴':'▾'}</button>
   {liqHudOpen&&<div className="liqRiskContent" title={`Сесія: $${formatUsd(sessionLiquidationsUsd)} (всі отримані унікальні події, без порогу)
Джерело: ${liquidationSource||'—'} · потік ${liquidationStreamLive?'LIVE':'OFFLINE'}
Великі ліквідації ≥ $${formatUsd(cascadeRisk.threshold??liquidationCut)}
5 хв усі отримані: ${formatUsd(cascadeRisk.observedTotal5 ?? 0)} · ${cascadeRisk.observedCount5} подій
5 хв великі: ${formatUsd(cascadeRisk.total5)} · ${cascadeRisk.count5} подій
1 хв: $${formatUsd(cascadeRisk.total1??0)} · ${cascadeRisk.count1??0} подій · прискорення ${(cascadeRisk.acceleration??0).toFixed(2)}×
LONG: $${formatUsd(cascadeRisk.longUsd)} · SHORT: $${formatUsd(cascadeRisk.shortUsd)}
Остання подія: ${liquidationLastEventAt?new Date(liquidationLastEventAt).toLocaleTimeString(language):'—'}`}>
     <b>Liq: {`$${formatUsd(sessionLiquidationsUsd)}`}</b>
     {hasObservedLiquidationCascade(cascadeRisk,liquidationStreamLive)&&<>
       <span>{translateHookChartPhrase(language,'Каскад:')} <strong className={'risk-'+cascadeRisk.level.toLowerCase()}>{cascadeRiskLabel(cascadeRisk.level)}</strong><em>{cascadeRisk.score}</em></span>
       <small>{liquidationSource||'—'} · великі 5m $${formatUsd(cascadeRisk.total5)} (≥ ${formatUsd(cascadeRisk.threshold??liquidationCut)}) · 1m $${formatUsd(cascadeRisk.total1??0)} · L ${formatUsd(cascadeRisk.longUsd)} · S ${formatUsd(cascadeRisk.shortUsd)}</small>
     </>}
   </div>}
  </div>}
  {!hideTimeJump&&<div className="timeJumpDock" style={{right:AX+8,'--time-jump-right':`${AX+8}px`} as React.CSSProperties}>
   <button className={jumpOpen?'timeJumpButton active':'timeJumpButton'} title={translateHookChartPhrase(language,"Перейти до дати або часу")} aria-label={translateHookChartPhrase(language,"Перейти до дати або часу")} onClick={()=>{setJumpOpen(v=>!v);setJumpMessage('')}}><CalendarDays size={15}/></button>
   {jumpOpen&&<div className="timeJumpPopover">
    <div className="jumpQuick"><button onClick={()=>quickJump(0)}>{translateHookChartPhrase(language,"Сьогодні")}</button><button onClick={()=>quickJump(1)}>{translateHookChartPhrase(language,"Вчора")}</button><button onClick={()=>quickJump(2)}>{translateHookChartPhrase(language,"−2 дні")}</button><button onClick={()=>quickJump(3)}>{translateHookChartPhrase(language,"−3 дні")}</button><button onClick={()=>quickJump(7)}>{translateHookChartPhrase(language,"−7 днів")}</button></div>
    <div className="jumpMode"><button className={jumpMode==='day'?'sel':''} onClick={()=>setJumpMode('day')}>{translateHookChartPhrase(language,"Цілий день")}</button><button className={jumpMode==='time'?'sel':''} onClick={()=>setJumpMode('time')}>{translateHookChartPhrase(language,"Конкретний час")}</button></div>
    <label className="jumpField"><span>{translateHookChartPhrase(language,"Дата")}</span><input type="date" value={jumpDate} onChange={e=>setJumpDate(e.target.value)}/></label>
    {jumpMode==='time'&&<><label className="jumpField"><span>{translateHookChartPhrase(language,"Час")}</span><input type="time" step="60" value={jumpTime} onChange={e=>setJumpTime(e.target.value)}/></label><div className="jumpHours">{['00:00','06:00','12:00','18:00'].map(h=><button key={h} onClick={()=>setJumpTime(h)}>{h}</button>)}</div></>}
    <button className="jumpGo" disabled={jumpBusy||!jumpDate} onClick={()=>void requestJump(jumpDate)}>{translateHookChartPhrase(language,jumpBusy?'Завантаження…':'Перейти')}</button>
    {jumpMessage&&<small className="jumpMessage">{translateHookChartPhrase(language,jumpMessage)}</small>}
    <small className="jumpZone">{timezone} · TF {tf}</small>
   </div>}
  </div>}
  {controlsContainer?createPortal(scaleControls,controlsContainer):controlsContainer===undefined?scaleControls:null}
  {countdownContainer&&createPortal(barCountdown,countdownContainer)}
  {actionDrawing&&drawingActions&&(tool==='cursor'||(tool==='ruler'&&actionDrawing.type==='ruler'))&&
    <div className={'chartDrawingActions'+(rulerActionPosition?' measurement-actions':'')} role="toolbar" aria-label={translateHookChartPhrase(language,'Дії з інструментом графіка')}
      style={{left:rulerActionPosition?.x??drawingActions.x,top:rulerActionPosition?.y??drawingActions.y}} onPointerDown={e=>e.stopPropagation()}>
      <button type="button" title={translateHookChartPhrase(language,'Редагувати межі інструмента')} aria-label={translateHookChartPhrase(language,'Редагувати інструмент')}
        aria-pressed={editingDrawingId===actionDrawing.id} className={editingDrawingId===actionDrawing.id?'active':''}
        onClick={e=>{e.stopPropagation();setEditingDrawingId(id=>id===actionDrawing.id?null:actionDrawing.id)}}>
        <Pencil size={15}/>
      </button>
      <button type="button" className="delete" title={translateHookChartPhrase(language,'Видалити інструмент')} aria-label={translateHookChartPhrase(language,'Видалити інструмент')}
        onClick={e=>{e.stopPropagation();setDrawings(list=>list.filter(d=>d.id!==actionDrawing.id));setSelectedDrawingId(null);setEditingDrawingId(null);setDrawingActions(null)}}>
        <Trash2 size={15}/>
      </button>
      {editingDrawingId===actionDrawing.id&&actionDrawing.type==='text'&&
        <input type="text" className="chartDrawingTextInput" maxLength={200}
          aria-label={translateHookChartPhrase(language,'Змінити текст інструмента')} value={actionDrawing.text||''}
          onChange={e=>{const value=e.target.value;setDrawings(list=>list.map(d=>d.id===actionDrawing.id?{...d,text:value}:d))}}/>}
    </div>}
  {alertActions&&tool==='cursor'&&alerts.some(a=>a.id===alertActions.id)&&
    <div className="chartDrawingActions" role="toolbar" aria-label={translateHookChartPhrase(language,'Дії з сигнальним рівнем')}
      style={{left:alertActions.x,top:alertActions.y}} onPointerDown={e=>e.stopPropagation()}>
      <button type="button" title={translateHookChartPhrase(language,'Редагувати сигнальний рівень')} aria-label={translateHookChartPhrase(language,'Редагувати сигнальний рівень')}
        onClick={e=>{e.stopPropagation();onSelectPriceAlert?.(alertActions.id,'edit')}}><Pencil size={15}/></button>
      <button type="button" className="delete" title={translateHookChartPhrase(language,'Видалити сигнальний рівень')} aria-label={translateHookChartPhrase(language,'Видалити сигнальний рівень')}
        onClick={e=>{e.stopPropagation();onSelectPriceAlert?.(alertActions.id,'delete')}}><Trash2 size={15}/></button>
    </div>}
  <div className="chartCanvasSurface">
  <canvas ref={ref} style={{WebkitTouchCallout:'none'}} tabIndex={0} aria-label={`${translateHookChartPhrase(language,"Графік")} ${symbol}`} aria-description={translateHookChartPhrase(language,"Рух пальцем без утримання — перетягнути графік. Коротко утримуйте палець для вільного курсора; довше утримуйте нерухомо для лупи. Після появи лупи другим пальцем змінюйте її масштаб по правій шкалі цін. На комп’ютері утримуйте середню кнопку миші (колесо), щоб показати лупу. Два пальці без активної лупи — масштаб графіка.")} onMouseEnter={focusChart} onPointerEnter={focusChart}/>
   <canvas ref={interactionRef} className="chartInteractionCanvas" width={1} height={1} aria-hidden="true"/>
  </div>
 </div>
}
