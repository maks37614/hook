import type { ArchivedFormation, DetectedFormation, ExchangeId, MarketType, ScannedCoin, Timeframe } from '../types';
import type { EarlyFormationCandidate } from './earlyFormations';

/** Dedicated in-app page: hash routing works with the current SPA deployment. */
export type ChartPageKind = 'coin' | 'archive' | 'early';
/** Which page opened the chart; independent of whether the coin has a formation. */
export type ChartPageOrigin = 'screener' | 'formations';
export interface ChartPageRoute {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  timeframe: Timeframe;
  kind: ChartPageKind;
  origin?: ChartPageOrigin;
  formationId?: string;
  /** Distinguishes multiple saves of the same formation/coin. */
  archiveId?: string;
}
export interface ChartPageSnapshot {
  coin: ScannedCoin;
  formation?: DetectedFormation | null;
  archived?: ArchivedFormation | null;
  earlyCandidate?: EarlyFormationCandidate | null;
}

const TIMEFRAMES = new Set(['1m','5m','15m','1h','4h','1d']);
const CHART_PREFIX = '#/chart/';
const SNAPSHOT_PREFIX = 'h00k:chart-page:snapshot:v1:';
const RETURN_PREFIX = 'h00k:chart-page:return:v1:';

export function chartPageHash(route: ChartPageRoute): string {
  const params = new URLSearchParams();
  if (route.kind !== 'coin') params.set('kind',route.kind);
  if (route.formationId) params.set('formation',route.formationId);
  if (route.kind === 'archive' && route.archiveId) params.set('record',route.archiveId);
  if (route.origin) params.set('origin',route.origin);
  return CHART_PREFIX + [
    route.exchange,route.marketType,encodeURIComponent(route.symbol.toUpperCase()),route.timeframe,
  ].join('/') + (params.size ? '?' + params.toString() : '');
}
export function readChartPageHash(hash: string): ChartPageRoute | null {
  if (!hash.startsWith(CHART_PREFIX)) return null;
  const [path, query = ''] = hash.slice(CHART_PREFIX.length).split('?', 2);
  const parts = path.split('/');
  if (parts.length !== 4) return null;
  const [exchange, marketType, encodedSymbol, timeframe] = parts;
  let symbol: string;
  try { symbol = decodeURIComponent(encodedSymbol).toUpperCase(); }
  catch { return null; }
  if ((exchange !== 'binance' && exchange !== 'bybit') ||
      (marketType !== 'futures' && marketType !== 'spot') ||
      !/^[A-Z0-9]{2,30}$/.test(symbol) || !TIMEFRAMES.has(timeframe)) return null;
  const params = new URLSearchParams(query);
  const kindParam = params.get('kind');
  const kind: ChartPageKind = kindParam === 'archive' || kindParam === 'early' ? kindParam : 'coin';
  const formationId = params.get('formation')?.slice(0,200) || undefined;
  const recordId = params.get('record');
  // A malformed record must not silently open an unrelated sibling archive.
  if (kind === 'archive' && recordId !== null && !/^[A-Za-z0-9_-]{1,140}$/.test(recordId)) return null;
  const archiveId = kind === 'archive' ? (recordId || undefined) : undefined;
  const originParam = params.get('origin');
  const origin: ChartPageOrigin | undefined = originParam === 'screener' || originParam === 'formations'
    ? originParam : undefined;
  return {
    exchange, marketType, symbol, timeframe: timeframe as Timeframe, kind,
    ...(formationId ? { formationId } : {}),
    ...(archiveId ? { archiveId } : {}),
    ...(origin ? { origin } : {}),
  };
}

export function sameChartPageRoute(a: ChartPageRoute | null, b: ChartPageRoute | null): boolean {
  return a?.exchange === b?.exchange && a?.marketType === b?.marketType &&
    a?.symbol === b?.symbol && a?.timeframe === b?.timeframe &&
    a?.kind === b?.kind && a?.formationId === b?.formationId && a?.archiveId === b?.archiveId &&
    chartPageVisualOrigin(a) === chartPageVisualOrigin(b);
}
/** Legacy chart URLs remain valid: plain coin links are Screener charts.
 * Early detection and archives continue to use Formation profiles by default. */
export function chartPageVisualOrigin(route: ChartPageRoute | null): ChartPageOrigin {
  if (route?.origin) return route.origin;
  return route?.kind === 'archive' || route?.kind === 'early' ? 'formations' : 'screener';
}

/** Page origin, not formation existence, controls the visible and full-screen scales. */
export function chartPageVisualContext(route: ChartPageRoute | null, expanded: boolean): 'screenerQuick' | 'screenerFull' | 'formationsQuick' | 'formationsFull' {
  const origin = chartPageVisualOrigin(route);
  if (origin === 'screener') return expanded ? 'screenerFull' : 'screenerQuick';
  return expanded ? 'formationsFull' : 'formationsQuick';
}

export function chartPageSnapshotKey(route: ChartPageRoute, uid: string): string {
  return SNAPSHOT_PREFIX + uid + ':' + chartPageHash(route);
}
export function saveChartPageSnapshot(storage: Pick<Storage,'setItem'> | null | undefined,
  uid: string, route: ChartPageRoute, snapshot: ChartPageSnapshot): void {
  try { storage?.setItem(chartPageSnapshotKey(route, uid), JSON.stringify(snapshot)); }
  catch { /* Limited session storage must not prevent opening a chart. */ }
}
export function readChartPageSnapshot(storage: Pick<Storage,'getItem'> | null | undefined,
  uid: string, route: ChartPageRoute): ChartPageSnapshot | null {
  try {
    const raw = storage?.getItem(chartPageSnapshotKey(route,uid));
    if (!raw || raw.length > 750_000) return null;
    const parsed: ChartPageSnapshot = JSON.parse(raw);
    if (!parsed?.coin || parsed.coin.exchange !== route.exchange ||
        parsed.coin.marketType !== route.marketType ||
        parsed.coin.symbol?.toUpperCase() !== route.symbol) return null;
    if (route.kind === 'early' && (!parsed.earlyCandidate ||
        parsed.earlyCandidate.id !== route.formationId)) return null;
    if (route.kind === 'archive' && (!parsed.archived ||
        (route.archiveId && parsed.archived.id !== route.archiveId) ||
        (route.formationId && parsed.archived.formation.id !== route.formationId))) return null;
    if (route.kind === 'coin' && route.formationId &&
        parsed.formation?.id !== route.formationId) return null;
    return parsed;
  } catch { return null; }
}
export function chartReturnHashKey(uid: string): string { return RETURN_PREFIX + uid; }
export function safeReturnHash(hash: string | null | undefined): string {
  if (hash && /^#(screener|patterns|terminal|surveillance|replay)$/.test(hash)) return hash;
  return '#screener';
}
export function saveChartReturnHash(storage: Pick<Storage,'setItem'> | null | undefined,
  uid: string, hash: string): void {
  try { storage?.setItem(chartReturnHashKey(uid), safeReturnHash(hash)); } catch {}
}
export function readChartReturnHash(storage: Pick<Storage,'getItem'> | null | undefined,
  uid: string): string {
  try { return safeReturnHash(storage?.getItem(chartReturnHashKey(uid))); }
  catch { return '#screener'; }
}
