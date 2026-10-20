import { useCallback, useEffect, useState } from 'react';
import type { ScannedCoin, DetectedFormation, ArchivedFormation, Timeframe } from '../types';

export interface ChartPageData {
  coin: ScannedCoin;
  formation?: DetectedFormation;
  archivedItem?: ArchivedFormation | null;
  timeframe: Timeframe;
  returnHash?: string;
}
export function chartPageHash(data: ChartPageData): string {
  return '#chart?' + new URLSearchParams({
    symbol: data.coin.symbol, exchange: data.coin.exchange,
    market: data.coin.marketType, timeframe: data.timeframe,
  }).toString();
}
export function useChartPageRoute(uid?: string) {
  const read = useCallback(() => {
    if (typeof window === 'undefined' || !window.location.hash.startsWith('#chart?'))
      return { active: false, data: null as ChartPageData | null };
    const hash = window.location.hash;
    try {
      const data = JSON.parse(sessionStorage.getItem('chart-page:' + (uid || 'guest') + ':' + hash) || 'null');
      return { active: true, data: data && chartPageHash(data) === hash ? data as ChartPageData : null };
    } catch { return { active: true, data: null as ChartPageData | null }; }
  }, [uid]);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const sync = () => setRoute(read());
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [read]);
  const open = useCallback((value: ChartPageData) => {
    const data = { ...value, returnHash: window.location.hash || '#screener' };
    const hash = chartPageHash(data);
    try { sessionStorage.setItem('chart-page:' + (uid || 'guest') + ':' + hash, JSON.stringify(data)); } catch {}
    window.history.pushState({ ...window.history.state, signalhookChartPage: true }, '', hash);
    setRoute({ active: true, data });
    window.scrollTo(0, 0);
  }, [uid]);
  const close = useCallback(() => {
    if (window.history.state?.signalhookChartPage) window.history.back();
    else window.location.hash = route.data?.returnHash || '#screener';
  }, [route.data]);
  return { ...route, open, close };
}
