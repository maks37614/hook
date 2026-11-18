import type { TerminalChartBlock, Timeframe } from '../types';
import { normalizeExchangeSymbol } from './marketSymbols';
import { normalizeTerminalMarketPair } from './terminalPresets';

export const MAX_FULLSCREEN_CHARTS = 4;
export type FullscreenMarket = Pick<TerminalChartBlock, 'symbol' | 'exchange' | 'marketType'>;
export type FullscreenSelection = Pick<TerminalChartBlock, 'symbol' | 'baseAsset' | 'quoteAsset' | 'exchange' | 'marketType'>;

export function fullscreenMarketKey(market: FullscreenMarket): string {
  return [market.exchange, market.marketType, normalizeExchangeSymbol(market.symbol).toUpperCase()].join(':');
}

/** Exchange and market badges are one-tap toggles on the fullscreen page. */
export function toggleFullscreenExchange(exchange: FullscreenMarket['exchange']): FullscreenMarket['exchange'] {
  return exchange === 'binance' ? 'bybit' : 'binance';
}

export function toggleFullscreenMarketType(marketType: FullscreenMarket['marketType']): FullscreenMarket['marketType'] {
  return marketType === 'futures' ? 'spot' : 'futures';
}

/** Never connect the same exchange + market + symbol in two fullscreen panels. */
export function fullscreenMarketCollision(
  slots: readonly FullscreenChartSlot[], activeId: string, market: FullscreenMarket,
): FullscreenChartSlot | undefined {
  return slots.find(slot => slot.id !== activeId && fullscreenMarketKey(slot) === fullscreenMarketKey(market));
}

/** The existing main chart counts toward the four-chart cap. Duplicate streams are never added. */
export function appendFullscreenChart(
  blocks: TerminalChartBlock[],
  primary: FullscreenMarket,
  selected: FullscreenSelection,
  timeframe: Timeframe,
  formationId?: string,
  makeId: () => string = () => 'fullscreen-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
): TerminalChartBlock[] {
  if (blocks.length >= MAX_FULLSCREEN_CHARTS - 1) return blocks;
  const pair = normalizeTerminalMarketPair(selected.symbol, selected.quoteAsset);
  const market = { ...selected, symbol: pair.symbol };
  const key = fullscreenMarketKey(market);
  if (key === fullscreenMarketKey(primary) || blocks.some(block => fullscreenMarketKey(block) === key)) return blocks;
  return [...blocks, {
    id: makeId(), symbol: pair.symbol,
    baseAsset: selected.baseAsset || pair.symbol.slice(0, -pair.quoteAsset.length),
    quoteAsset: pair.quoteAsset, exchange: selected.exchange, marketType: selected.marketType,
    timeframe, formationId, colSpan: 1,
  }];
}

/** Ignore a coin-picker update that would collide with another visible chart. */
export function updateFullscreenChart(
  blocks: TerminalChartBlock[],
  primary: FullscreenMarket,
  id: string,
  patch: Partial<TerminalChartBlock>,
): TerminalChartBlock[] {
  const current = blocks.find(block => block.id === id);
  if (!current) return blocks;
  const updated = { ...current, ...patch, id: current.id };
  const key = fullscreenMarketKey(updated);
  if (key === fullscreenMarketKey(primary) || blocks.some(block => block.id !== id && fullscreenMarketKey(block) === key)) return blocks;
  if ((Object.keys(patch) as Array<keyof TerminalChartBlock>).every(field => Object.is(current[field], updated[field]))) return blocks;
  return blocks.map(block => block.id === id ? updated : block);
}

/** Preserve mounted chart identities while reordering, including the primary chart. */
export function reorderFullscreenCharts(order: string[], movingId: string, targetId: string): string[] {
  if (movingId === targetId || !order.includes(movingId) || !order.includes(targetId)) return order;
  const next = [...order];
  next.splice(next.indexOf(movingId), 1);
  next.splice(next.indexOf(targetId), 0, movingId);
  return next;
}

export function shiftFullscreenChart(order: string[], movingId: string, direction: -1 | 1): string[] {
  const index = order.indexOf(movingId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Replace one secondary fullscreen chart while retaining its slot, timeframe and UI layout.
 * A favorite already open in another slot (including the primary) cannot be duplicated.
 */
export function replaceFullscreenChart(
  blocks: TerminalChartBlock[],
  primary: FullscreenMarket,
  targetId: string,
  selected: FullscreenSelection,
): TerminalChartBlock[] {
  const pair = normalizeTerminalMarketPair(selected.symbol, selected.quoteAsset);
  return updateFullscreenChart(blocks, primary, targetId, {
    symbol: pair.symbol,
    baseAsset: selected.baseAsset || pair.symbol.slice(0, -pair.quoteAsset.length),
    quoteAsset: pair.quoteAsset,
    exchange: selected.exchange,
    marketType: selected.marketType,
    formationId: undefined,
  });
}

export interface FullscreenChartSlot extends FullscreenMarket {
  id: string;
}

/** Slot menu and multi-chart grid share a single display order. */
/** Cycle only the fullscreen header's active chart, in visible drag-and-drop order.
 * No chart remount, scroll jump or duplicate market-data subscription is needed.
 */
export function nextFullscreenChartSlotId(
  slots: readonly FullscreenChartSlot[], currentId: string,
): string {
  if (!slots.length) return 'primary';
  const index = slots.findIndex(slot => slot.id === currentId);
  return slots[index < 0 ? 0 : (index + 1) % slots.length].id;
}

export function fullscreenChartSlots(
  primary: FullscreenMarket,
  blocks: TerminalChartBlock[],
  order: readonly string[],
): FullscreenChartSlot[] {
  const slots: FullscreenChartSlot[] = [{ id: 'primary', ...primary },
    ...blocks.map(block => ({ id: block.id, symbol: block.symbol, exchange: block.exchange, marketType: block.marketType }))];
  return [...slots].sort((a, b) => {
    const indexA = order.indexOf(a.id), indexB = order.indexOf(b.id);
    return (indexA < 0 ? slots.indexOf(a) + order.length : indexA)
      - (indexB < 0 ? slots.indexOf(b) + order.length : indexB);
  });
}

/** Viewport-clamped placement for the compact favorite picker, above its
 * source row when required. Pure client-side geometry; no work for HookChart.
 */
export function fullscreenFavoriteMenuPosition(
  anchor: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
  chartCount: number,
): { left: number; top: number; width: number } {
  const width = Math.min(176, Math.max(0, viewport.width - 16));
  const height = 28 + Math.min(MAX_FULLSCREEN_CHARTS, Math.max(1, chartCount)) * 32;
  const left = Math.max(8, Math.min(anchor.left + 8, viewport.width - width - 8));
  const below = anchor.bottom + 4;
  const top = below + height <= viewport.height - 8
    ? below : Math.max(8, anchor.top - height - 4);
  return { left, top, width };
}

/** Resolve a favorite against the active chart (never add a fifth chart or duplicate a market).
 * A favorite already visible in another chart focuses that chart instead.
 */
export function fullscreenFavoriteDestination(
  slots: readonly FullscreenChartSlot[], activeSlotId: string, coin: FullscreenMarket,
): { targetId: string; alreadyOpen: boolean } {
  const targetId = slots.some(slot => slot.id === activeSlotId) ? activeSlotId : 'primary';
  const existing = slots.find(slot => fullscreenMarketKey(slot) === fullscreenMarketKey(coin));
  return existing ? { targetId: existing.id, alreadyOpen: true }
    : { targetId, alreadyOpen: false };
}
