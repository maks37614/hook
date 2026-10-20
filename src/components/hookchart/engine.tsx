// Canvas chart and indicator panels extracted from the user's hookchart archive.
import { translateHookChartPhrase } from '../../locales/hookchartLanguage';
import type { SupportedLanguage } from '../../locales';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useImperativeHandle, useId } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import { quantile, atr, formatUsd, type AutoLevel, type MarketPrint } from './marketAnalytics';
import { supportResistanceLevels } from './supportResistance';
import type { StrategyResult } from './strategyEngine';
import { INDICATOR_META, indicatorData, type IndicatorId, type OIPoint } from './indicatorEngine';
import type { ChartMarkerInfo, DetectedFormation } from '../../types';
import { formatCryptoPrice } from '../../utils/formatters';
import { hookChartHorizontalRange, hookChartIndexAtTime, hookChartTimeAtIndex, restoredHookViewport, terminalHookViewport } from '../../utils/hookchartData';
import { HOOKCHART_PRICE_SCALE_WIDTH, HOOKCHART_PRICE_LABEL_HEIGHT, layoutPriceScaleLabels } from './priceScale';
export interface HookChartHandle { takeScreenshot(): string | null; fitContent(): void; zoomToLatest(): void; zoom(factor: number): void; }
export type Candle={t:number,o:number,h:number,l:number,c:number,v:number,n:number,tb?:number};

export type Density={id:string,side:'ASK'|'BID',p:number,q:number,usd:number,peakUsd:number,first:number,last:number,active:boolean,reacted?:boolean,reaction?:number,touches:number,lastTouch:number,replenishments:number,updates:number,score:number,mmScore:number};

export type Liquidation={id:string,side:'LONG'|'SHORT',t:number,p:number,q:number,usd:number};

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

const TF_MS:{[k:string]:number}={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000};

const zoneFormatters=new Map<string,Intl.DateTimeFormat>();
const zonePartsCache=new Map<string,{y:number;m:number;d:number;h:number;mi:number;s:number}>();
const zoneParts=(ts:number,tz:string)=>{const key=tz+':'+Math.floor(ts/1000),cached=zonePartsCache.get(key);if(cached)return cached;let formatter=zoneFormatters.get(tz);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});zoneFormatters.set(tz,formatter)}const parts=formatter.formatToParts(ts),o:any={};for(const x of parts)if(x.type!=='literal')o[x.type]=x.value;const result={y:+o.year,m:+o.month,d:+o.day,h:+o.hour,mi:+o.minute,s:+o.second};zonePartsCache.set(key,result);if(zonePartsCache.size>20000)zonePartsCache.delete(zonePartsCache.keys().next().value!);return result};

const zoneDateKey=(ts:number,tz:string)=>{const z=zoneParts(ts,tz);return`${z.y}-${String(z.m).padStart(2,'0')}-${String(z.d).padStart(2,'0')}`};

const zoneDateOffset=(daysAgo:number,tz:string)=>{const z=zoneParts(Date.now(),tz),u=new Date(Date.UTC(z.y,z.m-1,z.d)-daysAgo*86400000);return`${u.getUTCFullYear()}-${String(u.getUTCMonth()+1).padStart(2,'0')}-${String(u.getUTCDate()).padStart(2,'0')}`};

const zonedLocalTs=(date:string,time:string,tz:string)=>{const dm=date.match(/^(\d{4})-(\d{2})-(\d{2})$/),tm=time.match(/^(\d{2}):(\d{2})$/);if(!dm||!tm)return NaN;const want=[+dm[1],+dm[2],+dm[3],+tm[1],+tm[2],0],wantUtc=Date.UTC(want[0],want[1]-1,want[2],want[3],want[4],0);let guess=wantUtc;for(let i=0;i<6;i++){const z=zoneParts(guess,tz),seen=Date.UTC(z.y,z.m-1,z.d,z.h,z.mi,z.s),diff=wantUtc-seen;if(Math.abs(diff)<1000)break;guess+=diff}const final=zoneParts(guess,tz);return final.y===want[0]&&final.m===want[1]&&final.d===want[2]&&final.h===want[3]&&final.mi===want[4]?guess:NaN};

const fmt=(n:number,d=2)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d}):'—';

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
 useEffect(()=>{const el=ref.current;if(!el)return;const update=()=>setWidth(Math.max(HOOKCHART_PRICE_SCALE_WIDTH+40,el.getBoundingClientRect().width||1000));update();const ro=new ResizeObserver(update);ro.observe(el);return()=>ro.disconnect()},[ids.length>0,candles.length>0]);
 if(!ids.length||!candles.length)return null;
 const AX=HOOKCHART_PRICE_SCALE_WIDTH,plotW=Math.max(40,width),{step,virtualEnd,virtualStart}=hookChartHorizontalRange(candles.length,plotW,viewport,rightPaddingBars,rightPadding),startI=Math.max(0,Math.floor(virtualStart)-2),endI=Math.min(candles.length,Math.ceil(virtualEnd)+2),startT=candles[startI]?.t??-Infinity,endT=candles[Math.max(startI,endI-1)]?.t??Infinity,calcCandles=candles.slice(Math.max(0,startI-320),endI);
 const fmtV=(v:number,kind?:string)=>{if(!Number.isFinite(v))return'—';if(kind==='percent')return`${v>=0?'+':''}${fmt(v,2)}%`;if(kind==='compact')return`${v<0?'-':''}${formatUsd(Math.abs(v))}`;if(kind==='usd')return`$${formatUsd(v)}`;if(kind==='price')return fmt(v,Math.abs(v)<1?5:Math.abs(v)<10?4:2);return fmt(v,2)};
 const nearestAt=(values:{t:number;v:number}[],t:number)=>{if(!values.length)return undefined;let lo=0,hi=values.length-1;while(lo<hi){const m=(lo+hi)>>1;if(values[m].t<t)lo=m+1;else hi=m}const a=values[lo],b=lo>0?values[lo-1]:a;return Math.abs(a.t-t)<Math.abs(b.t-t)?a:b};
 return <div className="indicatorDock" ref={ref}>{ids.map(id=>{
  const meta=INDICATOR_META.find(x=>x.id===id)!;
  const data=indicatorData(id,calcCandles,oi),rows=data.series.map(z=>({...z,values:z.values.filter(p=>p.t>=startT&&p.t<=endT)})).filter(z=>z.values.length);
  let vals=rows.flatMap(z=>z.values.map(p=>p.v)).filter(Number.isFinite),lo=vals.length?Math.min(...vals):0,hi=vals.length?Math.max(...vals):1;
  if(id==='rsi'||id==='stoch'){lo=0;hi=100}else if(id==='cmf'){lo=Math.min(-.1,lo);hi=Math.max(.1,hi)}else if(id==='vr'){lo=0;hi=Math.max(2,hi)}else{for(const guide of data.guides||[]){lo=Math.min(lo,guide);hi=Math.max(hi,guide)}if(hi===lo){hi+=1;lo-=1}const pad=(hi-lo)*(id==='oi'?.055:.08);lo-=pad;hi+=pad}
  const W=Math.max(HOOKCHART_PRICE_SCALE_WIDTH+40,width),H=id==='oi'?112:92,L=0,R=AX,T=id==='oi'?22:18,B=10,innerW=W-L,plotH=H-T-B,x=(t:number)=>L+(indicatorIndexAtTime(candles,t)-virtualStart+.5)*step,y=(v:number)=>T+(hi-v)/(hi-lo)*plotH;
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

export function ChartTimeAxis({candles,tf,timezone,language='uk',viewport,rightPadding=0,rightPaddingBars=0,countdownRef}:{candles:Candle[],tf:string,timezone:string,language?:SupportedLanguage,viewport:Viewport,rightPadding?:number,rightPaddingBars?:number,countdownRef?:React.Ref<HTMLDivElement>}){
 const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(1000);
 useEffect(()=>{const el=ref.current;if(!el)return;const update=()=>setWidth(Math.max(HOOKCHART_PRICE_SCALE_WIDTH+40,el.getBoundingClientRect().width||1000));update();const ro=new ResizeObserver(update);ro.observe(el);return()=>ro.disconnect()},[]);
 if(!candles.length)return <div className="chartTimeAxis" ref={ref}/>;
 const AX=HOOKCHART_PRICE_SCALE_WIDTH,plotW=Math.max(40,width),{step,virtualEnd,virtualStart}=hookChartHorizontalRange(candles.length,plotW,viewport,rightPaddingBars,rightPadding),startI=Math.max(0,Math.floor(virtualStart)-3),endI=Math.min(candles.length,Math.ceil(virtualEnd)+3),barMs=TF_MS[tf]||300000;
 const timeFmt=new Intl.DateTimeFormat(language,{timeZone:timezone,hour:'2-digit',minute:'2-digit',hour12:false}),dateFmt=new Intl.DateTimeFormat(language,{timeZone:timezone,day:'numeric',month:'short'}),monthFmt=new Intl.DateTimeFormat(language,{timeZone:timezone,month:'short'}),yearFmt=new Intl.DateTimeFormat(language,{timeZone:timezone,year:'numeric'});
 const targetPx=step>=18?86:step>=10?76:68,desiredMs=Math.max(barMs,barMs*Math.max(1,targetPx/step)),niceIntervals=[60_000,5*60_000,15*60_000,30*60_000,60*60_000,2*60*60_000,4*60*60_000,6*60*60_000,12*60*60_000,24*60*60_000,2*24*60*60_000,7*24*60*60_000,14*24*60*60_000,30*24*60*60_000,90*24*60*60_000,180*24*60*60_000,365*24*60*60_000],regularMs=niceIntervals.find(v=>v>=desiredMs)??niceIntervals.at(-1)!;
 const wallMs=(t:number)=>{const z=zoneParts(t,timezone);return Date.UTC(z.y,z.m-1,z.d,z.h,z.mi)},labelWidth=(label:string,major:boolean)=>Math.max(major?40:34,label.length*(major?6.5:6.1)+8);
 type Tick={x:number,label:string,major:boolean,priority:number,align:'left'|'center'|'right',l:number,r:number};const candidates:Tick[]=[],labelRight=plotW-(countdownRef?AX:0);
 const scanStride=viewport.fitAll?Math.max(1,Math.floor(Math.max(1,endI-startI)/Math.max(240,plotW*2))):1;for(let gi=startI;gi<endI;gi+=scanStride){const k=candles[gi],x=(gi-virtualStart+.5)*step;if(x<1||x>plotW-1)continue;const prevI=Math.max(0,gi-scanStride),z=zoneParts(k.t,timezone),prev=gi>0?zoneParts(candles[prevI].t,timezone):null;let priority=0,label='',major=false;
  if(prev&&z.y!==prev.y){priority=4;label=yearFmt.format(k.t);major=true}
  else if(prev&&z.m!==prev.m){priority=3;label=monthFmt.format(k.t);major=true}
  else if(barMs<86400000&&prev&&(z.d!==prev.d||z.m!==prev.m||z.y!==prev.y)){priority=2;label=dateFmt.format(k.t);major=true}
  else{const prevWall=gi>0?wallMs(candles[prevI].t):wallMs(k.t)-barMs,curBucket=Math.floor(wallMs(k.t)/regularMs),prevBucket=Math.floor(prevWall/regularMs);if(curBucket!==prevBucket){priority=1;label=barMs>=86400000?dateFmt.format(k.t):timeFmt.format(k.t)}}
  if(!priority)continue;const w=labelWidth(label,major),edge=5;let align:'left'|'center'|'right'='center',l=x-w/2,r=x+w/2;if(l<edge){align='left';l=x+4;r=l+w}else if(r>labelRight-edge){align='right';r=x-4;l=r-w}if(l<edge||r>labelRight-edge)continue;candidates.push({x,label,major,priority,align,l,r})
 }
 const accepted:Tick[]=[];for(const priority of [4,3,2,1]){for(const c of candidates.filter(x=>x.priority===priority).sort((a,b)=>a.x-b.x)){if(accepted.some(a=>c.l<a.r+10&&c.r>a.l-10))continue;accepted.push(c)}}accepted.sort((a,b)=>a.x-b.x);
 return <div className="chartTimeAxis" ref={ref}><div className="chartTimePlot" style={{width:plotW}}>{accepted.map((t,i)=><div key={`${t.x}-${i}`} className={`chartTimeTick ${t.major?'major ':''}align-${t.align}`} style={{left:t.x}}><i/><span>{t.label}</span></div>)}</div><div className="chartTimeScaleSpacer" ref={countdownRef} style={{width:AX}} aria-hidden={countdownRef?undefined:true}/></div>
}

export type Viewport={barWidth:number;rightOffset:number;autoY:boolean;manualCenter:number|null;manualRange:number|null;fitAll?:boolean};

export function Chart({candles,symbol,tf,tool,drawings,setDrawings,alerts,setAlerts,densities,marketPrints,liquidations,autoLevels,levelLabelMode,levelLabelColor='#2090F0',levelLabelSize=11,levelLabelStyle='text',levelLineStyle='solid',rightPadding=0,rightPaddingBars=0,roundGrid=false,roundness=2,gridHorizontal=false,gridVertical=false,showMarketPrintSums=false,showVolumes=true,showLiquidations=true,cascadeRisk,liquidationCut=0,liquidationSource='',liquidationStreamLive=false,liquidationLastEventAt=null,timezone='Europe/Warsaw',language='uk',showDensityLines=true,showDensityLabels=true,showDensityAmounts=true,autoSR=false,showSRLabels=true,autoPrevDay=false,autoDayOpen=false,autoVWAP=false,autoLocalHL=false,autoRoundLevels=false,autoPOC=false,autoChannel=false,autoStops=false,showLiqRiskBlock=true,channelModel=null,strategyResult=null,hideTimeJump=false,hideBarCountdown=hideTimeJump,controlsContainer,countdownContainer,candleLongColor='#0ECB81',candleShortColor='#F6465D',densityLineColor='#7B61FF',densityLabelColor='#C4B5FD',densityLineWidth=.5,densityLineStyle='solid',densityLabelSize=8,onViewportChange,onNeedHistory,markers=[],controlRef,initialViewport,initialLogicalRange,terminalMode=false,focusFormation,textLabel='Нотатка'}:{candles:Candle[],symbol:string,tf:string,tool:string,drawings:Drawing[],setDrawings:React.Dispatch<React.SetStateAction<Drawing[]>>,alerts:Alert[],setAlerts:React.Dispatch<React.SetStateAction<Alert[]>>,densities:Density[],marketPrints:MarketPrint[],liquidations:Liquidation[],autoLevels:AutoLevel[],levelLabelMode:'always'|'hover'|'off',levelLabelColor?:string,levelLabelSize?:number,levelLabelStyle?:'text'|'filled'|'outline',levelLineStyle?:'solid'|'dash'|'dot',rightPadding?:number,rightPaddingBars?:number,roundGrid?:boolean,roundness?:number,gridHorizontal?:boolean,gridVertical?:boolean,showMarketPrintSums?:boolean,showVolumes?:boolean,showLiquidations?:boolean,cascadeRisk:CascadeRisk,liquidationCut?:number,liquidationSource?:string,liquidationStreamLive?:boolean,liquidationLastEventAt?:number|null,timezone?:string,language?:SupportedLanguage,showDensityLines?:boolean,showDensityLabels?:boolean,showDensityAmounts?:boolean,autoSR?:boolean,showSRLabels?:boolean,autoPrevDay?:boolean,autoDayOpen?:boolean,autoVWAP?:boolean,autoLocalHL?:boolean,autoRoundLevels?:boolean,autoPOC?:boolean,autoChannel?:boolean,autoStops?:boolean,showLiqRiskBlock?:boolean,channelModel?:AutoChannelModel|null,strategyResult?:StrategyResult|null,hideTimeJump?:boolean,hideBarCountdown?:boolean,controlsContainer?:HTMLElement|null,countdownContainer?:HTMLElement|null,candleLongColor?:string,candleShortColor?:string,densityLineColor?:string,densityLabelColor?:string,densityLineWidth?:number,densityLineStyle?:'solid'|'dash'|'dot',densityLabelSize?:number,onViewportChange?:(v:Viewport)=>void,onNeedHistory?:(targetTs:number)=>Promise<boolean>;markers?:ChartMarkerInfo[];controlRef?:React.Ref<HookChartHandle>;initialViewport?:Viewport;initialLogicalRange?:{from:number;to:number};terminalMode?:boolean;focusFormation?:DetectedFormation|null;textLabel?:string}){
 const ref=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null);
 const [vp,setVp]=useState<Viewport>(()=>initialViewport||{barWidth:9,rightOffset:0,autoY:true,manualCenter:null,manualRange:null,fitAll:false});
 useEffect(()=>{onViewportChange?.(vp)},[vp,onViewportChange]);
 const terminalNavigation=useRef(false),terminalFocusKey=useRef<string|null>(null);
 const rangeRestored=useRef(false);
 useLayoutEffect(()=>{
   if(!terminalMode||!candles.length||initialLogicalRange)return;
   const key=focusFormation?.id||'latest';
   if(terminalFocusKey.current!==key){terminalFocusKey.current=key;terminalNavigation.current=false}
   const canvas=ref.current;if(!canvas)return;
   const fit=()=>{const width=canvas.getBoundingClientRect().width;if(width>0&&!terminalNavigation.current)setVp(terminalHookViewport(candles,width,focusFormation,rightPaddingBars))};
   fit();const observer=new ResizeObserver(fit);observer.observe(canvas);
   return()=>observer.disconnect();
 },[terminalMode,candles.length,focusFormation?.id,initialLogicalRange,rightPaddingBars]);
 useLayoutEffect(()=>{if(rangeRestored.current||!candles.length||!initialLogicalRange)return;const width=ref.current?.getBoundingClientRect().width||800,restored=restoredHookViewport(candles.length,Math.max(40,width),initialLogicalRange);if(restored){rangeRestored.current=true;setVp({...restored,rightOffset:restored.rightOffset+Math.max(0,rightPaddingBars)+Math.max(0,rightPadding)/Math.max(3,restored.barWidth)})}},[candles.length,initialLogicalRange,rightPaddingBars,rightPadding]);
 const [draft,setDraft]=useState<{t:number,p:number}|null>(null),[selectedDrawingId,setSelectedDrawingId]=useState<string|null>(null),[editingDrawingId,setEditingDrawingId]=useState<string|null>(null);
 const [zoomPanelOpen,setZoomPanelOpen]=useState<boolean>(()=>true),[clockNow,setClockNow]=useState(()=>Date.now()),[jumpOpen,setJumpOpen]=useState(false),[jumpMode,setJumpMode]=useState<'day'|'time'>('day'),[jumpDate,setJumpDate]=useState(()=>zoneDateKey(Date.now(),timezone)),[jumpTime,setJumpTime]=useState('12:00'),[jumpBusy,setJumpBusy]=useState(false),[jumpMessage,setJumpMessage]=useState(''),[pendingJump,setPendingJump]=useState<{t:number,fitDay:boolean}|null>(null),[liqHudOpen,setLiqHudOpen]=useState<boolean>(()=>true);
 const touchHoldTimer=useRef<ReturnType<typeof setTimeout>|null>(null),touchCursorVisible=useRef(false),suppressTouchClick=useRef(false);
 const cancelTouchHold=()=>{if(touchHoldTimer.current!==null){clearTimeout(touchHoldTimer.current);touchHoldTimer.current=null}};
 useEffect(()=>()=>{cancelTouchHold();touchCursorVisible.current=false;drag.current=null;pointers.current.clear()},[symbol,tf,tool]);
 const drag=useRef<any>(null),geom=useRef<any>(null),pointers=useRef(new Map<number,{x:number,y:number}>()),lastTap=useRef(0),mouseRef=useRef<{x:number,y:number}|null>(null),rafRef=useRef<number|null>(null),drawRef=useRef<()=>void>(()=>{});

 useEffect(()=>{const id=setInterval(()=>setClockNow(Date.now()),1000);return()=>clearInterval(id)},[]);
 useEffect(()=>{if(!jumpOpen)setJumpDate(zoneDateKey(Date.now(),timezone))},[timezone]);useEffect(()=>{if(hideTimeJump&&jumpOpen)setJumpOpen(false)},[hideTimeJump,jumpOpen]);
 const intervalMs=TF_MS[tf]||300000,lastBarStart=candles.at(-1)?.t||Math.floor(clockNow/intervalMs)*intervalMs,barStart=(lastBarStart<=clockNow&&clockNow-lastBarStart<intervalMs*2)?lastBarStart:Math.floor(clockNow/intervalMs)*intervalMs,barLeftMs=Math.max(0,barStart+intervalMs-clockNow);
 const formatBarLeft=(ms:number)=>{const total=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),sec=total%60;return h>0?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`};
 const axisTimeFmt=useMemo(()=>new Intl.DateTimeFormat(language,{timeZone:timezone,hour:'2-digit',minute:'2-digit',hour12:false}),[timezone,language,intervalMs]);
 const axisDateFmt=useMemo(()=>new Intl.DateTimeFormat(language,{timeZone:timezone,day:'2-digit',month:'2-digit'}),[timezone,language]);
 const axisFullFmt=useMemo(()=>new Intl.DateTimeFormat(language,{timeZone:timezone,day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}),[timezone,language,intervalMs]);
 const axisDayKeyFmt=useMemo(()=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}),[timezone]);
 const autoOverlay=useMemo(()=>{
   const out:any={sr:[],prev:null,dayOpen:null,vwap:[],local:[],round:[],stops:[],channel:autoChannel?channelModel:null};if(!candles.length||!(autoSR||autoPrevDay||autoDayOpen||autoVWAP||autoLocalHL||autoRoundLevels||autoPOC||autoStops||autoChannel))return out;
   const n=candles.length,last=candles[n-1],curKey=zoneDateKey(last.t,timezone);
   let curStart=n-1;while(curStart>0&&zoneDateKey(candles[curStart-1].t,timezone)===curKey)curStart--;
   const curDay=candles.slice(curStart);if(autoDayOpen&&curDay.length)out.dayOpen={p:curDay[0].o,t:curDay[0].t};
   if(autoVWAP&&curDay.length){let pv=0,v=0;out.vwap=curDay.map(k=>{const tp=(k.h+k.l+k.c)/3;pv+=tp*k.v;v+=k.v;return{t:k.t,p:v?pv/v:k.c}})}
   if(autoPrevDay&&curStart>0){const prevKey=zoneDateKey(candles[curStart-1].t,timezone);let ps=curStart-1;while(ps>0&&zoneDateKey(candles[ps-1].t,timezone)===prevKey)ps--;const rows=candles.slice(ps,curStart);if(rows.length)out.prev={h:Math.max(...rows.map(x=>x.h)),l:Math.min(...rows.map(x=>x.l)),t:rows[0].t}}
   const recent=candles.slice(Math.max(0,n-520)),baseIndex=n-recent.length,pw=tf==='1m'||tf==='3m'?4:tf==='5m'||tf==='15m'?5:6,piv:any[]=[];
   for(let i=pw;i<recent.length-pw;i++){const k=recent[i];let hi=true,lo=true;for(let j=i-pw;j<=i+pw;j++){if(j===i)continue;if(recent[j].h>=k.h)hi=false;if(recent[j].l<=k.l)lo=false;if(!hi&&!lo)break}if(hi||lo){const around=recent.slice(Math.max(0,i-pw),Math.min(recent.length,i+pw+1)),avg=around.reduce((a,x)=>a+x.c,0)/around.length,prom=Math.abs((hi?k.h:k.l)-avg)/Math.max(avg,1e-12);piv.push({kind:hi?'R':'S',p:hi?k.h:k.l,t:k.t,prom,idx:baseIndex+i})}}
   if(autoSR)out.sr=supportResistanceLevels(candles,tf);
   if(autoLocalHL){const tail=piv.filter(x=>x.idx>=Math.max(0,n-180));const rh=[...tail].reverse().find(x=>x.kind==='R'),rl=[...tail].reverse().find(x=>x.kind==='S');out.local=[rh,rl].filter(Boolean)}
   if(autoRoundLevels&&last.c>0){const mag=Math.pow(10,Math.floor(Math.log10(last.c))),step=mag*(roundness>=3?.1:roundness===2?.05:.01),center=Math.round(last.c/step)*step;for(let i=-3;i<=3;i++)out.round.push(center+i*step)}
   if(autoStops&&piv.length){const A=Math.max(atr(candles,14),last.c*.0005),ranked=[...piv].filter(x=>x.idx>=Math.max(0,n-360)).sort((a,b)=>(b.prom-a.prom)||b.idx-a.idx),picked:any[]=[];for(const z of ranked){const off=Math.max(A*.10,z.p*.0002),p=z.kind==='S'?z.p-off:z.p+off,start=Math.max(0,z.idx+1),after=candles.slice(start),swept=z.kind==='S'?after.some(k=>k.l<=p):after.some(k=>k.h>=p);if(swept)continue;const side=z.kind==='S'?'LONG':'SHORT';if(picked.some(x=>x.side===side&&Math.abs(x.p-p)/Math.max(p,1e-12)<.0015))continue;picked.push({side,p,t:z.t,pivot:z.p,prom:z.prom});if(picked.filter(x=>x.side==='LONG').length>=3&&picked.filter(x=>x.side==='SHORT').length>=3)break}out.stops=picked}

   return out
 },[candles,timezone,tf,roundness,autoSR,autoPrevDay,autoDayOpen,autoVWAP,autoLocalHL,autoRoundLevels,autoStops,autoChannel,channelModel]);
 const AX=HOOKCHART_PRICE_SCALE_WIDTH,TX=0;
 const geometry=()=>{
  const c=ref.current;if(!c||!candles.length)return null;
  const r=c.getBoundingClientRect(),plotW=Math.max(40,r.width),priceX=Math.max(0,r.width-AX),plotH=Math.max(40,r.height-TX);
  const {step,virtualEnd,virtualStart}=hookChartHorizontalRange(candles.length,plotW,vp,rightPaddingBars,rightPadding);
  const dataStart=Math.max(0,Math.floor(virtualStart)-2),dataEnd=Math.min(candles.length,Math.ceil(virtualEnd)+2);
  const data=dataEnd>dataStart?candles.slice(dataStart,dataEnd):[];
  const scaleData=data.length?data:candles.slice(-Math.min(80,candles.length));
  let lo=Infinity,hi=-Infinity;for(const z of scaleData){if(z.l<lo)lo=z.l;if(z.h>hi)hi=z.h}if(!Number.isFinite(lo)||!Number.isFinite(hi)){lo=0;hi=1}
  if(vp.autoY&&candles.length&&densities.length){const cp=candles.at(-1)!.c;const near=[...densities].filter(d=>d.active&&Math.abs(d.p-cp)/Math.max(cp,1e-12)<=.03).sort((a,b)=>Math.abs(a.p-cp)-Math.abs(b.p-cp)).slice(0,4);for(const d of near){if(d.p<lo)lo=d.p;if(d.p>hi)hi=d.p}}
  if(terminalMode&&vp.autoY){for(const marker of markers){if(Number.isFinite(marker.price)&&marker.price>0){lo=Math.min(lo,marker.price);hi=Math.max(hi,marker.price)}}}
  const pad=(hi-lo||Math.abs(hi)*.01||1)*(terminalMode ? .16 : .08);lo-=pad;hi+=pad;
  if(!vp.autoY&&vp.manualCenter!=null&&vp.manualRange!=null){lo=vp.manualCenter-vp.manualRange/2;hi=vp.manualCenter+vp.manualRange/2}
  const y=(p:number)=>plotH-(p-lo)/(hi-lo)*plotH,p=(yy:number)=>lo+(plotH-yy)/plotH*(hi-lo);
  const nearestIndex=(t:number)=>{let loI=0,hiI=candles.length-1;while(loI<hiI){const m=Math.floor((loI+hiI)/2);if(candles[m].t<t)loI=m+1;else hiI=m}const a=Math.max(0,loI-1),b=Math.min(candles.length-1,loI);return Math.abs(candles[a].t-t)<=Math.abs(candles[b].t-t)?a:b};
  const indexAtTime=(t:number)=>hookChartIndexAtTime(candles,t,intervalMs);
  const x=(t:number)=>(indexAtTime(t)-virtualStart+.5)*step;
  const candleX=(localIndex:number)=>(dataStart+localIndex-virtualStart+.5)*step;
  const timeAtX=(xx:number)=>hookChartTimeAtIndex(candles,virtualStart+xx/step-.5,intervalMs);
  return{r,plotW,priceX,plotH,data,dataStart,dataEnd,virtualStart,virtualEnd,lo,hi,step,x,candleX,y,p,nearestIndex,indexAtTime,timeAtX};
 };
 const candleIndexAtOrBefore=(target:number)=>{if(!candles.length)return 0;if(target<=candles[0].t)return 0;let lo=0,hi=candles.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(candles[mid].t<=target)lo=mid;else hi=mid-1}return lo};
 const focusAtTime=(target:number,fitDay=false)=>{const g=geometry();if(!g)return;const targetIndex=candleIndexAtOrBefore(target),useBar=fitDay?Math.max(3,Math.min(34,g.plotW/Math.max(20,86400000/intervalMs+8))):vp.barWidth,step=Math.max(3,useBar),slots=g.plotW/step,rp=Math.max(0,rightPaddingBars)+Math.max(0,rightPadding)/step,virtualStart=targetIndex+.5-slots/2,rightOffset=candles.length+rp-slots-virtualStart;setVp(v=>({...v,barWidth:useBar,rightOffset,autoY:true,manualCenter:null,manualRange:null,fitAll:false}))};
 useEffect(()=>{if(!pendingJump||!candles.length)return;if(pendingJump.t>=candles[0].t-intervalMs){focusAtTime(pendingJump.t,pendingJump.fitDay);setPendingJump(null);setJumpBusy(false);setJumpOpen(false);setJumpMessage('')}},[candles,pendingJump]);
 const requestJump=async(date:string,mode:'day'|'time'=jumpMode,time=jumpTime)=>{const clock=mode==='day'?'12:00':time;let target=zonedLocalTs(date,clock,timezone);if(!Number.isFinite(target)){setJumpBusy(false);setJumpMessage('Цей локальний час не існує або введений некоректно');return}setJumpDate(date);setJumpMode(mode);setJumpBusy(true);setJumpMessage('');const latest=candles.at(-1)?.t;if(latest){const latestDate=zoneDateKey(latest,timezone);if(date>latestDate){setJumpBusy(false);setJumpMessage('Для майбутньої дати ще немає свічок');return}if(mode==='time'&&target>latest+intervalMs){setJumpBusy(false);setJumpMessage('Для цього часу ще немає свічки');return}if(mode==='day'&&date===latestDate&&target>latest)target=latest}if(candles.length&&target>=candles[0].t){focusAtTime(target,mode==='day');setJumpBusy(false);setJumpOpen(false);return}setPendingJump({t:target,fitDay:mode==='day'});const ok=onNeedHistory?await onNeedHistory(target):false;if(!ok){setPendingJump(null);setJumpBusy(false);setJumpMessage('Не вдалося завантажити цю ділянку історії')}};
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
 const zoomX=(factor:number,anchorX:number,g:any)=>setVp(v=>{
   const old=v.fitAll?Math.max(.001,g.step):Math.max(terminalMode ? .12 : 3,v.barWidth),nw=Math.max(.12,Math.min(34,old*factor));
   const anchorFromRight=(g.plotW-anchorX)/old+v.rightOffset;
   const nr=anchorFromRight-(g.plotW-anchorX)/nw;
   return{...v,barWidth:nw,rightOffset:nr,fitAll:false}
 });
 const zoomY=(factor:number,anchorY:number,g:any)=>setVp(v=>{
   const range=v.autoY?(g.hi-g.lo):(v.manualRange||g.hi-g.lo),anchor=g.p(anchorY),nr=Math.max(1e-14,range/factor);
   const ratio=(anchorY/g.plotH)-.5,nc=anchor+ratio*nr;
   return{...v,autoY:false,manualRange:nr,manualCenter:nc}
 });
 const panXWheel=(pixels:number)=>setVp(v=>({
   ...v,
   // Same direction as TradingView-style time navigation:
   // positive wheel motion moves the visible range toward older bars.
   rightOffset:v.rightOffset+pixels/(v.fitAll?Math.max(.001,geom.current?.step||1):Math.max(terminalMode ? .12 : 3,v.barWidth)),fitAll:false
 }));
 const scheduleDraw=()=>{if(rafRef.current!==null)return;rafRef.current=requestAnimationFrame(()=>{rafRef.current=null;drawRef.current()})};
 const profileData=(d:Drawing,g:any)=>{
  if(d.type!=='profile'||!d.pts[1]||!candles.length)return null;
  const t0=Math.min(d.pts[0].t,d.pts[1].t),t1=Math.max(d.pts[0].t,d.pts[1].t);
  const firstT=candles[0].t,lastT=candles.at(-1)!.t;
  // The selection rectangle may extend into future empty space, but volume
  // is calculated only from the real candles that overlap the selection.
  if(t1<firstT||t0>lastT)return null;
  let i0=g.nearestIndex(Math.max(t0,firstT)),i1=g.nearestIndex(Math.min(t1,lastT));if(i0>i1){const z=i0;i0=i1;i1=z}
  const rows=candles.slice(i0,i1+1);if(!rows.length)return null;
  let pLo=Infinity,pHi=-Infinity;for(const k of rows){if(k.l<pLo)pLo=k.l;if(k.h>pHi)pHi=k.h}
  if(!Number.isFinite(pLo)||!Number.isFinite(pHi)||pHi<=pLo)return null;
  // Keep the visual Profile selection at the exact user-selected times.
  // Previously xA/xB were rebuilt from nearest real candles, which collapsed
  // every endpoint in the right-side empty area back to the last candle.
  const xA=g.x(t0),xB=g.x(t1),xL=Math.max(0,Math.min(g.plotW,Math.min(xA,xB))),xR=Math.max(0,Math.min(g.plotW,Math.max(xA,xB)));
  const binCount=Math.max(20,Math.min(40,Math.round(22+Math.min(18,Math.abs(xR-xL)/22))));
  const step=(pHi-pLo)/binCount,bins=Array.from({length:binCount},()=>({buy:0,sell:0,total:0}));
  for(const k of rows){const a=Math.max(0,Math.min(binCount-1,Math.floor((k.l-pLo)/step))),b=Math.max(a,Math.min(binCount-1,Math.floor((k.h-pLo)/step)));const share=k.v/Math.max(1,b-a+1),isBuy=k.c>=k.o;for(let j=a;j<=b;j++){bins[j].total+=share;if(isBuy)bins[j].buy+=share;else bins[j].sell+=share}}
  let maxV=0,poc=0;for(let i=0;i<bins.length;i++){if(bins[i].total>maxV){maxV=bins[i].total;poc=i}}
  const yTop=g.y(pHi),yBottom=g.y(pLo),profileW=Math.max(48,Math.min(150,Math.max(64,Math.abs(xR-xL)*.46)));
  return{t0,t1,i0,i1,rows,pLo,pHi,step,bins,maxV,poc,xL,xR,yTop,yBottom,profileW};
 };
 const lineActionLayout=(d:Drawing,g:any)=>{if(!d.pts[1])return null;const b=d.pts[1],x2=g.x(b.t),y2=g.y(b.p);if(x2<0||x2>g.plotW||y2<0||y2>g.plotH)return null;const y=Math.max(14,Math.min(g.plotH-14,y2-18)),editX=Math.max(14,Math.min(g.plotW-38,x2+16)),deleteX=Math.max(36,Math.min(g.plotW-14,editX+24));return{editX,deleteX,y}};
 const hitLineAction=(d:Drawing,g:any,x:number,y:number)=>{const a=lineActionLayout(d,g);if(!a)return null;if(Math.hypot(x-a.editX,y-a.y)<=11)return'edit';if(Math.hypot(x-a.deleteX,y-a.y)<=11)return'delete';return null};
 const profileActionLayout=(d:Drawing,g:any)=>{const pd=profileData(d,g);if(!pd)return null;const anchor=Math.max(pd.xL+8,pd.xR),y=Math.max(14,Math.min(g.plotH-14,Math.max(16,pd.yTop+12))),editX=Math.max(14,Math.min(g.plotW-38,anchor+16)),deleteX=Math.max(36,Math.min(g.plotW-14,editX+24));return{...pd,editX,deleteX,y}};
 const hitProfileAction=(d:Drawing,g:any,x:number,y:number)=>{const a=profileActionLayout(d,g);if(!a)return null;if(Math.hypot(x-a.editX,y-a.y)<=11)return'edit';if(Math.hypot(x-a.deleteX,y-a.y)<=11)return'delete';return null};
 const rulerPct=(a:{p:number},b:{p:number})=>a.p===0?0:(b.p-a.p)/a.p*100;
 useEffect(()=>{const c=ref.current;if(!c)return;const ro=new ResizeObserver(()=>scheduleDraw()),onVisible=()=>{if(document.visibilityState==='visible'){if(rafRef.current!==null){cancelAnimationFrame(rafRef.current);rafRef.current=null}drawRef.current()}},onResize=()=>scheduleDraw();ro.observe(c);document.addEventListener('visibilitychange',onVisible);window.addEventListener('resize',onResize,{passive:true});window.visualViewport?.addEventListener('resize',onResize,{passive:true});scheduleDraw();return()=>{ro.disconnect();document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('resize',onResize);window.visualViewport?.removeEventListener('resize',onResize);if(rafRef.current!==null){cancelAnimationFrame(rafRef.current);rafRef.current=null}}},[]);
 useEffect(()=>{setDraft(null);if(tool!=='cursor'&&tool!=='trend'&&tool!=='profile'&&tool!=='ruler'&&tool!=='fib'){setSelectedDrawingId(null);setEditingDrawingId(null)}},[tool]);
 const draw=()=>{const c=ref.current,g=geometry();if(!c||!g)return;geom.current=g;const mouse=mouseRef.current,rawDpr=Math.max(1,window.devicePixelRatio||1),dpr=Math.min(4,rawDpr),w=Math.max(1,g.r.width),h=Math.max(1,g.r.height),pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));if(c.width!==pw||c.height!==ph){c.width=pw;c.height=ph}const q=c.getContext('2d',{alpha:false})!;const scaleX=pw/w,scaleY=ph/h;q.setTransform(scaleX,0,0,scaleY,0,0);q.imageSmoothingEnabled=false;q.globalCompositeOperation='source-over';q.lineCap='butt';q.lineJoin='miter';const strokeX=(v:number)=>(Math.round(v*scaleX)+.5)/scaleX,strokeY=(v:number)=>(Math.round(v*scaleY)+.5)/scaleY,hairX=1/scaleX,hairY=1/scaleY,hair=Math.max(hairX,hairY);q.clearRect(0,0,w,h);q.fillStyle=CHART_THEME.bg;q.fillRect(0,0,w,h);
  // TradingView-style adaptive price scale: tick spacing follows the current Y range.
  // When the user stretches/compresses the price scale, both grid density and labels rescale naturally.
  const priceStep=nicePriceStep(g.hi-g.lo,g.plotH),priceDecimals=priceTickDecimals(priceStep),firstPriceTick=Math.ceil((g.lo-1e-12)/priceStep)*priceStep;
  if(gridHorizontal){q.strokeStyle=CHART_THEME.grid;q.lineWidth=hair;let priceTickCount=0;for(let p=firstPriceTick;p<=g.hi+priceStep*.25&&priceTickCount<64;p=firstPriceTick+(++priceTickCount)*priceStep){const yy=g.y(p);if(yy<-2||yy>g.plotH+2)continue;q.beginPath();q.moveTo(0,strokeY(yy));q.lineTo(g.plotW,strokeY(yy));q.stroke()}}
  if(gridVertical){const gridEvery=Math.max(1,Math.ceil(92/Math.max(3,g.step)));let lastGridX=-1e9;for(let i=0;i<g.data.length;i++){const globalI=g.dataStart+i;if(globalI%gridEvery!==0)continue;const xx=g.candleX(i);if(xx<0||xx>g.plotW||xx-lastGridX<58)continue;q.strokeStyle=CHART_THEME.gridSoft;q.lineWidth=hair;q.beginPath();q.moveTo(strokeX(xx),0);q.lineTo(strokeX(xx),g.plotH);q.stroke();lastGridX=xx}}
  if(roundGrid){const cp=candles.at(-1)?.c||1,rs=roundPriceIncrement(cp,roundness);if(rs>0){let n=0;for(let rp=Math.ceil(g.lo/rs)*rs;rp<=g.hi&&n<80;rp+=rs,n++){const yy=g.y(rp),major=Math.round(rp/rs)%5===0;q.strokeStyle=major?'rgba(120,123,134,.30)':'rgba(42,46,57,.48)';q.lineWidth=major?Math.max(hair,.8):hair;q.beginPath();q.moveTo(0,yy);q.lineTo(g.plotW,yy);q.stroke()}}}
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
  // Automatic intraday reference overlays toggled from the top toolbar.
  const autoH=(p:number,label:string,col:string,dash:number[]=[4,4],x0=0,showLabel=true)=>{const yy=g.y(p);if(yy<0||yy>g.plotH)return;q.save();q.strokeStyle=col;q.fillStyle=col;q.globalAlpha=.86;q.lineWidth=.9;q.setLineDash(dash);q.beginPath();q.moveTo(Math.max(0,x0),yy);q.lineTo(g.plotW,yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;q.font='600 10px system-ui';if(showLabel)q.fillText(label,Math.max(4,Math.min(g.plotW-70,Math.max(4,x0+4))),Math.max(11,yy-3));q.restore()};
  if(autoSR)for(const z of autoOverlay.sr){autoH(z.p,`${z.kind} ${tf}`,z.kind==='R'?'#d67a86':'#5fb9a8',[5,4],g.x(z.t),showSRLabels)}
  if(autoPrevDay&&autoOverlay.prev){autoH(autoOverlay.prev.h,'PDH','#c2a85d',[6,4],g.x(autoOverlay.prev.t));autoH(autoOverlay.prev.l,'PDL','#c2a85d',[6,4],g.x(autoOverlay.prev.t))}
  if(autoDayOpen&&autoOverlay.dayOpen)autoH(autoOverlay.dayOpen.p,'OPEN','#9da9b8',[3,4],g.x(autoOverlay.dayOpen.t));
  if(autoLocalHL)for(const z of autoOverlay.local){autoH(z.p,z.kind==='R'?'Local H':'Local L',z.kind==='R'?'#e08b91':'#70bfae',[2,3],g.x(z.t))}
  if(autoRoundLevels)for(const rp of autoOverlay.round)autoH(rp,'RN','#737f90',[2,5],0);
  if(autoStops)for(const st of autoOverlay.stops){const yy=g.y(st.p),xx=Math.max(4,Math.min(g.plotW-70,g.x(st.t))),col=st.side==='LONG'?'#ff6d78':'#e8c257';if(yy<0||yy>g.plotH)continue;q.save();q.strokeStyle=col;q.globalAlpha=.72;q.lineWidth=1;q.setLineDash([3,4]);q.beginPath();q.moveTo(xx,yy);q.lineTo(Math.min(g.plotW,xx+64),yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;q.fillStyle=col;q.beginPath();if(st.side==='LONG'){q.moveTo(xx+3,yy-4);q.lineTo(xx+8,yy-4);q.lineTo(xx+5.5,yy+1);q.closePath()}else{q.moveTo(xx+3,yy+4);q.lineTo(xx+8,yy+4);q.lineTo(xx+5.5,yy-1);q.closePath()}q.fill();q.font='700 9px system-ui';const txt=`Stop ${st.side}`;q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(txt,xx+11,Math.max(10,Math.min(g.plotH-3,yy-3)));q.fillStyle=col;q.fillText(txt,xx+11,Math.max(10,Math.min(g.plotH-3,yy-3)));q.restore()}
  if(autoPOC){const rows=g.data.length?g.data:candles.slice(-Math.min(220,candles.length));if(rows.length>4){let lo=Infinity,hi=-Infinity;for(const k of rows){if(k.l<lo)lo=k.l;if(k.h>hi)hi=k.h}if(Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo){const count=48,step=(hi-lo)/count,bins=Array.from({length:count},()=>0);for(const k of rows){const a=Math.max(0,Math.min(count-1,Math.floor((k.l-lo)/step))),b=Math.max(a,Math.min(count-1,Math.floor((k.h-lo)/step))),share=k.v/Math.max(1,b-a+1);for(let j=a;j<=b;j++)bins[j]+=share}let poc=0,max=0;for(let i=0;i<count;i++)if(bins[i]>max){max=bins[i];poc=i}let z0=poc,z1=poc;if(poc>0&&bins[poc-1]>=max*.72)z0--;if(poc<count-1&&bins[poc+1]>=max*.72)z1++;const pLo=lo+z0*step,pHi=lo+(z1+1)*step,pMid=lo+(poc+.5)*step,y0=g.y(pHi),y1=g.y(pLo),ym=g.y(pMid);if(y1>=0&&y0<=g.plotH){q.save();q.fillStyle='rgba(207,164,88,.105)';q.fillRect(0,Math.max(0,y0),g.plotW,Math.max(1,Math.min(g.plotH,y1)-Math.max(0,y0)));q.strokeStyle='rgba(218,178,101,.9)';q.lineWidth=1.05;q.setLineDash([]);q.beginPath();q.moveTo(0,ym);q.lineTo(g.plotW,ym);q.stroke();q.fillStyle='#d7b16a';q.font='700 10px system-ui';q.fillText('POC',Math.max(4,g.plotW-30),Math.max(11,Math.min(g.plotH-3,ym-3)));q.restore()}}}}
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
    for(let i=0;i<g.data.length;i++){
      const k=g.data[i],rawX=g.candleX(i),centerPx=Math.round(rawX*scaleX),stepPx=Math.max(2,Math.round(g.step*scaleX)),barPx=Math.max(1,Math.min(stepPx-1,Math.round(g.step*.72*scaleX)));
      const hhPx=Math.max(2,Math.round(((k.v/maxV)*(volumeBandH-5))*scaleY)),leftPx=Math.round(centerPx-barPx/2),basePx=Math.round(volumeBaseY*scaleY);
      q.fillStyle=k.c>=k.o?candleLongColor:candleShortColor;q.fillRect(leftPx,basePx-hhPx,barPx,hhPx);
    }
    q.restore();q.restore();q.globalAlpha=1;
  }
  const now=Date.now();
  const tfPriority=(z:AutoLevel['tf'])=>z==='1d'?3:z==='4h'?2:z==='1h'?1:z==='15m'?.7:.5;
  const tfRank:{[k:string]:number}={'1m':1,'3m':1,'5m':1,'15m':1,'30m':1,'1h':1,'4h':2,'1d':3};
  const chartRank=tfRank[tf]||1;
  const allowedLevel=(l:AutoLevel)=>chartRank===3?l.tf==='1d':chartRank===2?(l.tf==='4h'||l.tf==='1d'):true;
  const currentPrice=candles.at(-1)?.c||((g.hi+g.lo)/2);
  const rawLevels=autoLevels.filter(l=>allowedLevel(l)&&l.p>=g.lo&&l.p<=g.hi);
  const quota:{[k:string]:number}=chartRank===3?{'1d':6}:chartRank===2?{'4h':4,'1d':4}:{'5m':3,'15m':3,'1h':3,'4h':3,'1d':3};
  const rankedLevels=[...rawLevels].sort((a,b)=>{
    const quality=(l:AutoLevel)=>l.strength*.72+tfPriority(l.tf)*6+(l.broken?-18:0)+Math.max(0,12-Math.abs(l.p-currentPrice)/Math.max(currentPrice,1e-12)*220);
    return quality(b)-quality(a)
  });
  const perTf:{[k:string]:number}={},preselected:AutoLevel[]=[];
  for(const l of rankedLevels){const max=quota[l.tf]||0;if(!max||((perTf[l.tf]||0)>=max))continue;if(l.broken&&preselected.filter(x=>x.broken).length>=2)continue;preselected.push(l);perTf[l.tf]=(perTf[l.tf]||0)+1}
  // Keep enough vertical air between rays. When zooming in, more levels naturally fit.
  // Fractional desktop sizes can become invisible strokes on a phone. Keep mobile captions readable.
  const levelFontSize=Math.max(window.matchMedia('(pointer: coarse)').matches?10:0.2,Math.min(20,Number.isFinite(levelLabelSize)?levelLabelSize:11));
  const levelMinGap=Math.max(levelFontSize+(levelLabelStyle==='text'?8:16),20,Math.min(38,26+(9-vp.barWidth)*.35));
  const scaleAwareLevels:AutoLevel[]=[];
  for(const l of preselected){const yy=g.y(l.p);const conflict=scaleAwareLevels.find(x=>Math.abs(g.y(x.p)-yy)<levelMinGap);if(!conflict)scaleAwareLevels.push(l)}
  scaleAwareLevels.sort((a,b)=>a.p-b.p).forEach(l=>{
    const yy=g.y(l.p),origin=g.x(l.firstTime);const x0=origin>g.plotW?0:Math.max(0,origin),broken='#777B80',col=l.broken?broken:levelLabelColor;
    const tfBase=l.tf==='1d'?.62:l.tf==='4h'?.54:l.tf==='1h'?.46:.4;
    const strengthWidth=.05+Math.pow(Math.max(0,Math.min(100,l.strength))/100,.8)*.34;
    const w=l.broken?Math.max(.4,tfBase*.74):Math.min(1.3,tfBase+strengthWidth);
    q.strokeStyle=col;q.globalAlpha=l.broken?.62:.96;q.lineWidth=w;q.setLineDash(levelLineStyle==='dash'?[7,5]:levelLineStyle==='dot'?[2,4]:[]);q.beginPath();q.moveTo(x0,yy);q.lineTo(g.plotW,yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;
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
  if(showDensityLines||showDensityLabels)densities.filter(d=>d.p>=g.lo&&d.p<=g.hi).forEach(d=>{const yy=g.y(d.p),origin=g.x(d.first);const xx=origin>g.plotW?Math.max(0,g.plotW-g.step):Math.max(0,origin),age=Math.max(0,Math.floor((now-d.first)/1000));if(showDensityLines){q.strokeStyle=densityLineColor;q.lineWidth=Math.max(.5,densityLineWidth)*(d.active?1:.75);q.globalAlpha=d.active?1:.5;q.setLineDash(densityLineStyle==='dash'?[7,5]:densityLineStyle==='dot'?[2,4]:[]);q.beginPath();q.moveTo(xx,yy);q.lineTo(g.plotW,yy);q.stroke();q.setLineDash([]);q.globalAlpha=1}if(showDensityLabels){q.font=`600 ${Math.max(8,densityLabelSize)}px system-ui`;const ageTxt=age<60?`${age}s`:age<3600?`${Math.floor(age/60)}m`:`${Math.floor(age/3600)}h`,core=d.touches>0?`x${d.touches}`:d.side,details=showDensityAmounts?` · $${formatUsd(d.usd)} · ${ageTxt}`:'',txt=`${core}${details}`;const tw=q.measureText(txt).width;const lx=Math.max(5,Math.min(g.plotW-tw-5,origin<0?6:origin+4));q.fillStyle=densityLabelColor;q.globalAlpha=d.active?1:.62;q.fillText(txt,lx,Math.max(12,yy-5));q.globalAlpha=1}});
  if(showMarketPrintSums){const printsByCandle=new Map<number,MarketPrint[]>();for(const m of marketPrints){const xx=g.x(m.t);if(xx<0||xx>g.plotW)continue;const ci=g.nearestIndex(m.t);const arr=printsByCandle.get(ci)||[];arr.push(m);printsByCandle.set(ci,arr)}for(const [ci,items0] of printsByCandle){const c=candles[ci];if(!c)continue;const items=[...items0].sort((a,b)=>b.usd-a.usd).slice(0,3),xx=g.x(c.t),anchorY=Math.max(1,Math.min(g.plotH-2,g.y(c.l))),baseY=Math.max(12,Math.min(anchorY+16,g.plotH-8-(items.length-1)*14));items.forEach((m,row)=>{const buy=m.side==='BUY',text=`$${formatUsd(m.usd)}`;q.font='700 11px system-ui';const tw=q.measureText(text).width,tx=Math.max(2,Math.min(g.plotW-tw-2,xx-tw/2)),ty=Math.max(12,Math.min(g.plotH-6,baseY+row*14)),col=buy?candleLongColor:candleShortColor;q.strokeStyle=col;q.lineWidth=1;q.globalAlpha=.95;q.beginPath();q.moveTo(xx,Math.min(g.plotH-2,anchorY+1));q.lineTo(xx,Math.max(2,Math.min(g.plotH-10,ty-11)));q.stroke();q.globalAlpha=1;q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(text,tx,ty);q.fillStyle=col;q.fillText(text,tx,ty)})}};
  if(showLiquidations){
    // The feed contains only large liquidation events (>= the adaptive cut).
    // Bucket real exchange events into their actual candle and show observed notional below it.
    for(const bucket of aggregateLiquidationsByCandle(candles,liquidations,intervalMs)){
      const c=candles[bucket.index];if(!c)continue;
      const xx=g.x(c.t);if(xx<0||xx>g.plotW)continue;
      const anchorY=Math.max(1,Math.min(g.plotH-2,g.y(c.l)));
      const summary=`Liq $${formatUsd(bucket.totalUsd)}`;
      const detail=`L $${formatUsd(bucket.longUsd)} · S $${formatUsd(bucket.shortUsd)}`;
      const col=bucket.longUsd>=bucket.shortUsd?'#ff6677':'#f0c95a';
      q.save();q.textAlign='center';q.textBaseline='alphabetic';
      q.font='800 10px system-ui';const summaryW=q.measureText(summary).width;
      q.font='700 9px system-ui';const detailW=q.measureText(detail).width,maxW=Math.max(summaryW,detailW);
      const tx=Math.max(maxW/2+2,Math.min(g.plotW-maxW/2-2,xx));
      const baseY=Math.max(26,Math.min(g.plotH-7,anchorY+44));
      q.strokeStyle=col;q.lineWidth=1;q.globalAlpha=.9;q.beginPath();q.moveTo(xx,Math.min(g.plotH-3,anchorY+2));q.lineTo(tx,Math.max(anchorY+8,baseY-23));q.stroke();
      q.globalAlpha=1;q.font='800 10px system-ui';q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(summary,tx,baseY-10);q.fillStyle=col;q.fillText(summary,tx,baseY-10);
      q.font='700 9px system-ui';q.strokeText(detail,tx,baseY+2);q.fillStyle='#c7d0dc';q.fillText(detail,tx,baseY+2);
      q.restore();
    }
  }

  if(strategyResult){const events=strategyResult.events.slice().sort((a,b)=>a.t-b.t);q.save();for(const e of events){if(e.zone){const y0=g.y(e.zone.high),y1=g.y(e.zone.low),top=Math.max(0,Math.min(y0,y1)),bot=Math.min(g.plotH,Math.max(y0,y1));if(bot>top){q.fillStyle=e.direction==='bullish'?'rgba(38,166,154,.055)':e.direction==='bearish'?'rgba(239,83,80,.055)':'rgba(123,145,171,.045)';q.fillRect(0,top,g.plotW,Math.max(1,bot-top))}}if(e.lines)for(const ln of e.lines){const x0=g.x(ln.t0),x1=g.x(ln.t1),y0=g.y(ln.p0),y1=g.y(ln.p1);q.strokeStyle='#8aa4c3';q.globalAlpha=.78;q.lineWidth=1;q.setLineDash([5,4]);q.beginPath();q.moveTo(x0,y0);q.lineTo(x1,y1);q.stroke()}const xx=g.x(e.t),yy=e.p!=null?g.y(e.p):NaN;if(xx<0||xx>g.plotW||!Number.isFinite(yy)||yy<0||yy>g.plotH)continue;const col=e.type==='OVERHEAT'?'#f0a45d':e.type==='FAILED_BREAKOUT'?'#ef6b73':e.direction==='bullish'?'#56c5aa':e.direction==='bearish'?'#e8787e':'#91a4bd';q.globalAlpha=.95;q.fillStyle=col;q.beginPath();q.arc(xx,yy,2.6,0,Math.PI*2);q.fill();q.font='700 9px system-ui';const text=`${translateHookChartPhrase(language,e.label)} ${e.score}`,tw=q.measureText(text).width,tx=Math.max(3,Math.min(g.plotW-tw-3,xx+5)),ty=Math.max(11,Math.min(g.plotH-4,yy+(e.direction==='bearish'?14:-7)));q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(text,tx,ty);q.fillStyle=col;q.fillText(text,tx,ty)}q.setLineDash([]);q.globalAlpha=1;q.restore()}
  const priceTags:{price:number;label:string;bg:string;fg:string;y:number;current?:boolean}[]=[];
  const priceTag=(price:number,label:string,bg:string,fg='#ffffff')=>{const yy=g.y(price);if(yy>=0&&yy<=g.plotH)priceTags.push({price,label,bg,fg,y:yy})};
  for(const marker of markers){
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
  drawings.filter(d=>d.id.startsWith(symbol+':')).forEach(d=>{
    if(!d.pts.length)return;
    const selected=d.id===selectedDrawingId;
    q.strokeStyle=selected?'#dce5ef':'#aeb8c6';q.fillStyle='#aeb8c6';q.lineWidth=selected?1.6:1.25;
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
      if(selected){const ac=profileActionLayout(d,g);if(ac){q.save();q.lineCap='round';q.lineJoin='round';q.strokeStyle=editingDrawingId===d.id?'#f0c95a':'#aeb8c6';q.lineWidth=1.6;const ex=ac.editX,ey=ac.y;q.beginPath();q.moveTo(ex-5,ey+4);q.lineTo(ex+4,ey-5);q.moveTo(ex-6,ey+5);q.lineTo(ex-2,ey+4);q.moveTo(ex+3,ey-6);q.lineTo(ex+5,ey-4);q.stroke();const dx=ac.deleteX,dy=ac.y;q.strokeStyle='#e56a73';q.beginPath();q.moveTo(dx-5,dy-4);q.lineTo(dx+5,dy-4);q.moveTo(dx-2,dy-6);q.lineTo(dx+2,dy-6);q.moveTo(dx-4,dy-2);q.lineTo(dx-3,dy+6);q.lineTo(dx+3,dy+6);q.lineTo(dx+4,dy-2);q.stroke();if(editingDrawingId===d.id){const yHandle=Math.max(5,Math.min(g.plotH-5,pd.yTop+2)),xA=g.x(d.pts[0].t),xB=g.x(d.pts[1].t);q.fillStyle='#f0c95a';for(const xx of [xA,xB]){if(xx>=0&&xx<=g.plotW){q.beginPath();q.arc(xx,yHandle,4,0,Math.PI*2);q.fill()}}}q.restore()}}
      q.restore();
    }else if(d.pts[1]){
      const b=d.pts[1],x2=g.x(b.t),y2=g.y(b.p),isEditable=d.type==='trend'||d.type==='ruler'||d.type==='fib';
      if(d.type==='ruler'){
        const pct=rulerPct(a,b),col=pct>=0?'#26A69A':'#EF5350';q.strokeStyle=selected?'#dce5ef':col;q.lineWidth=selected?1.5:1.15;q.beginPath();q.moveTo(x1,y1);q.lineTo(x2,y2);q.stroke();
        q.fillStyle=editingDrawingId===d.id?'#ffffff':(selected?'#dce5ef':col);for(const [xx,yy] of [[x1,y1],[x2,y2]]){q.beginPath();q.arc(xx,yy,editingDrawingId===d.id?4:2.5,0,Math.PI*2);q.fill()}
        const txt=`${pct>=0?'+':''}${pct.toFixed(4)}%`,mx=(x1+x2)/2,my=(y1+y2)/2-7;q.font='700 11px system-ui';const tw=q.measureText(txt).width,tx=Math.max(3,Math.min(g.plotW-tw-3,mx-tw/2)),ty=Math.max(12,Math.min(g.plotH-4,my));q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(txt,tx,ty);q.fillStyle=col;q.fillText(txt,tx,ty);
      }else if(d.type==='fib'){
        const lx=Math.max(0,Math.min(g.plotW,Math.min(x1,x2))),rx=Math.max(0,Math.min(g.plotW,Math.max(x1,x2))),span=Math.max(1,rx-lx),dp=b.p-a.p;
        q.save();q.beginPath();q.rect(0,0,g.plotW,g.plotH);q.clip();q.font='600 10px system-ui';q.textBaseline='bottom';
        for(let fi=0;fi<FIB_LEVELS.length;fi++){const r=FIB_LEVELS[fi],price=a.p+dp*r,yy=g.y(price);if(yy<0||yy>g.plotH)continue;const col=FIB_COLORS[fi];q.strokeStyle=col;q.globalAlpha=selected?.95:.72;q.lineWidth=r===.5||r===.618?1.15:.85;q.setLineDash([]);q.beginPath();q.moveTo(lx,yy);q.lineTo(rx,yy);q.stroke();const label=`${r.toFixed(r===0||r===1?0:3)}  ${formatCryptoPrice(price)}`;q.globalAlpha=1;q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(label,Math.min(g.plotW-110,rx+5),Math.max(11,yy-2));q.fillStyle=col;q.fillText(label,Math.min(g.plotW-110,rx+5),Math.max(11,yy-2))}
        q.globalAlpha=1;q.strokeStyle=selected?'rgba(220,229,239,.48)':'rgba(174,184,198,.24)';q.lineWidth=.7;q.setLineDash([3,4]);q.strokeRect(lx+.5,Math.min(y1,y2)+.5,span,Math.max(1,Math.abs(y2-y1)));q.setLineDash([]);
        q.fillStyle=editingDrawingId===d.id?'#ffffff':(selected?'#dce5ef':'#aeb8c6');for(const [xx,yy] of [[x1,y1],[x2,y2]]){q.beginPath();q.arc(xx,yy,editingDrawingId===d.id?4:2.5,0,Math.PI*2);q.fill()}q.restore();
      }else{
        q.beginPath();q.moveTo(x1,y1);q.lineTo(d.type==='ray'?g.plotW:x2,d.type==='ray'?y1+(g.plotW-x1)*(y2-y1)/(x2-x1||1):y2);q.stroke();
        if(d.type==='rect')q.strokeRect(x1,y1,x2-x1,y2-y1);
        if(d.type==='trend'){q.fillStyle=editingDrawingId===d.id?'#ffffff':(selected?'#dce5ef':'#aeb8c6');q.beginPath();q.arc(x1,y1,editingDrawingId===d.id?4:2.5,0,Math.PI*2);q.fill();q.beginPath();q.arc(x2,y2,editingDrawingId===d.id?4:2.5,0,Math.PI*2);q.fill()}
      }
      if(selected&&isEditable){const ac=lineActionLayout(d,g);if(ac){q.save();q.lineCap='round';q.lineJoin='round';q.strokeStyle=editingDrawingId===d.id?'#f0c95a':'#aeb8c6';q.lineWidth=1.6;const ex=ac.editX,ey=ac.y;q.beginPath();q.moveTo(ex-5,ey+4);q.lineTo(ex+4,ey-5);q.moveTo(ex-6,ey+5);q.lineTo(ex-2,ey+4);q.moveTo(ex+3,ey-6);q.lineTo(ex+5,ey-4);q.stroke();const dx=ac.deleteX,dy=ac.y;q.strokeStyle='#e56a73';q.beginPath();q.moveTo(dx-5,dy-4);q.lineTo(dx+5,dy-4);q.moveTo(dx-2,dy-6);q.lineTo(dx+2,dy-6);q.moveTo(dx-4,dy-2);q.lineTo(dx-3,dy+6);q.lineTo(dx+3,dy+6);q.lineTo(dx+4,dy-2);q.stroke();q.restore()}}
    }
  });
  if((tool==='trend'||tool==='profile'||tool==='ruler'||tool==='fib')&&draft&&mouse&&mouse.x>=0&&mouse.x<=g.plotW&&mouse.y>=0&&mouse.y<=g.plotH){
    const end=snap(mouse.x,mouse.y,g),x1=g.x(draft.t),y1=g.y(draft.p),x2=g.x(end.t),y2=g.y(end.p);q.save();
    if(tool==='profile'){const lx=Math.min(x1,x2),rx=Math.max(x1,x2);q.fillStyle='rgba(100,126,156,.08)';q.fillRect(lx,0,Math.max(1,rx-lx),g.plotH);q.strokeStyle='rgba(220,229,239,.65)';q.lineWidth=1;q.setLineDash([4,4]);q.strokeRect(lx+.5,.5,Math.max(1,rx-lx),g.plotH-1)}
    else if(tool==='fib'){const lx=Math.min(x1,x2),rx=Math.max(x1,x2),dp=end.p-draft.p;q.font='600 10px system-ui';for(let fi=0;fi<FIB_LEVELS.length;fi++){const r=FIB_LEVELS[fi],price=draft.p+dp*r,yy=g.y(price),col=FIB_COLORS[fi];q.strokeStyle=col;q.globalAlpha=.78;q.lineWidth=r===.5||r===.618?1.1:.8;q.setLineDash([4,3]);q.beginPath();q.moveTo(lx,yy);q.lineTo(rx,yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;q.fillStyle=col;q.fillText(r.toFixed(r===0||r===1?0:3),Math.min(g.plotW-35,rx+4),Math.max(11,yy-2))}q.fillStyle='#dce5ef';for(const [xx,yy] of [[x1,y1],[x2,y2]]){q.beginPath();q.arc(xx,yy,2.5,0,Math.PI*2);q.fill()}}
    else{const pct=tool==='ruler'?rulerPct(draft,end):0,col=tool==='ruler'?(pct>=0?'#26A69A':'#EF5350'):'#dce5ef';q.strokeStyle=col;q.lineWidth=1.25;q.setLineDash([4,3]);q.beginPath();q.moveTo(x1,y1);q.lineTo(x2,y2);q.stroke();q.fillStyle=col;q.beginPath();q.arc(x1,y1,2.5,0,Math.PI*2);q.fill();q.beginPath();q.arc(x2,y2,2.5,0,Math.PI*2);q.fill();if(tool==='ruler'){const txt=`${pct>=0?'+':''}${pct.toFixed(4)}%`,mx=(x1+x2)/2,my=(y1+y2)/2-7;q.font='700 11px system-ui';const tw=q.measureText(txt).width;q.setLineDash([]);q.lineWidth=3;q.strokeStyle=CHART_THEME.bg;q.strokeText(txt,Math.max(3,Math.min(g.plotW-tw-3,mx-tw/2)),Math.max(12,Math.min(g.plotH-4,my)));q.fillStyle=col;q.fillText(txt,Math.max(3,Math.min(g.plotW-tw-3,mx-tw/2)),Math.max(12,Math.min(g.plotH-4,my)))}}
    q.setLineDash([]);q.restore();
  }
  alerts.filter(a=>a.id.startsWith(symbol+':')).forEach(a=>{const yy=g.y(a.p);if(yy<0||yy>g.plotH)return;const col=a.fired?'#5c6673':'#d95763';q.strokeStyle=col;q.lineWidth=1;q.globalAlpha=a.fired?.45:.72;q.setLineDash([3,5]);q.beginPath();q.moveTo(0,yy);q.lineTo(g.plotW,yy);q.stroke();q.setLineDash([]);q.globalAlpha=1;q.fillStyle=col;q.beginPath();q.moveTo(g.plotW-7,yy);q.lineTo(g.plotW-1,yy-4);q.lineTo(g.plotW-1,yy+4);q.closePath();q.fill()});
  // Live current-price guide: a fine dotted ray from the latest candle to the price scale,
  // plus a filled price badge using the current candle direction color.
  {const last=candles.at(-1);if(last){const py=g.y(last.c),lastX=g.x(last.t),priceCol=last.c>=last.o?candleLongColor:candleShortColor;if(py>=0&&py<=g.plotH){q.save();q.strokeStyle=priceCol;q.globalAlpha=.92;q.lineWidth=1;q.setLineDash([2,3]);if(lastX<=g.plotW){q.beginPath();q.moveTo(Math.max(0,lastX+Math.max(2,g.step*.32)),py+.5);q.lineTo(g.plotW,py+.5);q.stroke()}q.restore();priceTags.push({price:last.c,label:'',bg:priceCol,fg:'#ffffff',y:py,current:true})}}}
  if(mouse&&mouse.x>=0&&mouse.x<g.plotW&&mouse.y>=0&&mouse.y<g.plotH){q.save();q.strokeStyle=CHART_THEME.crosshair;q.lineWidth=1.4;q.setLineDash([]);q.beginPath();q.moveTo(mouse.x,0);q.lineTo(mouse.x,g.plotH);q.moveTo(0,mouse.y);q.lineTo(g.plotW,mouse.y);q.stroke();q.restore();priceTag(g.p(mouse.y),'','#303946')}
  // Transparent price-scale overlay: chart content continues under the right-side labels.
  q.save();q.globalAlpha=1;q.setLineDash([]);
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
  // Date/time axis is rendered as a dedicated synchronized row below indicator panels.
 };
 drawRef.current=draw;
 useLayoutEffect(()=>{if(document.visibilityState==='hidden'){scheduleDraw();return}if(rafRef.current!==null){cancelAnimationFrame(rafRef.current);rafRef.current=null}drawRef.current()},[candles,vp,drawings,alerts,densities,marketPrints,liquidations,autoLevels,markers,levelLabelMode,levelLabelColor,levelLabelSize,levelLabelStyle,levelLineStyle,symbol,draft,selectedDrawingId,editingDrawingId,tool,rightPadding,rightPaddingBars,roundGrid,roundness,gridHorizontal,gridVertical,showMarketPrintSums,showVolumes,showLiquidations,showDensityLines,showDensityLabels,showDensityAmounts,candleLongColor,candleShortColor,densityLineColor,densityLabelColor,densityLineWidth,densityLineStyle,densityLabelSize,autoSR,showSRLabels,autoPrevDay,autoDayOpen,autoVWAP,autoLocalHL,autoRoundLevels,autoPOC,autoStops,autoChannel,channelModel,strategyResult,cascadeRisk.score,cascadeRisk.level,cascadeRisk.total5,cascadeRisk.count5,liquidationCut,timezone,language]);
 const point=(e:React.PointerEvent<HTMLElement>)=>{const g=geometry();if(!g)return null;return{g,x:e.clientX-g.r.left,y:e.clientY-g.r.top}};
 const handlePointerDown=(e:React.PointerEvent<HTMLCanvasElement>)=>{terminalNavigation.current=true;if(terminalMode||e.pointerType==='touch')e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const z=point(e);if(!z)return;cancelTouchHold();touchCursorVisible.current=false;if(!pointers.current.size)suppressTouchClick.current=false;mouseRef.current={x:z.x,y:z.y};scheduleDraw();pointers.current.set(e.pointerId,{x:z.x,y:z.y});if(editingDrawingId){const ed=drawings.find(d=>d.id===editingDrawingId&&(d.type==='trend'||d.type==='ruler'||d.type==='fib'||d.type==='profile')&&d.pts[1]);if(ed){if(ed.type==='profile'){const pd=profileData(ed,z.g);if(pd){const x0=z.g.x(ed.pts[0].t),x1=z.g.x(ed.pts[1].t),insideY=z.y>=pd.yTop-12&&z.y<=pd.yBottom+12,d0=insideY?Math.abs(z.x-x0):999,d1=insideY?Math.abs(z.x-x1):999;if(Math.min(d0,d1)<=12){drag.current={kind:'editDrawingPoint',drawingId:ed.id,pointIndex:d0<=d1?0:1};return}}}else{const pts=ed.pts.slice(0,2).map(p=>({x:z.g.x(p.t),y:z.g.y(p.p)})),d0=Math.hypot(z.x-pts[0].x,z.y-pts[0].y),d1=Math.hypot(z.x-pts[1].x,z.y-pts[1].y);if(Math.min(d0,d1)<=12){drag.current={kind:'editDrawingPoint',drawingId:ed.id,pointIndex:d0<=d1?0:1};return}}}}if(pointers.current.size===2){suppressTouchClick.current=true;const a=[...pointers.current.values()];drag.current={kind:'pinch',distX:Math.max(1,Math.abs(a[0].x-a[1].x)),bar:vp.fitAll?Math.max(.001,z.g.step):vp.barWidth,anchor:z.g.virtualStart+(a[0].x+a[1].x)/2/z.g.step};return}const zn=zone(z.x,z.y,z.g);if((e.pointerType==='touch'||e.pointerType==='pen')&&tool==='cursor'&&zn==='plot'){const gesture={kind:'touchCursor',x:z.x,y:z.y,vp:{...vp},g:z.g,panning:false,inspecting:false};drag.current=gesture;touchHoldTimer.current=setTimeout(()=>{touchHoldTimer.current=null;if(drag.current===gesture&&pointers.current.size===1&&!gesture.panning){gesture.inspecting=true;touchCursorVisible.current=true;suppressTouchClick.current=true;scheduleDraw()}},350);return}drag.current={kind:zn,x:z.x,y:z.y,vp:{...vp},g:z.g,baseCenter:(z.g.hi+z.g.lo)/2,baseRange:z.g.hi-z.g.lo}};
 const handlePointerMove=(e:React.PointerEvent<HTMLElement>)=>{
   const z=point(e);if(!z)return;
   mouseRef.current={x:z.x,y:z.y};scheduleDraw();
   if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:z.x,y:z.y});
   const d=drag.current;if(!d)return;
   if(d.kind==='editDrawingPoint'){const p=snap(z.x,z.y,z.g);setDrawings(list=>list.map(item=>item.id!==d.drawingId?item:{...item,pts:item.pts.map((pt,i)=>i===d.pointIndex?p:pt)}));return}
   if(tool!=='cursor')return;
   if(d.kind==='pinch'&&pointers.current.size>=2){
     const a=[...pointers.current.values()],distX=Math.max(1,Math.abs(a[0].x-a[1].x)),ratio=terminalMode?distX/(d.distX||1):Math.max(.35,Math.min(3.2,distX/(d.distX||1)));
     const barWidth=Math.max(.12,Math.min(34,d.bar*ratio));
     const midX=(a[0].x+a[1].x)/2;
     setVp(v=>({...v,fitAll:false,barWidth,...(terminalMode?{rightOffset:candles.length+rightPaddingBars+rightPadding/barWidth-d.anchor-(z.g.plotW-midX)/barWidth}:{})}));return
   }
   if(d.kind==='touchCursor'){
     const dx=z.x-d.x,dy=z.y-d.y;
     // Hold to inspect without moving the candles; a normal swipe still pans both axes.
     if(d.inspecting)return;
     if(!d.panning&&Math.hypot(dx,dy)>=5){d.panning=true;cancelTouchHold();suppressTouchClick.current=true}
     if(d.panning){
       const center=d.g.p(d.g.plotH/2-dy);
       setVp(v=>({...v,rightOffset:d.vp.rightOffset+dx/Math.max(.001,d.g.step),autoY:false,manualCenter:center,manualRange:d.vp.manualRange||d.g.hi-d.g.lo,fitAll:false}))
     }
     return
   }
   if(d.kind==='plot'){
     const dx=z.x-d.x,dy=z.y-d.y,nextOffset=d.vp.rightOffset+dx/Math.max(.001,d.vp.fitAll?d.g.step:d.vp.barWidth);
     const movedY=Math.abs(dy)>1.5||!d.vp.autoY;
     if(movedY){
       const center=d.baseCenter+(dy/Math.max(1,d.g.plotH))*d.baseRange;
       setVp(v=>({...v,rightOffset:nextOffset,autoY:false,manualCenter:center,manualRange:d.vp.manualRange||d.baseRange,fitAll:false}))
     }else setVp(v=>({...v,rightOffset:nextOffset,fitAll:false}))
   }else if(d.kind==='time'){
     const dx=z.x-d.x,baseBar=d.vp.fitAll?Math.max(.001,d.g.step):d.vp.barWidth;setVp(v=>({...v,fitAll:false,barWidth:Math.max(.12,Math.min(34,baseBar*Math.exp(dx/180)))}))
   }else if(d.kind==='price'){
     const dy=z.y-d.y,base=d.vp.autoY?(d.g.hi-d.g.lo):(d.vp.manualRange||d.g.hi-d.g.lo),nr=Math.max(1e-9,base*Math.exp(dy/180)),anchorY=Math.max(0,Math.min(d.g.plotH,d.y)),anchorPrice=d.g.p(anchorY),anchorRatio=anchorY/Math.max(1,d.g.plotH)-.5,center=anchorPrice+anchorRatio*nr;
     setVp(v=>({...v,autoY:false,manualCenter:center,manualRange:nr}))
   }
 };
 const handlePointerUp=(e:React.PointerEvent<HTMLCanvasElement>)=>{
   cancelTouchHold();
   if(e.type==='pointercancel'){touchCursorVisible.current=false;mouseRef.current=null;scheduleDraw()}
   pointers.current.delete(e.pointerId);
   if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
   if(!pointers.current.size)drag.current=null;
   else if(drag.current?.kind==='pinch'&&pointers.current.size===1){
     const p=[...pointers.current.values()][0],g=geometry();
     drag.current=g?{kind:'touchCursor',x:p.x,y:p.y,vp:{...vp},g,panning:true,inspecting:false}:null;
   }
 };
 const focusChart=()=>{const canvas=ref.current;if(canvas&&document.activeElement!==canvas)canvas.focus({preventScroll:true})};
 const handleWheel=(e:WheelEvent)=>{
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
     panXWheel(scroll*.55);
     return
   }

   // Alt/Option + wheel over the plot mirrors TradingView price-scale zoom without
   // requiring the pointer to be exactly over the narrow right axis.
   if(z==='plot'&&e.altKey){zoomY(factor,ay,g);return}

   // Time scale always zooms horizontally around the cursor.
   if(z==='time'){zoomX(factor,ax,g);return}

   // Main chart:
   // regular wheel -> time zoom, keeping the right edge stable;
   // Ctrl/Cmd + wheel -> focused zoom around the candle under the cursor.
   const anchor=(e.ctrlKey||e.metaKey)?ax:g.plotW;
   zoomX(factor,anchor,g);
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
     if(target.closest('input,textarea,select,[contenteditable],.floatingDrawTools,.indicatorDrawer,.timeJumpPopover,.originalSettingsBackdrop,.densityQuickPopup'))return;
     wheelHandlerRef.current(event);
   };
   host.addEventListener('wheel',onWheel,{capture:true,passive:false});
   return()=>host.removeEventListener('wheel',onWheel,true);
 },[]);
 const hitDrawing=(x:number,y:number,g:any)=>{let hit:Drawing|null=null,best=9;for(const d of drawings){const a=d.pts[0],b=d.pts[1];if(!a)continue;if((d.type==='trend'||d.type==='ruler'||d.type==='ray')&&b){const x1=g.x(a.t),y1=g.y(a.p),bx=g.x(b.t),by=g.y(b.p),x2=d.type==='ray'?g.plotW:bx,y2=d.type==='ray'?y1+(g.plotW-x1)*(by-y1)/(bx-x1||1):by,vx=x2-x1,vy=y2-y1,len2=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((x-x1)*vx+(y-y1)*vy)/len2)),px=x1+t*vx,py=y1+t*vy,dist=Math.hypot(x-px,y-py);if(dist<best){best=dist;hit=d}}else if(d.type==='level'){const dist=Math.abs(y-g.y(a.p));if(dist<best){best=dist;hit=d}}else if(d.type==='text'){const dist=Math.hypot(x-g.x(a.t),y-g.y(a.p));if(dist<best){best=dist;hit=d}}else if(d.type==='fib'&&b){const x1=g.x(a.t),x2=g.x(b.t);if(x>=Math.min(x1,x2)-6&&x<=Math.max(x1,x2)+6)for(const r of FIB_LEVELS){const dist=Math.abs(y-g.y(a.p+(b.p-a.p)*r));if(dist<best){best=dist;hit=d}}}else if(d.type==='profile'&&b){const pd=profileData(d,g);if(pd&&x>=pd.xL-5&&x<=pd.xR+8&&y>=pd.yTop-5&&y<=pd.yBottom+5){hit=d;best=0}}else if(d.type==='rect'&&b){const x1=g.x(a.t),x2=g.x(b.t),y1=g.y(a.p),y2=g.y(b.p),l=Math.min(x1,x2),r=Math.max(x1,x2),t=Math.min(y1,y2),bt=Math.max(y1,y2),dist=Math.min(Math.abs(x-l),Math.abs(x-r),Math.abs(y-t),Math.abs(y-bt));if(x>=l-6&&x<=r+6&&y>=t-6&&y<=bt+6&&dist<best){best=dist;hit=d}}}return hit};
 const handleClick=(e:React.MouseEvent<HTMLCanvasElement>)=>{if(suppressTouchClick.current){suppressTouchClick.current=false;return}const g=geometry();if(!g)return;const x=e.clientX-g.r.left,y=e.clientY-g.r.top;if(zone(x,y,g)!=='plot')return;if(tool==='erase'){const hit=hitDrawing(x,y,g);if(hit){setDrawings(a=>a.filter(d=>d.id!==hit.id));setSelectedDrawingId(null);setEditingDrawingId(null)}return}
   const selected=selectedDrawingId?drawings.find(d=>d.id===selectedDrawingId&&d.pts[1]):null;
   if(selected){
     if(selected.type==='trend'||selected.type==='ruler'||selected.type==='fib'){const action=hitLineAction(selected,g,x,y);if(action==='delete'){setDrawings(a=>a.filter(d=>d.id!==selected.id));setSelectedDrawingId(null);setEditingDrawingId(null);setDraft(null);return}if(action==='edit'){setEditingDrawingId(v=>v===selected.id?null:selected.id);return}}
     if(selected.type==='profile'){const action=hitProfileAction(selected,g,x,y);if(action==='delete'){setDrawings(a=>a.filter(d=>d.id!==selected.id));setSelectedDrawingId(null);setEditingDrawingId(null);setDraft(null);return}if(action==='edit'){setEditingDrawingId(v=>v===selected.id?null:selected.id);return}}
   }
   if(tool==='cursor'){
     let hit:Drawing|null=null,best=8;
     for(const d of drawings){
       if((d.type==='trend'||d.type==='ruler')&&d.pts[1]){const a=d.pts[0],b=d.pts[1],x1=g.x(a.t),y1=g.y(a.p),x2=g.x(b.t),y2=g.y(b.p),vx=x2-x1,vy=y2-y1,len2=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((x-x1)*vx+(y-y1)*vy)/len2)),px=x1+t*vx,py=y1+t*vy,dist=Math.hypot(x-px,y-py);if(dist<best){best=dist;hit=d}}
       else if(d.type==='fib'&&d.pts[1]){const a=d.pts[0],b=d.pts[1],x1=g.x(a.t),x2=g.x(b.t),lx=Math.min(x1,x2)-6,rx=Math.max(x1,x2)+6;if(x>=lx&&x<=rx){for(const r of FIB_LEVELS){const yy=g.y(a.p+(b.p-a.p)*r),dist=Math.abs(y-yy);if(dist<best){best=dist;hit=d}}}}
       else if(d.type==='profile'&&d.pts[1]){const pd=profileData(d,g);if(pd&&x>=pd.xL-5&&x<=pd.xR+8&&y>=pd.yTop-5&&y<=pd.yBottom+5){hit=d;best=0}}
     }
     setSelectedDrawingId(hit?.id||null);if(!hit||hit.id!==editingDrawingId)setEditingDrawingId(null);return
   }
   const p=snap(x,y,g);
   if(tool==='alert'){setAlerts(a=>[...a,{id:symbol+':'+uid(),p:p.p,kind:'level',created:Date.now()}]);return}
   if(tool==='level'||tool==='text'){setDrawings(a=>[...a,{id:symbol+':'+uid(),type:tool,pts:[p],text:tool==='text'?textLabel:''}]);return}
   if(!draft){setDraft(p);setSelectedDrawingId(null)}else{const id=symbol+':'+uid();setDrawings(a=>[...a,{id,type:tool,pts:[draft,p]}]);setDraft(null);setSelectedDrawingId(tool==='trend'||tool==='profile'||tool==='ruler'||tool==='fib'?id:null);setEditingDrawingId(null)}
 };
 const reset=()=>{terminalNavigation.current=true;setVp(terminalMode?terminalHookViewport(candles,ref.current?.getBoundingClientRect().width||800,focusFormation,rightPaddingBars):{barWidth:9,rightOffset:0,autoY:true,manualCenter:null,manualRange:null,fitAll:false})};
 const fitAllHistory=()=>{terminalNavigation.current=true;setVp(v=>({...v,rightOffset:0,autoY:true,manualCenter:null,manualRange:null,fitAll:true}))};
 const zoomButton=(factor:number)=>{terminalNavigation.current=true;const g=geometry();setVp(v=>{const base=v.fitAll?Math.max(.001,g?.step||3):Math.max(terminalMode ? .12 : 3,v.barWidth);return{...v,fitAll:false,barWidth:Math.max(.12,Math.min(34,base*factor))}})};
 const handleDoubleClick=(e:React.MouseEvent<HTMLCanvasElement>)=>{const g=geometry();if(!g)return;const x=e.clientX-g.r.left,y=e.clientY-g.r.top;if(zone(x,y,g)==='price')setVp(v=>({...v,autoY:true,manualCenter:null,manualRange:null}));else reset()};
 const handleTouchEnd=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(e.pointerType==='mouse'||drag.current?.kind==='pinch'||drag.current?.panning||drag.current?.inspecting){handlePointerUp(e);return}const now=Date.now();if(now-lastTap.current<320){const g=geometry();if(g){const x=e.clientX-g.r.left,y=e.clientY-g.r.top;if(zone(x,y,g)==='price')setVp(v=>({...v,autoY:true,manualCenter:null,manualRange:null}))}}lastTap.current=now;handlePointerUp(e)};
 useImperativeHandle(controlRef,()=>({takeScreenshot:()=>{try{return ref.current?.toDataURL('image/png')||null}catch{return null}},fitContent:fitAllHistory,zoomToLatest:reset,zoom:zoomButton}),[candles,vp]);
 const barCountdown=!hideBarCountdown?<div className="barCountdown" role="timer" aria-label="Час до закриття бару" title={`До закриття свічки ${tf}`}><b>{formatBarLeft(barLeftMs)}</b></div>:null;
 const scaleControls=(<div role="toolbar" aria-label="Керування масштабом графіка" className={'chartScaleDock '+(zoomPanelOpen?'expanded':'collapsed')}>
   {countdownContainer===undefined&&barCountdown}
   {zoomPanelOpen&&<div className="scaleTools"><button type="button" aria-label="Збільшити масштаб" title="Збільшити масштаб" onClick={()=>zoomButton(1.2)}>+</button><button type="button" aria-label="Зменшити масштаб" title="Зменшити масштаб" onClick={()=>zoomButton(1/1.2)}>−</button><button type="button" className="scaleReset" onClick={reset}>Reset</button><button type="button" className={vp.fitAll?'scaleHistory active':'scaleHistory'} title={vp.fitAll?'Вся історія: увімкнено':'Вся завантажена історія поточного таймфрейму'} aria-label="Показати всю історію" onClick={fitAllHistory}><svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 3v12M15.5 3v12M5 9h8"/><path d="M7 7 5 9l2 2M11 7l2 2-2 2"/></svg></button></div>}
   <button type="button" className="scaleDockToggle" title={zoomPanelOpen?'Згорнути масштабування':'Розгорнути масштабування'} onClick={()=>setZoomPanelOpen(v=>!v)}>{zoomPanelOpen?'›':'‹'}</button>
  </div>);
 return <div className="chartWrap" ref={box} onPointerMoveCapture={handlePointerMove} onPointerLeave={()=>{if(!pointers.current.size&&!touchCursorVisible.current){mouseRef.current=null;scheduleDraw()}}}>
  {strategyResult&&<div className="strategyHud"><div><b>{strategyResult.presetName}</b><span className={strategyResult.directionScore>0?'bull':strategyResult.directionScore<0?'bear':'neutral'}>{strategyResult.directionScore>0?'Bullish':strategyResult.directionScore<0?'Bearish':'Neutral'} {Math.abs(strategyResult.directionScore)}</span><span>Risk {strategyResult.riskScore}</span></div><small>{strategyResult.hint}</small><em>{strategyResult.context}</em></div>}
  {showLiqRiskBlock&&<div className={'liqRiskHud '+(liqHudOpen?'open':'collapsed')} style={{right:AX+8,maxWidth:`calc(100% - ${AX+18}px)`}}><button className="liqRiskToggle" title={liqHudOpen?'Сховати Liq / каскад':'Показати Liq / каскад'} aria-label={liqHudOpen?'Сховати блок ліквідацій':'Показати блок ліквідацій'} onClick={()=>setLiqHudOpen(v=>!v)}>{liqHudOpen?'▴':'▾'}</button>{liqHudOpen&&<div className="liqRiskContent" title={`Джерело: ${liquidationSource||'—'} · потік ${liquidationStreamLive?'LIVE':'OFFLINE'}\nВеликі ліквідації ≥ $${formatUsd(cascadeRisk.threshold??liquidationCut)}\n5 хв: $${formatUsd(cascadeRisk.total5)} · ${cascadeRisk.count5} великих подій\n1 хв: $${formatUsd(cascadeRisk.total1??0)} · ${cascadeRisk.count1??0} подій · прискорення ${(cascadeRisk.acceleration??0).toFixed(2)}×\nLONG: $${formatUsd(cascadeRisk.longUsd)} · SHORT: $${formatUsd(cascadeRisk.shortUsd)}\nОстання подія: ${liquidationLastEventAt?new Date(liquidationLastEventAt).toLocaleTimeString(language):'—'}`}><b>Liq 5m: {liquidationStreamLive?`$${formatUsd(cascadeRisk.total5)}`:'—'}</b><span>Каскад: {liquidationStreamLive?(cascadeRisk.total5>0?<><strong className={'risk-'+cascadeRisk.level.toLowerCase()}>{cascadeRiskLabel(cascadeRisk.level)}</strong><em>{cascadeRisk.score}</em></>:<strong className="risk-low">Немає</strong>):<strong className="risk-low">OFF</strong>}</span><small>{liquidationSource||'—'} · ≥ ${formatUsd(cascadeRisk.threshold??liquidationCut)} · 1m ${formatUsd(cascadeRisk.total1??0)} · L ${formatUsd(cascadeRisk.longUsd)} · S ${formatUsd(cascadeRisk.shortUsd)}</small></div>}</div>}
  {!hideTimeJump&&<div className="timeJumpDock">
   <button className={jumpOpen?'timeJumpButton active':'timeJumpButton'} title="Перейти до дати або часу" aria-label="Перейти до дати або часу" onClick={()=>{setJumpOpen(v=>!v);setJumpMessage('')}}><CalendarDays size={15}/></button>
   {jumpOpen&&<div className="timeJumpPopover">
    <div className="jumpQuick"><button onClick={()=>quickJump(0)}>Сьогодні</button><button onClick={()=>quickJump(1)}>Вчора</button><button onClick={()=>quickJump(2)}>−2 дні</button><button onClick={()=>quickJump(3)}>−3 дні</button><button onClick={()=>quickJump(7)}>−7 днів</button></div>
    <div className="jumpMode"><button className={jumpMode==='day'?'sel':''} onClick={()=>setJumpMode('day')}>Цілий день</button><button className={jumpMode==='time'?'sel':''} onClick={()=>setJumpMode('time')}>Конкретний час</button></div>
    <label className="jumpField"><span>Дата</span><input type="date" value={jumpDate} onChange={e=>setJumpDate(e.target.value)}/></label>
    {jumpMode==='time'&&<><label className="jumpField"><span>Час</span><input type="time" step="60" value={jumpTime} onChange={e=>setJumpTime(e.target.value)}/></label><div className="jumpHours">{['00:00','06:00','12:00','18:00'].map(h=><button key={h} onClick={()=>setJumpTime(h)}>{h}</button>)}</div></>}
    <button className="jumpGo" disabled={jumpBusy||!jumpDate} onClick={()=>void requestJump(jumpDate)}>{jumpBusy?'Завантаження…':'Перейти'}</button>
    {jumpMessage&&<small className="jumpMessage">{jumpMessage}</small>}
    <small className="jumpZone">{timezone} · TF {tf}</small>
   </div>}
  </div>}
  {controlsContainer?createPortal(scaleControls,controlsContainer):controlsContainer===undefined?scaleControls:null}
  {countdownContainer&&createPortal(barCountdown,countdownContainer)}
  <canvas ref={ref} style={{WebkitTouchCallout:'none'}} tabIndex={0} aria-label={`Графік ${symbol}`} aria-description="Рух пальцем — перетягнути графік. Утримуйте палець, потім рухайте — перемістити курсор. Два пальці — масштаб." onMouseEnter={focusChart} onPointerEnter={focusChart} onClick={handleClick} onPointerDown={handlePointerDown} onPointerUp={handleTouchEnd} onPointerCancel={handlePointerUp} onDoubleClick={handleDoubleClick} onContextMenu={e=>{e.preventDefault();if(touchCursorVisible.current||touchHoldTimer.current!==null)return;setDraft(null);setSelectedDrawingId(null);setEditingDrawingId(null)}}/>
 </div>
}
