import { apiFetch } from '../utils/apiFetch';
import { subscribeUserSignalStream } from '../utils/userSignalStream';
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { SurveillanceRequestGuard } from '../utils/surveillanceRequests';
import { isDesktopSurveillanceView, shouldConnectSurveillanceSSE } from '../utils/desktopSurveillanceVisibility';
import {
  SurveillanceCoin,
  SurveillanceConfig,
  SurveillanceEvent,
  ExchangeId,
  MarketType,
} from '../types';

export interface AggregatedSurveillanceEvent extends SurveillanceEvent {
  coinId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
}

interface SurveillanceContextType {
  coins: SurveillanceCoin[];
  allEvents: AggregatedSurveillanceEvent[];
  loading: boolean;
  activeCount: number;
  addCoinToSurveillance: (
    symbol: string,
    exchange?: ExchangeId,
    marketType?: MarketType,
    customConfig?: Partial<SurveillanceConfig>
  ) => Promise<{ success: boolean; coin?: SurveillanceCoin; error?: string; code?: string }>;
  removeCoinFromSurveillance: (id: string) => Promise<boolean>;
  updateCoinConfig: (id: string, config: Partial<SurveillanceConfig>) => Promise<boolean>;
  toggleCoinActive: (id: string) => Promise<boolean>;
  toggleAllCoinsActive: (targetActive: boolean) => Promise<boolean>;
  checkCoinNow: (id: string, forceNotify?: boolean) => Promise<SurveillanceCoin | null>;
  checkAllCoinsNow: () => Promise<boolean>;
  getWorkerSnapshot: (id: string) => Promise<any | null>;
  runBacktest: (symbol: string, exchange?: ExchangeId, marketType?: MarketType, timeframe?: string) => Promise<any | null>;
  isCoinMonitored: (symbol: string, exchange?: ExchangeId) => boolean;
  isCoinOnSurveillance: (symbol: string, exchange?: ExchangeId) => boolean;
  refresh: () => Promise<void>;
}

const SurveillanceContext = createContext<SurveillanceContextType | undefined>(undefined);

export const SurveillanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [coins, setCoins] = useState<SurveillanceCoin[]>([]);
  const currentUserId = useRef(user?.uid || 'guest');
  currentUserId.current = user?.uid || 'guest';
  const requestGuard = useRef(new SurveillanceRequestGuard(currentUserId.current));
  requestGuard.current.setUser(currentUserId.current);
  const removedIds = useRef(new Map<string, Set<string>>());
  const [loading, setLoading] = useState<boolean>(true);

  const fetchCoins = useCallback(async () => {
    const userId = user?.uid || 'guest';
    if (userId === 'guest') { setCoins([]); setLoading(false); return; }
    const request = requestGuard.current.beginRead();
    if (!request) return;
    try {
      const res = await apiFetch(`/api/surveillance?userId=${encodeURIComponent(userId)}`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!requestGuard.current.canApply(request)) return;
      if (data.success && Array.isArray(data.data)) {
        setCoins(data.data);
        try {
          localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(data.data));
        } catch {}
      }
    } catch (err) {
      if (!requestGuard.current.canApply(request)) return;
      console.warn('[Surveillance] Fetch error, checking localStorage:', err);
      let cachedCoins: SurveillanceCoin[] | undefined;
      try {
        const cached = localStorage.getItem(`signalhook_surveillance_${userId}`);
        if (cached) {
          const saved = JSON.parse(cached);
          if (Array.isArray(saved)) cachedCoins = saved;
        }
      } catch {}
      setCoins(previous => (cachedCoins || previous).map(coin => ({ ...coin, state: coin.state ? {
        ...coin.state, engineStatus: 'STALE' as const, densitiesCount: 0,
        topDensityUsd: undefined, topDensityPrice: undefined, topDensitySide: undefined,
      } : coin.state })));
    } finally {
      if (requestGuard.current.canApply(request)) setLoading(false);
    }
  }, [user?.uid]);

  // Use the existing authenticated event stream when available; a second
  // periodic GET every minute would duplicate the same snapshots for every user.
  const streamConnected = useRef(false);
  const streamEpochRef = useRef(0);
  const hasActiveMonitors = coins.some(coin => coin.isActive);
  // The website keeps its existing notification/SSE lifecycle. Only Desktop
  // renderer windows can release their personal SSE when minimized/hidden;
  // the backend continues the user's 24/7 surveillance independently.
  const desktopView = typeof window !== 'undefined' &&
    isDesktopSurveillanceView(window.location.search);
  const [desktopVisible, setDesktopVisible] = useState(() =>
    typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    if (!desktopView) return;
    const onVisibilityChange = () => {
      const visible = !document.hidden;
      setDesktopVisible(visible);
      // Restore the current monitored state after an inactive Desktop pane
      // returns. This does not restart a scan or create an exchange socket.
      if (visible && user?.uid) void fetchCoins();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [desktopView, user?.uid, fetchCoins]);
  const keepSurveillanceSSE = shouldConnectSurveillanceSSE(
    !!user, hasActiveMonitors, desktopView, desktopVisible,
  );
  const activeMonitorsRef = useRef(hasActiveMonitors);
  activeMonitorsRef.current = hasActiveMonitors;
  const lastIdlePollRef = useRef(0);
  useEffect(() => {
    streamConnected.current = false;
    lastIdlePollRef.current = Date.now();
    setCoins([]);
    setLoading(true);
    void fetchCoins();
    const interval = setInterval(() => {
      if (streamConnected.current || (typeof document !== 'undefined' && document.hidden)) return;
      // Inactive accounts do not need a full surveillance snapshot each minute.
      // Freshly added/edited coins are refreshed immediately by their handlers.
      const now = Date.now();
      if (!activeMonitorsRef.current && now - lastIdlePollRef.current < 5 * 60_000) return;
      lastIdlePollRef.current = now;
      void fetchCoins();
    }, 60000);
    return () => { clearInterval(interval); streamConnected.current = false; };
  }, [fetchCoins]);

  // Reuse the same authenticated SSE connection as the price-alert context:
  // enabling both monitors and standalone alerts must not double sockets.
  useEffect(() => {
    const epoch = ++streamEpochRef.current;
    if (!keepSurveillanceSSE || !user?.uid) {
      streamConnected.current = false;
      return;
    }
    let lastFetch = 0;
    let lastUrgentFetch = 0;
    const unsubscribe = subscribeUserSignalStream(user.uid, event => {
      if (streamEpochRef.current !== epoch) return;
      const now = Date.now();
      if (event === 'alert') {
        // Critical/new signals never wait for the routine 12s throttle.
        if (now - lastUrgentFetch >= 500) {
          lastUrgentFetch = now;
          lastFetch = now;
          void fetchCoins();
        }
      } else if (event === 'changed' && now - lastFetch >= 12000) {
        lastFetch = now;
        void fetchCoins();
      }
    }, connected => {
      if (streamEpochRef.current === epoch) streamConnected.current = connected;
    });
    const epochRef = streamEpochRef;
    return () => {
      if (epochRef.current === epoch) streamConnected.current = false;
      unsubscribe();
    };
  }, [user?.uid, fetchCoins, keepSurveillanceSSE]);

  const mutate = async (userId: string, url: string, options: RequestInit) => {
    const finish = requestGuard.current.beginWrite(userId);
    try {
      const res = await apiFetch(url, options);
      const data = await res.json();
      if (!finish.isCurrent()) throw new Error('Обліковий запис змінено');
      return data;
    } finally { finish(); }
  };

  const getWorkerSnapshot = useCallback(async (id: string): Promise<any | null> => {
    const userId = user?.uid || 'guest';
    const requestedAt = Date.now();
    try {
      const res = await apiFetch(`/api/surveillance/worker/${encodeURIComponent(id)}?userId=${encodeURIComponent(user?.uid || 'guest')}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (currentUserId.current !== userId || removedIds.current.get(userId)?.has(id)) return null;
      return json.success ? { ...json.data, clientRequestedAt: requestedAt } : null;
    } catch {
      return null;
    }
  }, [user?.uid]);

  const runBacktest = async (
    symbol: string,
    exchange: ExchangeId = 'binance',
    marketType: MarketType = 'futures',
    timeframe = '15m'
  ): Promise<any | null> => {
      const res = await apiFetch('/api/surveillance/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, exchange, marketType, timeframe }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Не вдалося виконати бектест');
      return json.data;
  };

  const addCoinToSurveillance = async (
    symbol: string,
    exchange: ExchangeId = 'binance',
    marketType: MarketType = 'futures',
    customConfig?: Partial<SurveillanceConfig>
  ) => {
    try {
      const userId = user?.uid || 'guest';
      const cleanSymbol = symbol.toUpperCase().trim();
      // Server resolves and verifies base ticker + quote against the exact
      // selected exchange/market. Do not pre-invent a USDT base/quote here.
      const data = await mutate(userId, '/api/surveillance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: cleanSymbol,
          exchange,
          marketType,
          userId,
          config: customConfig,
        }),
      });

      if (data.success && data.coin) {
        if (removedIds.current.get(userId)?.has(data.coin.id)) return { success: false, error: 'Монету вже видалено' };
        setCoins((prev) => {
          const exists = prev.some((c) => c.id === data.coin.id);
          const next = exists ? prev.map((c) => (c.id === data.coin.id ? data.coin : c)) : [data.coin, ...prev];
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return { success: true, coin: data.coin };
      }
      return { success: false, error: data.error || 'Не вдалося додати монету', code: data.code };
    } catch (err: any) {
      return { success: false, error: err.message || 'Помилка мережі' };
    }
  };

  const removeCoinFromSurveillance = async (id: string): Promise<boolean> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, `/api/surveillance/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      if (data.success) {
        if (!removedIds.current.has(userId)) removedIds.current.set(userId, new Set());
        removedIds.current.get(userId)!.add(id);
        setCoins((prev) => {
          const next = prev.filter((c) => c.id !== id);
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const updateCoinConfig = async (
    id: string,
    config: Partial<SurveillanceConfig>
  ): Promise<boolean> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, `/api/surveillance/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, config }),
      });
      if (data.success && data.coin) {
        setCoins((prev) => {
          const next = prev.map((c) => (c.id === id ? data.coin : c));
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const toggleCoinActive = async (id: string): Promise<boolean> => {
    const coin = coins.find((c) => c.id === id);
    if (!coin) return false;
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, `/api/surveillance/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isActive: !coin.isActive }),
      });
      if (data.success && data.coin) {
        setCoins((prev) => {
          const next = prev.map((c) => (c.id === id ? data.coin : c));
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const checkCoinNow = async (id: string, forceNotify = false): Promise<SurveillanceCoin | null> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, `/api/surveillance/${encodeURIComponent(id)}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, forceNotify }),
      });
      if (data.success && data.coin) {
        setCoins((prev) => {
          const next = prev.map((c) => (c.id === id ? data.coin : c));
          try {
            localStorage.setItem(`signalhook_surveillance_${userId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return data.coin;
      }
      return null;
    } catch {
      return null;
    }
  };

  const checkAllCoinsNow = async (): Promise<boolean> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, '/api/surveillance/check-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (data.success && Array.isArray(data.data)) {
        await fetchCoins();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const toggleAllCoinsActive = async (targetActive: boolean): Promise<boolean> => {
    try {
      const userId = user?.uid || 'guest';
      const data = await mutate(userId, '/api/surveillance/toggle-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isActive: targetActive }),
      });
      if (data.success && Array.isArray(data.data)) {
        await fetchCoins();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const isCoinMonitored = (symbol: string, exchange?: ExchangeId): boolean => {
    const clean = symbol.toUpperCase().trim();
    return coins.some((c) => c.symbol === clean && (!exchange || c.exchange === exchange) && c.isActive);
  };

  const isCoinOnSurveillance = (symbol: string, exchange?: ExchangeId): boolean => {
    const clean = symbol.toUpperCase().trim();
    return coins.some((c) => c.symbol === clean && (!exchange || c.exchange === exchange));
  };

  const activeCount = coins.filter((c) => c.isActive).length;

  const allEvents = useMemo<AggregatedSurveillanceEvent[]>(() => {
    const list: AggregatedSurveillanceEvent[] = [];
    for (const coin of coins) {
      if (coin.state?.recentEvents && Array.isArray(coin.state.recentEvents)) {
        for (const ev of coin.state.recentEvents) {
          list.push({
            ...ev,
            coinId: coin.id,
            symbol: coin.symbol,
            baseAsset: coin.baseAsset,
            quoteAsset: coin.quoteAsset,
            exchange: coin.exchange,
            marketType: coin.marketType,
          });
        }
      }
    }
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [coins]);

  return (
    <SurveillanceContext.Provider
      value={{
        coins,
        allEvents,
        loading,
        activeCount,
        addCoinToSurveillance,
        removeCoinFromSurveillance,
        updateCoinConfig,
        toggleCoinActive,
        toggleAllCoinsActive,
        checkCoinNow,
        checkAllCoinsNow,
        getWorkerSnapshot,
        runBacktest,
        isCoinMonitored,
        isCoinOnSurveillance,
        refresh: fetchCoins,
      }}
    >
      {children}
    </SurveillanceContext.Provider>
  );
};

export const useSurveillance = () => {
  const context = useContext(SurveillanceContext);
  if (!context) {
    throw new Error('useSurveillance must be used within a SurveillanceProvider');
  }
  return context;
};
