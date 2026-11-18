import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { persistenceMetrics } from './persistenceMetrics';
import { writePrivateJsonAtomic } from './privateAtomicJson';
import { publishSurveillance } from './surveillanceEvents';
import {
  SurveillanceCoin,
  SurveillanceConfig,
  SurveillanceEvent,
  SurveillanceState,
  ExchangeId,
  MarketType,
  Timeframe,
  TriggerModeType,
  Kline,
} from '../src/types';
import { normalizeKlineTimeMs } from '../src/utils/formationValidation';
import { getTimeframeMs } from './surveillance/multiTimeframeEngine';
import { fetchKlines } from './marketService';
import { surveillanceCheckCandleCache } from './surveillance/checkCandleCache';
import { hasFreshSurveillanceCheck, wasSurveillanceCheckCommitted, SurveillanceCheckIncompleteError } from './surveillance/checkResult';
import { ScopedSurveillanceChecks, type SurveillanceCheckOptions } from './surveillance/scopedChecks';
import { candleCloseCheckPlanner } from './surveillance/candleCloseCheckPlanner';
import { sharedSurveillanceState } from './surveillance/sharedSurveillanceState';
import { getUserTelegram } from './alertService';
import { surveillanceManager } from './surveillance/surveillanceManager';
import { notificationRouter, registerSurveillanceCoinLookup } from './notificationRouter';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const SURVEILLANCE_FILE = path.join(DATA_DIR, 'surveillance.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error('Failed to create server/data directory:', e);
    }
  }
}

/** Only a genuinely missing file means there is no saved store. Permission,
 * I/O and filesystem failures are errors and must never become an empty list. */
function readStoreFileIfPresent(filename: string): string | null {
  try {
    return fs.readFileSync(filename, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

interface UserSurveillanceStore {
  [userId: string]: SurveillanceCoin[];
}

let storeCache: UserSurveillanceStore = {};
let isStoreLoaded = false;

function formatPrice(val: number): string {
  if (!val && val !== 0) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

export function loadSurveillanceStore(): UserSurveillanceStore {
  if (isStoreLoaded) return storeCache;

  // Do not acknowledge an empty account list when the on-disk source is
  // unreadable, malformed, or cannot be migrated. A later write must never
  // erase someone's 24/7-monitor configuration because of a read failure.
  ensureDataDir();
  let candidate: UserSurveillanceStore = Object.create(null) as UserSurveillanceStore;
  let migrated = false;

  const raw = readStoreFileIfPresent(SURVEILLANCE_FILE);
  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Legacy single-list format: migrate once without losing the old file
      // when the atomic rename fails.
      for (const item of parsed) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          throw new Error('Invalid legacy surveillance.json coin');
        const record = item as SurveillanceCoin;
        const uid = (typeof record.userId === 'string' && record.userId.trim()) || 'guest';
        (candidate[uid] ??= []).push(record);
      }
      migrated = true;
    } else if (parsed && typeof parsed === 'object') {
      candidate = parsed as UserSurveillanceStore;
    } else {
      throw new Error('Invalid surveillance.json: expected a user-keyed object or legacy array');
    }
  } else {
    const legacyFile = path.join(DATA_DIR, 'surveillance_legacy.json');
    const legacyRaw = readStoreFileIfPresent(legacyFile);
    if (legacyRaw !== null) {
      const legacy: unknown = JSON.parse(legacyRaw);
      if (!Array.isArray(legacy))
        throw new Error('Invalid surveillance_legacy.json: expected an array');
      candidate = { guest: legacy as SurveillanceCoin[] };
      migrated = true;
    }
  }

  // Repair guest ownership and duplicate worker IDs using a separate staging
  // copy. Never mutate the cached user store until the fixed file is durable.
  const ids = new Set<string>();
  let repaired = false;
  const normalized: UserSurveillanceStore = Object.create(null) as UserSurveillanceStore;
  for (const [userId, coins] of Object.entries(candidate)) {
    if (!Array.isArray(coins))
      throw new Error(`Invalid surveillance.json: account ${userId} must contain a coin list`);
    normalized[userId] = coins.map((coin) => {
      if (!coin || typeof coin !== 'object' || Array.isArray(coin))
        throw new Error(`Invalid surveillance.json: malformed coin for account ${userId}`);
      const newId = typeof coin.id === 'string' && coin.id.trim() && !ids.has(coin.id)
        ? coin.id : `surv_${randomUUID()}`;
      ids.add(newId);
      if (coin.userId !== userId || coin.id !== newId) {
        repaired = true;
        return { ...coin, userId, id: newId };
      }
      return coin;
    });
  }

  if (migrated || repaired) {
    if (!saveSurveillanceStore(normalized))
      throw new Error('Failed to persist migrated surveillance.json; original file preserved');
  } else {
    storeCache = normalized;
  }
  // Mark loaded only after validating every owner and committing migrations.
  isStoreLoaded = true;
  return storeCache;
}
export function saveSurveillanceStore(store: UserSurveillanceStore): boolean {
  const started = performance.now();
  let bytes = 0;
  try {
    ensureDataDir();
    let safeStore: UserSurveillanceStore = store;
    if (Array.isArray(store)) {
      safeStore = Object.create(null) as UserSurveillanceStore;
      for (const item of store as any[]) {
        if (item && typeof item === 'object') {
          const uid = (item.userId && String(item.userId).trim()) || 'guest';
          if (!safeStore[uid]) safeStore[uid] = [];
          safeStore[uid].push(item);
        }
      }
    }
    const payload = JSON.stringify(safeStore);
    bytes = Buffer.byteLength(payload);
    writePrivateJsonAtomic(SURVEILLANCE_FILE, payload);
    // A failed disk write must never replace the authoritative in-memory copy.
    storeCache = safeStore;
    persistenceMetrics.record('surveillance', performance.now() - started, bytes, true);
    return true;
  } catch (err) {
    persistenceMetrics.record('surveillance', performance.now() - started, bytes, false);
    console.error('Failed to save surveillance.json:', err);
    return false;
  }
}

export function loadSurveillanceList(userId?: string): SurveillanceCoin[] {
  const store = loadSurveillanceStore();
  const uid = (userId && userId.trim() !== '') ? userId.trim() : 'guest';
  const list = store[uid] || [];

  return list.map((storedCoin) => {
    // Worker snapshots and legacy defaults are view-only. A GET must not
    // mutate the durable store or turn transient order-book data into JSON.
    const coin: SurveillanceCoin = structuredClone(storedCoin);
    if (!coin.config.triggerModes) {
      coin.config.triggerModes = coin.config.triggerMode ? [coin.config.triggerMode] : ['bar_close'];
    }

    // Reading a user's list must not repeatedly reconfigure an already
    // running worker or start anonymous guest market streams. Actual user
    // edits and the initial boot already reconcile active worker settings.
    // Recover a missing worker for an authenticated user's active coin only.
    if (uid !== 'guest' && coin.isActive &&
        !surveillanceManager.getWorker(coin.id, uid)) {
      surveillanceManager.startWorkerForCoin(coin);
    }

    // Merge live metrics from worker if available
    const snapshot = surveillanceManager.getWorkerSnapshot(coin.id, uid);
    if (snapshot && snapshot.userId === uid && coin.state) {
      const topDensity = snapshot.densities[0];
      const activeSetup = snapshot.setups[0];
      const activePattern = snapshot.patterns[0];
      const activeThirdTouch = snapshot.thirdTouches[0];

      // Convert worker EngineAlertEvents to SurveillanceEvents
      const workerEvents: SurveillanceEvent[] = (snapshot.recentEvents || []).map((e: any) => ({
        id: e.eventId || `worker_evt_${e.timestamp}`,
        type: (e.type?.toLowerCase().includes('level') || e.type?.toLowerCase().includes('retest'))
          ? 'level'
          : (e.type?.toLowerCase().includes('structure') || e.type?.toLowerCase().includes('bos') || e.type?.toLowerCase().includes('choch'))
          ? 'structure'
          : (e.type?.toLowerCase().includes('impulse') || e.type?.toLowerCase().includes('momentum'))
          ? 'momentum'
          : 'risk',
        title: e.title || `Подія ${e.type}`,
        description: e.description || '',
        price: e.price || snapshot.currentPrice,
        timestamp: e.timestamp || Date.now(),
        severity: (e.severity === 'CRITICAL' || e.severity === 'HIGH')
          ? 'critical'
          : (e.severity === 'IMPORTANT' || e.severity === 'WATCH')
          ? 'warning'
          : 'info',
        details: {
          timeframe: e.timeframe,
          // Required for precise per-category browser delivery; event.type
          // has already been collapsed into the legacy level/structure label.
          notificationType: e.type,
          confluenceScore: e.confluenceScore,
          type: e.type,
          evidence: e.evidence,
        },
      }));

      const existingEvents: SurveillanceEvent[] = coin.state.recentEvents || [];
      const combinedEvents = [...workerEvents, ...existingEvents];
      const seenIds = new Set<string>();
      const dedupedEvents = combinedEvents.filter((ev) => {
        if (!ev.id || seenIds.has(ev.id)) return false;
        seenIds.add(ev.id);
        return true;
      }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 25);

      coin.state = {
        ...coin.state,
        engineStatus: snapshot.status as any,
        currentPrice: snapshot.currentPrice > 0 ? snapshot.currentPrice : coin.state.currentPrice,
        spreadPct: snapshot.orderBookState?.spreadPct,
        bestBid: snapshot.orderBookState?.bestBid,
        bestAsk: snapshot.orderBookState?.bestAsk,
        densitiesCount: snapshot.densities.length,
        topDensityUsd: topDensity?.notionalUsd,
        topDensityPrice: topDensity?.price,
        topDensitySide: topDensity?.side,
        thirdTouchState: activeThirdTouch?.state,
        thirdTouchDistancePct: activeThirdTouch?.distancePct,
        activeSetupType: activeSetup?.type,
        activeSetupStage: activeSetup?.stage,
        activeSetupConfluence: activeSetup?.confluenceScore,
        oiRegime: snapshot.oiSnapshot?.regime,
        oiChange15mPct: snapshot.oiSnapshot?.change15mPct,
        oiAnomaly: snapshot.oiSnapshot?.isAnomaly,
        tradeFlowBuyUsd: snapshot.tradeFlow?.aggressiveBuyUsd,
        tradeFlowSellUsd: snapshot.tradeFlow?.aggressiveSellUsd,
        tradeFlowImbalance: snapshot.tradeFlow?.imbalanceRatio,
        formationName: activePattern?.name,
        formationScore: activePattern?.score,
        lastCalculated: snapshot.lastAnalysisTimestamp || Date.now(),
        recentEvents: dedupedEvents,
        lastEvent: dedupedEvents[0] || coin.state.lastEvent,
      };
    }

    return coin;
  });
}

// Realtime updates are available from memory immediately; only routine
// monitor snapshots are grouped into a bounded number of durable file writes.
// Explicit user edits and newly delivered Telegram alerts remain synchronous.
const pendingSurveillanceUsers = new Set<string>();

export function flushDeferredSurveillanceChecks(): boolean {
  if (pendingSurveillanceUsers.size === 0) return true;
  if (!saveSurveillanceStore(loadSurveillanceStore())) return false;
  const changedUsers = [...pendingSurveillanceUsers];
  pendingSurveillanceUsers.clear();
  for (const userId of changedUsers) publishSurveillance(userId, true);
  return true;
}

export function saveSurveillanceList(userId: string, list: SurveillanceCoin[]): boolean {
  const store = loadSurveillanceStore();
  const uid = (userId && userId.trim() !== '') ? userId.trim() : 'guest';
  // Stage a fresh account list; never mutate the in-memory account or stop
  // workers until the new state is safely renamed into place on disk.
  const previous = store[uid] || [];
  const nextList = structuredClone(list);
  if (!saveSurveillanceStore({ ...store, [uid]: nextList })) return false;
  const nextIds = new Set(nextList.map(item => item.id));
  for (const coin of previous) {
    if (!nextIds.has(coin.id)) surveillanceManager.stopWorkerForCoin(coin.id, uid);
  }
  pendingSurveillanceUsers.delete(uid);
  publishSurveillance(uid, true);
  return true;
}

// An async check must never restore a deleted coin or overwrite a user's edits.
export function commitSurveillanceCheck(
  checked: SurveillanceCoin, options: { deferPersist?: boolean } = {},
): SurveillanceCoin | null {
  const found = findSurveillanceCoinById(checked.id, checked.userId);
  if (!found) return null;
  const current = found.coin;
  if (current.isActive !== checked.isActive || JSON.stringify(current.config) !== JSON.stringify(checked.config)) return current;
  // A slower manual or background response must not rewind the last processed
  // candles, recent signals, or notification cooldown stored by a newer pass.
  const currentCheckAt = Date.parse(current.lastCheckedAt || '');
  const checkedAt = Date.parse(checked.lastCheckedAt || '');
  if (Number.isFinite(currentCheckAt) && (!Number.isFinite(checkedAt) || checkedAt < currentCheckAt))
    return current;

  const currentNotifyAt = Date.parse(current.lastNotifiedAt || '');
  const checkedNotifyAt = Date.parse(checked.lastNotifiedAt || '');
  const newNotification = Number.isFinite(checkedNotifyAt)
    && (!Number.isFinite(currentNotifyAt) || checkedNotifyAt > currentNotifyAt);
  const lastNotifiedAt = newNotification ? checked.lastNotifiedAt : current.lastNotifiedAt;
  const updated = { ...current, state: checked.state, lastCheckedAt: checked.lastCheckedAt,
    lastNotifiedAt };
  // A real Telegram dispatch updates lastNotifiedAt and must be written
  // durably before the next monitor pass, never buffered with routine metrics.
  if (options.deferPersist && !newNotification) {
    found.list[found.index] = updated;
    pendingSurveillanceUsers.add(found.userId);
  } else {
    const next = found.list.slice();
    next[found.index] = updated;
    if (!saveSurveillanceList(found.userId, next))
      throw new Error('Не вдалося зберегти стан 24/7-нагляду');
  }
  surveillanceManager.updateWorkerCoin(updated);
  return updated;
}

export function updateSurveillanceCoinActive(
  id: string,
  isActive: boolean,
  preferredUserId?: string
): SurveillanceCoin | null {
  const store = loadSurveillanceStore();
  const found = findSurveillanceCoinById(id, preferredUserId);
  if (!found) return null;

  const updatedCoin: SurveillanceCoin = {
    ...found.coin,
    isActive: Boolean(isActive),
    updatedAt: new Date().toISOString(),
  };

  const next = found.list.slice();
  next[found.index] = updatedCoin;
  if (!saveSurveillanceList(found.userId, next))
    throw new Error('Не вдалося зберегти зміну активності нагляду');
  if (Boolean(isActive)) {
    surveillanceManager.startWorkerForCoin(updatedCoin);
  } else {
    surveillanceManager.stopWorkerForCoin(id, found.userId);
  }
  return updatedCoin;
}

export function setAllSurveillanceCoinsActive(userId: string, isActive: boolean): SurveillanceCoin[] {
  const store = loadSurveillanceStore();
  const uid = (userId && userId.trim() !== '') ? userId.trim() : 'guest';
  const list = store[uid] || [];
  const updatedList = list.map((coin) => {
    const updated = {
      ...coin,
      isActive: Boolean(isActive),
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!saveSurveillanceList(uid, updatedList))
    throw new Error('Не вдалося зберегти групову зміну нагляду');
  for (const updated of updatedList) {
    if (Boolean(isActive)) surveillanceManager.startWorkerForCoin(updated);
    else surveillanceManager.stopWorkerForCoin(updated.id, uid);
  }
  return updatedList;
}

export function findSurveillanceCoinById(
  id: string,
  preferredUserId?: string
): { userId: string; coin: SurveillanceCoin; index: number; list: SurveillanceCoin[] } | null {
  const store = loadSurveillanceStore();

  const userId = preferredUserId?.trim() || 'guest';
  const list = store[userId];
  if (!Array.isArray(list)) return null;
  const index = list.findIndex(coin => coin.id === id);
  return index === -1 ? null : { userId, coin: list[index], index, list };
}

// Keep persisted coin validation synchronous without eagerly importing this
// heavyweight store from NotificationRouter (which re-enters the manager while
// StateMachineAndAlerts is being initialized).
registerSurveillanceCoinLookup((id, userId) => findSurveillanceCoinById(id, userId)?.coin ?? null);

/** Cheap owner-scoped count for the status endpoint. Never iterate every
 * user's coins on every authenticated profile refresh. */
export function countActiveSurveillanceCoins(userId?: string): number {
  const store = loadSurveillanceStore();
  if (userId) return (store[userId] || []).reduce((n, coin) => n + Number(coin.isActive), 0);
  let total = 0;
  for (const coins of Object.values(store))
    if (Array.isArray(coins))
      for (const coin of coins) if (coin.isActive) total++;
  return total;
}

export function getAllActiveSurveillanceCoins(): { userId: string; coin: SurveillanceCoin }[] {
  const store = loadSurveillanceStore();
  const results: { userId: string; coin: SurveillanceCoin }[] = [];
  for (const [userId, coins] of Object.entries(store)) {
    if (Array.isArray(coins)) {
      for (const coin of coins) {
        if (coin.isActive) {
          // Legacy defaults are normalized for scheduling only. Reading the
          // active monitor inventory must not silently change saved configs.
          const scheduledCoin = coin.config.triggerModes ? coin : {
            ...coin, config: {
              ...coin.config,
              triggerModes: coin.config.triggerMode
                ? [coin.config.triggerMode] : ['bar_close' as const],
            },
          };
          results.push({ userId, coin: scheduledCoin });
        }
      }
    }
  }
  return results;
}

export function getDefaultSurveillanceConfig(): SurveillanceConfig {
  return {
    timeframe: '4h',
    triggerModes: ['bar_close'],
    levelsEnabled: true,
    structureEnabled: true,
    momentumEnabled: true,
    momentumPct: 2.5,
    momentumBars: 3,
    momentumTf: '15m',
    channelEnabled: true,
    fibonacciEnabled: true,
    cooldownMinutes: 15,
  };
}

export function validateSurveillanceConfig(config: Partial<SurveillanceConfig>): string | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 'Невірні налаштування стеження';
  if (config.densityMode !== undefined && !['AUTO', 'MANUAL', 'HYBRID'].includes(config.densityMode)) return 'Невірний режим щільностей';
  if (config.manualDensityThresholdUsd !== undefined &&
      (!Number.isFinite(config.manualDensityThresholdUsd) || config.manualDensityThresholdUsd <= 0)) return 'Поріг щільності має бути додатним числом';
  if (config.cooldownMinutes !== undefined && (!Number.isFinite(config.cooldownMinutes) || config.cooldownMinutes < 0)) return 'Невірний інтервал сповіщень';
  if (config.momentumBars !== undefined && (!Number.isInteger(config.momentumBars) || config.momentumBars < 1)) return 'Невірна кількість свічок імпульсу';
  if (config.momentumPct !== undefined && (!Number.isFinite(config.momentumPct) || config.momentumPct <= 0)) return 'Невірний поріг імпульсу';
  if (config.triggerModes !== undefined && (!Array.isArray(config.triggerModes) || !config.triggerModes.length ||
      config.triggerModes.some(mode => !['realtime', 'bar_close', 'bar_close_1h', 'bar_close_15m'].includes(mode)))) return 'Оберіть коректний режим підтвердження';
  return null;
}

export async function calculateSurveillanceState(
  symbol: string,
  exchange: ExchangeId,
  marketType: MarketType,
  config: SurveillanceConfig,
  source?: Record<'1d' | '4h' | '1h' | '15m', Kline[]>
): Promise<SurveillanceState | null> {
  try {
    const [klines1d, klines4h, klines1h, klines15m] = source
      ? [source['1d'], source['4h'], source['1h'], source['15m']]
      : await Promise.all([
      fetchKlines(exchange, marketType, symbol, '1d', 60).catch(() => []),
      fetchKlines(exchange, marketType, symbol, '4h', 80).catch(() => []),
      fetchKlines(exchange, marketType, symbol, '1h', 60).catch(() => []),
      fetchKlines(exchange, marketType, symbol, '15m', 40).catch(() => []),
    ]);

    let activeCandles = klines4h;
    if (!activeCandles || activeCandles.length < 5) {
      if (klines1h && klines1h.length >= 5) activeCandles = klines1h;
      else if (klines15m && klines15m.length >= 5) activeCandles = klines15m;
      else if (klines1d && klines1d.length >= 2) activeCandles = klines1d;
    }

    if (!activeCandles || activeCandles.length === 0) {
      return null;
    }

    const currentCandle = activeCandles[activeCandles.length - 1];
    const currentPrice = currentCandle.close;

    let change24h = 0;
    if (klines1d.length >= 2) {
      const yesterdayClose = klines1d[klines1d.length - 2].close;
      change24h = Number((((currentPrice - yesterdayClose) / yesterdayClose) * 100).toFixed(2));
    } else if (klines4h.length >= 7) {
      const dayAgo = klines4h[klines4h.length - 7].close;
      change24h = Number((((currentPrice - dayAgo) / dayAgo) * 100).toFixed(2));
    }

    const high1d = klines1d.length > 0 ? Math.max(...klines1d.map((k) => k.high)) : currentCandle.high * 1.05;
    const low1d = klines1d.length > 0 ? Math.min(...klines1d.map((k) => k.low)) : currentCandle.low * 0.95;

    const swingHighs: number[] = [];
    const swingLows: number[] = [];
    for (let i = 3; i < klines4h.length - 3; i++) {
      const c = klines4h[i];
      const isHigh =
        c.high > klines4h[i - 1].high &&
        c.high > klines4h[i - 2].high &&
        c.high > klines4h[i - 3].high &&
        c.high > klines4h[i + 1].high &&
        c.high > klines4h[i + 2].high &&
        c.high > klines4h[i + 3].high;
      if (isHigh) swingHighs.push(c.high);

      const isLow =
        c.low < klines4h[i - 1].low &&
        c.low < klines4h[i - 2].low &&
        c.low < klines4h[i - 3].low &&
        c.low < klines4h[i + 1].low &&
        c.low < klines4h[i + 2].low &&
        c.low < klines4h[i + 3].low;
      if (isLow) swingLows.push(c.low);
    }

    const recent4hSlice = (klines4h.length ? klines4h : activeCandles).slice(-30);
    const maxRecent4h = Math.max(...recent4hSlice.map((k) => k.high));
    const minRecent4h = Math.min(...recent4hSlice.map((k) => k.low));

    // Prefer closest structural swing high >= currentPrice. If none, check 1d high or highest swing high before falling back to window max
    let resistance4h = swingHighs.filter((h) => h >= currentPrice).sort((a, b) => a - b)[0];
    if (!resistance4h) {
      if (high1d > currentPrice) {
        resistance4h = high1d;
      } else if (swingHighs.length > 0) {
        resistance4h = Math.max(...swingHighs);
      } else {
        resistance4h = maxRecent4h;
      }
    }

    // Prefer closest structural swing low <= currentPrice. If none, check 1d low or lowest swing low before falling back to window min
    let support4h = swingLows.filter((l) => l <= currentPrice).sort((a, b) => b - a)[0];
    if (!support4h) {
      if (low1d < currentPrice) {
        support4h = low1d;
      } else if (swingLows.length > 0) {
        support4h = Math.min(...swingLows);
      } else {
        support4h = minRecent4h;
      }
    }

    const swingHigh4h = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : maxRecent4h;
    const swingLow4h = swingLows.length > 0 ? swingLows[swingLows.length - 1] : minRecent4h;

    const rangeSpan = Math.max(currentPrice * 0.000001, resistance4h - support4h);
    let rangePositionPct = ((currentPrice - support4h) / rangeSpan) * 100;
    rangePositionPct = Math.max(0, Math.min(100, Number(rangePositionPct.toFixed(1))));

    let localHigh1h = currentPrice * 1.01;
    let localLow1h = currentPrice * 0.99;
    if (klines1h && klines1h.length >= 10) {
      const recent1h = klines1h.slice(-15);
      localHigh1h = Math.max(...recent1h.map((k) => k.high));
      localLow1h = Math.min(...recent1h.map((k) => k.low));
    }

    let localHigh15m = currentPrice * 1.005;
    let localLow15m = currentPrice * 0.995;
    if (klines15m && klines15m.length >= 10) {
      const recent15m = klines15m.slice(-15);
      localHigh15m = Math.max(...recent15m.map((k) => k.high));
      localLow15m = Math.min(...recent15m.map((k) => k.low));
    }

    let channelUpper = resistance4h;
    let channelLower = support4h;
    if (klines1h && klines1h.length >= 20) {
      const last20_1h = klines1h.slice(-20);
      channelUpper = Math.max(...last20_1h.map((k) => k.high));
      channelLower = Math.min(...last20_1h.map((k) => k.low));
    }

    const fibSpan = Math.max(currentPrice * 0.000001, swingHigh4h - swingLow4h);
    const fib618 = swingHigh4h - fibSpan * 0.618;
    const fib786 = swingHigh4h - fibSpan * 0.786;

    const nextZoneUp = resistance4h + rangeSpan * 0.5;
    const nextZoneDown = Math.max(currentPrice * 0.000001, support4h - rangeSpan * 0.5);

    let structureTrend: 'bullish' | 'bearish' | 'consolidation' = 'consolidation';
    if (klines4h.length >= 20) {
      const ema20 = klines4h.slice(-20).reduce((acc, c) => acc + c.close, 0) / 20;
      if (currentPrice > resistance4h * 0.985 && currentPrice > ema20) {
        structureTrend = 'bullish';
      } else if (currentPrice < support4h * 1.015 && currentPrice < ema20) {
        structureTrend = 'bearish';
      } else {
        structureTrend = 'consolidation';
      }
    }

    let momentumRecentPct = 0;
    const momentumSource =
      config.momentumTf === '1h'
        ? klines1h
        : config.momentumTf === '4h'
        ? klines4h
        : klines15m;

    const momentumKlines = momentumSource.filter(c => normalizeKlineTimeMs(c.time) + getTimeframeMs(config.momentumTf) <= Date.now());
    if (momentumKlines.length >= config.momentumBars && config.momentumBars > 0) {
      const startBar = momentumKlines[momentumKlines.length - config.momentumBars];
      const latestBar = momentumKlines[momentumKlines.length - 1];
      if (startBar && startBar.open > 0) {
        momentumRecentPct = Number((((latestBar.close - startBar.open) / startBar.open) * 100).toFixed(2));
      }
    }

    return {
      currentPrice,
      change24h,
      high1d,
      low1d,
      swingHigh4h,
      swingLow4h,
      localHigh1h,
      localLow1h,
      localHigh15m,
      localLow15m,
      rangePositionPct,
      resistance4h,
      support4h,
      nextZoneUp,
      nextZoneDown,
      fib618,
      fib786,
      structureTrend,
      channelUpper,
      channelLower,
      momentumRecentPct,
      lastCalculated: Date.now(),
    };
  } catch (err) {
    console.error(`[Surveillance] Error calculating state for ${symbol}:`, err);
    return null;
  }
}

export function formatSurveillanceTelegramMessage(
  coin: SurveillanceCoin,
  state: SurveillanceState,
  event: SurveillanceEvent
): string {
  const symbol = coin.symbol;
  const exchangeUpper = coin.exchange.toUpperCase();
  const marketUpper = coin.marketType.toUpperCase();
  const priceStr = formatPrice(state.currentPrice);
  const changeSign = state.change24h >= 0 ? '+' : '';
  const changeStr = `${changeSign}${state.change24h}%`;

  const typeIcons: Record<string, string> = {
    structure: '🔄',
    level: '🔔',
    momentum: '⚡',
    risk: '🌊',
  };
  const typeNames: Record<string, string> = {
    structure: 'СТРУКТУРА',
    level: 'РІВЕНЬ',
    momentum: 'ІМПУЛЬС',
    risk: 'КАНАЛ / РИЗИК',
  };

  const catIcon = typeIcons[event.type] || '🔔';
  const catName = typeNames[event.type] || 'СИСТЕМНИЙ АЛЕРТ';

  const modes = coin.config.triggerModes || (coin.config.triggerMode ? [coin.config.triggerMode] : ['bar_close']);
  const modeLabelsMap: Record<string, string> = {
    bar_close: 'Закриття 4H',
    bar_close_1h: 'Закриття 1H',
    bar_close_15m: 'Закриття 15m',
    realtime: 'Realtime',
  };
  const modeLabel = modes.map((m) => modeLabelsMap[m] || m).join(', ');

  const exchangeUrl =
    coin.exchange === 'binance'
      ? `https://www.binance.com/uk-UA/trade/${coin.baseAsset}_${coin.quoteAsset}`
      : `https://www.bybit.com/trade/usdt/${coin.symbol}`;

  return `🛰 <b>СИСТЕМНИЙ НАГЛЯД [SIGNALHOOK SURVEILLANCE]</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 <b>#${symbol}</b> • <b>${exchangeUpper} ${marketUpper}</b>
💰 <b>Ціна:</b> <code>$${priceStr}</code> (${changeStr})

${catIcon} <b>ТИП ПОДІЇ:</b> <b>${catName}</b>
🚨 <b>СТАТУС:</b> <b>${event.title}</b>
📝 <b>Деталі:</b> ${event.description}

📊 <b>СТАРШІ ТА ЛОКАЛЬНІ РІВНІ:</b>
• <b>4H Діапазон:</b> <code>$${formatPrice(state.support4h)}</code> — <code>$${formatPrice(state.resistance4h)}</code>
• <b>Старший Опір (4H/1D):</b> <code>$${formatPrice(state.resistance4h)}</code>
• <b>Старша Підтримка (4H/1D):</b> <code>$${formatPrice(state.support4h)}</code>
• <b>Локальний High (1H):</b> <code>$${formatPrice(state.localHigh1h)}</code> | <b>Low (1H):</b> <code>$${formatPrice(state.localLow1h)}</code>
• <b>Локальний High (15m):</b> <code>$${formatPrice(state.localHigh15m)}</code> | <b>Low (15m):</b> <code>$${formatPrice(state.localLow15m)}</code>

🎯 <b>ЦІЛІ ТА КЛЮЧОВІ ЗОНИ:</b>
• <b>Наступна зона:</b> <code>$${formatPrice(state.nextZoneUp)}</code>
• <b>Рівень скасування:</b> <code>$${formatPrice(state.nextZoneDown)}</code>
• <b>Fibonacci 0.618 (Golden Pocket):</b> <code>$${formatPrice(state.fib618)}</code>
${state.momentumRecentPct !== undefined ? `• <b>Імпульс (${coin.config.momentumBars} бари ${coin.config.momentumTf}):</b> <code>${state.momentumRecentPct >= 0 ? '+' : ''}${state.momentumRecentPct}%</code>\n` : ''}
⏱ <b>Режими підтвердження:</b> <code>${modeLabel}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 <a href="${exchangeUrl}">Перейти на біржу ${exchangeUpper}</a>`;
}

type SurveillanceCheckResult = { coin: SurveillanceCoin; newEvents: SurveillanceEvent[] };
const checkFlights = new ScopedSurveillanceChecks<SurveillanceCoin, SurveillanceCheckResult>(
  checkCoinSurveillanceInternal,
);

export function checkCoinSurveillance(
  requestedCoin: SurveillanceCoin,
  options: { forceCheck?: boolean; forceNotify?: boolean } | boolean = false
): Promise<SurveillanceCheckResult> {
  // Array keys keep identities isolated even if a user or coin ID contains ':'.
  const key = JSON.stringify([requestedCoin.userId, requestedCoin.id]);
  return checkFlights.check(key, requestedCoin, options);
}

async function checkCoinSurveillanceInternal(
  requestedCoin: SurveillanceCoin,
  options: SurveillanceCheckOptions,
): Promise<SurveillanceCheckResult> {
  const current = findSurveillanceCoinById(requestedCoin.id, requestedCoin.userId)?.coin;
  if (!current) return { coin: requestedCoin, newEvents: [] };
  const coin = structuredClone(current);
  const config = coin.config;
  const prevState = coin.state;
  const { forceCheck, forceNotify } = options;
  const frames = ['1d', '4h', '1h', '15m'] as const;
  const fetched = await Promise.all(frames.map(tf =>
    (forceCheck
      ? fetchKlines(coin.exchange, coin.marketType, coin.symbol, tf, tf === '4h' ? 80 : 60)
      : surveillanceCheckCandleCache.get(coin.exchange, coin.marketType, coin.symbol, tf,
          tf === '4h' ? 80 : 60)).catch(() => [])));
  const source = Object.fromEntries(frames.map((tf, i) => [tf, fetched[i]])) as Record<typeof frames[number], Kline[]>;
  // All users following the same candle snapshot share pure market analysis.
  // Event identities, notification thresholds and Telegram delivery remain per user.
  const publicStateFor = (candles: typeof source) =>
    sharedSurveillanceState.get(coin.exchange, coin.marketType, coin.symbol,
      config, candles, () => calculateSurveillanceState(
        coin.symbol, coin.exchange, coin.marketType, config, candles));
  const newState = await publicStateFor(source);
  if (!newState) return { coin, newEvents: [] };

  const now = Date.now();
  const processed = { '15m': 0, '1h': 0, '4h': 0, ...prevState?.lastProcessedCandleTimes };
  const modes = config.triggerModes || (config.triggerMode ? [config.triggerMode] : ['bar_close']);
  const closingModes = [
    ['4h', 'bar_close'], ['1h', 'bar_close_1h'], ['15m', 'bar_close_15m'],
  ] as const;
  const newEvents: SurveillanceEvent[] = [];

  for (const [tf, mode] of closingModes) {
    if (!modes.includes(mode)) continue;
    const closed = source[tf].filter(c => normalizeKlineTimeMs(c.time) + getTimeframeMs(tf) <= now);
    const candle = closed[closed.length - 1];
    if (!candle || closed.length < 3) continue;
    const startTime = normalizeKlineTimeMs(candle.time);
    // Legacy 4h state stored the live bucket instead of the last closed candle.
    if (processed[tf] > startTime) processed[tf] = startTime;
    if (startTime <= processed[tf]) continue;
    const previousProcessed = processed[tf];
    processed[tf] = startTime;
    // Establish a baseline when tracking starts; an old candle is not a new event.
    if (!prevState || !previousProcessed) continue;

    const causalSource = Object.fromEntries(frames.map(frame => [frame, source[frame].filter(c =>
      normalizeKlineTimeMs(c.time) + getTimeframeMs(frame) <= startTime)])) as typeof source;
    const levels = await publicStateFor(causalSource);
    if (!levels) continue;
    const previousClose = closed[closed.length - 2].close;
    const price = candle.close;
    const add = (kind: string, type: SurveillanceEvent['type'], title: string, description: string,
      severity: SurveillanceEvent['severity'], reference = '') => {
      newEvents.push({ id: `${kind}_${tf}_${startTime}_${reference}`, type, title, description, severity, price,
        timestamp: startTime + getTimeframeMs(tf),
        details: { timeframe: tf, triggerMode: mode, notificationType: kind, eventIdentity: `${kind}_${tf}_${reference}` },
      });
    };
    const crossing = (level: number, kind: string, label: string, severity: SurveillanceEvent['severity']) => {
      if (!(level > 0) || !Number.isFinite(level)) return;
      if (previousClose <= level && price > level) add(kind, 'level', `🔔 ${label}: пробій вгору ($${formatPrice(level)})`,
        `Свічка ${tf} закрилася вище рівня $${formatPrice(level)}.`, severity, String(level));
      else if (previousClose >= level && price < level) add(kind, 'level', `🔔 ${label}: пробій вниз ($${formatPrice(level)})`,
        `Свічка ${tf} закрилася нижче рівня $${formatPrice(level)}.`, severity, String(level));
    };
    if (config.levelsEnabled) {
      crossing(levels.resistance4h, 'LEVEL_CROSS_4H', 'Опір 4H', 'critical');
      crossing(levels.support4h, 'LEVEL_CROSS_4H', 'Підтримка 4H', 'critical');
      crossing(levels.localHigh1h, 'LEVEL_CROSS_1H', 'Максимум 1H', 'warning');
      crossing(levels.localLow1h, 'LEVEL_CROSS_1H', 'Мінімум 1H', 'warning');
      crossing(levels.localHigh15m, 'LEVEL_CROSS_15M', 'Максимум 15m', 'info');
      crossing(levels.localLow15m, 'LEVEL_CROSS_15M', 'Мінімум 15m', 'info');
    }
    if (config.channelEnabled) {
      if (previousClose <= levels.channelUpper && price > levels.channelUpper) add('CHANNEL_BREAKOUT', 'risk',
        '🌊 Вихід із каналу вгору', `Закриття ${tf} вище $${formatPrice(levels.channelUpper)}.`, 'warning', 'UP');
      else if (previousClose >= levels.channelLower && price < levels.channelLower) add('CHANNEL_BREAKOUT', 'risk',
        '🌊 Вихід із каналу вниз', `Закриття ${tf} нижче $${formatPrice(levels.channelLower)}.`, 'warning', 'DOWN');
    }
    const endTime = startTime + getTimeframeMs(tf);
    const completedSource = Object.fromEntries(frames.map(frame => [frame, source[frame].filter(c =>
      normalizeKlineTimeMs(c.time) + getTimeframeMs(frame) <= endTime)])) as typeof source;
    const completedState = await publicStateFor(completedSource);
    if (config.structureEnabled && completedState && levels.structureTrend !== completedState.structureTrend) add(
      'STRUCTURE_SHIFT', 'structure', `🔄 Зміна структури (${completedState.structureTrend.toUpperCase()})`,
      `Підтверджено закриттям ${tf}.`, 'critical', completedState.structureTrend);
    if (config.momentumEnabled && tf === config.momentumTf && completedState &&
        Math.abs(completedState.momentumRecentPct || 0) >= config.momentumPct) add('MOMENTUM', 'momentum',
      `⚡ Імпульс: ${completedState.momentumRecentPct}%`,
      `Рух за ${config.momentumBars} закритих свічок ${tf}.`, 'warning', completedState.momentumRecentPct! > 0 ? 'UP' : 'DOWN');
    if (config.fibonacciEnabled && levels.fib618 > 0 && Math.abs(price - levels.fib618) / levels.fib618 <= 0.0035 &&
        Math.abs(previousClose - levels.fib618) / levels.fib618 > 0.0035) add('FIBONACCI', 'level',
      '🎯 Тест Fibonacci 0.618', `Закриття ${tf} у зоні $${formatPrice(levels.fib618)}.`, 'info', String(levels.fib618));
  }

  const fresh = findSurveillanceCoinById(coin.id, coin.userId)?.coin;
  if (!fresh || fresh.isActive !== coin.isActive || JSON.stringify(fresh.config) !== JSON.stringify(config)) {
    return { coin: fresh || coin, newEvents: [] };
  }
  const allEvents = [...newEvents, ...(fresh.state?.recentEvents || [])];
  const ids = new Set<string>();
  const updatedCoin: SurveillanceCoin = { ...fresh, lastCheckedAt: new Date(now).toISOString(), state: {
    ...newState, lastProcessedCandleTimes: processed,
    lastEvent: newEvents[0] || fresh.state?.lastEvent,
    recentEvents: allEvents.filter(event => { if (ids.has(event.id)) return false; ids.add(event.id); return true; }).slice(0, 25),
  } };
  const cooldownMs = Math.max(0, config.cooldownMinutes ?? 15) * 60 * 1000;
  const lastNotified = fresh.lastNotifiedAt ? new Date(fresh.lastNotifiedAt).getTime() : 0;
  const event = newEvents.find(e => e.severity === 'critical') || newEvents.find(e => e.severity === 'warning') || newEvents[0];
  if ((event && now - lastNotified >= cooldownMs) || forceNotify) {
    const selected = event || { id: `manual_${now}`, type: 'risk' as const, title: '🛰 Ручна перевірка стану монети',
      description: 'Поточний стан отримано з обраної біржі.', severity: 'info' as const, price: newState.currentPrice, timestamp: now };
    const sent = await notificationRouter.dispatch({
      source: 'SURVEILLANCE', userId: coin.userId, coinId: coin.id, symbol: coin.symbol,
      exchange: coin.exchange, marketType: coin.marketType,
      eventType: selected.details?.notificationType || 'MANUAL_CHECK',
      timeframe: selected.details?.timeframe,
      eventIdentity: selected.details?.eventIdentity || selected.id,
      triggerMode: forceNotify ? 'manual' : selected.details?.triggerMode,
      htmlMessage: formatSurveillanceTelegramMessage(updatedCoin, { ...newState, currentPrice: selected.price }, selected),
      customCooldownMs: cooldownMs, forceNotify, coin: updatedCoin,
    });
    if (sent) updatedCoin.lastNotifiedAt = new Date().toISOString();
  }
  return { coin: updatedCoin, newEvents };
}

let isLoopRunning = false;
let monitorPassInFlight = false;

export async function checkAllUserCoins(userId: string): Promise<SurveillanceCoin[]> {
  const uid = userId && userId.trim() !== '' ? userId.trim() : 'guest';
  const list = [...(loadSurveillanceStore()[uid] || [])];
  if (list.length === 0) return [];

  let failedChecks = 0;
  for (const coin of list) {
    try {
      // #6: check-all runs with forceCheck: true (re-evaluates current levels) but forceNotify: false
      // This strictly enforces cooldown to prevent mass Telegram spam!
      const { coin: updated } = await checkCoinSurveillance(coin, { forceCheck: true, forceNotify: false });
      if (!hasFreshSurveillanceCheck(coin, updated))
        throw new Error('Біржа не надала актуальних свічок для перевірки');
      const committed = commitSurveillanceCheck(updated);
      if (!wasSurveillanceCheckCommitted(updated, committed))
        throw new Error('Монету видалено або налаштування змінено під час перевірки');
    } catch (error) {
      failedChecks++;
      console.error(`[Surveillance] Manual check failed for ${coin.symbol}:`, error);
    }
  }
  // A manual user request must not report a complete success if a durable
  // checkpoint failed. Other coins are still checked independently.
  if (failedChecks) throw new SurveillanceCheckIncompleteError(failedChecks);

  return loadSurveillanceList(uid);
}

export function startSurveillanceMonitor(intervalMs = 25000) {
  if (isLoopRunning) return;
  isLoopRunning = true;
  console.log(`[Surveillance] 24/7 Monitor started with interval ${intervalMs}ms`);

  // Start 24/7 Realtime Surveillance Engine
  try {
    surveillanceManager.start();
  } catch (e) {
    console.error('[Surveillance] Error starting surveillanceManager:', e);
  }

  setInterval(async () => {
    if (monitorPassInFlight) return;
    monitorPassInFlight = true;
    let lastPersistAt = Date.now();
    try {
      const activeItems = getAllActiveSurveillanceCoins();
      const activeKeys = new Set(activeItems.map(({ userId, coin }) =>
        JSON.stringify([userId, coin.id])));
      candleCloseCheckPlanner.prune(activeKeys);
      if (activeItems.length === 0) return;

      for (const { userId, coin } of activeItems) {
        const key = JSON.stringify([userId, coin.id]);
        if (!candleCloseCheckPlanner.due(key, coin.config, Date.now())) continue;
        try {
          const { coin: updated } = await checkCoinSurveillance(coin);
          const result = commitSurveillanceCheck(updated, { deferPersist: true });
          if (!result || !result.lastCheckedAt ||
              result.lastCheckedAt === coin.lastCheckedAt ||
              !candleCloseCheckPlanner.hasLatestClosedBars(
                coin.config, result.state?.lastProcessedCandleTimes, Date.now())) {
            // Missing exchange candles, changed account config, or a partial
            // server response: retry, don't sleep until the next bar close.
            candleCloseCheckPlanner.failed(key, coin.config, Date.now());
          } else {
            candleCloseCheckPlanner.succeeded(key, coin.config, Date.now());
          }
        } catch (e) {
          candleCloseCheckPlanner.failed(key, coin.config, Date.now());
          console.error(`[Surveillance] Failed to check coin ${coin.symbol} for user ${userId}:`, e);
        }
        // Keep at most a short window of routine measurements unflushed,
        // including when a full account scan takes longer than 25 seconds.
        if (Date.now() - lastPersistAt >= 5_000) {
          if (!flushDeferredSurveillanceChecks())
            console.error('[Surveillance] Failed to persist batched market measurements');
          lastPersistAt = Date.now();
        }
      }
    } catch (err) {
      console.error('[Surveillance] Error in monitor loop:', err);
    } finally {
      if (!flushDeferredSurveillanceChecks())
        console.error('[Surveillance] Failed to flush final market measurements');
      monitorPassInFlight = false;
    }
  }, intervalMs);
}
