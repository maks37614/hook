import { publicPriceFeed } from './publicPriceFeed';
import { AlertCheckScheduler } from './alertCheckScheduler';
import { persistenceMetrics } from './persistenceMetrics';
import { writePrivateJsonAtomic } from './privateAtomicJson';
import { publishSurveillanceAlert } from './surveillanceEvents';
import { exchangeFetch } from './exchangeHttp';
import { forEachBounded, selectRoundRobinBatch } from './priceAlertFallback';
import fs from 'fs';
import path from 'path';
import type { PriceAlert, AlertHistoryItem, ExchangeId, MarketType } from '../src/types';
import { sendUserTelegramMessage, getTelegramDelivery } from './telegramDelivery';
import { getUserTelegram, saveUserTelegram, loadUserTelegram } from './userTelegram';
export { getUserTelegram, saveUserTelegram, loadUserTelegram } from './userTelegram';
import type { SetupInstance } from './surveillance/types';
import { validateSetupAlertsMath } from './surveillance/setupValidation';
import { normalizeLanguage, telegramText, type SupportedLanguage } from '../src/locales';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const HISTORY_FILE = path.join(DATA_DIR, 'alert_history.json');
const DELETED_ALERTS_FILE = path.join(DATA_DIR, 'deleted_alerts.json');

// Ensure directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error('Failed to create server/data directory:', e);
    }
  }
}

// Format price nicely
function formatPrice(val: number): string {
  if (!val && val !== 0) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

// In-memory caches
let alertsCache: PriceAlert[] = [];
// A read-only lookup index for frequent /api/alerts requests. Rebuilt only
// when the persisted array changes, not on every browser refresh.
let alertsByUser: Map<string, PriceAlert[]> | null = null;
let indexedAlerts: PriceAlert[] | null = null;
let isAlertsLoaded = false;

let historyCache: AlertHistoryItem[] = [];
let historyByUser: Map<string, AlertHistoryItem[]> | null = null;
let processedHistoryIndex: Map<string, AlertHistoryItem> | null = null;
let indexedHistory: AlertHistoryItem[] | null = null;
let isHistoryLoaded = false;

let monitorInterval: any = null;
const deletedAlertIds = new Set<string>();
let areDeletedAlertIdsLoaded = false;
const alertIdentity = (userId: string, id: string) => `${userId}:${id}`;

function loadDeletedAlertIds() {
  if (areDeletedAlertIdsLoaded) return;
  ensureDataDir();
  if (fs.existsSync(DELETED_ALERTS_FILE)) {
    const stored: unknown = JSON.parse(fs.readFileSync(DELETED_ALERTS_FILE, 'utf-8'));
    if (!Array.isArray(stored) || stored.some(id => typeof id !== 'string')) {
      throw new Error('Invalid deleted alert persistence');
    }
    for (const id of stored) deletedAlertIds.add(id);
  }
  areDeletedAlertIdsLoaded = true;
}

function saveDeletedAlertIds() {
  ensureDataDir();
  // Must be durable before deleting the corresponding alert snapshot.
  writePrivateJsonAtomic(DELETED_ALERTS_FILE, JSON.stringify([...deletedAlertIds]));
}

export function getUserLanguage(userId?: string): SupportedLanguage {
  return normalizeLanguage(getUserTelegram(userId)?.language);
}

/** User actions must not acknowledge a change that failed to reach disk. */
function persistAlertEdit(next: PriceAlert[]): void {
  if (!saveAlerts(next)) throw new Error('Не вдалося зберегти цінові сповіщення. Повторіть спробу.');
}

/** A durable deletion tombstone prevents an out-of-date browser snapshot from
 * restoring an alert. Write tombstones first so even a later alerts.json
 * rename failure cannot rearm a deleted alert after a server restart. */
function commitAlertDeletion(identities: string[], next: PriceAlert[]): void {
  const added = identities.filter(identity => !deletedAlertIds.has(identity));
  for (const identity of added) deletedAlertIds.add(identity);
  try {
    saveDeletedAlertIds();
  } catch (error) {
    for (const identity of added) deletedAlertIds.delete(identity);
    throw error;
  }
  if (!saveAlerts(next)) {
    // The tombstone file is already durable; retain the same logical deletion
    // in memory, rather than continuing to monitor the now-deleted alert.
    alertsCache = next;
    alertsByUser = null;
    indexedAlerts = null;
    console.error('[Alerts] Tombstone saved but alerts.json rewrite failed; deletion remains effective');
  }
}

// --- Alerts persistence ---
export function loadAlerts(): PriceAlert[] {
  loadDeletedAlertIds();
  if (isAlertsLoaded) return alertsCache;
  try {
    ensureDataDir();
    if (fs.existsSync(ALERTS_FILE)) {
      const raw = fs.readFileSync(ALERTS_FILE, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Invalid alerts.json: expected an array');
      alertsCache = parsed;
    } else {
      alertsCache = [];
    }
  } catch (err) {
    // An unreadable/corrupt store must never be treated as empty: a later
    // successful save would otherwise permanently overwrite existing alerts.
    console.error('Failed to read alerts.json:', err);
    throw err;
  }
  alertsCache = alertsCache.filter(a => !deletedAlertIds.has(alertIdentity(a.userId || 'guest', a.id)));
  // Repair stale alert snapshots from the durable trigger history on startup.
  // A Telegram notification already processed must not be armed again.
  let repaired = false;
  for (const alert of alertsCache) {
    const history = findProcessedAlertHistory(alert);
    if (history && (!alert.triggered || alert.isActive || alert.deliveryPending)) {
      alert.triggered = true;
      alert.isActive = false;
      alert.triggeredAt = history.triggeredAt;
      alert.triggeredPrice = history.triggeredPrice;
      alert.deliveryPending = false;
      repaired = true;
    }
  }
  if (repaired && !saveAlerts(alertsCache)) {
    throw new Error('[Alerts] Could not persist restored triggered states; notification dispatch is unsafe');
  }
  // Do not expose the partially reconstructed store when history is unreadable.
  isAlertsLoaded = true;
  return alertsCache;
}

export function saveAlerts(alerts: PriceAlert[]): boolean {
  const started = performance.now();
  let bytes = 0;
  try {
    ensureDataDir();
    const payload = JSON.stringify(alerts);
    bytes = Buffer.byteLength(payload);
    writePrivateJsonAtomic(ALERTS_FILE, payload);
    alertsCache = alerts;
    alertsByUser = null;
    indexedAlerts = null;
    persistenceMetrics.record('alerts', performance.now() - started, bytes, true);
    return true;
  } catch (err) {
    persistenceMetrics.record('alerts', performance.now() - started, bytes, false);
    console.error('Failed to save alerts.json:', err);
    return false;
  }
}

// --- History persistence ---
export function loadHistory(): AlertHistoryItem[] {
  if (isHistoryLoaded) return historyCache;
  try {
    ensureDataDir();
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Invalid alert_history.json: expected an array');
      historyCache = parsed;
    } else {
      historyCache = [];
    }
  } catch (err) {
    // Preserve corrupt/unreadable history for recovery instead of wiping it.
    console.error('Failed to read alert_history.json:', err);
    throw err;
  }
  isHistoryLoaded = true;
  return historyCache;
}

export function saveHistory(items: AlertHistoryItem[]): boolean {
  const started = performance.now();
  let bytes = 0;
  try {
    ensureDataDir();
    const payload = JSON.stringify(items);
    bytes = Buffer.byteLength(payload);
    writePrivateJsonAtomic(HISTORY_FILE, payload);
    // A failed write must never make unpersisted history look durable.
    historyCache = items;
    historyByUser = null;
    processedHistoryIndex = null;
    indexedHistory = null;
    persistenceMetrics.record('alertHistory', performance.now() - started, bytes, true);
    return true;
  } catch (err) {
    persistenceMetrics.record('alertHistory', performance.now() - started, bytes, false);
    console.error('Failed to save alert_history.json:', err);
    return false;
  }
}

/** Completed alert cycles remain terminal across stale browser syncs and server restarts. */
function findProcessedAlertHistory(alert: PriceAlert): AlertHistoryItem | undefined {
  const history = loadHistory();
  if (indexedHistory !== history || !processedHistoryIndex) {
    const next = new Map<string, AlertHistoryItem>();
    for (const item of history) {
      // Preserve the first match in history order, as Array.find did.
      const key = JSON.stringify([item.userId, item.alertId, item.deliveryEpoch ?? 0]);
      if (!next.has(key)) next.set(key, item);
    }
    processedHistoryIndex = next;
    indexedHistory = history;
  }
  return processedHistoryIndex.get(JSON.stringify([
    alert.userId, alert.id, alert.deliveryEpoch ?? 0,
  ]));
}

export function getAlertHistory(userId?: string): AlertHistoryItem[] {
  if (!userId || userId === 'guest') return [];
  const all = loadHistory();
  if (!historyByUser) {
    historyByUser = new Map();
    for (const item of all) {
      const owner = item.userId || 'guest';
      let rows = historyByUser.get(owner);
      if (!rows) { rows = []; historyByUser.set(owner, rows); }
      rows.push(item);
    }
  }
  return (historyByUser.get(userId) || []).map(item => {
    const delivery = item.telegramDeliveryId ? getTelegramDelivery(userId, item.telegramDeliveryId) : undefined;
    return delivery ? { ...item, telegramSent: delivery.status === 'sent', telegramPending: delivery.status === 'pending', telegramError: delivery.error, telegramMessageIds: delivery.messageIds } : { ...item };
  });
}

export function addHistoryItem(item: AlertHistoryItem): void {
  const history = loadHistory();
  const ownHistory = [item, ...history.filter(entry =>
    entry.userId === item.userId &&
    !(item.alertId && entry.alertId === item.alertId && (entry.deliveryEpoch ?? 0) === (item.deliveryEpoch ?? 0))
  )].slice(0, 500);
  if (!saveHistory([...ownHistory, ...history.filter(entry => entry.userId !== item.userId)]))
    throw new Error('Не вдалося зберегти історію сповіщень');
}

export function clearAlertHistory(userId?: string): number {
  if (!userId || userId === 'guest') return 0;
  const history = loadHistory();
  const remaining = history.filter((h) => h.userId !== userId);
  const clearedCount = history.length - remaining.length;
  if (!clearedCount) return 0;
  if (!saveHistory(remaining)) throw new Error('Не вдалося очистити історію сповіщень');
  return clearedCount;
}

export function deleteHistoryItem(id: string, userId?: string): boolean {
  if (!userId || userId === 'guest') return false;
  const history = loadHistory();
  const filtered = history.filter((h) => !(h.id === id && h.userId === userId));
  if (filtered.length !== history.length) {
    if (!saveHistory(filtered)) throw new Error('Не вдалося видалити подію з історії');
    return true;
  }
  return false;
}

/** Rearming while an old delivery is unresolved would erase its durable intent. */
export class AlertDispatchPendingError extends Error {
  constructor() {
    super('Сповіщення ще очікує збереження доставки. Спробуйте пізніше.');
    this.name = 'AlertDispatchPendingError';
  }
}

// Get all alerts (strictly filtered by user, never leaked to guests)
export function getAllAlerts(userId?: string): PriceAlert[] {
  if (!userId || userId === 'guest') return [];
  const all = loadAlerts();
  if (indexedAlerts !== all || !alertsByUser) {
    const next = new Map<string, PriceAlert[]>();
    for (const alert of all) {
      const owner = alert.userId || 'guest';
      let rows = next.get(owner);
      if (!rows) { rows = []; next.set(owner, rows); }
      rows.push(alert);
    }
    indexedAlerts = all;
    alertsByUser = next;
  }
  // Never return the mutable indexed collection to caller code.
  // Returned snapshots must never grant a reader a mutable reference to
  // the source of truth. Only explicit persisted operations may change it.
  return alertsByUser.get(userId)?.map(alert => ({ ...alert })) ?? [];
}

// Create alert
export function createAlert(
  data: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & {
    id?: string;
    createdAt?: number;
    isActive?: boolean;
    userId?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
  }
): PriceAlert {
  const alerts = loadAlerts();
  const userId = data.userId || 'guest';

  if (data.language) saveUserTelegram(userId, { language: data.language });

  const userTg = getUserTelegram(userId);
  const effectiveLanguage = normalizeLanguage(data.language || userTg?.language);

  const alertId = data.id || `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  if (deletedAlertIds.has(alertIdentity(userId, alertId))) throw new Error('Сповіщення вже видалено');
  const existing = alerts.find(a => a.id === alertId && a.userId === userId);
  // The source-of-truth array belongs to the persistence layer. A duplicate
  // create is idempotent and must not expose a mutable reference to that array.
  if (existing) return { ...existing };

  const newAlert: PriceAlert = {
    id: alertId,
    userId,
    symbol: data.symbol.toUpperCase().replace('/', '').trim(),
    exchange: data.exchange,
    marketType: data.marketType,
    targetPrice: Number(data.targetPrice),
    condition: data.condition,
    note: data.note ? String(data.note).trim() : undefined,
    formationName: data.formationName ? String(data.formationName).trim() : undefined,
    levelType: data.levelType || 'custom',
    createdAt: data.createdAt || Date.now(),
    isActive: data.isActive !== undefined ? data.isActive : true,
    triggered: false,
    language: effectiveLanguage,
  };

  persistAlertEdit([newAlert, ...alerts]);
  return { ...newAlert };
}

// Create batch of alerts (e.g. 3 levels: Entry, Take-Profit, Stop-Loss)
export function createAlertsBatch(
  userId: string,
  alertsList: Array<
    Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & {
      id?: string;
      isActive?: boolean;
      telegramBotToken?: string;
      telegramChatId?: string;
    }
  >,
  telegramBotToken?: string,
  telegramChatId?: string,
  language?: SupportedLanguage
): PriceAlert[] {
  const alerts = loadAlerts();

  if (language) saveUserTelegram(userId, { language });

  const userTg = getUserTelegram(userId);
  const effectiveLanguage = normalizeLanguage(language || userTg?.language);

  const staged = [...alerts];
  const createdAlerts: PriceAlert[] = [];
  let index = 0;

  for (const item of alertsList) {
    const alertId = item.id || `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${index++}`;
    if (deletedAlertIds.has(alertIdentity(userId, alertId))) continue;
    const existing = staged.find(a => a.id === alertId && a.userId === userId);
    if (existing) {
      createdAlerts.push(existing);
      continue;
    }
    const newAlert: PriceAlert = {
      id: alertId,
      userId,
      symbol: item.symbol.toUpperCase().replace('/', '').trim(),
      exchange: item.exchange,
      marketType: item.marketType,
      targetPrice: Number(item.targetPrice),
      condition: item.condition,
      note: item.note ? String(item.note).trim() : undefined,
      formationName: item.formationName ? String(item.formationName).trim() : undefined,
      levelType: item.levelType || 'custom',
      createdAt: Date.now() + index,
      isActive: item.isActive !== undefined ? item.isActive : true,
      triggered: false,
      language: normalizeLanguage(item.language || effectiveLanguage),
    };

    staged.unshift(newAlert);
    createdAlerts.push(newAlert);
  }

  if (createdAlerts.some(alert => !alerts.includes(alert))) persistAlertEdit(staged);
  return createdAlerts.map(alert => ({ ...alert }));
}

/**
 * Creates an atomic group of 3 Price Alerts for a setup:
 * setupId
 *  ├── ENTRY
 *  ├── TARGET
 *  └── STOP
 *
 * Mathematically validates before creation:
 * For LONG:  STOP < ENTRY < TARGET
 * For SHORT: TARGET < ENTRY < STOP
 */
export function createSetupAlertsGroup(
  userId: string,
  setup: SetupInstance,
  currentPrice?: number,
  autoActivate = true
): { success: boolean; alerts?: PriceAlert[]; error?: string } {
  const mathValidation = validateSetupAlertsMath(setup);
  if (!mathValidation.valid) {
    return {
      success: false,
      error: mathValidation.reason || 'Mathematical validation failed for setup levels',
    };
  }

  const { entry, target, stop } = mathValidation;
  const curPrice = currentPrice || entry;

  // ENTRY:
  // For LONG: if currentPrice > entry, triggers when dropping to entry ('lte'); if below, when reclaiming ('gte')
  // For SHORT: if currentPrice < entry, triggers when bouncing to entry ('gte'); if above, when dropping ('lte')
  const entryCondition =
    setup.direction === 'LONG'
      ? curPrice >= entry
        ? 'lte'
        : 'gte'
      : curPrice <= entry
      ? 'gte'
      : 'lte';

  // TARGET:
  // For LONG: triggers when price rises to or exceeds target ('gte')
  // For SHORT: triggers when price falls to or drops below target ('lte')
  const targetCondition = setup.direction === 'LONG' ? 'gte' : 'lte';

  // STOP:
  // For LONG: triggers when price falls to or drops below stop ('lte')
  // For SHORT: triggers when price rises to or exceeds stop ('gte')
  const stopCondition = setup.direction === 'LONG' ? 'lte' : 'gte';

  const userTg = getUserTelegram(userId);
  const now = Date.now();

  const alertsToCreate: PriceAlert[] = [
    {
      id: `${setup.id}_ENTRY`,
      userId,
      setupId: setup.id,
      setupRole: 'ENTRY',
      symbol: setup.symbol.toUpperCase().replace('/', '').trim(),
      exchange: setup.exchange,
      marketType: setup.marketType,
      targetPrice: Number(entry),
      condition: entryCondition,
      levelType: 'entry',
      formationName: setup.type,
      note: `[Setup ${setup.direction}] Точка входу (${setup.type} ${setup.timeframe})`,
      createdAt: now,
      isActive: autoActivate,
      triggered: false,
      language: normalizeLanguage(userTg?.language),
    },
    {
      id: `${setup.id}_TARGET`,
      userId,
      setupId: setup.id,
      setupRole: 'TARGET',
      symbol: setup.symbol.toUpperCase().replace('/', '').trim(),
      exchange: setup.exchange,
      marketType: setup.marketType,
      targetPrice: Number(target),
      condition: targetCondition,
      levelType: 'target',
      formationName: setup.type,
      note: `[Setup ${setup.direction}] Ціль Take-Profit (TP) +${Math.abs(((target - entry) / entry) * 100).toFixed(1)}%`,
      createdAt: now + 1,
      isActive: autoActivate,
      triggered: false,
      language: normalizeLanguage(userTg?.language),
    },
    {
      id: `${setup.id}_STOP`,
      userId,
      setupId: setup.id,
      setupRole: 'STOP',
      symbol: setup.symbol.toUpperCase().replace('/', '').trim(),
      exchange: setup.exchange,
      marketType: setup.marketType,
      targetPrice: Number(stop),
      condition: stopCondition,
      levelType: 'stop_loss',
      formationName: setup.type,
      note: `[Setup ${setup.direction}] Скасування Stop-Loss (SL) -${Math.abs(((entry - stop) / entry) * 100).toFixed(1)}%`,
      createdAt: now + 2,
      isActive: autoActivate,
      triggered: false,
      language: normalizeLanguage(userTg?.language),
    },
  ];

  const alerts = loadAlerts();
  const staged = [...alerts];
  for (const newAlert of alertsToCreate) {
    if (deletedAlertIds.has(alertIdentity(userId, newAlert.id))) continue;
    const existingIdx = staged.findIndex((a) => a.id === newAlert.id && a.userId === userId);
    if (existingIdx >= 0) {
      // Repeated analysis must not rearm a fired setup or undo a manual pause.
      Object.assign(newAlert, staged[existingIdx]);
    } else {
      staged.unshift(newAlert);
    }
  }

  if (staged.length !== alerts.length) persistAlertEdit(staged);
  return { success: true, alerts: alertsToCreate.filter(a => !deletedAlertIds.has(alertIdentity(userId, a.id))).map(alert => ({ ...alert })) };
}

// Sync user alerts batch from the signed-in client with smart merge
export function syncUserAlerts(
  userId: string,
  userAlerts: PriceAlert[],
  telegramBotToken?: string,
  telegramChatId?: string,
  language?: SupportedLanguage
): PriceAlert[] {
  if (language) saveUserTelegram(userId, { language });

  const all = loadAlerts();
  const userTg = getUserTelegram(userId);
  const effectiveLanguage = normalizeLanguage(language || userTg?.language);

  // Map of existing alerts on server for this user
  const existingUserAlerts = new Map<string, PriceAlert>();
  for (const a of getAllAlerts(userId)) {
    existingUserAlerts.set(a.id, a);
  }

  // Merge incoming alerts
  const mergedUserAlerts: PriceAlert[] = [];
  const processedIds = new Set<string>();

  for (const rawIncoming of userAlerts) {
    const { telegramBotToken: _token, telegramChatId: _chat, ...incoming } = rawIncoming;
    if (incoming.userId && incoming.userId !== userId) continue;
    if (deletedAlertIds.has(alertIdentity(userId, incoming.id))) continue;
    // Multiple copies of one client alert can occur after reconnect/retry.
    // Accept only one identity per sync so a duplicate cannot create multiple
    // monitor entries or distort the user's alert count.
    if (processedIds.has(incoming.id)) continue;
    processedIds.add(incoming.id);
    const existing = existingUserAlerts.get(incoming.id);

    // The server is authoritative for an existing alert's lifecycle.
    // A delayed client snapshot must never re-arm a sent notification;
    // nor may an old triggered snapshot undo a deliberate manual restart.
    const processed = existing ? undefined : findProcessedAlertHistory({ ...incoming, userId });
    mergedUserAlerts.push({
      ...incoming,
      userId,
      isActive: existing ? existing.isActive : processed ? false : incoming.isActive,
      triggered: existing ? existing.triggered : processed ? true : incoming.triggered,
      triggeredAt: existing ? existing.triggeredAt : processed ? processed.triggeredAt : incoming.triggeredAt,
      triggeredPrice: existing ? existing.triggeredPrice : processed ? processed.triggeredPrice : incoming.triggeredPrice,
      deliveryEpoch: existing ? existing.deliveryEpoch : incoming.deliveryEpoch,
      // Browser sync never owns the durable dispatch checkpoint.
      deliveryPending: existing ? existing.deliveryPending : false,
      language: normalizeLanguage(incoming.language || existing?.language || effectiveLanguage),
    });
  }

  // Absence in a stale browser snapshot is not a deletion. Deletions use the DELETE endpoint.
  for (const [id, existing] of existingUserAlerts.entries()) {
    if (!processedIds.has(id)) {
      mergedUserAlerts.push({
        ...existing,
        telegramBotToken: undefined,
        telegramChatId: undefined,
        language: normalizeLanguage(existing.language || effectiveLanguage),
      });
    }
  }

  // Avoid rewriting the entire global alerts.json file for a no-op browser
  // synchronization. A thousand idle users used to cause frequent synchronous
  // filesystem writes even when their alert states had not changed.
  const changed = mergedUserAlerts.length !== existingUserAlerts.size
    || mergedUserAlerts.some(alert => {
      const previous = existingUserAlerts.get(alert.id);
      return !previous || JSON.stringify(previous) !== JSON.stringify(alert);
    });
  if (changed) {
    const otherAlerts = all.filter((a) => a.userId !== userId);
    persistAlertEdit([...mergedUserAlerts, ...otherAlerts]);
  }

  return mergedUserAlerts.map(alert => ({ ...alert }));
}

// Delete alert
export function deleteAlert(id: string, userId?: string): boolean {
  if (!userId || userId === 'guest') return false;
  const alerts = loadAlerts();
  const initialCount = alerts.length;
  const filtered = alerts.filter(a => !(a.id === id && a.userId === userId));
  // Record the tombstone even if DELETE arrives before a delayed create.
  commitAlertDeletion([alertIdentity(userId, id)], filtered);
  return filtered.length !== initialCount;
}

// Toggle alert active state
export function toggleAlert(id: string, userId?: string, isActive?: boolean): PriceAlert | null {
  if (!userId || userId === 'guest') return null;
  const alerts = loadAlerts();
  const index = alerts.findIndex((a) => a.id === id && a.userId === userId);
  if (index >= 0) {
    const alert = { ...alerts[index] };
    alert.isActive = isActive ?? !alert.isActive;
    // Only this explicit user action starts a new delivery cycle.
    if (alert.isActive && alert.triggered) {
      // Restarting an unfinished cycle would erase its only durable dispatch
      // intent. Explicit deletion/clear remains available to cancel it.
      if (alert.deliveryPending) throw new AlertDispatchPendingError();
      alert.deliveryEpoch = (alert.deliveryEpoch ?? 0) + 1;
      alert.triggered = false;
      alert.triggeredAt = undefined;
      alert.triggeredPrice = undefined;
    }
    const staged = alerts.slice();
    staged[index] = alert;
    persistAlertEdit(staged);
    return { ...alert };
  }
  return null;
}

// Clear triggered alerts
export function clearTriggeredAlerts(userId?: string): number {
  if (!userId || userId === 'guest') return 0;
  const alerts = loadAlerts();
  const remaining = alerts.filter((a) => {
    if (!a.triggered) return true;
    if (a.userId !== userId) return true;
    return false;
  });
  const clearedCount = alerts.length - remaining.length;
  if (clearedCount === 0) return 0;
  const identities = alerts.filter(alert => alert.triggered && alert.userId === userId)
    .map(alert => alertIdentity(userId, alert.id));
  commitAlertDeletion(identities, remaining);
  return clearedCount;
}

// HTML escaping helper for Telegram
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Fetch single ticker price from exchange with robust cross-exchange fallbacks
async function fetchCurrentPrice(exchange: ExchangeId, market: MarketType, symbol: string): Promise<number | null> {
  const cleanSymbol = symbol.toUpperCase().replace('/', '').trim();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };

  const urls = exchange === 'binance'
    ? market === 'futures'
      ? [`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${cleanSymbol}`]
      : [`https://data-api.binance.vision/api/v3/ticker/price?symbol=${cleanSymbol}`,
         `https://api.binance.com/api/v3/ticker/price?symbol=${cleanSymbol}`]
    : [`https://api.bybit.com/v5/market/tickers?category=${market === 'futures' ? 'linear' : 'spot'}&symbol=${cleanSymbol}`,
       `https://api.bytick.com/v5/market/tickers?category=${market === 'futures' ? 'linear' : 'spot'}&symbol=${cleanSymbol}`];
  for (const url of urls) {
    try {
      const res = await exchangeFetch(url, { headers, signal: AbortSignal.timeout(3500) });
      if (!res.ok) continue;
      const data = await res.json();
      const price = Number(exchange === 'binance' ? data.price : data?.result?.list?.[0]?.lastPrice);
      if (Number.isFinite(price) && price > 0) return price;
    } catch {}
  }

  return null;
}

const PRICE_REST_FALLBACK_MAX_PER_CYCLE = 16;
const PRICE_REST_FALLBACK_PARALLEL = 8;
let fallbackCursor = 0;
let fallbackLast = { missingStreamPrices: 0, restPriceChecks: 0, streamPrices: 0 };
export function priceAlertFallbackStats() { return { ...fallbackLast,
  maxRestPerCycle: PRICE_REST_FALLBACK_MAX_PER_CYCLE,
  maxConcurrentRest: PRICE_REST_FALLBACK_PARALLEL }; }

// The background cron may skip an overlapping pass, but an explicit user's
// manual check is queued and awaited instead of falsely returning success.
const alertCheckScheduler = new AlertCheckScheduler(checkAlertsInternal);
export const priceAlertCheckStats = () => alertCheckScheduler.stats();
export function checkAlertsOnce(userId?: string): Promise<void> {
  return alertCheckScheduler.check(userId);
}

async function checkAlertsInternal(userId?: string) {
  const alerts = loadAlerts();
  // These alerts were explicitly created on the independent Price Alerts page.
  // Browser-only profile switches must not block monitoring or Telegram here.
  const allActive = alerts.filter(a => a.isActive && !a.triggered
    && Boolean(a.userId) && a.userId !== 'guest');
  // A manual /api/cron/run for one user must NEVER replace the global
  // exchange subscription universe with that user's private subset.
  // Keep network subscriptions global but evaluate/notify only the caller.
  const activeAlerts = userId ? allActive.filter(a => a.userId === userId) : allActive;
  // The fired marker and the dispatch intent are committed together. If
  // Telegram queue creation, history persistence, or the process crashes
  // afterwards, the next pass can resume using the *same* delivery epoch.
  // Only new-style alerts with this explicit durable intent are replayed:
  // old fired alerts whose history was cleared must never fire again.
  const recoverable = alerts.filter(a => a.deliveryPending === true && a.triggered
    && !a.isActive && Boolean(a.userId) && a.userId !== 'guest'
    && Number.isSafeInteger(a.triggeredAt) && Number.isFinite(a.triggeredPrice)
    && (userId === undefined || a.userId === userId));
  const watched = new Map<string, { exchange: ExchangeId; market: MarketType; symbol: string }>();
  for (const alert of allActive) {
    const key = `${alert.exchange}:${alert.marketType}:${alert.symbol}`;
    if (!watched.has(key))
      watched.set(key, { exchange: alert.exchange, market: alert.marketType, symbol: alert.symbol });
  }
  publicPriceFeed.watch([...watched.values()]);
  if (activeAlerts.length === 0 && recoverable.length === 0) return;

  // Group prices only for the subset actually being checked.
  const uniqueKeys = new Map<string, { exchange: ExchangeId; market: MarketType; symbol: string }>();
  for (const a of activeAlerts) {
    const key = `${a.exchange}:${a.marketType}:${a.symbol}`;
    if (!uniqueKeys.has(key))
      uniqueKeys.set(key, { exchange: a.exchange, market: a.marketType, symbol: a.symbol });
  }

  // Prefer one shared live quote per instrument. During an exchange WebSocket
  // outage, checking *all* missing prices in parallel would overload the VPS
  // and possibly exhaust Binance/Bybit REST rate limits.
  const priceMap = new Map<string, number>();
  const missing: Array<[string, { exchange: ExchangeId; market: MarketType; symbol: string }]> = [];
  for (const [key, item] of uniqueKeys) {
    const live = publicPriceFeed.current({ exchange: item.exchange, market: item.market, symbol: item.symbol });
    if (live !== null && Number.isFinite(live) && live > 0) priceMap.set(key, live);
    else missing.push([key, item]);
  }
  const batch = selectRoundRobinBatch(missing, fallbackCursor, PRICE_REST_FALLBACK_MAX_PER_CYCLE);
  fallbackCursor = batch.nextCursor;
  fallbackLast = { missingStreamPrices: missing.length, restPriceChecks: batch.selected.length,
    streamPrices: priceMap.size };
  await forEachBounded(batch.selected, PRICE_REST_FALLBACK_PARALLEL, async ([key, item]) => {
    const price = await fetchCurrentPrice(item.exchange, item.market, item.symbol);
    if (price !== null && Number.isFinite(price) && price > 0) priceMap.set(key, price);
  });

  // Price-alert cycles run every six seconds. Index the *current* in-memory
  // collections once, instead of scanning all users' alerts and history for
  // every candidate (quadratic work when many users configure alerts).
  // Rebuild after a concurrent API mutation replaces the collection, so an
  // alert deleted/paused while awaiting prices cannot be sent accidentally.
  let alertList: PriceAlert[] | undefined;
  let alertByIdentity = new Map<string, PriceAlert>();
  const currentAlert = (candidate: PriceAlert): PriceAlert | undefined => {
    const list = loadAlerts();
    if (list !== alertList) {
      alertList = list;
      alertByIdentity = new Map<string, PriceAlert>(list.map(alert =>
        [JSON.stringify([alert.userId, alert.id]), alert]));
    }
    return alertByIdentity.get(JSON.stringify([candidate.userId, candidate.id]));
  };
  let recordedHistory: AlertHistoryItem[] | undefined;
  let processedByIdentity = new Map<string, AlertHistoryItem>();
  const processedAlert = (alert: PriceAlert): AlertHistoryItem | undefined => {
    const history = loadHistory();
    if (history !== recordedHistory) {
      recordedHistory = history;
      processedByIdentity = new Map();
      for (const record of history) {
        const key = JSON.stringify([record.userId, record.alertId, record.deliveryEpoch ?? 0]);
        // Retain the same first-match semantics as findProcessedAlertHistory.
        if (!processedByIdentity.has(key)) processedByIdentity.set(key, record);
      }
    }
    return processedByIdentity.get(JSON.stringify([alert.userId, alert.id, alert.deliveryEpoch ?? 0]));
  };

  for (const candidate of [...recoverable, ...activeAlerts]) {
    let alert = currentAlert(candidate);
    if (!alert) continue;
    const recovering = alert.deliveryPending === true && alert.triggered && !alert.isActive;
    if (!recovering && (!alert.isActive || alert.triggered)) continue;
    const prior = processedAlert(alert);
    if (prior) {
      const restored = { ...alert, triggered: true, isActive: false,
        deliveryPending: false,
        triggeredAt: prior.triggeredAt, triggeredPrice: prior.triggeredPrice };
      if (!recovering || alert.deliveryPending) {
        if (!saveAlerts(loadAlerts().map(entry => entry === alert ? restored : entry)))
          throw new Error('[Alerts] Failed to finalize a previously fired notification');
      }
      continue;
    }
    const key = `${alert.exchange}:${alert.marketType}:${alert.symbol}`;
    const currentPrice = recovering ? alert.triggeredPrice : priceMap.get(key);
    if (currentPrice === undefined || !Number.isFinite(currentPrice) || currentPrice <= 0) continue;

    let isTriggered = recovering;
    if (alert.condition === 'gte' && currentPrice >= alert.targetPrice) {
      isTriggered = true;
    } else if (alert.condition === 'lte' && currentPrice <= alert.targetPrice) {
      isTriggered = true;
    }

    if (isTriggered) {
      if (!recovering) {
        const fired = { ...alert, triggered: true, isActive: false,
          deliveryPending: true, triggeredAt: Date.now(), triggeredPrice: currentPrice };
        if (!saveAlerts(loadAlerts().map(entry => entry === alert ? fired : entry))) {
          // Never send Telegram before the durable fired marker and intent.
          console.error('[Alerts] Could not persist fired state; skipped Telegram notification');
          continue;
        }
        alert = fired;
        // Price alert was durably fired. Notify this owner's open browser
        // immediately, BEFORE any slow Telegram HTTP/send retry. The stream
        // carries only a version invalidation, never private alert contents.
        publishSurveillanceAlert(alert.userId || '');
      }

      console.log(`[ALERT TRIGGERED] ${alert.symbol} target: ${alert.targetPrice}, live price: ${currentPrice}, condition: ${alert.condition}`);

      const language = normalizeLanguage(getUserTelegram(alert.userId)?.language || alert.language);
      const localeTag: Record<SupportedLanguage, string> = {
        uk: 'uk-UA',
        en: 'en-US',
        ru: 'ru-RU',
        pl: 'pl-PL',
      };
      const timeStr = new Date(alert.triggeredAt).toLocaleTimeString(localeTag[language], { timeZone: 'Europe/Kyiv' });
      const dateStr = new Date(alert.triggeredAt).toLocaleDateString(localeTag[language], { timeZone: 'Europe/Kyiv' });

      const levelKey =
        alert.levelType === 'entry' ? 'levelEntry' :
        alert.levelType === 'target' ? 'levelTarget' :
        alert.levelType === 'stop_loss' ? 'levelStop' :
        'levelCustom';
      const levelTitle = telegramText(language, levelKey);
      const conditionLabel = telegramText(language, alert.condition === 'gte' ? 'conditionGte' : 'conditionLte');

      const safeSymbol = escapeHtml(alert.symbol);
      const safeFormation = alert.formationName ? escapeHtml(alert.formationName) : '';
      const safeNote = alert.note ? escapeHtml(alert.note) : '';
      const formationLine = safeFormation ? telegramText(language, 'formationLine', { formation: safeFormation }) : '';
      const levelLine = alert.levelType ? telegramText(language, 'levelLine', { level: levelTitle }) : '';
      const noteLine = safeNote ? telegramText(language, 'noteLine', { note: safeNote }) : '';

      const message = `${telegramText(language, 'priceAlertTitle')}\n\n${telegramText(language, 'priceAlertBody', {
        symbol: safeSymbol,
        exchange: alert.exchange.toUpperCase(),
        market: alert.marketType.toUpperCase(),
        currentPrice: formatPrice(currentPrice),
        targetPrice: formatPrice(alert.targetPrice),
        condition: conditionLabel,
        formationLine,
        levelLine,
        noteLine,
        date: dateStr,
        time: timeStr,
      })}`;

      let telegramSent = false;
      let telegramError: string | undefined = undefined;
      let telegramDeliveryId: string | undefined;
      let telegramMessageIds: number[] | undefined;
      let telegramPending = false;

      const telegramConfig = getUserTelegram(alert.userId || '');
      const userAllowedTelegram = Boolean(telegramConfig?.botToken
        && telegramConfig?.chatId && telegramConfig?.confirmedAt);
      try {
        if (!userAllowedTelegram) {
          telegramError = 'Налаштування Telegram не підключені або не підтверджені';
        } else {
        const sendRes = await sendUserTelegramMessage(alert.userId || '', message, `price:${alert.id}:epoch:${alert.deliveryEpoch ?? 0}`);
        telegramDeliveryId = sendRes.deliveryId;
        telegramMessageIds = sendRes.messageIds;
        telegramPending = Boolean(sendRes.queued);
        if (sendRes.success) {
          telegramSent = true;
          console.log(`[ALERT DISPATCHED] Successfully sent Telegram alert for ${alert.symbol} to user: ${alert.userId || 'default'}`);
        } else {
          telegramError = sendRes.error;
          console.warn(`[ALERT DISPATCH WARNING] Telegram notification for ${alert.symbol} was not delivered:`, sendRes.error);
        }
        }
      } catch (dispatchErr: any) {
        telegramError = dispatchErr?.message || telegramText(language, 'sendError');
        console.error(`[ALERT DISPATCH ERROR] Failed to send Telegram alert for ${alert.symbol}:`, dispatchErr);
      }

      // A configured Telegram recipient requires a durable queue record.
      // A disk failure or queue-capacity rejection must not permanently
      // mark the alert's dispatch as complete; replay it next monitor pass.
      if (userAllowedTelegram && !telegramDeliveryId) {
        console.warn('[Alerts] Telegram enqueue was not confirmed; keeping durable dispatch intent');
        continue;
      }

      // Record in Alert History
      const historyItem: AlertHistoryItem = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        userId: alert.userId || 'guest',
        alertId: alert.id,
        symbol: alert.symbol,
        exchange: alert.exchange,
        marketType: alert.marketType,
        condition: alert.condition,
        targetPrice: alert.targetPrice,
        triggeredPrice: currentPrice,
        formationName: alert.formationName,
        levelType: alert.levelType,
        note: alert.note,
        triggeredAt: alert.triggeredAt,
        telegramSent,
        telegramError,
        telegramDeliveryId,
        deliveryEpoch: alert.deliveryEpoch ?? 0,
        telegramMessageIds,
        telegramPending,
        createdAt: new Date().toISOString(),
      };
      addHistoryItem(historyItem);
      // Commit the completed dispatch only *after* the history is durable.
      // If this write fails, the next pass sees history and finalizes without
      // resending. Never overwrite a user-initiated new epoch or a deletion.
      const latest = currentAlert(alert);
      if (latest?.deliveryPending && latest.triggered
          && latest.triggeredAt === alert.triggeredAt
          && (latest.deliveryEpoch ?? 0) === (alert.deliveryEpoch ?? 0)) {
        if (!saveAlerts(loadAlerts().map(entry =>
          entry === latest ? { ...entry, deliveryPending: false } : entry)))
          throw new Error('[Alerts] Could not finalize durable Telegram dispatch intent');
      }
    }
  }

}

// Start background monitor loop
export function startAlertMonitor(intervalMs: number = 6000) {
  if (monitorInterval) return;
  loadAlerts();
  loadHistory();
  loadUserTelegram();
  monitorInterval = setInterval(() => {
    checkAlertsOnce().catch((err) => {
      console.error('Error during alert check iteration:', err);
    });
  }, intervalMs);
  console.log(`Telegram price alert monitor started (interval: ${intervalMs}ms)`);
}

// Stop monitor
export function stopAlertMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
