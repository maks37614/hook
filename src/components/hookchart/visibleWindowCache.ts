/**
 * Reuse visible OHLC windows and their extrema across sub-candle pointer moves.
 * The cache never changes, rounds or downsamples source market data.
 *
 * Two slots cover the normal visible range and the 80-candle scale fallback
 * when the user pans into empty future space. A new source array immediately
 * discards all old rows (including rows from the previous symbol).
 */
export function createChartVisibleWindowCache<T extends {l:number;h:number}>() {
  type Window={from:number;to:number;rows:T[];low:number;high:number};
  let source:readonly T[]|null=null;
  const windows:Window[]=[];
  return {
    get(candles:readonly T[],from:number,to:number):{rows:T[];low:number;high:number}{
      if(source!==candles){
        source=candles;
        windows.length=0;
      }
      const index=windows.findIndex(row=>row.from===from&&row.to===to);
      if(index>=0){
        const hit=windows[index];
        if(index>0){windows.splice(index,1);windows.unshift(hit)}
        return hit;
      }
      const rows=to>from?candles.slice(from,to):[];
      let low=Infinity,high=-Infinity;
      for(const candle of rows){
        if(candle.l<low)low=candle.l;
        if(candle.h>high)high=candle.h;
      }
      const entry={from,to,rows,low,high};
      windows.unshift(entry);
      if(windows.length>2)windows.pop();
      return entry;
    },
  };
}
