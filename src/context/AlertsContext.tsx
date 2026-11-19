import { apiFetch } from '../utils/apiFetch';
import { subscribeUserSignalStream } from '../utils/userSignalStream';
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { PriceAlert, AlertHistoryItem } from '../types';
import { normalizeLanguage } from '../locales';

interface AlertsContextType {
  alerts: PriceAlert[];
  history: AlertHistoryItem[];
  loading: boolean;
  loadingHistory: boolean;
  notificationPermission: NotificationPermission;
  requestNotificationPermission: () => Promise<NotificationPermission>;
  addAlert: (
    data: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & { isActive?: boolean }
  ) => Promise<PriceAlert>;
  addAlertsBatch: (
    items: Array<
      Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & { isActive?: boolean }
    >
  ) => Promise<PriceAlert[]>;
  deleteAlert: (id: string) => Promise<boolean>;
  toggleAlert: (id: string) => Promise<void>;
  clearTriggered: () => Promise<number>;
  fetchHistory: () => Promise<void>;
  clearHistory: () => Promise<number>;
  deleteHistoryItem: (id: string) => Promise<boolean>;
  reactivateAlert: (item: AlertHistoryItem | PriceAlert) => Promise<PriceAlert>;
  activeAlertsCount: number;
  triggeredAlertsCount: number;
  historyCount: number;
}

const AlertsContext = createContext<AlertsContextType | undefined>(undefined);

export const AlertsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const notifiedTriggers = useRef(new Set<string>());
  useEffect(() => { notifiedTriggers.current.clear(); }, [user?.uid]);
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const userRef = useRef(user);
  userRef.current = user;

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
        return perm;
      } catch {
        return 'denied';
      }
    }
    return 'denied';
  }, []);

  const handleServerAlertTriggered = useCallback((serverAlert: PriceAlert) => {
    const key = `${serverAlert.id}:${serverAlert.triggeredAt ?? 0}`;
    if (notifiedTriggers.current.has(key)) return;
    notifiedTriggers.current.add(key);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('signalhook:alert-triggered', {
          detail: {
            symbol: serverAlert.symbol,
            exchange: serverAlert.exchange,
            marketType: serverAlert.marketType,
            alertId: serverAlert.id + ':' + String(serverAlert.deliveryEpoch ?? 0),
            targetPrice: serverAlert.targetPrice,
            condition: serverAlert.condition,
            triggeredPrice: serverAlert.triggeredPrice,
            message: serverAlert.note || serverAlert.formationName || 'Цільову ціну досягнуто!',
          },
        })
      );


    }
  }, []);

  const historyOwnerUid = user?.uid;
  const fetchHistory = useCallback(async () => {
    const ownerUid = historyOwnerUid;
    if (!ownerUid) { setHistory([]); return; }
    setLoadingHistory(true);
    try {
      const response = await apiFetch('/api/alerts/history?userId=' + encodeURIComponent(ownerUid));
      if (!response.ok) throw new Error('History unavailable');
      const data = await response.json();
      if (userRef.current?.uid !== ownerUid) return;
      const items: AlertHistoryItem[] = Array.isArray(data.history) ? data.history : [];
      setHistory(items.sort((a, b) => b.triggeredAt - a.triggeredAt));
    } catch (error) { console.warn('[Alerts] History unavailable:', error); }
    finally { setLoadingHistory(false); }
  }, [historyOwnerUid]);

  const fetchHistoryRef = useRef(fetchHistory);
  fetchHistoryRef.current = fetchHistory;
  const handleServerAlertTriggeredRef = useRef(handleServerAlertTriggered);
  handleServerAlertTriggeredRef.current = handleServerAlertTriggered;

  // Server is the only source of truth for 24/7 monitoring.
  // Browser storage is a display cache, never a replacement for server alerts.
  useEffect(() => {
    if (!user?.uid) {
      setAlerts([]); setHistory([]); setLoading(false); return;
    }
    const uid = user.uid;
    let cancelled = false;
    setAlerts([]);
    setHistory([]);
    setLoading(true);
    const initialize = async () => {
      try {
        const response = await apiFetch('/api/alerts/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: uid,
            language: normalizeLanguage(localStorage.getItem('crypto_screener_language')),
            alerts: [],
          }),
        });
        if (!response.ok) throw new Error('Alerts unavailable');
        const data = await response.json();
        if (cancelled || userRef.current?.uid !== uid) return;
        const serverAlerts: PriceAlert[] = Array.isArray(data.alerts) ? data.alerts : [];
        alertsRef.current = serverAlerts;
        setAlerts(serverAlerts);
        try { localStorage.setItem('signalhook_user_alerts_' + uid, JSON.stringify(serverAlerts)); } catch {}
      } catch {
        if (cancelled || userRef.current?.uid !== uid) return;
        try {
          const cached = JSON.parse(localStorage.getItem('signalhook_user_alerts_' + uid) || '[]');
          if (Array.isArray(cached)) setAlerts(cached.filter(a => a.userId === uid));
        } catch {}
      } finally {
        if (!cancelled && userRef.current?.uid === uid) setLoading(false);
      }
    };
    void initialize();
    void fetchHistoryRef.current();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // One priority live event stream is shared with the SurveillanceProvider.
  // Listen only while this account has pending price alerts; the existing
  // 30/120-second read-only polling is still the disconnect fallback.
  const hasPendingPriceAlerts = alerts.some(alert => alert.isActive && !alert.triggered);
  const priceAlertRefreshRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!user?.uid || !hasPendingPriceAlerts) return;
    const unsubscribe = subscribeUserSignalStream(user.uid, event => {
      if (event === 'alert') priceAlertRefreshRef.current?.();
    }, connected => {
      // An SSE event can be missed while offline. Read the durable server
      // snapshot once when the private stream reconnects, not only on a
      // 30-second timer. Never invent a client-side triggered event.
      if (connected) priceAlertRefreshRef.current?.();
    });
    return unsubscribe;
  }, [user?.uid, hasPendingPriceAlerts]);

  // Adaptive UI sync only. The server monitors and delivers price alerts 24/7
  // independently: this request only refreshes the currently open page.
  // Keep idle users from submitting unchanged alert arrays every five seconds.
  useEffect(() => {
    if (!user?.uid) return;

    let disposed = false;
    let inFlight = false;
    let pendingUrgent = false;
    let urgentTimer: ReturnType<typeof setTimeout> | null = null;
    let lastLiveFetch = 0;
    let lastPolledAt = Date.now();
    const pollSync = async (force = false) => {
      if (disposed || (typeof document !== 'undefined' && document.hidden)) return;
      if (inFlight) { if (force) pendingUrgent = true; return; }
      const hasPendingAlerts = alertsRef.current.some(alert => alert.isActive && !alert.triggered);
      const minimumInterval = hasPendingAlerts ? 30_000 : 120_000;
      const now = Date.now();
      if (force) {
        // Server already verified the fired marker. Coalesce quick successive
        // SSE invalidations, but do not wait 30 seconds for the old poll.
        if (now - lastLiveFetch < 750) {
          // A second signal during/just after an earlier GET still deserves
          // a follow-up read. Delay rather than dropping its invalidation.
          if (!urgentTimer) urgentTimer = setTimeout(() => {
            urgentTimer = null;
            void pollSync(true);
          }, Math.max(1, 750 - (now - lastLiveFetch)));
          return;
        }
        lastLiveFetch = now;
      } else if (now - lastPolledAt < minimumInterval) return;
      lastPolledAt = now;
      inFlight = true;
      try {
        const currentUser = userRef.current;
        if (!currentUser || currentUser.uid !== user.uid) return;
        const currentAlertsList = alertsRef.current;

        // All changes are already saved by the dedicated create/delete/toggle
        // routes. Polling is read-only: never resubmit every alert on every tab.
        const res = await apiFetch('/api/alerts?userId=' + encodeURIComponent(currentUser.uid));

        if (!res.ok) return;
        const data = await res.json();
        if (disposed || userRef.current?.uid !== currentUser.uid) return;
        if (data.success && Array.isArray(data.alerts)) {
          let hasNewlyTriggered = false;

          data.alerts.forEach((serverAlert: PriceAlert) => {
            const localMatch = currentAlertsList.find((a) => a.id === serverAlert.id);
            if (localMatch && serverAlert.triggered && !localMatch.triggered) {
              hasNewlyTriggered = true;
              handleServerAlertTriggeredRef.current(serverAlert);
            }
          });

          const changed = JSON.stringify(alertsRef.current) !== JSON.stringify(data.alerts);
          alertsRef.current = data.alerts;
          if (changed) {
            setAlerts(data.alerts);
            try { localStorage.setItem('signalhook_user_alerts_' + currentUser.uid, JSON.stringify(data.alerts)); } catch {}
          }

          if (hasNewlyTriggered) {
            fetchHistoryRef.current();
          }
        }
      } catch {
        // Retry on the next poll.
      } finally {
        inFlight = false;
        // An SSE invalidation arriving during an HTTP sync must not be lost.
        // Fetch again after the earlier request finishes, using current state.
        if (pendingUrgent && !disposed) {
          pendingUrgent = false;
          void pollSync(true);
        }
      }
    };
    priceAlertRefreshRef.current = () => { void pollSync(true); };

    // The timer is cheap and does not itself request data. Foregrounding the
    // tab resumes a pending sync, respecting the same minimum interval.
    const interval = setInterval(() => { void pollSync(); }, 10_000);
    const onVisible = () => {
      if (!document.hidden) void pollSync(
        alertsRef.current.some(alert => alert.isActive && !alert.triggered));
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      priceAlertRefreshRef.current = null;
      if (urgentTimer) clearTimeout(urgentTimer);
      clearInterval(interval);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.uid]);

  const addAlert = useCallback(
    async (
      data: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & { isActive?: boolean }
    ): Promise<PriceAlert> => {
      if (!user) {
        throw new Error('Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть або зареєструйтесь.');
      }

      if (!Number.isFinite(Number(data.targetPrice)) || Number(data.targetPrice) <= 0 ||
          !['gte', 'lte'].includes(data.condition) || !data.symbol.trim()) {
        throw new Error('Вкажіть коректний символ, додатню ціну й умову сповіщення.');
      }
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const cleanSymbol = data.symbol.toUpperCase().replace('/', '').trim();

      const currentLanguage = normalizeLanguage(typeof window !== 'undefined' ? localStorage.getItem('crypto_screener_language') : 'uk');

      const newAlert: PriceAlert = {
        id: alertId,
        userId: user.uid,
        symbol: cleanSymbol,
        exchange: data.exchange,
        marketType: data.marketType,
        targetPrice: Number(data.targetPrice),
        condition: data.condition,
        note: data.note?.trim() || undefined,
        formationName: data.formationName?.trim() || undefined,
        levelType: data.levelType || 'custom',
        createdAt: Date.now(),
        isActive: data.isActive !== undefined ? data.isActive : true,
        triggered: false,
        language: currentLanguage,
      };

      const response = await apiFetch('/api/alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newAlert),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Сервер не зберіг сповіщення.');
      if (userRef.current?.uid === user.uid) {
        const updated = [newAlert, ...alertsRef.current];
        alertsRef.current = updated;
        setAlerts(updated);
        try { localStorage.setItem('signalhook_user_alerts_' + user.uid, JSON.stringify(updated)); } catch {}
      }

      return newAlert;
    },
    [user]
  );

  const addAlertsBatch = useCallback(
    async (
      items: Array<
        Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & { isActive?: boolean }
      >
    ): Promise<PriceAlert[]> => {
      if (!user) {
        throw new Error(
          'Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть або зареєструйтесь.'
        );
      }
      if (!items || items.length === 0) return [];

      if (items.some(item => !Number.isFinite(Number(item.targetPrice)) || Number(item.targetPrice) <= 0 ||
        !['gte', 'lte'].includes(item.condition) || !item.symbol.trim())) {
        throw new Error('Некоректні рівні сповіщення.');
      }
      const baseTime = Date.now();
      const currentLanguage = normalizeLanguage(typeof window !== 'undefined' ? localStorage.getItem('crypto_screener_language') : 'uk');

      const newAlerts: PriceAlert[] = items.map((item, idx) => {
        const alertId = `alert_${baseTime}_${Math.random().toString(36).substring(2, 8)}_${idx}`;
        const cleanSymbol = item.symbol.toUpperCase().replace('/', '').trim();
        return {
          id: alertId,
          userId: user.uid,
          symbol: cleanSymbol,
          exchange: item.exchange,
          marketType: item.marketType,
          targetPrice: Number(item.targetPrice),
          condition: item.condition,
          note: item.note?.trim() || undefined,
          formationName: item.formationName?.trim() || undefined,
          levelType: item.levelType || 'custom',
          createdAt: baseTime + idx,
          isActive: item.isActive !== undefined ? item.isActive : true,
          triggered: false,
          language: currentLanguage,
        };
      });

      const response = await apiFetch('/api/alerts/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid, alerts: newAlerts,
          language: normalizeLanguage(localStorage.getItem('crypto_screener_language')),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Сервер не зберіг сповіщення.');
      if (userRef.current?.uid === user.uid) {
        const updated = [...newAlerts, ...alertsRef.current];
        alertsRef.current = updated;
        setAlerts(updated);
        try { localStorage.setItem('signalhook_user_alerts_' + user.uid, JSON.stringify(updated)); } catch {}
      }

      return newAlerts;
    },
    [user]
  );

  const deleteAlert = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      // Delete from server FIRST, so a disappearing chart marker can never
      // leave an active Telegram notification monitoring the price.
      try {
        const response = await apiFetch(`/api/alerts/${encodeURIComponent(id)}?userId=${encodeURIComponent(user.uid)}`, {
          method: 'DELETE',
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          console.error('Failed to delete alert from server:', result.error || 'Alert not found');
          return false;
        }
      } catch (err) {
        console.error('Failed to delete alert from server:', err);
        return false;
      }
      if (userRef.current?.uid !== user.uid) return false;
      const remaining = alertsRef.current.filter((a) => a.id !== id);
      alertsRef.current = remaining;
      setAlerts(remaining);
      try { localStorage.setItem('signalhook_user_alerts_' + user.uid, JSON.stringify(remaining)); } catch {}
      return true;
    },
    [user]
  );

  const toggleAlert = useCallback(
    async (id: string) => {
      if (!user) return;
      const existing = alerts.find((a) => a.id === id);
      if (!existing) return;

      const newActive = !existing.isActive;
      const response = await apiFetch(`/api/alerts/${encodeURIComponent(id)}/toggle?userId=${encodeURIComponent(user.uid)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: newActive }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.alert) throw new Error(data.error || 'Не вдалося змінити сповіщення');
      if (userRef.current?.uid !== user.uid) return;
      const updated = alertsRef.current.map(a => a.id === id ? data.alert as PriceAlert : a);
      alertsRef.current = updated;
      setAlerts(updated);
      try { localStorage.setItem('signalhook_user_alerts_' + user.uid, JSON.stringify(updated)); } catch {}
    },
    [user, alerts]
  );

  const clearTriggered = useCallback(async (): Promise<number> => {
    if (!user) return 0;
    const triggered = alerts.filter((a) => a.triggered);
    if (triggered.length === 0) return 0;

    // Confirm durable deletion before removing anything from browser state.
    const response = await apiFetch(`/api/alerts/clear-triggered?userId=${encodeURIComponent(user.uid)}`, {
      method: 'POST',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Не вдалося очистити сповіщення.');
    if (userRef.current?.uid !== user.uid) return 0;
    const remaining = alertsRef.current.filter((a) => !a.triggered);
    alertsRef.current = remaining;
    setAlerts(remaining);
    try { localStorage.setItem('signalhook_user_alerts_' + user.uid, JSON.stringify(remaining)); } catch {}
    return Number.isFinite(result.count) ? result.count : triggered.length;
  }, [user, alerts]);

  // Delete single history record
  const deleteHistoryItem = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      // Do not hide a history item until the server confirms its deletion.
      try {
        const response = await apiFetch(`/api/alerts/history/${encodeURIComponent(id)}?userId=${encodeURIComponent(user.uid)}`, {
          method: 'DELETE',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success || userRef.current?.uid !== user.uid) return false;
        setHistory((prev) => prev.filter((h) => h.id !== id));
        return true;
      } catch (err) {
        console.error('Failed to delete history item on server:', err);
        return false;
      }
    },
    [user]
  );

  // Clear entire history
  const clearHistory = useCallback(async (): Promise<number> => {
    if (!user) return 0;
    const response = await apiFetch('/api/alerts/history/clear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.uid }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Не вдалося очистити історію.');
    if (userRef.current?.uid !== user.uid) return 0;
    setHistory([]);
    return Number.isFinite(result.cleared) ? result.cleared : history.length;
  }, [user, history]);

  // Reactivate an alert from history or triggered list
  const reactivateAlert = useCallback(
    async (item: AlertHistoryItem | PriceAlert): Promise<PriceAlert> => {
      const existing = alerts.find((a) => a.id === (item as any).alertId || a.id === item.id);
      if (existing) {
        await toggleAlert(existing.id);
        return existing;
      }

      // Add fresh alert with same parameters
      return await addAlert({
        symbol: item.symbol,
        exchange: item.exchange,
        marketType: item.marketType,
        targetPrice: item.targetPrice,
        condition: item.condition,
        formationName: item.formationName,
        levelType: item.levelType,
        note: item.note,
        isActive: true,
      });
    },
    [alerts, toggleAlert, addAlert]
  );

  const activeAlertsCount = alerts.filter((a) => a.isActive && !a.triggered).length;
  const triggeredAlertsCount = alerts.filter((a) => a.triggered).length;
  const historyCount = history.length;

  return (
    <AlertsContext.Provider
      value={{
        alerts,
        history,
        loading,
        loadingHistory,
        notificationPermission,
        requestNotificationPermission,
        addAlert,
        addAlertsBatch,
        deleteAlert,
        toggleAlert,
        clearTriggered,
        fetchHistory,
        clearHistory,
        deleteHistoryItem,
        reactivateAlert,
        activeAlertsCount,
        triggeredAlertsCount,
        historyCount,
      }}
    >
      {children}
    </AlertsContext.Provider>
  );
};

export const useAlerts = () => {
  const context = useContext(AlertsContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertsProvider');
  }
  return context;
};
