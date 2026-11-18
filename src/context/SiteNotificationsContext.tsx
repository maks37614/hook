import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useAlerts } from './AlertsContext';
import { useSurveillance } from './SurveillanceContext';
import { useAppPreferences } from '../utils/userPreferences';
import {
  DEFAULT_SITE_NOTIFICATIONS, ImpulseTracker, normalizeSiteNotificationSettings,
  notificationEnabled, readNotificationItems, siteNotificationSettingsKey, siteNotificationStorageKey,
  siteNotificationClearedAtKey, siteNotificationSeenKey, siteNotificationMuteKey,
  applyLocalNotificationMute, normalizeNotificationFavoriteIds,
  type SiteNotificationItem, type SiteNotificationKind, type SiteNotificationSettings, type SiteNotificationSound,
} from '../utils/siteNotifications';
import { playSiteNotificationSound, stopCustomNotificationSound } from '../utils/domSound';
import type { ScannedCoin } from '../types';
import { scanNotificationSignals, marketSurveillanceSignal, liquidationNotificationSignal, LiquidationCascadeTracker, QualityScoreTracker, ProximityAlertTracker, NotificationCooldownTracker } from '../utils/notificationSignals';
import { matchesNotificationScope } from '../utils/siteNotifications';

interface NewSiteNotification {
  id: string;
  kind: SiteNotificationKind;
  title: string;
  description: string;
  timestamp?: number;
  symbol?: string;
  changePct?: number;
  rangePct?: number;
  exchange?: string;
  marketType?: string;
  timeframe?: string;
}
interface SiteNotificationsValue {
  settings: SiteNotificationSettings;
  updateSettings: (patch: Partial<SiteNotificationSettings>) => Promise<void>;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  items: SiteNotificationItem[];
  unreadCount: number;
  emit: (event: NewSiteNotification) => void;
  processScan: (coins: readonly ScannedCoin[], favorites?: readonly string[]) => void;
  setFavoriteIds: (favorites: readonly string[]) => void;
  markAllRead: () => void;
  clear: () => void;
  error: string | null;
}
const Context = createContext<SiteNotificationsValue | null>(null);

/** Safari privacy modes may disable storage; the notification center must still render. */
function loadStoredItems(uid: string): SiteNotificationItem[] {
  try { return readNotificationItems(localStorage.getItem(siteNotificationStorageKey(uid))); }
  catch { return []; }
}

function loadSeen(uid: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(siteNotificationSeenKey(uid)) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string').slice(-5000) : []);
  } catch { return new Set(); }
}
function locallyMutedAt(uid: string): number {
  try { return Math.max(0, Number(localStorage.getItem(siteNotificationMuteKey(uid))) || 0); }
  catch { return 0; }
}
function soundStorageKey(uid: string): string { return 'h00k_site_notification_sound_v1:' + uid; }
function readStoredSound(uid: string): boolean {
  try { return localStorage.getItem(soundStorageKey(uid)) === 'true'; } catch { return false; }
}
function changePendingCount(map: Map<string, number>, uid: string, delta: number): void {
  const next = (map.get(uid) || 0) + delta;
  if (next <= 0) map.delete(uid);
  else map.set(uid, next);
}

export const SiteNotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const { history } = useAlerts();
  const { allEvents, coins: surveillanceCoins, loading: surveillanceLoading } = useSurveillance();
  const { preferences, updatePreferences } = useAppPreferences();
  const uid = user?.uid || 'guest';

  // The browser is authoritative: never let a delayed legacy profile
  // snapshot overwrite local opt-in/out and category selection.
  const loadSettings = (id: string, currentProfile: unknown): SiteNotificationSettings => {
    let source: unknown = null;
    try {
      const stored = localStorage.getItem(siteNotificationSettingsKey(id));
      if (stored !== null) source = JSON.parse(stored);
    } catch { /* Private browsing can reject local storage. */ }
    if (source === null) source = currentProfile ?? null;
    return applyLocalNotificationMute(normalizeSiteNotificationSettings(source), locallyMutedAt(id));
  };
  const [settingsState, setSettingsState] = useState<{ uid: string; settings: SiteNotificationSettings }>(
    () => ({ uid, settings: loadSettings(uid, profile?.uid === uid ? profile.siteNotificationSettings : undefined) })
  );
  const settings = settingsState.uid === uid ? settingsState.settings
    : loadSettings(uid, profile?.uid === uid ? profile.siteNotificationSettings : undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [itemState, setItemState] = useState<{ uid: string; items: SiteNotificationItem[] }>(() => ({
    uid, items: loadStoredItems(uid),
  }));
  const items = itemState.uid === uid ? itemState.items
    : loadStoredItems(uid);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const surveillanceSeen = useRef<{ uid: string; initialized: boolean; ids: Set<string> }>({ uid, initialized: false, ids: new Set() });
  const deliveredSeen = useRef<{ uid: string; ids: Set<string> }>({ uid, ids: loadSeen(uid) });
  const uidRef = useRef(uid);
  const favoritesRef = useRef<readonly string[]>([]);
  const qualityRef = useRef<{ uid: string; tracker: QualityScoreTracker }>({
    uid, tracker: new QualityScoreTracker(),
  });
  const proximityRef = useRef<{ uid: string; tracker: ProximityAlertTracker }>({
    uid, tracker: new ProximityAlertTracker(),
  });
  const cooldownRef = useRef<{ uid: string; tracker: NotificationCooldownTracker }>({
    uid, tracker: new NotificationCooldownTracker(),
  });
  uidRef.current = uid;
  const soundEnabledRef = useRef(preferences.soundAlertsEnabled);
  soundEnabledRef.current = preferences.soundAlertsEnabled;
  const [error, setError] = useState<string | null>(null);
  const visibleBrowserNotificationsRef = useRef(new Set<Notification>());
  const closeVisibleBrowserNotifications = useCallback(() => {
    for (const notification of visibleBrowserNotificationsRef.current) {
      try { notification.close(); } catch { /* Browser already dismissed it. */ }
    }
    visibleBrowserNotificationsRef.current.clear();
  }, []);

  useEffect(() => {
    closeVisibleBrowserNotifications();
    stopCustomNotificationSound();
    setSettingsState({ uid, settings: loadSettings(uid, profile?.uid === uid ? profile.siteNotificationSettings : undefined) });
    setItemState({ uid, items: loadStoredItems(uid) });
    deliveredSeen.current = { uid, ids: loadSeen(uid) };
    setError(null);
    const currentSettings = loadSettings(uid, profile?.uid === uid ? profile.siteNotificationSettings : undefined);
    // The sound is per device: old profile values are read only during the
    // one-time local migration below.
    const selectedSound = currentSettings.optedIn ? readStoredSound(uid) : false;
    updatePreferences({ soundAlertsEnabled: currentSettings.enabled ? selectedSound : false });
  }, [uid, updatePreferences, closeVisibleBrowserNotifications]);

  // One-time migration from previously synchronized profile preferences.
  // The first local choice always wins and future edits never hit any API.
  useEffect(() => {
    if (profile?.uid !== uid) return;
    let localConfig: string | null = null;
    let localSound: string | null = null;
    try {
      localConfig = localStorage.getItem(siteNotificationSettingsKey(uid));
      localSound = localStorage.getItem(soundStorageKey(uid));
    } catch { /* Storage may be restricted. */ }

    if (localConfig === null && profile.siteNotificationSettings) {
      const migrated = loadSettings(uid, profile.siteNotificationSettings);
      settingsRef.current = migrated;
      setSettingsState({ uid, settings: migrated });
      try { localStorage.setItem(siteNotificationSettingsKey(uid), JSON.stringify(migrated)); } catch {}
    }
    if (localSound === null && typeof profile.soundAlertsEnabled === 'boolean') {
      try { localStorage.setItem(soundStorageKey(uid), String(profile.soundAlertsEnabled)); } catch {}
      updatePreferences({ soundAlertsEnabled: settingsRef.current.enabled
        && settingsRef.current.optedIn && profile.soundAlertsEnabled });
    }
  }, [uid, profile?.uid, profile?.siteNotificationSettings, profile?.soundAlertsEnabled, updatePreferences]);

  // A second open tab must stop showing browser notifications immediately.
  // The storage event fires in the OTHER tabs; the initiating tab updates its
  // own settingsRef synchronously in updateSettings.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === siteNotificationSeenKey(uid)) {
        // Keep already delivered IDs synchronized across tabs so a second
        // screener tab does not replay the same notification on its next scan.
        const saved = loadSeen(uid);
        if (deliveredSeen.current.uid !== uid)
          deliveredSeen.current = { uid, ids: saved };
        else
          for (const id of saved) deliveredSeen.current.ids.add(id);
        return;
      }
      if (event.key !== siteNotificationMuteKey(uid)
        && event.key !== siteNotificationSettingsKey(uid)) return;
      const fromStorage = loadSettings(uid, null);
      settingsRef.current = fromStorage;
      setSettingsState({ uid, settings: fromStorage });
      if (!fromStorage.enabled) {
        closeVisibleBrowserNotifications();
        stopCustomNotificationSound();
        soundEnabledRef.current = false;
        updatePreferences({ soundAlertsEnabled: false });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [uid, updatePreferences, closeVisibleBrowserNotifications]);

  // This center is browser-only. Server-side Telegram controls belong to
  // independent price-alert and surveillance pages, never to this profile tab.

  const replaceItems = useCallback((next: SiteNotificationItem[]) => {
    const currentUid = uidRef.current;
    const limited = next.slice(0, 100);
    itemsRef.current = limited;
    setItemState({ uid: currentUid, items: limited });
    try { localStorage.setItem(siteNotificationStorageKey(currentUid), JSON.stringify(limited)); } catch {}
  }, []);

  const updateSettings = useCallback(async (patch: Partial<SiteNotificationSettings>) => {
    const currentUid = uidRef.current;
    const disabling = patch.enabled === false;
    const enabling = patch.enabled === true;
    const next = normalizeSiteNotificationSettings({ ...settingsRef.current, ...patch,
      ...(patch.onlyFavorites === true && patch.favoriteIds === undefined
        ? { favoriteIds: normalizeNotificationFavoriteIds(favoritesRef.current) } : {}),
      optedIn: settingsRef.current.optedIn || enabling,
      enabledAt: enabling && !settingsRef.current.enabled
        ? Date.now() : settingsRef.current.enabledAt });
    if (disabling) {
      closeVisibleBrowserNotifications();
      stopCustomNotificationSound();
      try { localStorage.setItem(siteNotificationMuteKey(currentUid),
        String(Math.max(Date.now(), settingsRef.current.enabledAt + 1))); } catch {}
      soundEnabledRef.current = false;
      updatePreferences({ soundAlertsEnabled: false });
      try { localStorage.setItem(soundStorageKey(currentUid), 'false'); } catch {}
    } else if (enabling) {
      try { localStorage.removeItem(siteNotificationMuteKey(currentUid)); } catch {}
    }
    settingsRef.current = next;
    setSettingsState({ uid: currentUid, settings: next });
    try {
      localStorage.setItem(siteNotificationSettingsKey(currentUid), JSON.stringify(next));
      setError(null);
    } catch {
      setError('Браузер не дозволяє зберегти налаштування. Перевірте доступ до локального сховища.');
    }
  }, [updatePreferences, closeVisibleBrowserNotifications]);

  const setSoundEnabled = useCallback(async (enabled: boolean) => {
    const currentUid = uidRef.current;
    const mutedAt = locallyMutedAt(currentUid);
    const allowed = Boolean(enabled && settingsRef.current.optedIn && settingsRef.current.enabled
      && !(mutedAt > 0 && settingsRef.current.enabledAt <= mutedAt));
    updatePreferences({ soundAlertsEnabled: allowed });
    soundEnabledRef.current = allowed;
    try {
      localStorage.setItem(soundStorageKey(currentUid), String(allowed));
      setError(null);
    } catch {
      setError('Браузер не дозволяє зберегти вибір звуку на цьому пристрої.');
    }
  }, [updatePreferences]);

  const emit = useCallback((event: NewSiteNotification) => {
    // A different tab can disable everything while this callback is still
    // processing market data. The persisted deny takes precedence over stale
    // React state and even a granted browser Notification permission.
    const mutedAt = locallyMutedAt(uidRef.current);
    if (mutedAt > 0 && settingsRef.current.enabledAt <= mutedAt) return;
    if (!notificationEnabled(settingsRef.current, event.kind)) return;
    if (!event.id || !event.title) return;
    const streamEvent = event.kind === 'price' || event.kind === 'liquidations'
      || (event.kind === 'impulse' || event.kind === 'volatility')
        && /^(?:impulse|volatility):/.test(event.id);
    if (event.kind !== 'system' && !matchesNotificationScope(settingsRef.current,
        event, favoritesRef.current, { timeframeIndependent: streamEvent })) return;
    const owner = uidRef.current;
    if (deliveredSeen.current.uid !== owner) deliveredSeen.current = { uid: owner, ids: loadSeen(owner) };
    if (deliveredSeen.current.ids.has(event.id) || itemsRef.current.some(item => item.id === event.id)) return;
    deliveredSeen.current.ids.add(event.id);
    if (deliveredSeen.current.ids.size > 5000) deliveredSeen.current.ids = new Set(Array.from(deliveredSeen.current.ids).slice(-4000));
    try { localStorage.setItem(siteNotificationSeenKey(owner), JSON.stringify([...deliveredSeen.current.ids])); } catch {}
    const notification: SiteNotificationItem = {
      ...event, timestamp: event.timestamp ?? Date.now(), read: false,
    };
    replaceItems([notification, ...itemsRef.current]);
    if (soundEnabledRef.current) {
      const soundOwner = uidRef.current;
      const soundKind = event.kind;
      playSiteNotificationSound(settingsRef.current.sound, soundOwner, () => {
        const mutedAt = locallyMutedAt(soundOwner);
        return uidRef.current === soundOwner && soundEnabledRef.current
          && !(mutedAt > 0 && settingsRef.current.enabledAt <= mutedAt)
          && notificationEnabled(settingsRef.current, soundKind);
      });
    }
    if (settingsRef.current.browserPush && typeof document !== 'undefined' && document.hidden
      && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const visible = new Notification(event.title, {
          body: event.description, icon: '/favicon.ico',
        });
        visibleBrowserNotificationsRef.current.add(visible);
        // Avoid an unbounded pile of native notifications during a volatility
        // burst; the in-site history still retains the full bounded event list.
        while (visibleBrowserNotificationsRef.current.size > 3) {
          const oldest = visibleBrowserNotificationsRef.current.values().next().value;
          if (!oldest) break;
          visibleBrowserNotificationsRef.current.delete(oldest);
          try { oldest.close(); } catch {}
        }
        visible.onclose = () => { visibleBrowserNotificationsRef.current.delete(visible); };
      } catch { /* Browser may forbid native notification displays. */ }
    }
  }, [replaceItems]);

  const setFavoriteIds = useCallback((favorites: readonly string[]) => {
    const normalized = normalizeNotificationFavoriteIds(favorites);
    favoritesRef.current = normalized;
    // Favorites are matched inside this browser; there is no server write when
    // a user edits their watchlist, and no additional exchange subscription.
  }, []);

  const processScan = useCallback((coins: readonly ScannedCoin[], favorites: readonly string[] = []) => {
    const mutedAt = locallyMutedAt(uidRef.current);
    if (mutedAt > 0 && settingsRef.current.enabledAt <= mutedAt) return;
    if (!settingsRef.current.optedIn || !settingsRef.current.enabled) return;
    favoritesRef.current = [...favorites];
    const currentUid = uidRef.current;
    if (qualityRef.current.uid !== currentUid) {
      let saved: unknown = {};
      try { saved = JSON.parse(localStorage.getItem('h00k_quality_history_v1:' + currentUid) || '{}'); } catch {}
      qualityRef.current = { uid: currentUid, tracker: new QualityScoreTracker(saved) };
    }
    if (proximityRef.current.uid !== currentUid) {
      let saved: unknown = {};
      try { saved = JSON.parse(localStorage.getItem('h00k_proximity_history_v1:' + currentUid) || '{}'); } catch {}
      proximityRef.current = { uid: currentUid, tracker: new ProximityAlertTracker(saved) };
    }
    if (cooldownRef.current.uid !== currentUid) {
      let saved: unknown = {};
      try { saved = JSON.parse(localStorage.getItem('h00k_notification_cooldown_v1:' + currentUid) || '{}'); } catch {}
      cooldownRef.current = { uid: currentUid, tracker: new NotificationCooldownTracker(saved) };
    }
    const tracker = qualityRef.current.tracker;
    const proximity = proximityRef.current.tracker;
    const cooldown = cooldownRef.current.tracker;
    if (deliveredSeen.current.uid !== currentUid)
      deliveredSeen.current = { uid: currentUid, ids: loadSeen(currentUid) };
    const wasDelivered = (id: string) => deliveredSeen.current.ids.has(id);
    for (const event of scanNotificationSignals(coins, settingsRef.current, favorites,
      Date.now(), tracker, proximity, wasDelivered, cooldown)) emit(event);
    try {
      localStorage.setItem('h00k_quality_history_v1:' + currentUid, JSON.stringify(tracker.snapshot()));
      localStorage.setItem('h00k_proximity_history_v1:' + currentUid, JSON.stringify(proximity.snapshot()));
      localStorage.setItem('h00k_notification_cooldown_v1:' + currentUid, JSON.stringify(cooldown.snapshot()));
    } catch { /* Read-only browser mode. */ }
  }, [emit]);

  // The server owns actual price-alert delivery. This is a local on-site view only.
  useEffect(() => {
    const onPrice = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (!data || typeof data.symbol !== 'string') return;
      emit({
        id: 'price:' + String(data.alertId || data.symbol + ':' + data.targetPrice + ':' + Date.now()),
        kind: 'price', symbol: data.symbol,
        exchange: data.exchange, marketType: data.marketType,
        title: 'Ціновий рівень досягнуто · ' + data.symbol,
        description: String(data.message || 'Рівень ' + data.targetPrice + ' досягнуто'),
      });
    };
    window.addEventListener('signalhook:alert-triggered', onPrice);
    return () => window.removeEventListener('signalhook:alert-triggered', onPrice);
  }, [emit]);

  // Backfill price alerts from server history after login, without sound.
  useEffect(() => {
    if (uid === 'guest' || !settings.optedIn || !settings.enabled || !settings.price || !settings.enabledAt) return;
    const existing = new Set(itemsRef.current.map(item => item.id));
    let clearedAt = 0;
    try { clearedAt = Number(localStorage.getItem(siteNotificationClearedAtKey(uid))) || 0; } catch {}
    const collected: SiteNotificationItem[] = [];
    for (const h of history.slice(0, 80)) {
      if (h.userId !== uid || !Number.isFinite(h.triggeredAt)
          || h.triggeredAt <= Math.max(clearedAt, settings.enabledAt)) continue;
      if (!matchesNotificationScope(settings, h, favoritesRef.current, { timeframeIndependent: true })) continue;
      const id = h.alertId ? 'price:' + h.alertId + ':' + String(h.deliveryEpoch ?? 0) : 'price-history:' + h.id;
      if (existing.has(id)) continue;
      existing.add(id);
      collected.push({
        id, kind: 'price', symbol: h.symbol, title: 'Ціновий рівень · ' + h.symbol,
        description: 'Ціна ' + h.triggeredPrice + ' · ціль ' + h.targetPrice + (h.note ? ' · ' + h.note : ''),
        timestamp: h.triggeredAt, read: true,
      });
    }
    if (collected.length) replaceItems([...itemsRef.current, ...collected].sort((a, b) => b.timestamp - a.timestamp));
  }, [uid, settings.optedIn, settings.enabled, settings.enabledAt, settings.price,
    settings.scopeExchange, settings.scopeMarket, settings.scopeTimeframe, settings.scopeSymbols,
    settings.onlyFavorites, history, replaceItems]);

  // Surveillance is already monitored by the server. Only new, explicitly
  // enabled per-category events are shown as unread; old events stay silent.
  useEffect(() => {
    if (uid === 'guest' || surveillanceLoading) return;
    if (surveillanceSeen.current.uid !== uid) {
      surveillanceSeen.current = { uid, initialized: false, ids: new Set() };
    }
    const owned = new Set(surveillanceCoins.filter(coin => coin.userId === uid).map(coin => coin.id));
    const scoped = allEvents.filter(event => owned.has(event.coinId));
    const previous = surveillanceSeen.current;
    const events = scoped.map(event => ({ event, id: 'surveillance:' + event.coinId + ':' + event.id }));
    if (!previous.initialized) {
      previous.initialized = true;
      for (const { id } of events) previous.ids.add(id);
      return;
    }
    for (const { event, id } of events) {
      if (previous.ids.has(id)) continue;
      previous.ids.add(id);
      if (!Number.isFinite(event.timestamp) || Date.now() - event.timestamp > 3 * 60_000) continue;
      const notification = marketSurveillanceSignal(event, settingsRef.current, favoritesRef.current);
      if (notification) emit(notification);
    }
    if (previous.ids.size > 1000) previous.ids = new Set(events.map(item => item.id));
  }, [uid, allEvents, surveillanceCoins, surveillanceLoading, emit]);

  // One direct WS per selected coin, never a global ticker REST loop.
  useEffect(() => {
    const config = settings;
    if (!config.enabled || !config.impulses || !config.impulseSymbol || typeof WebSocket === 'undefined') return;
    const symbol = config.impulseSymbol;
    const tracker = new ImpulseTracker(config.impulseWindowMinutes);
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let retries = 0;
    let lastProcessedAt = 0;
    const onPrice = (price: number) => {
      if (!Number.isFinite(price) || price <= 0) return;
      // A WS handshake without market data is not a healthy recovered stream.
      retries = 0;
      const now = Date.now();
      if (now - lastProcessedAt < 400) return;
      lastProcessedAt = now;
      const outcome = tracker.push(price, now, settingsRef.current.impulseThresholdPct);
      if (!outcome) return;
      const sign = outcome.changePct >= 0 ? '+' : '';
      const elapsed = outcome.durationSeconds < 60
        ? outcome.durationSeconds + ' с'
        : (outcome.durationSeconds / 60).toFixed(1) + ' хв';
      emit({
        id: outcome.kind + ':' + config.impulseExchange + ':' + config.impulseMarket + ':' + symbol + ':' + now,
        kind: outcome.kind, symbol, exchange: config.impulseExchange,
        marketType: config.impulseMarket, timeframe: config.impulseWindowMinutes + 'm',
        changePct: outcome.kind === 'impulse' ? outcome.changePct : undefined,
        rangePct: outcome.kind === 'volatility' ? outcome.rangePct : undefined,
        title: outcome.kind === 'volatility'
          ? '≈ Сплеск волатильності · ' + symbol
          : (outcome.changePct >= 0 ? '▲ Імпульс зростання · ' : '▼ Імпульс падіння · ') + symbol,
        description: (outcome.kind === 'volatility'
          ? 'Діапазон коливань ' + outcome.rangePct.toFixed(2) + '%'
          : sign + outcome.changePct.toFixed(2) + '%')
          + ' за ' + elapsed + ' (вікно ' + config.impulseWindowMinutes + ' хв) · '
          + config.impulseExchange.toUpperCase() + ' · ' + config.impulseMarket,
      });
    };
    const connect = () => {
      if (stopped) return;
      const isBinance = config.impulseExchange === 'binance';
      const url = isBinance
        ? (config.impulseMarket === 'futures' ? 'wss://fstream.binance.com/ws/' : 'wss://stream.binance.com:9443/ws/')
          + symbol.toLowerCase() + '@aggTrade'
        : 'wss://stream.bybit.com/v5/public/' + (config.impulseMarket === 'futures' ? 'linear' : 'spot');
      try {
        socket = new WebSocket(url);
        socket.onopen = () => {
          if (!isBinance) {
            socket?.send(JSON.stringify({ op: 'subscribe', args: ['publicTrade.' + symbol] }));
            heartbeat = setInterval(() => {
              if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 'ping' }));
            }, 20_000);
          }
        };
        socket.onmessage = (message) => {
          try {
            const packet = JSON.parse(String(message.data));
            if (isBinance) {
              if (packet.e === 'aggTrade') onPrice(Number(packet.p));
            } else if (packet.topic === 'publicTrade.' + symbol && Array.isArray(packet.data)) {
              const latest = packet.data[packet.data.length - 1];
              if (latest) onPrice(Number(latest.p));
            }
          } catch { /* Ignore control frames and malformed updates. */ }
        };
        socket.onclose = () => {
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = undefined;
          if (!stopped) {
            const baseDelay = Math.min(30_000, 2000 * 2 ** Math.min(retries++, 4));
            reconnect = setTimeout(connect, baseDelay + Math.floor(Math.random() * 5_000));
          }
        };
        socket.onerror = () => socket?.close();
      } catch {
        if (!stopped) reconnect = setTimeout(connect, 10_000 + Math.floor(Math.random() * 5_000));
      }
    };
    connect();
    return () => {
      stopped = true;
      if (reconnect) clearTimeout(reconnect);
      if (heartbeat) clearInterval(heartbeat);
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.close();
      }
    };
  }, [uid, settings.enabled, settings.impulses, settings.impulseSymbol,
    settings.impulseExchange, settings.impulseMarket, settings.impulseWindowMinutes,
    emit]);

  // Explicit opt-in chart-feed liquidation monitor. No additional REST polling.
  // Uses a single selected symbol and ignores the server's historical snapshot.
  useEffect(() => {
    const cfg = settings;
    if (!notificationEnabled(cfg, 'liquidations') || !cfg.impulseSymbol
        || typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    const symbol = cfg.impulseSymbol, exchange = cfg.impulseExchange;
    const cascadeTracker = new LiquidationCascadeTracker();
    let socket: WebSocket | null = null, stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const connect = () => {
      if (stopped) return;
      try {
        const url = new URL('/api/hookchart/liquidations', window.location.origin);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('exchange', exchange);
        url.searchParams.set('symbol', symbol);
        // Notification-only subscribers never need the large historical chart snapshot.
        url.searchParams.set('live', '1');
        socket = new WebSocket(url);
        socket.onopen = () => { /* Reset failure count only after valid live data arrives. */ };
        socket.onmessage = message => {
          if (stopped) return;
          try {
            const data = JSON.parse(String(message.data));
            if (data.type !== 'liquidation' || !data.event) return;
            attempt = 0;
            const signal = liquidationNotificationSignal(data.event, settingsRef.current,
              { symbol, exchange, marketType: 'futures' });
            if (signal) emit(signal);
            const cascade = cascadeTracker.push(data.event, settingsRef.current.liquidationMinUsd);
            if (cascade) emit({
              id: 'liq-cascade:' + exchange + ':' + symbol + ':' + cascade.side + ':' + Math.floor(Date.now() / 300000),
              kind: 'liquidations', symbol, exchange, marketType: 'futures',
              title: 'Каскад ліквідацій ' + cascade.side + ' · ' + symbol,
              description: cascade.count + ' ліквідацій за 5 хв · $' + cascade.usd.toLocaleString('en-US'),
            });
          } catch { /* Ignore malformed live frames. */ }
        };
        socket.onclose = (closeEvent) => {
          if (!stopped) {
            if (attempt >= 3) emit({
              id: 'system:liq-stream:' + exchange + ':' + symbol + ':' + Math.floor(Date.now() / 300000),
              kind: 'system', title: 'Потік ліквідацій недоступний · ' + symbol,
              description: 'З’єднання з потоком ліквідацій перерване; триває повторне підключення.',
            });
            // Capacity rejections must not become a reconnect storm against
            // this VPS. Add jitter so thousands of clients do not retry together.
            const capacityRejected = closeEvent.code === 1013;
            const baseDelay = capacityRejected
              ? 60_000 : Math.min(30_000, 2000 * 2 ** Math.min(attempt, 4));
            attempt++;
            retry = setTimeout(connect, baseDelay + Math.floor(Math.random() * 5_000));
          }
        };
        socket.onerror = () => socket?.close();
      } catch {
        if (!stopped) retry = setTimeout(connect, 10_000);
      }
    };
    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (socket) { socket.onmessage = null; socket.onclose = null; socket.close(); }
    };
  }, [uid, settings.optedIn, settings.enabled, settings.liquidations,
    settings.impulseSymbol, settings.impulseExchange, emit]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onDisconnect = () => emit({
      id: 'system:offline:' + Math.floor(Date.now() / 60000),
      kind: 'system', title: 'З’єднання втрачено',
      description: 'Пристрій перейшов в офлайн. Ринкові дані можуть бути застарілими.',
    });
    window.addEventListener('offline', onDisconnect);
    return () => window.removeEventListener('offline', onDisconnect);
  }, [emit]);

  const markAllRead = useCallback(() => replaceItems(itemsRef.current.map(item => ({ ...item, read: true }))), [replaceItems]);
  const clear = useCallback(() => {
    try { localStorage.setItem(siteNotificationClearedAtKey(uidRef.current), String(Date.now())); } catch {}
    replaceItems([]);
  }, [replaceItems]);
  const unreadCount = items.filter(item => !item.read).length;

  return <Context.Provider value={{
    settings, updateSettings, soundEnabled: preferences.soundAlertsEnabled, setSoundEnabled,
    items, unreadCount, emit, processScan, setFavoriteIds, markAllRead, clear, error,
  }}>{children}</Context.Provider>;
};

export function useOptionalSiteNotifications(): SiteNotificationsValue | null {
  return useContext(Context);
}

export function useSiteNotifications(): SiteNotificationsValue {
  const value = useContext(Context);
  if (!value) throw new Error('useSiteNotifications requires SiteNotificationsProvider');
  return value;
}
