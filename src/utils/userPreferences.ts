import { useEffect, useState, useCallback } from 'react';
import { ExchangeId, MarketType, Timeframe } from '../types';

export interface AppPreferences {
  defaultExchange: 'all' | ExchangeId;
  defaultMarketType: 'all' | MarketType;
  defaultTimeframe: Timeframe;
  soundAlertsEnabled: boolean;
}

export const PREFERENCES_STORAGE_KEY = 'crypto_screener_site_defaults';
export const PREFERENCES_UPDATED_EVENT = 'crypto_screener_preferences_updated';

// The authenticated profile owns its defaults. A browser-wide cache key
// allowed account A's exchange/market/timeframe to appear for account B or
// after logout. Keep only a small, UID-scoped cache (no server requests here).
let preferenceOwnerUid: string | null = null;
// In-memory fallback for Safari private browsing / blocked localStorage.
// The authenticated PostgreSQL profile remains authoritative and rehydrates it.
let memoryPreferences: AppPreferences | null = null;
export function preferenceStorageKey(uid: string | null = preferenceOwnerUid): string {
  return `${PREFERENCES_STORAGE_KEY}:${uid || 'guest'}`;
}

export function setPreferencesIdentity(uid: string | null): void {
  const nextUid = uid || null;
  if (preferenceOwnerUid === nextUid) return;
  preferenceOwnerUid = nextUid;
  memoryPreferences = null; // Never carry defaults across accounts.
  if (typeof window !== 'undefined') {
    // Identity changes notify mounted Screener/Terminal widgets.
    window.dispatchEvent(new CustomEvent<AppPreferences>(PREFERENCES_UPDATED_EVENT, {
      detail: getStoredPreferences(),
    }));
  }
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultExchange: 'all',
  defaultMarketType: 'futures',
  defaultTimeframe: '15m',
  soundAlertsEnabled: false,
};

/**
 * Keep an active chart/filter override when an account default changes.
 * Only values still equal to the preceding defaults inherit the new values.
 * Does not touch symbols, chart blocks, market streams or saved presets.
 */
export function applyChangedDefaultsToMarketFilters<T extends {
  exchange: AppPreferences['defaultExchange'];
  marketType: AppPreferences['defaultMarketType'];
  timeframe: Timeframe;
}>(
  current: T,
  previous: Pick<AppPreferences, 'defaultExchange' | 'defaultMarketType' | 'defaultTimeframe'>,
  next: Pick<AppPreferences, 'defaultExchange' | 'defaultMarketType' | 'defaultTimeframe'>,
): T {
  const exchange = current.exchange === previous.defaultExchange ? next.defaultExchange : current.exchange;
  const marketType = current.marketType === previous.defaultMarketType ? next.defaultMarketType : current.marketType;
  const timeframe = current.timeframe === previous.defaultTimeframe ? next.defaultTimeframe : current.timeframe;
  return exchange === current.exchange && marketType === current.marketType && timeframe === current.timeframe
    ? current : { ...current, exchange, marketType, timeframe };
}

/** Resolve the initial Replay market from account defaults. Replay has no 30s history. */
export function getReplayStartingDefaults(): { exchange: ExchangeId; marketType: MarketType; timeframe: Timeframe } {
  const { defaultExchange, defaultMarketType, defaultTimeframe } = getStoredPreferences();
  return {
    exchange: defaultExchange === 'all' ? 'binance' : defaultExchange,
    marketType: defaultMarketType === 'all' ? 'futures' : defaultMarketType,
    timeframe: defaultTimeframe === '30s' ? '1m' : defaultTimeframe,
  };
}

/**
 * Read preferences from localStorage (or fallback to defaults)
 */
export function getStoredPreferences(): AppPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_PREFERENCES;
  }
  // A browser may allow reading but reject writing (e.g. full storage quota).
  // Until another tab signals a storage change, the last confirmed in-tab
  // update must win over a stale persisted value.
  if (memoryPreferences) return memoryPreferences;
  try {
    const raw = localStorage.getItem(preferenceStorageKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        defaultExchange: ['all', 'binance', 'bybit'].includes(parsed.defaultExchange)
          ? parsed.defaultExchange : DEFAULT_APP_PREFERENCES.defaultExchange,
        defaultMarketType: ['all', 'futures', 'spot'].includes(parsed.defaultMarketType)
          ? parsed.defaultMarketType : DEFAULT_APP_PREFERENCES.defaultMarketType,
        defaultTimeframe: ['30s', '1m', '5m', '15m', '1h', '4h', '1d'].includes(parsed.defaultTimeframe)
          ? parsed.defaultTimeframe : DEFAULT_APP_PREFERENCES.defaultTimeframe,
        soundAlertsEnabled:
          parsed.soundAlertsEnabled !== undefined
            ? Boolean(parsed.soundAlertsEnabled)
            : DEFAULT_APP_PREFERENCES.soundAlertsEnabled,
      };
    }
  } catch (err) {
    console.warn('Failed to parse stored preferences:', err);
  }
  return memoryPreferences ?? DEFAULT_APP_PREFERENCES;
}

/**
 * Save preferences to localStorage and notify all components across the app
 */
export function saveStoredPreferences(updates: Partial<AppPreferences>): AppPreferences {
  const current = getStoredPreferences();
  const hasChanges = Object.entries(updates).some(([key, val]) => (current as any)[key] !== val);
  if (!hasChanges) {
    return current;
  }

  const next: AppPreferences = {
    ...current,
    ...updates,
  };

  memoryPreferences = next;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(preferenceStorageKey(), JSON.stringify(next));
    } catch (err) {
      console.warn('Failed to save stored preferences:', err);
    }
    // Other mounted charts must update even if the browser blocks storage.
    window.dispatchEvent(
      new CustomEvent<AppPreferences>(PREFERENCES_UPDATED_EVENT, { detail: next })
    );
  }

  return next;
}

/**
 * React hook to subscribe to website-wide preferences and apply updates
 */
export function useAppPreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => getStoredPreferences());

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<AppPreferences>;
      const next = customEvent.detail || getStoredPreferences();
      setPreferences((prev) => {
        const isSame =
          prev.defaultExchange === next.defaultExchange &&
          prev.defaultMarketType === next.defaultMarketType &&
          prev.defaultTimeframe === next.defaultTimeframe &&
          prev.soundAlertsEnabled === next.soundAlertsEnabled;
        return isSame ? prev : next;
      });
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === preferenceStorageKey()) {
        memoryPreferences = null; // Re-read the value changed in another tab.
        const next = getStoredPreferences();
        setPreferences((prev) => {
          const isSame =
            prev.defaultExchange === next.defaultExchange &&
            prev.defaultMarketType === next.defaultMarketType &&
            prev.defaultTimeframe === next.defaultTimeframe &&
            prev.soundAlertsEnabled === next.soundAlertsEnabled;
          return isSame ? prev : next;
        });
      }
    };

    window.addEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const updatePreferences = useCallback((updates: Partial<AppPreferences>) => {
    const next = saveStoredPreferences(updates);
    setPreferences((prev) => {
      const isSame =
        prev.defaultExchange === next.defaultExchange &&
        prev.defaultMarketType === next.defaultMarketType &&
        prev.defaultTimeframe === next.defaultTimeframe &&
        prev.soundAlertsEnabled === next.soundAlertsEnabled;
      return isSame ? prev : next;
    });
    return next;
  }, []);

  return {
    preferences,
    updatePreferences,
  };
}
