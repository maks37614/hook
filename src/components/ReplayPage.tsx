import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import {
  ScannedCoin,
  Timeframe,
  ExchangeId,
  MarketType,
  Kline,
  ReplayPosition,
  ReplayPendingOrder,
  ReplayTradeJournalItem,
  ReplaySimulationSettings,
} from '../types';
import { ReplayChart, ReplayChartHandle } from './replay/ReplayChart';
import { ReplayToolbar } from './replay/ReplayToolbar';
import { ReplaySimulatorPanel } from './replay/ReplaySimulatorPanel';
import { ReplayJournal } from './replay/ReplayJournal';
import {
  fetchHistoricalReplayCandles,
  generateRandomHistoricalDate,
  calculateExecutionPrice,
  calculateLiquidationPrice,
  calculateUnrealizedPnl,
  checkPositionTriggers,
  checkOrderFill,
  DEFAULT_SIMULATION_SETTINGS,
} from '../utils/replayService';
import { fetchReplayHistoryBoundary, resolveReplayHistoryDate } from '../utils/replayHistoryAvailability';
import { prependCachedReplayHistory, replayVisibleCandles } from '../utils/replayHistoryExtend';
import { REPLAY_INTRABAR_PHASES, REPLAY_INTRABAR_TICK_MS, replayIntrabarCandle, replayRemainingCandle } from '../utils/replayIntrabar';
import { useReplayProfileState } from '../utils/useReplayProfileState';
import { storeReplayScreenshot, deleteReplayScreenshots, clearReplayScreenshots, replayImageKey } from '../utils/replayScreenshots';
import {
  History,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Info,
  X,
  Volume2,
} from 'lucide-react';
import { TOP_POPULAR_PAIRS, fetchDirectBinanceTickers, fetchDirectBybitTickers } from '../utils/directExchangeClient';
import { getReplayStartingDefaults } from '../utils/userPreferences';

interface ReplayPageProps {
  coins: ScannedCoin[];
  onNavigateToScreener?: () => void;
}

export const ReplayPage: React.FC<ReplayPageProps> = ({ coins }) => {
  const { language, t } = useLanguage();
  const uiLocale = { uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL', ru: 'ru-RU' }[language];
  // Chart Handle for taking screenshots
  const chartRef = useRef<ReplayChartHandle>(null);

  // Active Coin & Market Selection
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [exchange, setExchange] = useState<ExchangeId>(() => getReplayStartingDefaults().exchange);
  const [marketType, setMarketType] = useState<MarketType>(() => getReplayStartingDefaults().marketType);
  const [timeframe, setTimeframe] = useState<Timeframe>(() => getReplayStartingDefaults().timeframe);

  // Replay Candlestick State
  const [allCandles, setAllCandles] = useState<Kline[]>([]);
  const [cutoffIndex, setCutoffIndex] = useState<number>(0);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [cachedHistoryPrefix, setCachedHistoryPrefix] = useState<Kline[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const historyRequestIdRef = useRef(0);
  const historyCheckedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focusTrigger, setFocusTrigger] = useState<number>(0);

  // Replay chart block sizes itself to the device viewport; no manual height state.

  // Playback Control
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0); // 1x = 600ms per bar
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Fractional playback is chart-only: the authoritative history cursor
  // advances exactly once per completed bar, preserving journal/profile writes.
  const [playbackPhase, setPlaybackPhase] = useState(0);
  const playbackFractionRef = useRef(0);
  const nextBarCutoffRef = useRef<{ time: number; phase: number; id: string } | null>(null);
  const orderCutoffsRef = useRef(new Map<string, { time: number; phase: number }>());
  const resetIntrabar = useCallback(() => {
    playbackFractionRef.current = 0;
    setPlaybackPhase(0);
  }, []);
  const loadRequestIdRef = useRef(0);
  const randomHistorySelectionRef = useRef(false);

  // All authenticated Replay data is tied to PostgreSQL session identity.
  // The latest candle is persisted only on trade actions or every 20s during playback.
  const replayProfile = useReplayProfileState({
    symbol, exchange, marketType, timeframe,
    atTime: allCandles[currentIndex]?.time,
  }, isPlaying);
  const {
    owner, ownerKey, isReady, storeError, restoredContext, lastSyncedRevision, lastSyncedTradeIds,
    settings, setSettings, position, setPosition,
    pendingOrders, setPendingOrders, journalItems, setJournalItems,
    resetSimulator,
  } = replayProfile;
  const initializedAccountRef = useRef<string | null>(null);
  const lastAccountRef = useRef(ownerKey);
  const screenshotOwnerRef = useRef(owner);
  screenshotOwnerRef.current = owner;

  // Prevent old chart requests or timers from modifying a newly signed-in
  // account's simulator. Do not clear the previous account's saved journal.
  useEffect(() => {
    if (lastAccountRef.current === ownerKey) return;
    lastAccountRef.current = ownerKey;
    initializedAccountRef.current = null;
    loadRequestIdRef.current++;
    historyRequestIdRef.current++;
    setIsPlaying(false);
    resetIntrabar();
    nextBarCutoffRef.current = null;
    orderCutoffsRef.current.clear();
    setAllCandles([]);
    setCurrentIndex(0);
    setCutoffIndex(0);
    setCachedHistoryPrefix([]);
    setHistoryExpanded(false);
    setIsHistoryLoading(false);
  }, [ownerKey, resetIntrabar]);

  useEffect(() => {
    if (!isReady) {
      setIsPlaying(false);
      resetIntrabar();
    }
  }, [isReady, resetIntrabar]);
  const [legacyJournalCount, setLegacyJournalCount] = useState(0);
  const legacyImportPending = useRef<string | null>(null);
  const legacyImportAfterRevision = useRef(0);
  const legacyImportedTradeIds = useRef<string[]>([]);
  const forgetLegacyImport = () => {
    legacyImportPending.current = null;
    legacyImportAfterRevision.current = 0;
    legacyImportedTradeIds.current = [];
  };
  // Never carry a pending legacy import over to another signed-in account.
  useEffect(() => {
    if (legacyImportPending.current && legacyImportPending.current !== owner)
      forgetLegacyImport();
  }, [owner]);
  // Serialized image writes/deletes prevent a late screenshot capture from
  // resurrecting a deleted trade or surviving a balance reset.
  const imageOperations = useRef<Promise<void>>(Promise.resolve());
  const storingScreenshots = useRef(new Set<string>());
  // Keep PNG bytes until PostgreSQL acknowledges the deleted journal rows.
  // Deleting them before a failed profile PUT would leave a restored trade
  // pointing at an irretrievably lost screenshot.
  const pendingPngCleanup = useRef<Array<{
    owner: string; afterRevision: number; tradeIds: string[]; all: boolean;
  }>>([]);
  const queueImageOperation = (perform: () => Promise<void>) => {
    const next = imageOperations.current.catch(() => {}).then(perform);
    imageOperations.current = next.catch(error =>
      console.warn('[Replay screenshots] browser storage unavailable', error));
    return next;
  };

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'danger' | 'info';
    title: string;
    description: string;
  } | null>(null);

  // Reuse a single lazily-created audio context instead of creating a new
  // browser audio device on every fast Replay order fill / liquidation.
  const replayAudioContextRef = useRef<AudioContext | null>(null);
  useEffect(() => () => {
    const context = replayAudioContextRef.current;
    replayAudioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }, []);
  const playSound = useCallback((type: 'order' | 'tp' | 'sl' | 'liq') => {
    try {
      const AudioContextType = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextType) return;
      let audioCtx = replayAudioContextRef.current;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextType();
        replayAudioContextRef.current = audioCtx;
      }
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {});
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      if (type === 'tp' || type === 'order') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.15); // G5
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(349.23, audioCtx.currentTime); // F4
        osc.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.2); // A3
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      }

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Audio is unavailable or playback is blocked by browser permissions.
    }
  }, []);

  const replayToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (replayToastTimerRef.current) clearTimeout(replayToastTimerRef.current);
  }, []);
  const showToast = useCallback(
    (type: 'success' | 'danger' | 'info', title: string, description: string) => {
      if (replayToastTimerRef.current) clearTimeout(replayToastTimerRef.current);
      setToastMessage({ type, title, description });
      replayToastTimerRef.current = setTimeout(() => {
        replayToastTimerRef.current = null;
        setToastMessage(null);
      }, 4500);
    },
    []
  );

  const reportScreenshotCleanupError = () => {
    const message = {
      uk: 'Не вдалося остаточно видалити локальні знімки. Очистіть дані сайту в браузері або повторіть дію.',
      en: 'Could not delete all local screenshots. Clear site storage in your browser or retry.',
      pl: 'Nie udało się usunąć lokalnych zrzutów. Wyczyść dane witryny w przeglądarce lub spróbuj ponownie.',
      ru: 'Не удалось удалить локальные снимки. Очистите данные сайта в браузере или повторите действие.',
    }[language];
    showToast('danger', 'Replay', message);
  };
  const schedulePngCleanupAfterSync = (tradeIds: string[], all = false) => {
    if (!owner) return;
    pendingPngCleanup.current.push({
      owner, afterRevision: lastSyncedRevision,
      tradeIds: [...new Set(tradeIds)], all,
    });
  };
  // Old sessions are reconciled by IndexedDB pruning on next profile load.
  useEffect(() => {
    pendingPngCleanup.current = pendingPngCleanup.current.filter(item => item.owner === owner);
  }, [owner]);
  useEffect(() => {
    if (!owner || !isReady || lastSyncedRevision <= 0) return;
    const remaining: typeof pendingPngCleanup.current = [];
    for (const item of pendingPngCleanup.current) {
      if (item.owner !== owner) continue;
      if (lastSyncedRevision <= item.afterRevision
          || item.tradeIds.some(id => lastSyncedTradeIds.includes(id))) {
        remaining.push(item);
        continue;
      }
      const clean = item.all && journalItems.length === 0 && lastSyncedTradeIds.length === 0
        ? () => clearReplayScreenshots(owner)
        : () => deleteReplayScreenshots(owner, item.tradeIds);
      void queueImageOperation(clean).catch(reportScreenshotCleanupError);
    }
    pendingPngCleanup.current = remaining;
  }, [owner, isReady, lastSyncedRevision, lastSyncedTradeIds, journalItems]);


  // Complete crypto market coins with volume from $100k to $10B
  const [allMarketCoins, setAllMarketCoins] = useState<ScannedCoin[]>([]);

  useEffect(() => {
    let isCancelled = false;
    async function loadAllMarketCoins() {
      try {
        const res = await fetch('/api/screener/coins?minVolume=100000&maxVolume=10000000000');
        if (res.ok) {
          const json = await res.json();
          if (!isCancelled && json.success && Array.isArray(json.data) && json.data.length > 0) {
            const mapped: ScannedCoin[] = json.data.map((c: any) => ({
              symbol: c.symbol,
              baseAsset: c.baseAsset,
              quoteAsset: c.quoteAsset || 'USDT',
              exchange: c.exchange,
              marketType: c.marketType,
              price: c.price,
              currentPrice: c.price,
              priceChange24h: c.change24h || 0,
              volume24hUsd: c.volumeUsd || 0,
              high24h: c.high24h || c.price,
              low24h: c.low24h || c.price,
              highPrice24h: c.high24h || c.price,
              lowPrice24h: c.low24h || c.price,
              timeframe: '1h' as Timeframe,
              formations: [],
              hasFormations: false,
              exchangeUrl: c.exchangeUrl || `https://www.binance.com/en/futures/${c.symbol}`,
              lastUpdated: Date.now(),
            }));
            setAllMarketCoins(mapped);
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to load market coins from server, falling back to direct tickers:', e);
      }

      // Fallback: direct Binance & Bybit tickers
      try {
        const [binanceTickers, bybitTickers] = await Promise.all([
          fetchDirectBinanceTickers(),
          fetchDirectBybitTickers(),
        ]);
        const combined = [...binanceTickers, ...bybitTickers];
        if (!isCancelled && combined.length > 0) {
          const mapped: ScannedCoin[] = combined
            .filter((c) => c.volumeUsd >= 100_000 && c.volumeUsd <= 10_000_000_000)
            .map((c) => ({
              symbol: c.symbol,
              baseAsset: c.baseAsset,
              quoteAsset: c.quoteAsset || 'USDT',
              exchange: c.exchange,
              marketType: c.marketType,
              price: c.price,
              currentPrice: c.price,
              priceChange24h: c.change24h || 0,
              volume24hUsd: c.volumeUsd || 0,
              high24h: c.high24h || c.price,
              low24h: c.low24h || c.price,
              highPrice24h: c.high24h || c.price,
              lowPrice24h: c.low24h || c.price,
              timeframe: '1h' as Timeframe,
              formations: [],
              hasFormations: false,
              exchangeUrl: c.exchangeUrl || `https://www.binance.com/en/futures/${c.symbol}`,
              lastUpdated: Date.now(),
            }));
          setAllMarketCoins(mapped);
        }
      } catch (e) {
        console.warn('Direct tickers fallback failed:', e);
      }
    }

    loadAllMarketCoins();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Never bind unscoped pre-login localStorage data to an arbitrary account.
  // The owner must explicitly choose import; copy stays until a PG ACK.
  useEffect(() => {
    if (!isReady || !owner || legacyImportPending.current) return;
    try {
      const value = JSON.parse(localStorage.getItem('signalhook_replay_journal') || '[]');
      setLegacyJournalCount(Array.isArray(value) ? value.length : 0);
    } catch { setLegacyJournalCount(0); }
  }, [isReady, owner, lastSyncedRevision]);

  useEffect(() => {
    if (!owner || legacyImportPending.current !== owner
      || lastSyncedRevision <= legacyImportAfterRevision.current
      || !legacyImportedTradeIds.current.every(id => lastSyncedTradeIds.includes(id))) return;
    try {
      localStorage.removeItem('signalhook_replay_journal');
      localStorage.removeItem('signalhook_replay_settings');
      legacyImportPending.current = null;
      setLegacyJournalCount(0);
    } catch {
      // Keep the old copy if the browser blocks cleanup; it is not read as
      // another account's journal, and explicit reset can purge it later.
    }
  }, [lastSyncedRevision, lastSyncedTradeIds, owner]);

  // The legacy localStorage copy also contains PNG data URLs. During a
  // still-unacknowledged import, deleting a journal trade must remove its
  // duplicate from the old local copy, not only from IndexedDB/PostgreSQL.
  const purgeLegacyImportedTrade = (tradeId: string) => {
    if (!owner || legacyImportPending.current !== owner) return;
    try {
      const stored = JSON.parse(localStorage.getItem('signalhook_replay_journal') || '[]');
      if (!Array.isArray(stored)) throw new Error('Invalid legacy journal');
      const remaining = stored.filter((row: unknown) =>
        !row || typeof row !== 'object' || (row as { id?: string }).id !== tradeId);
      if (remaining.length) localStorage.setItem('signalhook_replay_journal', JSON.stringify(remaining));
      else localStorage.removeItem('signalhook_replay_journal');
      legacyImportedTradeIds.current = legacyImportedTradeIds.current.filter(id => id !== tradeId);
      if (!remaining.length) {
        forgetLegacyImport();
        setLegacyJournalCount(0);
      }
    } catch {
      reportScreenshotCleanupError();
    }
  };

  const importLegacyReplay = () => {
    if (!owner || journalItems.length > 0) return;
    const label = {
      uk: 'Перенести старий локальний журнал і баланс у ваш поточний профіль? Дані залишаться локально до підтвердження збереження.',
      en: 'Import old local trades and balance into your current profile? The old copy stays until saving succeeds.',
      pl: 'Zaimportować lokalne transakcje i saldo do bieżącego profilu? Kopia pozostanie do potwierdzenia zapisu.',
      ru: 'Перенести старые локальные сделки и баланс в текущий профиль? Копия сохранится до подтверждения записи.',
    }[language];
    if (!window.confirm(label)) return;
    try {
      const raw = JSON.parse(localStorage.getItem('signalhook_replay_journal') || '[]');
      if (!Array.isArray(raw)) return;
      // The profile server caps a journal at 700 records; refusing a larger
      // legacy import is safer than silently dropping its oldest trades/PNGs.
      if (raw.length > 700) {
        showToast('danger', 'Replay',
          language === 'uk' ? 'Старий журнал має понад 700 угод. Локальна копія збережена; її не можна безпечно перенести за один раз.'
          : language === 'pl' ? 'Stary dziennik ma ponad 700 transakcji. Lokalna kopia pozostaje bez zmian.'
          : language === 'ru' ? 'В старом журнале более 700 сделок. Локальная копия сохранена без изменений.'
          : 'The legacy journal has over 700 trades. The local backup was kept unchanged.');
        return;
      }
      const trades: ReplayTradeJournalItem[] = [];
      const seen = new Set<string>();
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const trade = item as ReplayTradeJournalItem;
        if (typeof trade.id !== 'string' || trade.id.length > 90 || seen.has(trade.id)
          || typeof trade.symbol !== 'string' || !/^[A-Za-z0-9_.:-]{2,45}$/.test(trade.symbol)
          || !['binance','bybit'].includes(trade.exchange)
          || !['futures','spot'].includes(trade.marketType)
          || !['1m','5m','15m','1h','4h','1d'].includes(trade.timeframe)
          || !['long','short'].includes(trade.side)
          || !['tp','sl','manual','liquidation','limit'].includes(trade.exitReason)
          || ![
            trade.entryPrice, trade.exitPrice, trade.entryTime, trade.exitTime,
            trade.sizeUsd, trade.marginUsd, trade.leverage, trade.pnlUsd,
            trade.pnlPct, trade.commissionUsd,
          ].every(value => typeof value === 'number' && Number.isFinite(value))
          || typeof trade.tag !== 'string') continue;
        seen.add(trade.id);
        trades.push({ ...trade, screenshotUrl:
          trade.screenshotUrl?.startsWith('data:image/') ? trade.screenshotUrl : undefined });
        if (trades.length >= 700) break;
      }
      if (!trades.length) return;
      // Do not delete records that fail validation or duplicate an ID. The
      // pre-migration local journal must stay untouched until every row can
      // be represented safely in the authenticated account.
      if (trades.length !== raw.length) {
        showToast('danger', 'Replay',
          language === 'uk' ? 'Не всі записи старого журналу пройшли перевірку. Локальна копія збережена без змін.'
          : language === 'pl' ? 'Nie wszystkie stare transakcje są prawidłowe. Lokalna kopia pozostała bez zmian.'
          : language === 'ru' ? 'Часть старых сделок не прошла проверку. Локальная копия сохранена.'
          : 'Some legacy trades are invalid or duplicated. The local backup remains unchanged.');
        return;
      }
      const saved = JSON.parse(localStorage.getItem('signalhook_replay_settings') || 'null');
      if (saved && typeof saved === 'object') {
        setSettings(current => {
          const values = { ...current };
          for (const key of ['balance','leverage','positionSizeUsd','commissionPct','spreadPct','slippagePct','autoSlPct','autoTpPct'] as const) {
            const value = saved[key];
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e12)
              values[key] = value;
          }
          return values;
        });
      }
      legacyImportPending.current = owner;
      legacyImportAfterRevision.current = lastSyncedRevision;
      legacyImportedTradeIds.current = trades.map(item => item.id);
      setLegacyJournalCount(0);
      setJournalItems(trades);
    } catch {
      showToast('danger', 'Replay', 'Legacy journal is unreadable');
    }
  };

  const removeLegacyReplay = () => {
    const label = {
      uk: 'Назавжди видалити старий локальний журнал і всі його PNG-фотографії?',
      en: 'Permanently delete the old local journal and all embedded PNG screenshots?',
      pl: 'Trwale usunąć stary lokalny dziennik i wszystkie zrzuty PNG?',
      ru: 'Навсегда удалить старый локальный журнал и все PNG-снимки?',
    }[language];
    if (!window.confirm(label)) return;
    try {
      localStorage.removeItem('signalhook_replay_journal');
      localStorage.removeItem('signalhook_replay_settings');
      setLegacyJournalCount(0);
    } catch { reportScreenshotCleanupError(); }
  };

  // The journal never sends base64 screenshots to PostgreSQL/localStorage.
  // Persist the PNG bytes to the signed-in owner's IndexedDB and keep only a
  // tiny reference in the profile state. Guests keep ephemeral in-memory images.
  useEffect(() => {
    if (!owner || !isReady) return;
    for (const item of journalItems) {
      const image = item.screenshotUrl;
      if (!image?.startsWith('data:image/')) continue;
      const userId = owner, tradeId = item.id;
      // Trade IDs are not globally unique across imported journals/accounts.
      // Keep in-flight image locks owner-scoped, like the underlying IndexedDB key.
      const operationKey = userId + ':' + tradeId;
      if (storingScreenshots.current.has(operationKey)) continue;
      storingScreenshots.current.add(operationKey);
      void queueImageOperation(() => storeReplayScreenshot(userId, tradeId, image))
        .then(() => {
          if (screenshotOwnerRef.current !== userId) return;
          setJournalItems(current => current.map(row => row.id === tradeId && row.screenshotUrl === image
            ? { ...row, screenshotUrl: replayImageKey(tradeId) } : row));
        })
        .catch(() => {
          if (screenshotOwnerRef.current !== userId) return;
          const message = {
            uk: 'Браузер не зміг зберегти PNG. Збережіть фотографію вручну або звільніть місце.',
            en: 'Could not save the PNG in this browser. Download it manually or free storage.',
            pl: 'Nie udało się zapisać PNG w przeglądarce. Pobierz plik ręcznie lub zwolnij miejsce.',
            ru: 'Не удалось сохранить PNG в браузере. Скачайте его вручную или освободите место.',
          }[language];
          showToast('danger', 'Replay PNG', message);
          // Preserve the original data URL for a confirmed legacy import. If
          // we removed it, PostgreSQL would ACK a photo-less trade and then
          // erase the only remaining local backup containing that image.
          if (legacyImportPending.current === userId) return;
          // For a new trade, retain its metadata without an oversized data URL
          // in PostgreSQL. The warning above makes the lost PNG explicit.
          setJournalItems(current => current.map(row => row.id === tradeId && row.screenshotUrl === image
            ? { ...row, screenshotUrl: undefined } : row));
        })
        .finally(() => storingScreenshots.current.delete(operationKey));
    }
  }, [journalItems, owner, isReady, setJournalItems]);

  // Filter all coins with 24h volume between $100k and $10B
  const qualifiedCoins = useMemo(() => {
    if (allMarketCoins.length > 0) {
      return allMarketCoins;
    }
    const list = coins.filter((c) => {
      const vol = c.volume24hUsd || 0;
      return vol >= 100_000 && vol <= 10_000_000_000;
    });
    if (list.length > 0) return list;
    // Fallback popular pairs if coins not yet loaded
    return TOP_POPULAR_PAIRS.map((p) => ({
      symbol: p.symbol,
      baseAsset: p.baseAsset,
      quoteAsset: 'USDT',
      exchange: 'binance' as ExchangeId,
      marketType: 'futures' as MarketType,
      price: 0,
      currentPrice: 0,
      priceChange24h: 0,
      volume24hUsd: 5_000_000,
      high24h: 0,
      low24h: 0,
      highPrice24h: 0,
      lowPrice24h: 0,
      timeframe: '1h' as Timeframe,
      formations: [],
      hasFormations: false,
      exchangeUrl: `https://www.binance.com/en/futures/${p.symbol}`,
      lastUpdated: Date.now(),
    }));
  }, [allMarketCoins, coins]);

  // Load Historical Candles for a Target Date
  const loadHistoryForDate = useCallback(
    async (targetDate: Date, sym = symbol, ex = exchange, mkt = marketType, tf = timeframe,
      notifyReady = true, restoringProfile = false) => {
      const requestId = ++loadRequestIdRef.current;
      historyRequestIdRef.current++;
      historyCheckedRef.current = false;
      setHistoryExpanded(false);
      setCachedHistoryPrefix([]);
      setIsHistoryLoading(false);
      const randomSelection = randomHistorySelectionRef.current;
      randomHistorySelectionRef.current = false;
      setIsLoadingCandles(true);
      setLoadError(null);
      setIsPlaying(false);
      resetIntrabar();
      nextBarCutoffRef.current = null;
      orderCutoffsRef.current.clear();
      setAllCandles([]);
      if (!restoringProfile) {
        setPosition(null);
        setPendingOrders([]);
      }

      try {
        // Resolve the public market's first available candle once per instrument,
        // not once per user/date. Random mode never picks a pre-listing date.
        const firstCandleMs = await fetchReplayHistoryBoundary(ex, mkt, sym);
        if (requestId !== loadRequestIdRef.current) return;
        const resolved = resolveReplayHistoryDate(targetDate, firstCandleMs, tf, randomSelection);
        const actualDate = resolved.date;
        const { allCandles: fetchedCandles, cutoffIndex: idx } = await fetchHistoricalReplayCandles(
          ex,
          mkt,
          sym,
          tf,
          actualDate.getTime(),
          280,
          350
        );

        if (requestId !== loadRequestIdRef.current) return;
        if (fetchedCandles.length < 10) {
          throw new Error(
            t('replay.history.unavailable', { symbol: sym, date: actualDate.toLocaleDateString(uiLocale) })
          );
        }

        setAllCandles(fetchedCandles);
        setCutoffIndex(idx);
        setCurrentIndex(idx);
        setFocusTrigger((prev) => prev + 1);

        // Initial page entry should load silently. Explicit history/date changes may still show feedback.
        if (notifyReady) {
          showToast(
            'info',
            t('replay.history.readyTitle'),
            t('replay.history.readyDescription', { count: fetchedCandles.length, date: actualDate.toLocaleDateString(uiLocale) })
          );
          if (resolved.adjusted && !randomSelection && firstCandleMs) {
            const notice = {
              uk: 'Обрана дата передує початку торгів. Відкрито реальні свічки після лістингу:',
              en: 'The chosen date is before the listing. Showing real candles after the market opened:',
              pl: 'Wybrana data jest wcześniejsza niż debiut. Otwarto rzeczywiste świece po notowaniu:',
              ru: 'Выбранная дата раньше листинга. Открыты реальные свечи после начала торгов:',
            }[language];
            showToast('info', t('replay.history.readyTitle'),
              notice + ' ' + new Date(firstCandleMs).toLocaleDateString(uiLocale));
          }
        }
      } catch (err: any) {
        if (requestId !== loadRequestIdRef.current) return;
        console.error('Failed to load replay history:', err);
        setLoadError(err.message || t('replay.history.loadError'));
      } finally {
        if (requestId === loadRequestIdRef.current) setIsLoadingCandles(false);
      }
    },
    [symbol, exchange, marketType, timeframe, showToast, t, uiLocale, language, resetIntrabar]
  );

  // Wait until the correct account snapshot has loaded before initializing
  // Replay candles. Never clear a restored open position on page entry.
  useEffect(() => {
    if (!isReady || initializedAccountRef.current === ownerKey) return;
    initializedAccountRef.current = ownerKey;
    if (restoredContext?.atTime) {
      setSymbol(restoredContext.symbol);
      setExchange(restoredContext.exchange);
      setMarketType(restoredContext.marketType);
      setTimeframe(restoredContext.timeframe);
      void loadHistoryForDate(new Date(restoredContext.atTime * 1000),
        restoredContext.symbol, restoredContext.exchange, restoredContext.marketType,
        restoredContext.timeframe, false, true);
    } else {
      // Account defaults are available after Replay's owner snapshot hydrates.
      // Apply only on first entry, never during an active simulation or when
      // restoring a saved Replay context/position from PostgreSQL.
      const initial = getReplayStartingDefaults();
      setExchange(initial.exchange);
      setMarketType(initial.marketType);
      setTimeframe(initial.timeframe);
      randomHistorySelectionRef.current = true;
      void loadHistoryForDate(generateRandomHistoricalDate(), symbol,
        initial.exchange, initial.marketType, initial.timeframe, false);
    }
  }, [isReady, ownerKey, restoredContext]);

  // Only the chart receives cached older history while History is expanded.
  // Replay playback, dates, journal and simulation indices remain untouched.
  const confirmedReplayCandles = useMemo(
    () => replayVisibleCandles(allCandles, currentIndex, historyExpanded, cachedHistoryPrefix),
    [allCandles, currentIndex, historyExpanded, cachedHistoryPrefix],
  );
  // Only the next candle is reconstructed, from its already fetched OHLC.
  // The unaltered future candles never enter any renderer, journal or overlay.
  const partialCandle = useMemo(() => playbackPhase > 0 && currentIndex + 1 < allCandles.length
    ? replayIntrabarCandle(allCandles[currentIndex + 1], playbackPhase / REPLAY_INTRABAR_PHASES)
    : null, [allCandles, currentIndex, playbackPhase]);
  const visibleCandles = useMemo(() => partialCandle
    ? [...confirmedReplayCandles, partialCandle] : confirmedReplayCandles,
    [confirmedReplayCandles, partialCandle]);

  // History is a viewport mode with an optional cache-only prepend. Never
  // request older candles from Binance, Bybit, or the normal /api/klines route.
  const toggleCachedHistory = useCallback(async () => {
    if (historyExpanded) {
      historyRequestIdRef.current++;
      setHistoryExpanded(false);
      setIsHistoryLoading(false);
      return;
    }
    if (isLoadingCandles || isHistoryLoading || !allCandles.length) return;
    setHistoryExpanded(true);
    if (historyCheckedRef.current) return;
    const activeLoadId = loadRequestIdRef.current;
    const requestId = ++historyRequestIdRef.current;
    setIsHistoryLoading(true);
    try {
      const query = new URLSearchParams({
        exchange, market: marketType, symbol, timeframe,
        beforeTime: String(allCandles[0].time), limit: '1800',
      });
      const response = await fetch(`/api/replay/cached-history?${query.toString()}`);
      if (!response.ok) throw new Error('cache unavailable');
      const json = await response.json();
      if (!json.success || json.cacheOnly !== true || !Array.isArray(json.data)) throw new Error('invalid cache response');
      if (activeLoadId !== loadRequestIdRef.current || requestId !== historyRequestIdRef.current) return;
      historyCheckedRef.current = true;
      const { candles, added } = prependCachedReplayHistory(allCandles, json.data as Kline[], timeframe);
      if (added) {
        // Do not append cached past to the simulator dataset. Keeping it in a
        // separate prefix prevents History from increasing normal chart FPS cost
        // after the user collapses it, and preserves total/replay indices.
        setCachedHistoryPrefix(candles.slice(0, added));
      } else {
        showToast('info', t('replay.chart.history.title'), t('replay.chart.history.noExtra'));
      }
    } catch {
      if (activeLoadId === loadRequestIdRef.current && requestId === historyRequestIdRef.current) {
        showToast('info', t('replay.chart.history.title'), t('replay.chart.history.unavailable'));
      }
    } finally {
      if (activeLoadId === loadRequestIdRef.current && requestId === historyRequestIdRef.current) {
        setIsHistoryLoading(false);
      }
    }
  }, [allCandles, exchange, marketType, symbol, timeframe, historyExpanded, isLoadingCandles, isHistoryLoading, showToast, t]);

  const currentCandle = visibleCandles[visibleCandles.length - 1] || null;
  const currentPrice = currentCandle ? currentCandle.close : 0;
  // Display the simulated last price/PnL while leaving the persisted open
  // position untouched until the next historical candle is committed.
  const displayPosition = useMemo(() => {
    if (!position || !partialCandle) return position;
    const { pnlUsd, pnlPct } = calculateUnrealizedPnl(position, partialCandle.close);
    return { ...position, currentPrice: partialCandle.close,
      unrealizedPnlUsd: pnlUsd, unrealizedPnlPct: pnlPct };
  }, [position, partialCandle]);

  // Step Forward +1 Candle Logic. Explicit steps always reveal a complete bar.
  const handleStepForward = useCallback(() => {
    resetIntrabar();
    if (currentIndex >= allCandles.length - 1) {
      setIsPlaying(false);
      showToast('info', t('replay.history.endTitle'), t('replay.history.endDescription'));
      return;
    }

    const nextIndex = currentIndex + 1;
    const nextCandle = allCandles[nextIndex];
    // Capture the active order's in-bar origin before clearing it. The bar
    // will be committed only after all synthetic animation phases have passed.
    const currentEntryCutoff = nextBarCutoffRef.current;
    nextBarCutoffRef.current = null;
    setCurrentIndex(nextIndex);

    // 1. Check Pending Orders (Limit / Stop)
    setPendingOrders((prevOrders) => {
      // No pending order -> do not trigger a profile sync on every replay bar.
      if (prevOrders.length === 0) return prevOrders;
      const remaining: ReplayPendingOrder[] = [];
      for (const order of prevOrders) {
        const cutoff = orderCutoffsRef.current.get(order.id);
        const effectiveBar = cutoff?.time === nextCandle.time
          ? replayRemainingCandle(nextCandle, cutoff.phase) : nextCandle;
        orderCutoffsRef.current.delete(order.id);
        const isFilled = checkOrderFill(order, effectiveBar);
        if (isFilled) {
          // Fill order into active position
          const fillPrice = order.price;
          const screenshot = chartRef.current?.takeScreenshot() || undefined;

          // Check if an existing position exists
          setPosition((prevPos) => {
            if (prevPos) {
              // For simplicity, close or ignore if already in position
              return prevPos;
            }
            const posSide = order.side === 'buy' ? 'long' : 'short';
            const margin = order.sizeUsd / order.leverage;
            const liqPrice = calculateLiquidationPrice(fillPrice, posSide, order.leverage);

            showToast(
              'success',
              t('replay.order.filledTitle', { type: order.orderType.toUpperCase() }),
              t('replay.order.filledPrice', { side: order.side.toUpperCase(), symbol: order.symbol, price: fillPrice.toFixed(2) })
            );
            playSound('order');

            return {
              id: 'pos_' + Date.now(),
              symbol: order.symbol,
              side: posSide,
              entryPrice: fillPrice,
              currentPrice: fillPrice,
              sizeUsd: order.sizeUsd,
              marginUsd: margin,
              quantity: order.sizeUsd / fillPrice,
              leverage: order.leverage,
              slPrice: order.slPrice,
              tpPrice: order.tpPrice,
              entryTime: nextCandle.time,
              unrealizedPnlUsd: 0,
              unrealizedPnlPct: 0,
              liquidationPrice: liqPrice,
              tag: order.tag,
              notes: order.notes,
              entryScreenshot: screenshot,
            };
          });
        } else {
          remaining.push(order);
        }
      }
      return remaining.length === prevOrders.length ? prevOrders : remaining;
    });

    // 2. Check Open Position (SL, TP, Liquidation)
    setPosition((prevPos) => {
      if (!prevPos) return null;

      // Update current price & unrealized P&L
      const { pnlUsd, pnlPct } = calculateUnrealizedPnl(prevPos, nextCandle.close);
      const updatedPos: ReplayPosition = {
        ...prevPos,
        currentPrice: nextCandle.close,
        unrealizedPnlUsd: pnlUsd,
        unrealizedPnlPct: pnlPct,
      };

      // Check triggers on this new candle's High & Low
      const postEntryBar = currentEntryCutoff?.id === prevPos.id && currentEntryCutoff.time === nextCandle.time
        ? replayRemainingCandle(nextCandle, currentEntryCutoff.phase) : nextCandle;
      const trigger = checkPositionTriggers(prevPos, postEntryBar);
      if (trigger) {
        // Position closed by SL, TP, or Liquidation!
        const exitPrice = trigger.exitPrice;
        let finalPnlUsd = 0;
        if (prevPos.side === 'long') {
          finalPnlUsd = ((exitPrice - prevPos.entryPrice) / prevPos.entryPrice) * prevPos.sizeUsd;
        } else {
          finalPnlUsd = ((prevPos.entryPrice - exitPrice) / prevPos.entryPrice) * prevPos.sizeUsd;
        }

        const comm = (prevPos.sizeUsd * settings.commissionPct) / 100;
        const netPnlUsd = finalPnlUsd - comm;
        const finalPnlPct = (netPnlUsd / prevPos.marginUsd) * 100;

        const screenshot = chartRef.current?.takeScreenshot() || prevPos.entryScreenshot;

        const journalRecord: ReplayTradeJournalItem = {
          id: 'trade_' + Date.now(),
          symbol: prevPos.symbol,
          exchange,
          marketType,
          timeframe,
          side: prevPos.side,
          entryPrice: prevPos.entryPrice,
          exitPrice,
          entryTime: prevPos.entryTime,
          exitTime: nextCandle.time,
          sizeUsd: prevPos.sizeUsd,
          marginUsd: prevPos.marginUsd,
          leverage: prevPos.leverage,
          slPrice: prevPos.slPrice,
          tpPrice: prevPos.tpPrice,
          pnlUsd: netPnlUsd,
          pnlPct: finalPnlPct,
          commissionUsd: comm,
          tag: prevPos.tag || 'Replay Trade',
          notes: prevPos.notes,
          screenshotUrl: screenshot,
          exitReason: trigger.reason,
        };

        setJournalItems((items) => [journalRecord, ...items]);

        // Update balance
        setSettings((prevSet) => ({
          ...prevSet,
          balance: Math.max(0, prevSet.balance + netPnlUsd),
        }));

        if (trigger.reason === 'tp') {
          showToast(
            'success',
            t('replay.order.tpTitle'),
            t('replay.order.tpDescription', { pnl: netPnlUsd.toFixed(2), pct: finalPnlPct.toFixed(2) })
          );
          playSound('tp');
        } else if (trigger.reason === 'sl') {
          showToast(
            'danger',
            t('replay.order.slTitle'),
            t('replay.order.slDescription', { pnl: Math.abs(netPnlUsd).toFixed(2), pct: finalPnlPct.toFixed(2) })
          );
          playSound('sl');
        } else if (trigger.reason === 'liquidation') {
          showToast(
            'danger',
            t('replay.order.liquidationTitle'),
            t('replay.order.liquidationDescription', { price: exitPrice.toFixed(2) })
          );
          playSound('liq');
        }

        return null; // Position is now closed
      }

      return updatedPos;
    });
  }, [
    currentIndex,
    allCandles,
    settings.commissionPct,
    exchange,
    marketType,
    timeframe,
    showToast,
    playSound,
    t,
    resetIntrabar,
  ]);

  const handleStepForwardRef = useRef(handleStepForward);
  useEffect(() => {
    handleStepForwardRef.current = handleStepForward;
  }, [handleStepForward]);

  // Browser-only intra-candle animation. Historical seconds are never fetched
  // as fake ticks: the user sees an explicitly labelled OHLC approximation.
  // Up to 64 sub-bar states, with at most 25 timer checks/second. At 0.1x
  // each historical bar takes six seconds; faster speeds skip intermediate
  // states instead of increasing chart CPU or sending exchange requests.
  useEffect(() => {
    if (!isPlaying) return;
    let lastTickAt = performance.now();
    const intervalMs = Math.max(80, 600 / playbackSpeed);
    playbackTimerRef.current = setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === 'hidden') { lastTickAt = now; return; }
      const deltaMs = Math.max(0, Math.min(120, now - lastTickAt));
      lastTickAt = now;
      playbackFractionRef.current = Math.min(1, playbackFractionRef.current + deltaMs / intervalMs);
      if (playbackFractionRef.current >= 1) {
        resetIntrabar();
        handleStepForwardRef.current();
      } else {
        // Floor rather than ceil: a slow preview must never show a state
        // from later than the simulated clock, especially at 0.1x.
        const phase = Math.max(0, Math.min(REPLAY_INTRABAR_PHASES - 1,
          Math.floor(playbackFractionRef.current * REPLAY_INTRABAR_PHASES)));
        setPlaybackPhase(previous => previous === phase ? previous : phase);
      }
    }, REPLAY_INTRABAR_TICK_MS);
    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, resetIntrabar]);

  // Global Keyboard Shortcuts (Space: Play/Pause, Right Arrow: Step +1)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepForward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleStepForward]);

  // Execute Market Order
  const handleExecuteMarketOrder = useCallback(
    (params: {
      side: 'long' | 'short';
      sizeUsd: number;
      leverage: number;
      slPrice?: number;
      tpPrice?: number;
      tag: string;
      notes?: string;
    }) => {
      if (currentPrice <= 0) return;

      if (position) {
        showToast('info', t('replay.order.alreadyOpenTitle'), t('replay.order.alreadyOpenDescription'));
        return;
      }

      const execPrice = calculateExecutionPrice(
        currentPrice,
        params.side === 'long' ? 'buy' : 'sell',
        settings.spreadPct,
        settings.slippagePct
      );

      const margin = params.sizeUsd / params.leverage;
      if (margin > settings.balance) {
        showToast('danger', t('replay.order.marginTitle'), t('replay.order.marginDescription', { needed: margin.toFixed(1), balance: settings.balance.toFixed(1) }));
        return;
      }

      const liqPrice = calculateLiquidationPrice(execPrice, params.side, params.leverage);
      const screenshot = chartRef.current?.takeScreenshot() || undefined;

      const newPos: ReplayPosition = {
        id: 'pos_' + Date.now(),
        symbol,
        side: params.side,
        entryPrice: execPrice,
        currentPrice: execPrice,
        sizeUsd: params.sizeUsd,
        marginUsd: margin,
        quantity: params.sizeUsd / execPrice,
        leverage: params.leverage,
        slPrice: params.slPrice,
        tpPrice: params.tpPrice,
        entryTime: currentCandle ? currentCandle.time : Math.floor(Date.now() / 1000),
        unrealizedPnlUsd: 0,
        unrealizedPnlPct: 0,
        liquidationPrice: liqPrice,
        tag: params.tag,
        notes: params.notes,
        entryScreenshot: screenshot,
      };

      if (partialCandle && playbackPhase > 0) {
        nextBarCutoffRef.current = { time: partialCandle.time,
          phase: playbackPhase / REPLAY_INTRABAR_PHASES, id: newPos.id };
      }
      setPosition(newPos);
      playSound('order');
      showToast(
        'success',
        t('replay.order.marketOpenTitle', { side: params.side.toUpperCase() }),
        t('replay.order.marketOpenDescription', { symbol, size: params.sizeUsd, leverage: params.leverage, price: execPrice.toFixed(2) })
      );
    },
    [currentPrice, position, settings, symbol, currentCandle, partialCandle, playbackPhase, showToast, playSound, t]
  );

  // Place Pending Order (Limit / Stop)
  const handlePlacePendingOrder = useCallback(
    (params: {
      side: 'buy' | 'sell';
      orderType: 'limit' | 'stop';
      price: number;
      sizeUsd: number;
      leverage: number;
      slPrice?: number;
      tpPrice?: number;
      tag: string;
      notes?: string;
    }) => {
      const newOrder: ReplayPendingOrder = {
        id: 'order_' + Date.now(),
        symbol,
        side: params.side,
        orderType: params.orderType,
        price: params.price,
        sizeUsd: params.sizeUsd,
        leverage: params.leverage,
        slPrice: params.slPrice,
        tpPrice: params.tpPrice,
        tag: params.tag,
        notes: params.notes,
        createdAtTime: currentCandle ? currentCandle.time : Math.floor(Date.now() / 1000),
      };

      if (partialCandle && playbackPhase > 0) {
        orderCutoffsRef.current.set(newOrder.id, { time: partialCandle.time,
          phase: playbackPhase / REPLAY_INTRABAR_PHASES });
      }
      setPendingOrders((prev) => [...prev, newOrder]);
      showToast(
        'info',
        t('replay.order.pendingCreatedTitle', { type: params.orderType.toUpperCase() }),
        t('replay.order.pendingCreatedDescription', { side: params.side.toUpperCase(), price: params.price.toFixed(2) })
      );
    },
    [symbol, currentCandle, partialCandle, playbackPhase, showToast, t]
  );

  // Close Position Manually
  const handleClosePosition = useCallback(() => {
    if (!position || currentPrice <= 0) return;

    const exitPrice = calculateExecutionPrice(
      currentPrice,
      position.side === 'long' ? 'sell' : 'buy',
      settings.spreadPct,
      settings.slippagePct
    );

    let finalPnlUsd = 0;
    if (position.side === 'long') {
      finalPnlUsd = ((exitPrice - position.entryPrice) / position.entryPrice) * position.sizeUsd;
    } else {
      finalPnlUsd = ((position.entryPrice - exitPrice) / position.entryPrice) * position.sizeUsd;
    }

    const comm = (position.sizeUsd * settings.commissionPct) / 100;
    const netPnlUsd = finalPnlUsd - comm;
    const finalPnlPct = (netPnlUsd / position.marginUsd) * 100;

    const screenshot = chartRef.current?.takeScreenshot() || position.entryScreenshot;

    const journalRecord: ReplayTradeJournalItem = {
      id: 'trade_' + Date.now(),
      symbol: position.symbol,
      exchange,
      marketType,
      timeframe,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      entryTime: position.entryTime,
      exitTime: currentCandle ? currentCandle.time : Math.floor(Date.now() / 1000),
      sizeUsd: position.sizeUsd,
      marginUsd: position.marginUsd,
      leverage: position.leverage,
      slPrice: position.slPrice,
      tpPrice: position.tpPrice,
      pnlUsd: netPnlUsd,
      pnlPct: finalPnlPct,
      commissionUsd: comm,
      tag: position.tag || 'Manual Close',
      notes: position.notes,
      screenshotUrl: screenshot,
      exitReason: 'manual',
    };

    setJournalItems((prev) => [journalRecord, ...prev]);
    setSettings((prev) => ({
      ...prev,
      balance: Math.max(0, prev.balance + netPnlUsd),
    }));

    setPosition(null);
    playSound(netPnlUsd >= 0 ? 'tp' : 'sl');
    showToast(
      netPnlUsd >= 0 ? 'success' : 'danger',
      t('replay.order.manualCloseTitle'),
      t('replay.order.manualCloseDescription', { sign: netPnlUsd >= 0 ? '+' : '', pnl: netPnlUsd.toFixed(2), pct: finalPnlPct.toFixed(2) })
    );
  }, [
    position,
    currentPrice,
    settings,
    exchange,
    marketType,
    timeframe,
    currentCandle,
    showToast,
    playSound,
    t,
  ]);

  // Market/date switches previously discarded an open trade and pending orders
  // without realizing the PnL. Keep profile data intact until explicitly closed.
  const canChangeReplayHistory = () => {
    if (!position && pendingOrders.length === 0) return true;
    const message = {
      uk: ['Активна симуляція', 'Спочатку закрийте позицію та скасуйте відкладені ордери, щоб не втратити їх під час зміни графіка.'],
      en: ['Active simulation', 'Close the open position and cancel pending orders before changing the chart.'],
      pl: ['Aktywna symulacja', 'Zamknij pozycję i anuluj zlecenia oczekujące przed zmianą wykresu.'],
      ru: ['Активная симуляция', 'Закройте позицию и отмените отложенные ордера перед сменой графика.'],
    }[language];
    showToast('info', message[0], message[1]);
    return false;
  };

  // Coin change handler
  const handleSelectCoin = (newSymbol: string, newExchange: ExchangeId, newMarket: MarketType) => {
    if (!canChangeReplayHistory()) return;
    setSymbol(newSymbol);
    setExchange(newExchange);
    setMarketType(newMarket);
    randomHistorySelectionRef.current = true;
    const date = generateRandomHistoricalDate();
    loadHistoryForDate(date, newSymbol, newExchange, newMarket, timeframe);
  };

  // Timeframe change handler
  const handleTimeframeChange = (newTf: Timeframe) => {
    if (newTf === timeframe || !canChangeReplayHistory()) return;
    setTimeframe(newTf);
    const date = currentCandle ? new Date(currentCandle.time * 1000) : generateRandomHistoricalDate();
    randomHistorySelectionRef.current = !currentCandle;
    loadHistoryForDate(date, symbol, exchange, marketType, newTf);
  };

  // Random date generator
  const handleRandomHistoricalDate = () => {
    if (!canChangeReplayHistory()) return;
    randomHistorySelectionRef.current = true;
    const randomDate = generateRandomHistoricalDate();
    loadHistoryForDate(randomDate, symbol, exchange, marketType, timeframe);
  };

  const toggleReplayPlayback = () => setIsPlaying(previous => !previous);

  // Reset to cutoff index
  const handleResetToCutoff = () => {
    if (!canChangeReplayHistory()) return;
    resetIntrabar();
    nextBarCutoffRef.current = null;
    orderCutoffsRef.current.clear();
    setCurrentIndex(cutoffIndex);
    setIsPlaying(false);
    setFocusTrigger((prev) => prev + 1);
    showToast('info', t('replay.action.resetTitle'), t('replay.action.resetDescription'));
  };

  const currentDateText = currentCandle
    ? new Date(currentCandle.time * 1000).toLocaleString(uiLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }) + ' UTC'
    : '—';

  if (!isReady) {
    return <div className="m-3 rounded-xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-300" role="status">
      {storeError || (language === 'uk' ? 'Завантаження симулятора з профілю…'
        : language === 'pl' ? 'Wczytywanie symulatora z profilu…'
        : language === 'ru' ? 'Загрузка симулятора из профиля…' : 'Loading simulator profile…')}
    </div>;
  }

  return (
    <div className="space-y-4 max-w-[2560px] mx-auto pb-10">
      {/* Training-only introduction. */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-950/30 via-slate-900 to-indigo-950/30 border border-amber-500/20 shadow-md">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20">
            <History className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-base sm:text-lg text-white tracking-tight">{t("replay.chart.page.heading")}</h1>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed max-w-2xl">
              {t("replay.chart.page.intro")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 max-w-full min-w-0 overflow-x-auto whitespace-nowrap text-[10px] sm:text-[11px] text-slate-300" aria-label={t("replay.chart.page.hotkeys")}>
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1.5">
            <kbd className="font-mono font-bold text-amber-300">{t("replay.chart.page.space")}</kbd> — {t("replay.chart.page.playPause")}
          </span>
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1.5">
            <kbd className="font-mono font-bold text-cyan-300">→</kbd> — {t("replay.chart.page.step")}
          </span>
        </div>
      </div>

      {/* Replay Toolbar: Coin, Date, Playback Controls */}
      <ReplayToolbar
        selectedSymbol={symbol}
        selectedExchange={exchange}
        selectedMarketType={marketType}
        availableCoins={qualifiedCoins}
        onSelectCoin={handleSelectCoin}
        isReplayActive={true}
        isPlaying={isPlaying}
        onTogglePlay={toggleReplayPlayback}
        onStepForward={handleStepForward}
        onResetToCutoff={handleResetToCutoff}
        currentDateText={currentDateText}
        onSelectHistoricalDate={(d) => {
          if (canChangeReplayHistory()) void loadHistoryForDate(d, symbol, exchange, marketType, timeframe);
        }}
        onRandomHistoricalDate={handleRandomHistoricalDate}
        currentIndex={currentIndex}
        totalCandles={allCandles.length}
        isLoadingHistoricalData={isLoadingCandles}
      />

      {/* Error Alert if any */}
      {loadError && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={handleRandomHistoricalDate}
            className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 font-semibold transition-colors"
          >
            {t("replay.chart.page.retry")}
          </button>
        </div>
      )}

      {storeError && (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-950/40 p-3 text-xs text-amber-200">
          {storeError}
          <button type="button" className="ml-3 rounded bg-slate-800 px-2 py-1 text-white"
            onClick={() => window.location.reload()}>
            {language === 'uk' ? 'Оновити' : language === 'pl' ? 'Odśwież'
              : language === 'ru' ? 'Обновить' : 'Reload'}
          </button>
        </div>
      )}
      {owner && legacyJournalCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-slate-900/90 px-3 py-2 text-xs text-amber-200" role="note">
          <span>
            {language === 'uk' ? 'Знайдено старий локальний журнал:' : language === 'en' ? 'Old local journal found:'
              : language === 'pl' ? 'Znaleziono stary lokalny dziennik:' : 'Найден старый локальный журнал:'}
            {' '}{legacyJournalCount}
          </span>
          {journalItems.length === 0 && <button type="button" onClick={importLegacyReplay}
            className="rounded border border-amber-500/40 px-2 py-1 text-amber-100 hover:bg-amber-500/15">
            {language === 'uk' ? 'Перенести в профіль' : language === 'en' ? 'Import to profile'
              : language === 'pl' ? 'Importuj do profilu' : 'Импортировать в профиль'}
          </button>}
          <button type="button" onClick={removeLegacyReplay}
            className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800">
            {language === 'uk' ? 'Видалити стару копію' : language === 'en' ? 'Delete old copy'
              : language === 'pl' ? 'Usuń starą kopię' : 'Удалить старую копию'}
          </button>
        </div>
      )}
      {/* Training chart uses available full width, with practice controls below. */}
      <div className="flex flex-col gap-4 min-w-0">
        <div className="w-full min-w-0">
          <ReplayChart
            ref={chartRef}
            visibleCandles={visibleCandles}
            symbol={symbol}
            timeframe={timeframe}
            onTimeframeChange={handleTimeframeChange}
            isLoadingHistoricalData={isLoadingCandles}
            playbackSpeed={playbackSpeed}
            onSpeedChange={setPlaybackSpeed}
            historyExpanded={historyExpanded}
            isHistoryLoading={isHistoryLoading}
            onToggleHistory={toggleCachedHistory}
            isPlaying={isPlaying}
            isIntrabarPreview={partialCandle !== null}
            canAdvance={allCandles.length > 0 && currentIndex < allCandles.length - 1}
            onTogglePlay={toggleReplayPlayback}
            onStepForward={handleStepForward}
            onRandomHistoricalDate={handleRandomHistoricalDate}
            exchange={exchange}
            marketType={marketType}
            position={displayPosition}
            pendingOrders={pendingOrders}
            isReplaying={true}
            focusTrigger={focusTrigger}
            onTakeScreenshotNotification={() =>
              showToast('success', t('replay.action.screenshotTitle'), t('replay.action.screenshotDescription'))
            }
          />
        </div>
        <div className="w-full min-w-0">
          <ReplaySimulatorPanel
            currentPrice={currentPrice}
            currentCandle={currentCandle}
            position={displayPosition}
            settings={settings}
            onUpdateSettings={setSettings}
            onExecuteMarketOrder={handleExecuteMarketOrder}
            onPlacePendingOrder={handlePlacePendingOrder}
            onClosePosition={handleClosePosition}
            onResetBalance={() => {
              const warning = {
                uk: 'Скинути баланс і повністю очистити поточну симуляцію: позицію, відкладені ордери, журнал, статистику та фотографії?',
                en: 'Reset balance and permanently clear the position, pending orders, journal, statistics and screenshots?',
                pl: 'Zresetować saldo i usunąć pozycję, zlecenia oczekujące, dziennik, statystyki i zrzuty ekranu?',
                ru: 'Сбросить баланс и удалить позицию, отложенные ордера, журнал, статистику и скриншоты?',
              }[language];
              if (!window.confirm(warning)) return;
              setIsPlaying(false);
              resetSimulator();
              forgetLegacyImport();
              setLegacyJournalCount(0);
              schedulePngCleanupAfterSync(journalItems.map(item => item.id), true);
              // Legacy global records are not imported into any other user.
              // Explicit reset purges their original base64 copies as well.
              try {
                localStorage.removeItem('signalhook_replay_journal');
                localStorage.removeItem('signalhook_replay_settings');
              } catch {}
              showToast('info', t('replay.action.balanceTitle'), t('replay.action.balanceDescription'));
            }}
          />
        </div>
      </div>

      {/* Trading Journal Section (Full Width Below) */}
      <div className="w-full">
        <ReplayJournal
          journalItems={journalItems}
          pendingOrders={pendingOrders}
          onCancelPendingOrder={(orderId) => {
            setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
            showToast('info', t('replay.action.cancelTitle'), t('replay.action.cancelDescription'));
          }}
          onClearJournal={() => {
            setJournalItems([]);
            if (owner && legacyImportPending.current === owner) {
              try {
                localStorage.removeItem('signalhook_replay_journal');
                setLegacyJournalCount(0);
              } catch { reportScreenshotCleanupError(); }
              forgetLegacyImport();
            }
            schedulePngCleanupAfterSync(journalItems.map(item => item.id), true);
            showToast('info', t('replay.action.journalTitle'), t('replay.action.journalDescription'));
          }}
          onDeleteJournalItem={(id) => {
            setJournalItems(prev => prev.filter(item => item.id !== id));
            purgeLegacyImportedTrade(id);
            schedulePngCleanupAfterSync([id]);
          }}
          imageOwner={owner}
        />
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-200">
          <div
            className={`p-3.5 rounded-2xl shadow-2xl border backdrop-blur-md flex items-start justify-between gap-3 ${
              toastMessage.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/40 text-emerald-200 shadow-emerald-950/20'
                : toastMessage.type === 'danger'
                ? 'bg-slate-900/95 border-rose-500/40 text-rose-200 shadow-rose-950/20'
                : 'bg-slate-900/95 border-cyan-500/40 text-cyan-200 shadow-cyan-950/20'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  toastMessage.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : toastMessage.type === 'danger'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-cyan-500/20 text-cyan-400'
                }`}
              >
                {toastMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : toastMessage.type === 'danger' ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
              </div>
              <div>
                <div className="font-bold text-xs text-white">{toastMessage.title}</div>
                <div className="text-[11px] text-slate-300 leading-snug">
                  {toastMessage.description}
                </div>
              </div>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
