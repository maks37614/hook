/**
 * Reuse the same visible candle slice and its OHLC extrema while only the
 * sub-candle pixel offset changes. This never changes, rounds or down-samples
 * source candles; it is invalidated by any new immutable candle array or by
 * an actual change in visible candle indices.
 */
export function createChartVisibleWindowCache<T extends {l:number;h:number}>() {
  let source:readonly T[]|null=null, start=-1, end=-1;
  let cached:{rows:T[];low:number;high:number}={rows:[],low:Infinity,high:-Infinity};
  return {
    get(candles:readonly T[],from:number,to:number):{rows:T[];low:number;high:number}{
      if(source===candles&&start===from&&end===to)return cached;
      source=candles;start=from;end=to;
      const rows=to>from?candles.slice(from,to):[];
      let low=Infinity,high=-Infinity;
      for(const candle of rows){
        if(candle.l<low)low=candle.l;
        if(candle.h>high)high=candle.h;
      }
      cached={rows,low,high};
      return cached;
    },
  };
}
