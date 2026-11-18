import { Kline, Timeframe, ExchangeId, MarketType, ReplayPosition, ReplayPendingOrder, ReplayTradeJournalItem, ReplaySimulationSettings } from '../types';
import { fetchDirectKlines } from './directExchangeClient';

export interface ReplayCandlePack {
  symbol: string;
  exchange: ExchangeId;
  marketType: MarketType;
  timeframe: Timeframe;
  allCandles: Kline[];
  cutoffIndex: number;
  selectedDate: Date;
}

// Convert timeframe to duration in milliseconds
export function timeframeToMs(tf: Timeframe): number {
  switch (tf) {
    case '1m': return 60 * 1000;
    case '5m': return 5 * 60 * 1000;
    case '15m': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    default: return 60 * 60 * 1000;
  }
}

/** Replay shortcut: calendar date at local midnight for all device time zones. */
export function getReplayPresetDate(daysAgo: number, now = new Date()): Date {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Fetch a rich historical window of candles centered around a target date
 */
export async function fetchHistoricalReplayCandles(
  exchange: ExchangeId,
  market: MarketType,
  symbol: string,
  timeframe: Timeframe,
  targetTimestampMs: number,
  barsBefore: number = 300,
  barsAfter: number = 350
): Promise<{ allCandles: Kline[]; cutoffIndex: number }> {
  const tfMs = timeframeToMs(timeframe);
  // Align exchange range requests to their candle-open boundaries.
  // Users who choose 12:01 and 12:45 on a 1h chart can now reuse the
  // exact same public history page; cutoff remains the requested instant.
  const anchor = Math.floor(targetTimestampMs / tfMs) * tfMs;
  const startTime = Math.max(0, anchor - barsBefore * tfMs);
  const endTime = Math.min(Date.now(), anchor + barsAfter * tfMs);
  const totalLimit = Math.min(1000, barsBefore + barsAfter + 50);

  // 1. Try server endpoint first
  try {
    const res = await fetch(
      `/api/klines?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}&market=${market}&timeframe=${timeframe}&limit=${totalLimit}&startTime=${startTime}&endTime=${endTime}`
    );
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length >= 10 &&
          replayFallbackContainsDate(json.data, targetTimestampMs, timeframe)) {
        return processCandlesForCutoff(json.data, targetTimestampMs, timeframe);
      }
    }
  } catch (err) {
    console.warn('Server klines fetch error, falling back to direct exchange:', err);
  }

  // 2. Direct client fallback with multi-mirrors
  try {
    const directData = await fetchDirectKlines(exchange, market, symbol, timeframe, totalLimit, startTime, endTime);
    if (directData && directData.length >= 10 &&
        replayFallbackContainsDate(directData, targetTimestampMs, timeframe)) {
      return processCandlesForCutoff(directData, targetTimestampMs, timeframe);
    }
  } catch (err) {
    console.warn('Direct klines fetch error:', err);
  }

  // 3. If range returned too few candles (e.g. historical boundary), fetch latest candles and cut off inside them
  try {
    const fallbackLatest = await fetchDirectKlines(exchange, market, symbol, timeframe, 500);
    if (fallbackLatest && fallbackLatest.length > 0 &&
        replayFallbackContainsDate(fallbackLatest, targetTimestampMs, timeframe)) {
      // Latest candles are only a fallback when they actually include the
      // requested historical time. Never mislabel today's market as a replay
      // from months ago after the historical API fails.
      // The direct latest fallback must obey the exact same cutoff semantics
      // as historical pages. Never jump forward/backward by arbitrary bars.
      return processCandlesForCutoff(fallbackLatest, targetTimestampMs, timeframe);
    }
  } catch (e) {
    console.error('Final fallback klines failed:', e);
  }

  return { allCandles: [], cutoffIndex: 0 };
}

export function processCandlesForCutoff(
  candles: Kline[],
  targetTimestampMs: number,
  timeframe: Timeframe,
  _now = Date.now()
): { allCandles: Kline[]; cutoffIndex: number } {
  // Sort candles ascending by time
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  
  // Deduplicate by time
  const uniqueCandles: Kline[] = [];
  const seenTimes = new Set<number>();
  for (const c of sorted) {
    if (!seenTimes.has(c.time)) {
      seenTimes.add(c.time);
      uniqueCandles.push(c);
    }
  }

  const targetSec = Math.floor(targetTimestampMs / 1000);
  let cutoffIdx = -1;

  for (let i = 0; i < uniqueCandles.length; i++) {
    if (uniqueCandles[i].time <= targetSec) {
      cutoffIdx = i;
    } else {
      break;
    }
  }

  // The selected bar must not be moved into the future (e.g. the twentieth
  // bar of a newly listed market) or rewound by 30 bars on a delisted market.
  // Zero is a valid initial cutoff; the user can step through later bars.
  if (cutoffIdx < 0) return { allCandles: [], cutoffIndex: 0 };
  return { allCandles: uniqueCandles, cutoffIndex: cutoffIdx };
}

/** Latest-only fallback may not substitute 2026 candles for a 2025 replay. */
export function replayFallbackContainsDate(
  candles: readonly Kline[], targetTimestampMs: number, timeframe: Timeframe
): boolean {
  if (!candles.length || !Number.isFinite(targetTimestampMs)) return false;
  const targetSec = targetTimestampMs / 1000;
  const frameSec = timeframeToMs(timeframe) / 1000;
  if (!Number.isFinite(frameSec) || frameSec <= 0) return false;
  let matches = false;
  for (const candle of candles) {
    const time = candle.time > 1e11 ? candle.time / 1000 : candle.time;
    if (!Number.isFinite(time) || time <= 0) return false;
    // A sparse response can bracket the target with a multi-day gap.
    // Only a real historical bar covering the chosen time is acceptable;
    // price simulation must never run with a fabricated/rewound date.
    if (time <= targetSec && targetSec < time + frameSec) matches = true;
  }
  return matches;
}

/**
 * Generate a random historical date for the coin
 * Avoids dates too close to now (guarantees at least 1-2 weeks of future candles exist to play!)
 */
export function generateRandomHistoricalDate(): Date {
  const now = Date.now();
  // Min: 1.5 years ago
  const minPastMs = 30 * 24 * 3600 * 1000;      // at least 30 days ago
  const maxPastMs = 500 * 24 * 3600 * 1000;     // up to 500 days ago
  
  const randomPastOffset = minPastMs + Math.random() * (maxPastMs - minPastMs);
  const randomTime = now - randomPastOffset;
  
  const d = new Date(randomTime);
  // Round to nearest hour
  d.setMinutes(0, 0, 0);
  return d;
}

/**
 * Compute simulated execution price with spread & slippage
 */
export function calculateExecutionPrice(
  basePrice: number,
  side: 'buy' | 'sell',
  spreadPct: number = 0.02,
  slippagePct: number = 0.02
): number {
  const halfSpread = (spreadPct / 100) / 2;
  const slippage = slippagePct / 100;
  
  if (side === 'buy') {
    return basePrice * (1 + halfSpread + slippage);
  } else {
    return basePrice * (1 - halfSpread - slippage);
  }
}

/**
 * Calculate liquidation price based on leverage & side
 */
export function calculateLiquidationPrice(
  entryPrice: number,
  side: 'long' | 'short',
  leverage: number,
  maintenanceMarginPct: number = 0.005 // 0.5%
): number {
  if (leverage <= 1) return side === 'long' ? 0 : entryPrice * 2;
  
  if (side === 'long') {
    return Math.max(0, entryPrice * (1 - (1 / leverage) + maintenanceMarginPct));
  } else {
    return entryPrice * (1 + (1 / leverage) - maintenanceMarginPct);
  }
}

/**
 * Calculate unrealized P&L
 */
export function calculateUnrealizedPnl(
  position: ReplayPosition,
  currentPrice: number
): { pnlUsd: number; pnlPct: number } {
  if (position.entryPrice <= 0 || position.marginUsd <= 0) {
    return { pnlUsd: 0, pnlPct: 0 };
  }

  let pnlUsd = 0;
  if (position.side === 'long') {
    pnlUsd = ((currentPrice - position.entryPrice) / position.entryPrice) * position.sizeUsd;
  } else {
    pnlUsd = ((position.entryPrice - currentPrice) / position.entryPrice) * position.sizeUsd;
  }

  const pnlPct = (pnlUsd / position.marginUsd) * 100;
  return { pnlUsd, pnlPct };
}

/**
 * Check if a candle triggers SL, TP, or Liquidation
 */
export function checkPositionTriggers(
  position: ReplayPosition,
  candle: Kline
): { triggered: boolean; exitPrice: number; reason: 'tp' | 'sl' | 'liquidation' } | null {
  const { high, low } = candle;

  // 1. Check Liquidation first
  if (position.liquidationPrice > 0) {
    if (position.side === 'long' && low <= position.liquidationPrice) {
      return { triggered: true, exitPrice: position.liquidationPrice, reason: 'liquidation' };
    }
    if (position.side === 'short' && high >= position.liquidationPrice) {
      return { triggered: true, exitPrice: position.liquidationPrice, reason: 'liquidation' };
    }
  }

  // 2. Check Stop Loss
  if (position.slPrice && position.slPrice > 0) {
    if (position.side === 'long' && low <= position.slPrice) {
      return { triggered: true, exitPrice: position.slPrice, reason: 'sl' };
    }
    if (position.side === 'short' && high >= position.slPrice) {
      return { triggered: true, exitPrice: position.slPrice, reason: 'sl' };
    }
  }

  // 3. Check Take Profit
  if (position.tpPrice && position.tpPrice > 0) {
    if (position.side === 'long' && high >= position.tpPrice) {
      return { triggered: true, exitPrice: position.tpPrice, reason: 'tp' };
    }
    if (position.side === 'short' && low <= position.tpPrice) {
      return { triggered: true, exitPrice: position.tpPrice, reason: 'tp' };
    }
  }

  return null;
}

/**
 * Check if pending limit or stop orders are filled by this candle
 */
export function checkOrderFill(order: ReplayPendingOrder, candle: Kline): boolean {
  const { high, low } = candle;
  if (order.orderType === 'limit') {
    if (order.side === 'buy') {
      return low <= order.price;
    } else {
      return high >= order.price;
    }
  } else if (order.orderType === 'stop') {
    if (order.side === 'buy') {
      return high >= order.price;
    } else {
      return low <= order.price;
    }
  }
  return false;
}

// LocalStorage Keys for Practice Journal & Simulation Settings
const REPLAY_JOURNAL_KEY = 'signalhook_replay_journal';
const REPLAY_SETTINGS_KEY = 'signalhook_replay_settings';

export const DEFAULT_SIMULATION_SETTINGS: ReplaySimulationSettings = {
  balance: 10000,
  leverage: 10,
  positionSizeUsd: 1000,
  commissionPct: 0.05, // 0.05% taker
  spreadPct: 0.02,     // 0.02%
  slippagePct: 0.02,   // 0.02%
  autoSlPct: 2.0,      // 2%
  autoTpPct: 4.0,      // 4%
};

export function loadReplayJournal(): ReplayTradeJournalItem[] {
  try {
    const raw = localStorage.getItem(REPLAY_JOURNAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveReplayJournal(items: ReplayTradeJournalItem[]): void {
  try {
    localStorage.setItem(REPLAY_JOURNAL_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save replay journal:', e);
  }
}

export function loadReplaySettings(): ReplaySimulationSettings {
  try {
    const raw = localStorage.getItem(REPLAY_SETTINGS_KEY);
    if (!raw) return DEFAULT_SIMULATION_SETTINGS;
    return { ...DEFAULT_SIMULATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SIMULATION_SETTINGS;
  }
}

export function saveReplaySettings(settings: ReplaySimulationSettings): void {
  try {
    localStorage.setItem(REPLAY_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save replay settings:', e);
  }
}
