import type { ChartMarkerInfo, DetectedFormation, HookChartPreferences, Kline, ReplayPendingOrder, ReplayPosition, Timeframe, UserProfile } from '../types';

/** Shared candle, indicator and time-axis geometry. Negative offsets expose future space. */
export function hookChartHorizontalRange(
  candleCount: number,
  plotWidth: number,
  viewport: { barWidth: number; rightOffset: number; fitAll?: boolean },
  rightPaddingBars = 0,
  rightPaddingPixels = 0,
) {
  const paddingBars = Number.isFinite(rightPaddingBars) ? Math.max(0, rightPaddingBars) : 0;
  const paddingPixels = Number.isFinite(rightPaddingPixels) ? Math.max(0, rightPaddingPixels) : 0;
  if (viewport.fitAll) {
    // In "show all" mode, fit the candles *centrally*, not against the left
    // boundary. A saved right gap of 40–80 bars must not shrink the few
    // candles of a newly listed asset into a narrow strip.
    const marginBars = Math.max(1, Math.min(paddingBars, Math.max(1, candleCount * 0.08)));
    const usableWidth = Math.max(1, plotWidth - paddingPixels);
    const step = Math.max(.001, usableWidth / Math.max(1, candleCount + 2 * marginBars));
    const virtualStart = -marginBars - viewport.rightOffset;
    return { step, virtualStart, virtualEnd: virtualStart + plotWidth / step };
  }
  const step = Math.max(.12, viewport.barWidth);
  const virtualEnd = candleCount - viewport.rightOffset + paddingBars + paddingPixels / step;
  return { step, virtualEnd, virtualStart: virtualEnd - plotWidth / step };
}

/** Use the displayed spacing when leaving Fit All or a compact chart profile. */
export function resizeHookChartViewport(
  candleCount: number,
  plotWidth: number,
  view: { barWidth: number; rightOffset: number; fitAll?: boolean },
  factor: number,
  anchorX: number,
  rightPaddingBars = 0,
  rightPaddingPixels = 0,
) {
  const before = hookChartHorizontalRange(candleCount, plotWidth, view, rightPaddingBars, rightPaddingPixels);
  const barWidth = Math.max(.12, Math.min(34, before.step * factor));
  const after = hookChartHorizontalRange(candleCount, plotWidth, { barWidth, rightOffset: 0 },
    rightPaddingBars, rightPaddingPixels);
  const anchorIndex = before.virtualStart + anchorX / before.step;
  const rightOffset = after.virtualStart + anchorX / after.step - anchorIndex;
  return { barWidth, rightOffset, fitAll: false as const };
}

export function validCandle(candle: Kline | null | undefined): candle is Kline {
  return !!candle && [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
    && candle.time > 0 && candle.low > 0 && candle.volume >= 0
    && candle.high >= Math.max(candle.open, candle.close, candle.low)
    && candle.low <= Math.min(candle.open, candle.close);
}

/** Canonical site candles use seconds; hookchart uses milliseconds. Last duplicate wins. */
export function toHookCandles(klines: Kline[]) {
  // Live kline updates only replace the last bar, and historical pages are
  // normally sorted. Avoid building a Map and sorting thousands of candles
  // on every 80ms price update. Preserve last-duplicate-wins semantics.
  const ordered: Kline[] = [];
  let lastTime = -Infinity;
  let needsSorting = false;
  for (const candle of klines) {
    if (!validCandle(candle)) continue;
    if (candle.time < lastTime) { needsSorting = true; break; }
    if (candle.time === lastTime) ordered[ordered.length - 1] = candle;
    else { ordered.push(candle); lastTime = candle.time; }
  }
  const rows = needsSorting ? (() => {
    const byTime = new Map<number, Kline>();
    for (const candle of klines) if (validCandle(candle)) byTime.set(candle.time, candle);
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  })() : ordered;
  return rows.map(k => ({
    t: k.time * 1000, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume, n: k.tradeCount || 0,
    ...(Number.isFinite(k.buyVolume) ? { tb: Math.min(k.volume, Math.max(0, k.buyVolume!)) } : {}),
  }));

}

/** Cumulative candle volume cannot run backwards during a feed handover. */
export function isOlderLiveCandle(candle: Kline, previous: Kline): boolean {
  return candle.time < previous.time ||
    (candle.time === previous.time && candle.volume < previous.volume);
}

export function sameKlineValues(a: Kline, b: Kline): boolean {
  return a.time === b.time && a.open === b.open && a.high === b.high &&
    a.low === b.low && a.close === b.close && a.volume === b.volume &&
    a.tradeCount === b.tradeCount && a.buyVolume === b.buyVolume &&
    a.buyQuoteVolume === b.buyQuoteVolume && a.quoteVolume === b.quoteVolume;
}

/** Ignore stale and duplicate stream ticks without invalidating chart caches. */
export function mergeLiveCandle(candles: Kline[], tick: Kline, limit = 40_000): Kline[] {
  const previous = candles.at(-1);
  if (!validCandle(tick) || (previous && isOlderLiveCandle(tick, previous))) return candles;
  if (previous && tick.time === previous.time) {
    if (sameKlineValues(previous, tick)) return candles;
    return [...candles.slice(0, -1), tick];
  }
  return candles.length < limit ? [...candles, tick] : [...candles, tick].slice(-limit);
}

/** Overlay the live tail on a snapshot whose final bar might still be forming. */
export function mergeLiveChartHistory(history: Kline[], displayed: Kline[]): Kline[] {
  const last = history.at(-1);
  if (!last) return displayed;
  if (history === displayed) return history;

  let start = displayed.length;
  while (start > 0 && displayed[start - 1].time > last.time) start--;
  const overlap = displayed[start - 1];
  if (overlap?.time === last.time && overlap.volume >= last.volume &&
      !sameKlineValues(last, overlap)) {
    return [...history.slice(0, -1), ...displayed.slice(start - 1)];
  }
  return start === displayed.length ? history : [...history, ...displayed.slice(start)];
}

/** A later trade can update the close and wicks, while cumulative fields come from Kline. */
export function withNewerTradePrice(candle: Kline, current: Kline): Kline {
  return {
    ...candle,
    close: current.close,
    high: Math.max(candle.high, current.high),
    low: Math.min(candle.low, current.low),
  };
}

export function restoredHookViewport(candleCount: number, plotWidth: number, range?: { from: number; to: number }) {
  if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to) || range.to <= range.from) return null;
  return { barWidth: Math.max(.12, Math.min(34, plotWidth / (range.to - range.from))), rightOffset: candleCount - range.to,
    autoY: true, manualCenter: null, manualRange: null, fitAll: false };
}

export function formationChartMarkers(formation?: DetectedFormation | null, visible = { entry: true, target: true, stop: true }, timeframe?: Timeframe): ChartMarkerInfo[] {
  if (!formation) return [];
  const l = formation.levels;
  const rows: ChartMarkerInfo[] = [
    ...(visible.entry && formation.tpSlBuilder?.touches?.ready !== false ? [{ id: 'entry', type: 'entry' as const, price: l.entryPrice, label: 'Вхід', color: '#3b82f6' }] : []),
    ...(visible.target ? [{ id: 'target', type: 'target' as const, price: l.targetPrice, label: 'TP', color: '#10b981' }] : []),
    ...(visible.stop ? [{ id: 'stop', type: 'stop_loss' as const, price: l.stopLossPrice, label: 'SL', color: '#ef4444' }] : []),
  ];
  // W/M neckline commonly equals Entry. Always retain both semantic markers:
  // the renderer resolves coincident pixels, while TP/SL/archive keep their data.
  if (Number.isFinite(l.necklinePrice) && (l.necklinePrice ?? 0) > 0) {
    rows.push({ id: 'neckline', type: 'neckline', price: l.necklinePrice!, label: 'Шия',
      color: '#f59e0b', lineStyle: 'dotted', ...(timeframe ? { timeframe } : {}) });
  }
  for (const [type, price, label, color] of [
    ['resistance', l.resistancePrice, 'Опір', '#a855f7'],
    ['support', l.supportPrice, 'Підтримка', '#a855f7'],
  ] as const) if (price && !rows.some(row => row.price === price)) rows.push({ id: type, type, price, label, color, lineStyle: 'dotted', ...(timeframe ? { timeframe } : {}) });
  return rows.filter(row => Number.isFinite(row.price) && row.price > 0);
}

/** Older archives may have omitted a neck that coincided with Entry.
 * Recover its marker from the already detected formation, with no new scan.
 * Only affects the interactive live chart, never the immutable archive image.
 */
export function withCalculatedNecklineMarker(
  formation: DetectedFormation | null | undefined,
  markers: ChartMarkerInfo[],
  timeframe?: Timeframe,
): ChartMarkerInfo[] {
  const price = formation?.levels?.necklinePrice;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0
    || markers.some(marker => marker.type === 'neckline'
      && Number.isFinite(marker.price) && marker.price > 0)) return markers;
  return [...markers, { id: 'neckline', type: 'neckline', price,
    label: 'Шия', color: '#f59e0b', lineStyle: 'dotted',
    ...(timeframe ? { timeframe } : {}) }];
}

/** Only algorithm-verified W/M structures enable the neckline by default. */
export function defaultFormationNecklineVisible(formation?: DetectedFormation | null): boolean {
  const neckline = formation?.levels?.necklinePrice;
  return (formation?.patternKey === 'double_top' || formation?.patternKey === 'double_bottom')
    && typeof neckline === 'number' && Number.isFinite(neckline) && neckline > 0;
}

/** An archived/custom neckline can still be enabled manually on any chart. */
export function hasFormationNeckline(markers: readonly ChartMarkerInfo[]): boolean {
  return markers.some(marker => marker.type === 'neckline'
    && Number.isFinite(marker.price) && marker.price > 0);
}

/** Visibility only; never deletes a calculated price or alters a signal. */
export function filterFormationNeckline(
  markers: ChartMarkerInfo[], visible: boolean,
): ChartMarkerInfo[] {
  return visible ? markers : markers.filter(marker => marker.type !== 'neckline');
}

/** Render one line at the neck when Entry/TP/SL shares the same price.
 * Original markers stay untouched for snapshot and trade-level semantics.
 * A hidden neckline leaves the normal Entry/TP/SL lines available.
 */
export function coalesceNecklinePriceMarkers(markers: ChartMarkerInfo[]): ChartMarkerInfo[] {
  const levels = new Set(markers
    .filter(marker => marker.type === 'neckline' && Number.isFinite(marker.price) && marker.price > 0)
    .map(marker => marker.price));
  if (!levels.size) return markers;
  return markers.filter(marker => marker.type === 'neckline'
    || !levels.has(marker.price)
    || !['entry', 'target', 'stop_loss', 'support', 'resistance'].includes(marker.type));
}

/** Terminal HookChart has its own, initially disabled TP / Entry / SL switch.
 * Other formation and custom markers must remain visible independently. */
export function terminalChartMarkers(
  formation: DetectedFormation | null | undefined,
  showTradeLevels: boolean,
  timeframe?: Timeframe,
  customMarkers?: ChartMarkerInfo[],
  showNeckline = defaultFormationNecklineVisible(formation),
): ChartMarkerInfo[] {
  const markers = customMarkers?.length
    ? customMarkers
    : formationChartMarkers(formation, {
      entry: showTradeLevels,
      target: showTradeLevels,
      stop: showTradeLevels,
    }, timeframe);
  const tradeFiltered = showTradeLevels ? markers : markers.filter(marker =>
    marker.type !== 'entry' && marker.type !== 'target' && marker.type !== 'stop_loss');
  return filterFormationNeckline(tradeFiltered, showNeckline);
}

/** TP/SL is actionable only if all three real level prices are available.
 * Custom archive markers override formation markers in the renderer. */
export function hasCompleteTradeLevelSet(
  formation?: DetectedFormation | null,
  customMarkers?: ChartMarkerInfo[],
): boolean {
  const positive = (price: number) => Number.isFinite(price) && price > 0;
  if (customMarkers?.length) {
    return (['entry', 'target', 'stop_loss'] as const).every(type =>
      customMarkers.some(marker => marker.type === type && positive(marker.price)));
  }
  return !!formation && [
    formation.levels.entryPrice, formation.levels.targetPrice, formation.levels.stopLossPrice,
  ].every(positive);
}

/** One fullscreen button always sets Entry, TP and SL to the same state. */
export function toggleCombinedTradeLevels(current: { entry: boolean; target: boolean; stop: boolean }) {
  const visible = !(current.entry && current.target && current.stop);
  return { entry: visible, target: visible, stop: visible };
}

/** Apply the fullscreen level switch to supplied custom trade markers as well as formation markers. */
export function filterVisibleTradeMarkers(
  markers: ChartMarkerInfo[],
  visible: { entry: boolean; target: boolean; stop: boolean },
): ChartMarkerInfo[] {
  return markers.filter(marker => marker.type === 'entry' ? visible.entry
    : marker.type === 'target' ? visible.target
    : marker.type === 'stop_loss' ? visible.stop
    : true);
}

export function replayChartMarkers(position: ReplayPosition | null, pendingOrders: ReplayPendingOrder[] = []): ChartMarkerInfo[] {
  const result: ChartMarkerInfo[] = [];
  if (position) {
    result.push({ id: 'position', type: 'entry', price: position.entryPrice, label: position.side === 'long' ? 'LONG' : 'SHORT', color: position.side === 'long' ? '#10b981' : '#ef4444' });
    if (position.slPrice) result.push({ id: 'sl', type: 'stop_loss', price: position.slPrice, label: 'SL', color: '#ef4444' });
    if (position.tpPrice) result.push({ id: 'tp', type: 'target', price: position.tpPrice, label: 'TP', color: '#10b981' });
    if (position.liquidationPrice) result.push({ id: 'liquidation', type: 'custom', price: position.liquidationPrice, label: 'Ліквідація', color: '#f97316', lineStyle: 'dotted' });
  }
  for (const order of pendingOrders) result.push({ id: order.id, type: 'custom', price: order.price, label: `${order.side.toUpperCase()} ${order.orderType.toUpperCase()}`, color: '#f59e0b', lineStyle: 'dashed' });
  return result.filter(row => Number.isFinite(row.price) && row.price > 0);
}

/** Merge chart scopes so parallel edits in terminal blocks do not erase each other. */
export function mergeHookPreferences(previous: HookChartPreferences | undefined, updates: HookChartPreferences): HookChartPreferences {
  return {
    ...previous,
    ...updates,
    drawings: { ...previous?.drawings, ...updates.drawings },
    alerts: { ...previous?.alerts, ...updates.alerts },
  };
}

export function mergeProfileUpdate(previous: UserProfile, updates: Partial<UserProfile>): UserProfile {
  return { ...previous, ...updates, uid: previous.uid,
    ...(updates.hookChartPreferences ? { hookChartPreferences: mergeHookPreferences(previous.hookChartPreferences, updates.hookChartPreferences) } : {}),
  };
}


/** Terminal cards show a formation with preceding history at a readable, compact scale.
 * Detection timestamps anchor the range; scanner indices belong to another history window.
 */
export function terminalHookViewport(candles: { t: number }[], plotWidth: number,
  formation?: DetectedFormation | null, rightPaddingBars = 8) {
  const width = Math.max(40, plotWidth);
  let end = candles.length - 1;
  let span = 60;
  const detectedAt = formation?.detectedAt ?? 0;
  if (Number.isFinite(detectedAt) && detectedAt >= (candles[0]?.t ?? Infinity)
    && detectedAt <= (candles.at(-1)?.t ?? 0)) {
    let low = 0, high = candles.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (candles[mid].t <= detectedAt) low = mid; else high = mid - 1;
    }
    end = low;
    const startIndex = formation?.candleStartIndex, endIndex = formation?.candleEndIndex;
    if (Number.isFinite(startIndex) && Number.isFinite(endIndex) && endIndex! >= startIndex!)
      span = Math.min(candles.length, endIndex! - startIndex! + 1);
  }
  const slots = Math.max(180, width / 3, span + Math.max(80, span * .75) + 32);
  const barWidth = Math.max(.12, Math.min(3, width / slots));
  // Keep the formation near the right edge with room for candles after detection.
  const to = Math.min(candles.length + rightPaddingBars, end + 1 + Math.max(24, span * .2));
  return { barWidth, rightOffset: candles.length + rightPaddingBars - to,
    autoY: true, manualCenter: null, manualRange: null, fitAll: false };
}

/** Missing observed seconds stay gaps; future drawing space still uses the chosen interval. */
export function hookChartIndexAtTime(candles: { t: number }[], time: number, intervalMs: number) {
  if (!candles.length) return 0;
  const last = candles.length - 1;
  if (time <= candles[0].t) return (time - candles[0].t) / intervalMs;
  if (time >= candles[last].t) return last + (time - candles[last].t) / intervalMs;
  let low = 0, high = last;
  while (low + 1 < high) { const mid = (low + high) >> 1; if (candles[mid].t <= time) low = mid; else high = mid; }
  return low + (time - candles[low].t) / Math.max(1, candles[high].t - candles[low].t);
}
export function hookChartTimeAtIndex(candles: { t: number }[], index: number, intervalMs: number) {
  if (!candles.length) return 0;
  const last = candles.length - 1;
  if (index <= 0) return candles[0].t + index * intervalMs;
  if (index >= last) return candles[last].t + (index - last) * intervalMs;
  const low = Math.floor(index);
  return candles[low].t + (candles[low + 1].t - candles[low].t) * (index - low);
}
