/**
 * Pan/zoom hot-path precomputations.
 *
 * Market inputs change independently of the viewport. Derive stable ordering
 * when data/last price changes, not again for every full Canvas frame.
 * Helpers do not modify the underlying depth or level arrays.
 */
export type ChartDepthPrice = { p:number; active:boolean };

export function closestActiveDensityPrices(
  densities:readonly ChartDepthPrice[],
  currentPrice:number,
):number[] {
  // Preserve the original 3% gate and stable order for equal distances.
  const limit=Math.max(currentPrice,1e-12)*.03;
  const nearest:{price:number;distance:number}[]=[];
  for(let i=0;i<densities.length;i++){
    const d=densities[i];if(!d.active)continue;
    const distance=Math.abs(d.p-currentPrice);if(distance>limit)continue;
    let at=nearest.findIndex(v=>v.distance>distance);
    if(at<0)at=nearest.length;
    if(at>=4)continue;
    nearest.splice(at,0,{price:d.p,distance});
    if(nearest.length>4)nearest.pop();
  }
  return nearest.map(level=>level.price);
}

export type ChartRankableLevel = {
  p:number;
  strength:number;
  tf:string;
  broken?:boolean;
};

export function rankAutoLevelsForPrice<T extends ChartRankableLevel>(
  levels:readonly T[],
  currentPrice:number,
):T[] {
  const tfPriority=(tf:string)=>tf==='1d'?3:tf==='4h'?2:tf==='1h'?1:tf==='30m'?.85:tf==='15m'?.7:.5;
  const quality=(level:T)=>level.strength*.72+tfPriority(level.tf)*6
    +(level.broken?-18:0)
    +Math.max(0,12-Math.abs(level.p-currentPrice)/Math.max(currentPrice,1e-12)*220);
  // Array#sort is stable (ES2019). Filter to the visible price range *after*
  // ranking: filtering a sorted list retains the same result as sorting the
  // filtered subset, including equal-score source order.
  return [...levels].sort((a,b)=>quality(b)-quality(a));
}
