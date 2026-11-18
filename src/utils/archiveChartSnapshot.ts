import type { ArchivedChartSnapshot, ArchivedDensityScene, ArchivedFormation, ChartMarkerInfo, Timeframe } from '../types';
import { archiveVisibleOverlayKeys, sanitizeArchivedOverlayScene } from './archivedOverlayScene';

export const ARCHIVE_IMAGE_LIMIT = 130_000;
const TOOL_TYPES = new Set(['level','trend','ray','rect','fib','profile','text','ruler']);
const OVERLAY_KEYS = new Set<ArchivedChartSnapshot['overlays'][number]>([
  'sr','prevDay','dayOpen','vwap','localHL','roundLevels','poc','channel','stops',
]);

/** Small subset of the already-filtered HookChart DOM levels.
 * Called ONLY by an explicit archive click with the chart's real Y viewport.
 * No API call, subscription, timer, or background state is created. */
export type ArchiveDensitySource = {
  id:string;
  side:'BID'|'ASK';
  p:number;
  usd:number;
  first:number;
  last:number;
  active:boolean;
  touches:number;
  reactionTier?:'strong'|'potential';
  reactionScore?:number;
};

export function visibleArchivedDensityScene(
  densities: readonly ArchiveDensitySource[],
  visibility: {lines:boolean;labels:boolean;amounts:boolean},
  range: {low:number;high:number} | null,
): ArchivedDensityScene | undefined {
  if ((!visibility.lines && !visibility.labels) || !range ||
      !Number.isFinite(range.low) || !Number.isFinite(range.high) ||
      range.high < range.low) return undefined;
  const markers: ArchivedDensityScene['markers'] = [];
  for (const density of densities) {
    if (!Number.isFinite(density.p) || density.p <= 0 ||
        density.p < range.low || density.p > range.high ||
        !Number.isFinite(density.usd) || density.usd < 0 ||
        !Number.isFinite(density.first) || !Number.isFinite(density.last) ||
        density.side !== 'BID' && density.side !== 'ASK') continue;
    markers.push({
      id: String(density.id).slice(0,100), side:density.side, price:density.p,
      usd:density.usd, firstSeenAt:density.first,lastSeenAt:density.last,
      active:!!density.active,
      touches:Number.isFinite(density.touches) ? Math.max(0,Math.floor(density.touches)) : 0,
      ...(density.reactionTier === 'strong' || density.reactionTier === 'potential'
        ? {reactionTier:density.reactionTier} : {}),
      ...(Number.isFinite(density.reactionScore)
        ? {reactionScore:density.reactionScore} : {}),
    });
  }
  return { lines:!!visibility.lines, labels:!!visibility.labels,
    amounts:!!visibility.labels && !!visibility.amounts, markers };
}

export type ArchiveChartCapture = {
  chartSnapshot?: ArchivedChartSnapshot;
  /** Price from this exact chart's visible live candle at capture time. */
  capturedPrice?: number;
  /** These are the markers actually visible on the chart, even when empty. */
  markers: ChartMarkerInfo[];
};

/** Construct only when the user presses Save. No market subscription, timer,
 * history fetch, background write or image work runs in steady-state charts. */
export function buildArchivedChartSnapshot(input: ArchivedChartSnapshot): ArchivedChartSnapshot {
  const validPoint = (p: { t:number; p:number }) =>
    !!p && Number.isFinite(p.t) && Number.isFinite(p.p) && p.p > 0;
  // Never silently drop the user's oldest annotations. The existing 250KB
  // archive payload limit rejects oversized records instead of corrupting them.
  const drawings = (input.drawings || [])
    .filter(d => TOOL_TYPES.has(d.type) && typeof d.id === 'string' &&
      d.pts?.length > 0 && d.pts.length <= 4 && d.pts.every(validPoint))
    .map(d => ({ id: d.id.slice(0,128), type:d.type,
      pts:d.pts.map(point => ({ t:point.t, p:point.p })),
      ...(d.type === 'text' && d.text ? {text:d.text.slice(0,200)} : {}),
    }));
  // Preserve all valid drawn scalper lines. The archive size guard rejects an
  // oversized save instead of silently discarding the newest/oldest markings.
  const scalperLines = input.scalperEnabled
    ? (input.scalperLines || [])
      .filter(line => ['upper','lower','neckline'].includes(line.role)
        && validPoint(line.from) && validPoint(line.to))
      .map(line => ({ from:{...line.from},to:{...line.to},role:line.role }))
    : [];
  // Never resurrect hidden density markers. The level prices and sizes below
  // are observations saved with the image, not a request to reopen the order book.
  const density: ArchivedDensityScene | undefined =
    input.density && (input.density.lines || input.density.labels)
      ? {
          lines:!!input.density.lines, labels:!!input.density.labels,
          amounts:!!input.density.labels && !!input.density.amounts,
          markers:(input.density.markers || [])
            .filter(level => level && typeof level.id === 'string' &&
              ['BID','ASK'].includes(level.side) &&
              Number.isFinite(level.price) && level.price > 0 &&
              Number.isFinite(level.usd) && level.usd >= 0 &&
              Number.isFinite(level.firstSeenAt) && Number.isFinite(level.lastSeenAt))
            .map(level => ({
              id:level.id.slice(0,100), side:level.side,price:level.price,usd:level.usd,
              firstSeenAt:level.firstSeenAt,lastSeenAt:level.lastSeenAt,
              active:!!level.active,touches:Number.isFinite(level.touches)
                ? Math.max(0,Math.floor(level.touches)):0,
              ...(level.reactionTier === 'strong' || level.reactionTier === 'potential'
                ? {reactionTier:level.reactionTier} : {}),
              ...(Number.isFinite(level.reactionScore)
                ? {reactionScore:level.reactionScore} : {}),
            })),
        }
      : undefined;
  const enabledOverlayKeys = [...new Set((input.overlays || []).filter(key => OVERLAY_KEYS.has(key)))].slice(0,9);
  const safeScene = input.overlayScene === undefined ? undefined : sanitizeArchivedOverlayScene(input.overlayScene);
  // Both conditions matter: the user enabled the tool AND it rendered geometry.
  // Never revive a scene key for a disabled tool, including on imported records.
  const visibleSceneKeys = new Set(archiveVisibleOverlayKeys(safeScene));
  const overlayKeys = safeScene === undefined
    ? enabledOverlayKeys // Older snapshots still load without new geometry.
    : enabledOverlayKeys.filter(key => visibleSceneKeys.has(key));
  const overlayScene = safeScene && overlayKeys.length
    ? Object.fromEntries(overlayKeys.map(key => [key, safeScene[key]])) as ArchivedChartSnapshot['overlayScene']
    : undefined;
  const image = input.image?.startsWith('data:image/jpeg;base64,') &&
    input.image.length <= ARCHIVE_IMAGE_LIMIT &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.image) ? input.image : undefined;
  return {
    version:1,
    capturedAt: Number.isFinite(input.capturedAt) ? input.capturedAt : Date.now(),
    marketKey:input.marketKey.slice(0,125),
    timeframe:input.timeframe,
    ...(image ? {image} : {}),
    drawings,
    overlays: overlayKeys,
    ...(overlayScene && Object.keys(overlayScene).length ? { overlayScene } : {}),
    ...(input.srMarkersVisible ? { srMarkersVisible:true } : {}),
    scalperEnabled:!!input.scalperEnabled,
    scalperRegression:!!input.scalperEnabled && !!input.scalperRegression,
    scalperLabels:!!input.scalperEnabled && !!input.scalperLabels,
    scalperLines,
    liquidationMap:{ enabled:!!input.liquidationMap?.enabled,
      period: input.liquidationMap?.period === '7d' ? '7d' : '24h' },
    // A display toggle without any actual visible order-book level is not a
    // historical observation and does not belong to a saved formation.
    ...(density?.markers.length ? {density} : {}),
    tradeLevels:{ entry:!!input.tradeLevels?.entry, target:!!input.tradeLevels?.target, stop:!!input.tradeLevels?.stop },
  };
}

/** Keep the in-memory/localStorage archive list as lean as its PG projection.
 * The complete coordinates remain in PostgreSQL and are fetched by ID only
 * when the user opens a chart or explicitly exports the archive. */
export function archiveWithoutVisualImage(item: ArchivedFormation): ArchivedFormation {
  if (!item.chartSnapshot) return item;
  const {
    image: _image, drawings: _drawings, scalperLines: _scalperLines,
    density: _density, overlayScene: _overlayScene, ...summary
  } = item.chartSnapshot;
  // This is intentionally a summary; consumers must fetch the owner-scoped
  // full record before accessing the detailed snapshot geometry.
  return {...item,chartSnapshot:summary as ArchivedChartSnapshot};
}

export function archiveVisualMarketKey(
  exchange:string,market:string,symbol:string,timeframe:Timeframe|string,
):string { return [exchange,market,symbol.replace('/','').toUpperCase(),timeframe].join(':'); }

/** Never hide or recreate Entry/TP/SL: archived rows match visible chart state. */
export function visibleArchivedMarkers(markers: ChartMarkerInfo[],
  visible:{entry:boolean;target:boolean;stop:boolean}):ChartMarkerInfo[] {
  return markers.filter(marker => marker.type === 'entry' ? visible.entry
    : marker.type === 'target' ? visible.target
    : marker.type === 'stop_loss' ? visible.stop : true);
}
