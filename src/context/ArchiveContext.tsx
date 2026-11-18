import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { archiveWithoutVisualImage, buildArchivedChartSnapshot } from '../utils/archiveChartSnapshot';
import { useAuth } from './AuthContext';
import {
  ArchivedFormation,
  ArchivedChartSnapshot,
  ScannedCoin,
  DetectedFormation,
  Timeframe,
  ChartMarkerInfo,
  ChartRestoreParams,
  ExchangeId,
  MarketType,
} from '../types';

interface SaveArchiveOptions {
  timeframe?: Timeframe;
  historyLimit?: number;
  markers?: ChartMarkerInfo[];
  chartSnapshot?: ArchivedChartSnapshot;
  chartParams?: Partial<ChartRestoreParams>;
  notes?: string;
  /** Required for new saves initiated from HookChart; older archives remain readable. */
  entryReason?: string;
  currentPrice?: number;
}

interface ArchiveContextType {
  archivedFormations: ArchivedFormation[];
  loading: boolean;
  saveToArchive: (
    coin: ScannedCoin,
    formation: DetectedFormation,
    options?: SaveArchiveOptions
  ) => Promise<ArchivedFormation>;
  removeFromArchive: (id: string) => Promise<boolean>;
  clearUserArchive: () => Promise<boolean>;
  isArchived: (symbol: string, formationIdOrName: string, exchange?: ExchangeId, marketType?: MarketType) => boolean;
  getArchivedItem: (symbol: string, formationIdOrName: string) => ArchivedFormation | undefined;
  archiveCount: number;
}

const ArchiveContext = createContext<ArchiveContextType | undefined>(undefined);

export const ArchiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [archivedFormations, setArchivedFormations] = useState<ArchivedFormation[]>([]);
  const activeUid = useRef(user?.uid);
  activeUid.current = user?.uid;
  const [loading, setLoading] = useState<boolean>(true);

  // One account-scoped read at login. The server owns cross-device persistence;
  // localStorage is only a read-only offline fallback.
  useEffect(() => {
    if (!user?.uid) { setArchivedFormations([]); setLoading(false); return; }
    const uid = user.uid;
    let cancelled = false;
    setArchivedFormations([]);
    setLoading(true);
    const load = async () => {
      try {
        const response = await apiFetch('/api/account/archive', { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Не вдалося завантажити архів.');
        const payload = await response.json();
        const items: ArchivedFormation[] = Array.isArray(payload.items)
          ? payload.items.filter((item: ArchivedFormation) => item.userId === uid) : [];
        if (cancelled) return;
        setArchivedFormations(items);
        try { localStorage.setItem('signalhook_archive_' + uid, JSON.stringify(items)); } catch {}
      } catch {
        if (cancelled) return;
        try {
          const cached = JSON.parse(localStorage.getItem('signalhook_archive_' + uid) || '[]');
          if (Array.isArray(cached)) setArchivedFormations(cached.filter(item => item.userId === uid));
        } catch {}
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Check if a specific coin + formation is already in archive
  const isArchived = useCallback(
    (symbol: string, formationIdOrName: string, exchange?: ExchangeId, marketType?: MarketType) => {
      const cleanSym = symbol.toUpperCase().replace('/', '').trim();
      return archivedFormations.some((item) => {
        const itemSym = item.symbol.toUpperCase().replace('/', '').trim();
        return (
          itemSym === cleanSym &&
          (!exchange || item.exchange === exchange) &&
          (!marketType || item.marketType === marketType) &&
          (item.formation.id === formationIdOrName ||
            item.formation.name === formationIdOrName ||
            item.formationName === formationIdOrName)
        );
      });
    },
    [archivedFormations]
  );

  const getArchivedItem = useCallback(
    (symbol: string, formationIdOrName: string) => {
      const cleanSym = symbol.toUpperCase().replace('/', '').trim();
      return archivedFormations.find((item) => {
        const itemSym = item.symbol.toUpperCase().replace('/', '').trim();
        return (
          itemSym === cleanSym &&
          (item.formation.id === formationIdOrName ||
            item.formation.name === formationIdOrName ||
            item.formationName === formationIdOrName)
        );
      });
    },
    [archivedFormations]
  );

  // Save formation to archive
  const saveToArchive = useCallback(
    async (
      coin: ScannedCoin,
      formation: DetectedFormation,
      options?: SaveArchiveOptions
    ): Promise<ArchivedFormation> => {
      if (!user) {
        throw new Error('Увійдіть у профіль, щоб зберегти формацію у свій особистий архів');
      }
      const currentUserId = user.uid;
      const cleanSym = coin.symbol.toUpperCase().replace('/', '').trim();
      const timestamp = Date.now();
      // Every explicit save is a different trade idea, including the same coin
      // and formation in the same millisecond. DB uniqueness is per archive ID.
      const uniqueId = `arch_${cleanSym.toLowerCase()}_${formation.patternKey || 'p'}_${timestamp}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const entryReason = options?.entryReason?.trim();
      if (!entryReason || entryReason.length > 500)
        throw new Error('Вкажіть причину входу (до 500 символів).');

      const activeTimeframe = options?.timeframe || coin.timeframe || '1h';
      const activeLimit = options?.historyLimit || 500;
      const refPrice = options?.currentPrice || coin.currentPrice || formation.levels.entryPrice;

      // Construct comprehensive markers list
      const markersList: ChartMarkerInfo[] = options?.markers !== undefined
        ? options.markers.map(marker => ({...marker}))
        : [
            {
              id: `marker_entry_${uniqueId}`,
              type: 'entry',
              label: `Вхід: $${formation.levels.entryPrice}`,
              price: formation.levels.entryPrice,
              color: '#38bdf8',
              lineStyle: 'dashed',
              lineWidth: 2,
              notes: 'Точка входу в позицію за формацією',
            },
            {
              id: `marker_target_${uniqueId}`,
              type: 'target',
              label: `Ціль (Тейк): $${formation.levels.targetPrice}`,
              price: formation.levels.targetPrice,
              color: '#10b981',
              lineStyle: 'solid',
              lineWidth: 2,
              notes: `Очікуваний прибуток +${Math.abs(formation.potentialProfitPct)}%`,
            },
            {
              id: `marker_stop_${uniqueId}`,
              type: 'stop_loss',
              label: `Стоп-лосс: $${formation.levels.stopLossPrice}`,
              price: formation.levels.stopLossPrice,
              color: '#ef4444',
              lineStyle: 'solid',
              lineWidth: 2,
              notes: `Ризик -${Math.abs(formation.potentialRiskPct)}%`,
            },
          ];

      if (options?.markers === undefined && formation.levels.necklinePrice) {
        markersList.push({
          id: `marker_neckline_${uniqueId}`,
          type: 'neckline',
          label: `Лінія шиї: $${formation.levels.necklinePrice}`,
          price: formation.levels.necklinePrice,
          color: '#f59e0b',
          lineStyle: 'dotted',
          lineWidth: 1,
        });
      }

      if (options?.markers === undefined && formation.levels.resistancePrice) {
        markersList.push({
          id: `marker_res_${uniqueId}`,
          type: 'resistance',
          label: `Опір: $${formation.levels.resistancePrice}`,
          price: formation.levels.resistancePrice,
          color: '#f59e0b',
          lineStyle: 'dotted',
          lineWidth: 1,
        });
      }

      if (options?.markers === undefined && formation.levels.supportPrice) {
        markersList.push({
          id: `marker_sup_${uniqueId}`,
          type: 'support',
          label: `Підтримка: $${formation.levels.supportPrice}`,
          price: formation.levels.supportPrice,
          color: '#a855f7',
          lineStyle: 'dotted',
          lineWidth: 1,
        });
      }

      const chartParams: ChartRestoreParams = {
        timeframe: activeTimeframe,
        historyLimit: activeLimit,
        lastClosePrice: refPrice,
        visibleRange: options?.chartParams?.visibleRange || { from: 0, to: 80 },
        savedAtCandleTime: Math.floor(timestamp / 1000),
      };

      const newArchiveItem: ArchivedFormation = {
        id: uniqueId,
        userId: currentUserId,
        symbol: cleanSym,
        baseAsset: coin.baseAsset || cleanSym.replace('USDT', ''),
        quoteAsset: coin.quoteAsset || 'USDT',
        exchange: coin.exchange,
        marketType: coin.marketType,
        timeframe: activeTimeframe,
        formationName: formation.name,
        bias: formation.bias,
        confidence: formation.confidence,
        status: formation.status,
        entryPrice: formation.levels.entryPrice,
        targetPrice: formation.levels.targetPrice,
        stopLossPrice: formation.levels.stopLossPrice,
        necklinePrice: formation.levels.necklinePrice,
        resistancePrice: formation.levels.resistancePrice,
        supportPrice: formation.levels.supportPrice,
        savedPrice: refPrice,
        formation: { ...formation },
        markers: markersList,
        ...(options?.chartSnapshot ? { chartSnapshot: buildArchivedChartSnapshot(options.chartSnapshot) } : {}),
        chartParams,
        entryReason,
        notes: options?.notes || `${formation.name} • ${coin.exchange.toUpperCase()} • ${activeTimeframe}`,
        createdAt: new Date(timestamp).toISOString(),
        savedAtTimestamp: timestamp,
      };

      const response = await apiFetch('/api/account/archive/' + encodeURIComponent(uniqueId), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newArchiveItem),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || 'Не вдалося зберегти формацію на сервері.');
      }

      // Ignore a response belonging to an account that logged out or switched.
      if (activeUid.current !== currentUserId) throw new Error('Акаунт змінився під час збереження.');
      // Update state & user-scoped storage immediately
      setArchivedFormations((prev) => {
        const filtered = prev.filter((item) => item.id !== uniqueId);
        const updated = [archiveWithoutVisualImage(newArchiveItem), ...filtered];
        try {
          localStorage.setItem(`signalhook_archive_${currentUserId}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });

      return newArchiveItem;
    },
    [user]
  );

  // Remove formation from current user's archive
  const removeFromArchive = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      const currentUserId = user.uid;
      const response = await apiFetch('/api/account/archive/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!response.ok || activeUid.current !== currentUserId) return false;

      setArchivedFormations((prev) => {
        const updated = prev.filter((item) => item.id !== id);
        try {
          localStorage.setItem(`signalhook_archive_${currentUserId}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });

      return true;
    },
    [user]
  );

  // Clear all formations for current user only
  const clearUserArchive = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const currentUserId = user.uid;
    const response = await apiFetch('/api/account/archive', { method: 'DELETE' });
    if (!response.ok || activeUid.current !== currentUserId) return false;

    setArchivedFormations([]);
    try {
      localStorage.removeItem(`signalhook_archive_${currentUserId}`);
    } catch {}

    return true;
  }, [user]);

  const archiveCount = useMemo(() => archivedFormations.length, [archivedFormations]);

  return (
    <ArchiveContext.Provider
      value={{
        archivedFormations,
        loading,
        saveToArchive,
        removeFromArchive,
        clearUserArchive,
        isArchived,
        getArchivedItem,
        archiveCount,
      }}
    >
      {children}
    </ArchiveContext.Provider>
  );
};

export const useArchive = (): ArchiveContextType => {
  const context = useContext(ArchiveContext);
  if (!context) {
    throw new Error('useArchive must be used within an ArchiveProvider');
  }
  return context;
};
