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
  const step = viewport.fitAll
    ? Math.max(.001, Math.max(40, plotWidth - paddingPixels) / Math.max(1, candleCount + paddingBars))
    : Math.max(.12, viewport.barWidth);
  const virtualEnd = candleCount - viewport.rightOffset + paddingBars + paddingPixels / step;
  return { step, virtualEnd, virtualStart: virtualEnd - plotWidth / step };
}

export function validCandle(candle: Kline): boolean {
  return [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
    && candle.time > 0 && candle.low > 0 && candle.volume >= 0
    && candle.high >= Math.max(candle.open, candle.close, candle.low)
    && candle.low <= Math.min(candle.open, candle.close);
}

/** Canonical site candles use seconds; hookchart uses milliseconds. Last duplicate wins. */
export function toHookCandles(klines: Kline[]) {
  const byTime = new Map<number, Kline>();
  for (const candle of klines) if (validCandle(candle)) byTime.set(candle.time, candle);
  return [...byTime.values()].sort((a, b) => a.time - b.time).map(k => ({
    t: k.time * 1000, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume, n: 0,
  }));
}

/** Ignore stale stream ticks rather than moving the current candle backwards. */
export function mergeLiveCandle(candles: Kline[], tick: Kline, limit = 40_000): Kline[] {
  if (!validCandle(tick) || (candles.length && tick.time < candles[candles.length - 1].time)) return candles;
  if (candles.length && tick.time === candles[candles.length - 1].time) return [...candles.slice(0, -1), tick];
  return [...candles, tick].slice(-limit);
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
    ...(visible.entry ? [{ id: 'entry', type: 'entry' as const, price: l.entryPrice, label: 'Вхід', color: '#3b82f6' }] : []),
    ...(visible.target ? [{ id: 'target', type: 'target' as const, price: l.targetPrice, label: 'TP', color: '#10b981' }] : []),
    ...(visible.stop ? [{ id: 'stop', type: 'stop_loss' as const, price: l.stopLossPrice, label: 'SL', color: '#ef4444' }] : []),
  ];
  for (const [type, price, label, color] of [
    ['neckline', l.necklinePrice, 'Шия', '#f59e0b'],
    ['resistance', l.resistancePrice, 'Опір', '#a855f7'],
    ['support', l.supportPrice, 'Підтримка', '#a855f7'],
  ] as const) if (price && !rows.some(row => row.price === price)) rows.push({ id: type, type, price, label, color, lineStyle: 'dotted', ...(timeframe ? { timeframe } : {}) });
  return rows.filter(row => Number.isFinite(row.price) && row.price > 0);
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

/** Interpolate between observed candles and extend future space by the chosen interval. */
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
