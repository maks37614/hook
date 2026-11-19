import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  Star,
  Plus,
  TrendingUp,
  TrendingDown,
  Activity,
  SlidersHorizontal,
  Flame,
  ArrowUpDown,
  Zap,
  Globe,
  Loader2,
  ArrowDownToLine,
  ArrowUpToLine,
} from 'lucide-react';
import { FormationsIcon } from '../PageIcons';
import { ScreenerVolumeDropdown } from '../ScreenerVolumeDropdown';
import { isVolumeWithinCap, preferredVolumeSortOrder, type ScreenerVolumeMode } from '../../utils/screenerVolume';
import { ScannedCoin, Timeframe, ExchangeId, MarketType, MarketCoin } from '../../types';
import { formatVolume } from '../../utils/formatters';
import { fetchDirectBinanceTickers, fetchDirectBybitTickers } from '../../utils/directExchangeClient';
import { normalizeTerminalMarketPair, formatTerminalQuotedPrice } from '../../utils/terminalPresets';

interface AddChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  coins: ScannedCoin[];
  /** Original scanner results preserve the detection timeframe for real formations. */
  formationCoins?: ScannedCoin[];
  /** Already loaded by TerminalPage; avoids a duplicate full-market request. */
  terminalMarketCoins?: MarketCoin[];
  /** Existing workspaces are preserved, but new additions stop at the chart limit. */
  atChartLimit?: boolean;
  /** Label/limit override when the Terminal picker is reused on a fullscreen chart. */
  context?: 'terminal' | 'fullscreen';
  maxCharts?: number;
  /** Reuse this picker for replacing an existing chart instead of adding a new one. */
  mode?: 'add' | 'replace';
  initialTimeframe?: Timeframe;
  watchlist: string[];
  onAddChart: (
    coin: ScannedCoin | MarketCoin | { symbol: string; baseAsset: string; quoteAsset: string; exchange: ExchangeId; marketType: MarketType },
    timeframe: Timeframe,
    formationId?: string
  ) => void;
}

// Module-level cache for all 2,400+ exchange market coins between $50k and $10B
let globalMarketCoinsCache: MarketCoin[] | null = null;
let globalMarketCoinsTimestamp = 0;
const CACHE_TTL = 30 * 1000; // 30s cache
const FORMATION_FEEDBACK = {
  uk: {
    busy: 'Сканер зараз зайнятий. Повторіть пошук трохи пізніше.',
    failed: 'Не вдалося отримати формації. Спробуйте ще раз.',
    invalid: 'Сканер не повернув коректний список формацій.',
    loading: 'Завантажуємо актуальні формації…',
    info: 'Використовується спільний обмежений сканер без додаткових постійних підключень.',
    empty: 'Для цього набору фільтрів не знайдено підтверджених формацій. Спробуйте змінити фільтри.',
    retry: 'Повторити пошук формацій',
  },
  en: {
    busy: 'The scanner is busy. Please try again shortly.',
    failed: 'Could not load formations. Please try again.',
    invalid: 'The scanner returned an invalid formation list.',
    loading: 'Loading detected formations…',
    info: 'Uses the existing shared, rate-limited scanner without new permanent connections.',
    empty: 'No confirmed formations match these filters. Try adjusting the filters.',
    retry: 'Retry formation scan',
  },
  pl: {
    busy: 'Skaner jest zajęty. Spróbuj ponownie za chwilę.',
    failed: 'Nie udało się pobrać formacji. Spróbuj ponownie.',
    invalid: 'Skaner zwrócił nieprawidłową listę formacji.',
    loading: 'Ładowanie wykrytych formacji…',
    info: 'Używany jest współdzielony skaner z limitem żądań, bez nowych stałych połączeń.',
    empty: 'Brak potwierdzonych formacji dla tych filtrów. Zmień filtry.',
    retry: 'Ponów skanowanie formacji',
  },
  ru: {
    busy: 'Сканер занят. Повторите попытку немного позже.',
    failed: 'Не удалось загрузить формации. Повторите попытку.',
    invalid: 'Сканер вернул некорректный список формаций.',
    loading: 'Загрузка обнаруженных формаций…',
    info: 'Используется общий сканер с ограничением запросов, без новых постоянных соединений.',
    empty: 'Подтверждённых формаций по этим фильтрам не найдено. Измените фильтры.',
    retry: 'Повторить поиск формаций',
  },
} as const;

export const AddChartModal: React.FC<AddChartModalProps> = ({
  isOpen,
  onClose,
  coins,
  formationCoins,
  terminalMarketCoins,
  atChartLimit = false,
  context = 'terminal',
  maxCharts = 50,
  mode = 'add',
  initialTimeframe,
  watchlist,
  onAddChart,
}) => {
  const { language, t } = useLanguage();
  const formationFeedback = FORMATION_FEEDBACK[language];
  const numberLocale = { uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL', ru: 'ru-RU' }[language];
  const formatCount = (count: number) => count.toLocaleString(numberLocale);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'volume' | 'gainers' | 'losers' | 'formations' | 'watchlist'>('all');
  const [selectedExchange, setSelectedExchange] = useState<'all' | ExchangeId>('all');
  const [selectedMarket, setSelectedMarket] = useState<'all' | MarketType>('all');
  // Exactly the same inclusive From/To volume selector used in the Screener.
  // 0 = no extra filter within the existing $50k-$10B market catalog.
  const [selectedVolumeCap, setSelectedVolumeCap] = useState<number>(0);
  const [selectedVolumeMode, setSelectedVolumeMode] = useState<ScreenerVolumeMode>('to');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(initialTimeframe || '15m');
  const [marketCoins, setMarketCoins] = useState<MarketCoin[]>(() => globalMarketCoinsCache || []);
  // Prefer Terminal's existing quote snapshot over this dialog's fallback cache.
  const availableMarketCoins = terminalMarketCoins ?? marketCoins;
  const [isLoadingAllCoins, setIsLoadingAllCoins] = useState(false);
  const [displayCount, setDisplayCount] = useState<number>(80);
  const [onDemandFormations, setOnDemandFormations] = useState<ScannedCoin[]>([]);
  const [formationScanStatus, setFormationScanStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [formationScanError, setFormationScanError] = useState('');
  const formationScanController = useRef<AbortController | null>(null);
  const lastFormationTimeframe = useRef(selectedTimeframe);
  // 30s is not a formation-scan timeframe; use the closest supported 1m data
  // without altering the selected chart's own timeframe.
  const formationTimeframe = selectedTimeframe === '30s' ? '1m' : selectedTimeframe;

  useEffect(() => {
    if (isOpen) {
      setDisplayCount(80);
      if (initialTimeframe) setSelectedTimeframe(initialTimeframe);
      if (mode === 'replace') {
        // A chart switch starts with all available markets, not stale add filters.
        setSearch('');
        setFilterTab('all');
        setSelectedExchange('all');
        setSelectedMarket('all');
      }
    }
  }, [isOpen, initialTimeframe, mode]);

  // Load all coins from exchange ($50k to $10B)
  useEffect(() => {
    if (!isOpen) return;
    // The parent Terminal already refreshes this market catalog. Avoid another
    // backend call (and possibly four direct-exchange fallbacks) on each open.
    if (terminalMarketCoins !== undefined) {
      // The Terminal owns the catalog refresh, even while its initial load is pending.
      setIsLoadingAllCoins(false);
      return;
    }

    if (globalMarketCoinsCache && Date.now() - globalMarketCoinsTimestamp < CACHE_TTL) {
      setMarketCoins(globalMarketCoinsCache);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    async function loadAllMarketCoins() {
      setIsLoadingAllCoins(true);
      try {
        const res = await fetch('/api/screener/coins?minVolume=50000&maxVolume=10000000000', {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            if (isMounted) {
              setMarketCoins(json.data);
              globalMarketCoinsCache = json.data;
              globalMarketCoinsTimestamp = Date.now();
              setIsLoadingAllCoins(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Backend coins fetch fallback in AddChartModal:', err);
      }

      // Direct exchange fallback (Binance + Bybit)
      try {
        const [binanceTickers, bybitTickers] = await Promise.all([
          fetchDirectBinanceTickers({ signal: controller.signal }),
          fetchDirectBybitTickers({ signal: controller.signal }),
        ]);
        const combined = [...binanceTickers, ...bybitTickers].filter(
          (c) => c.volumeUsd >= 50_000 && c.volumeUsd <= 10_000_000_000
        );
        if (isMounted && combined.length > 0) {
          setMarketCoins(combined);
          globalMarketCoinsCache = combined;
          globalMarketCoinsTimestamp = Date.now();
        }
      } catch (fallbackErr) {
        console.warn('Direct fallback failed:', fallbackErr);
      } finally {
        if (isMounted) setIsLoadingAllCoins(false);
      }
    }

    loadAllMarketCoins();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [isOpen, terminalMarketCoins]);

  // The Terminal does not launch foreground formation scans on page entry.
  // Reuse previously scanned results; only a deliberate tap on this tab can
  // request one bounded shared scan, never while the picker is closed.
  const sourceFormations = formationCoins ?? coins;
  const haveIncomingFormations = sourceFormations.some(coin =>
    coin.timeframe === formationTimeframe && coin.formations?.length > 0);
  const loadFormationsOnDemand = () => {
    if (haveIncomingFormations || onDemandFormations.length || formationScanController.current
      || formationScanStatus === 'ready') return;
    const controller = new AbortController();
    formationScanController.current = controller;
    setFormationScanStatus('loading');
    setFormationScanError('');
    // Same public shared and rate-limited scan as the Formations page.
    // No polling, websocket or new worker per opened Terminal chart.
    void (async () => {
      try {
        const params = new URLSearchParams({
          timeframe: formationTimeframe, exchange: 'all', marketType: 'all', minVolume: '0',
        });
        const response = await fetch(`/api/screener/scan?${params.toString()}`, {
          signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error(response.status === 503
          ? formationFeedback.busy
          : formationFeedback.failed);
        const result = await response.json();
        if (!result?.success || !Array.isArray(result.data)) {
          throw new Error(formationFeedback.invalid);
        }
        if (!controller.signal.aborted) {
          setOnDemandFormations((result.data as ScannedCoin[]).filter(
            c => c && Array.isArray(c.formations) && c.formations.length > 0,
          ));
          setFormationScanStatus('ready');
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setFormationScanError(error instanceof Error ? error.message : formationFeedback.failed);
          setFormationScanStatus('error');
        }
      } finally {
        if (formationScanController.current === controller) formationScanController.current = null;
      }
    })();
  };

  // The one-shot form scan is keyed by the open tab/timeframe, never by
  // a new callback closure created during unrelated market-list updates.
  const loadFormationsRef = useRef(loadFormationsOnDemand);
  loadFormationsRef.current = loadFormationsOnDemand;
  // The selected tab survives dialog reopens. If it is still Formations,
  // request results again only when no snapshot has been loaded yet.
  useEffect(() => {
    if (isOpen && filterTab === 'formations' && formationScanStatus === 'idle') {
      loadFormationsRef.current();
    }
  }, [isOpen, filterTab, formationScanStatus, selectedTimeframe]);

  useEffect(() => {
    if (lastFormationTimeframe.current === selectedTimeframe) return;
    lastFormationTimeframe.current = selectedTimeframe;
    formationScanController.current?.abort();
    formationScanController.current = null;
    setOnDemandFormations([]);
    setFormationScanStatus('idle');
  }, [selectedTimeframe]);

  useEffect(() => {
    if (isOpen) return;
    formationScanController.current?.abort();
    formationScanController.current = null;
    setFormationScanStatus(status => status === 'loading' ? 'idle' : status);
  }, [isOpen]);

  // Merge verified scanner formations by exchange + symbol + market, not just
  // ticker (Binance/Bybit and Spot/Futures are distinct instruments).
  const formationsMap = useMemo(() => {
    const map = new Map<string, ScannedCoin>();
    if (!isOpen) return map;
    for (const c of [...sourceFormations, ...onDemandFormations]) {
      if (c.timeframe !== formationTimeframe || !c.formations?.length) continue;
      const key = `${c.exchange}_${c.symbol}_${c.marketType}`.toUpperCase();
      map.set(key, c);
    }
    return map;
  }, [sourceFormations, formationTimeframe, onDemandFormations, isOpen]);

  // Unified coins list: merges all market coins with formation metadata
  const unifiedCoins = useMemo(() => {
    if (!isOpen) return [];
    if (availableMarketCoins.length > 0) {
      // Keep the modal's existing $50k–$10B catalog constraint.
      const mapped = availableMarketCoins.filter(mc => mc.volumeUsd >= 50_000 && mc.volumeUsd <= 10_000_000_000).map((mc) => {
        const key = `${mc.exchange}_${mc.symbol}_${mc.marketType}`.toUpperCase();
        const scanned = formationsMap.get(key);
        return {
          symbol: mc.symbol,
          baseAsset: mc.baseAsset,
          quoteAsset: mc.quoteAsset || 'USDT',
          exchange: mc.exchange,
          marketType: mc.marketType,
          currentPrice: mc.price,
          priceChange24h: mc.change24h,
          volume24hUsd: mc.volumeUsd,
          highPrice24h: mc.high24h,
          lowPrice24h: mc.low24h,
          formations: scanned?.formations || [],
        };
      });
      // An existing scanner result may not appear in the current quote snapshot.
      // Keep real detected formations discoverable without inventing signals.
      if (filterTab === 'formations') {
        const present = new Set(mapped.map(c => `${c.exchange}_${c.symbol}_${c.marketType}`.toUpperCase()));
        for (const scanned of formationsMap.values()) {
          const key = `${scanned.exchange}_${scanned.symbol}_${scanned.marketType}`.toUpperCase();
          const volume = scanned.volume24hUsd || 0;
          if (present.has(key) || volume < 50_000 || volume > 10_000_000_000) continue;
          present.add(key);
          mapped.push({
            symbol: scanned.symbol, baseAsset: scanned.baseAsset, quoteAsset: scanned.quoteAsset,
            exchange: scanned.exchange, marketType: scanned.marketType,
            currentPrice: scanned.currentPrice, priceChange24h: scanned.priceChange24h,
            volume24hUsd: volume, highPrice24h: scanned.highPrice24h,
            lowPrice24h: scanned.lowPrice24h, formations: scanned.formations,
          });
        }
      }
      return mapped;
    }

    // If marketCoins haven't loaded yet, fall back to initial scanned coins
    return [...coins, ...onDemandFormations].map((c) => ({
      symbol: c.symbol,
      baseAsset: c.baseAsset,
      quoteAsset: c.quoteAsset,
      exchange: c.exchange,
      marketType: c.marketType,
      currentPrice: c.currentPrice,
      priceChange24h: c.priceChange24h,
      volume24hUsd: c.volume24hUsd || 0,
      highPrice24h: c.highPrice24h || c.currentPrice,
      lowPrice24h: c.lowPrice24h || c.currentPrice,
      formations: formationsMap.get(`${c.exchange}_${c.symbol}_${c.marketType}`.toUpperCase())?.formations || [],
    }));
  }, [availableMarketCoins, coins, onDemandFormations, formationsMap, filterTab, isOpen]);

  // Filter and sort coins
  const filteredCoins = useMemo(() => {
    if (!isOpen) return [];
    let result = unifiedCoins;

    // Exchange filter
    if (selectedExchange !== 'all') {
      result = result.filter((c) => c.exchange === selectedExchange);
    }

    // Market filter
    if (selectedMarket !== 'all') {
      result = result.filter((c) => c.marketType === selectedMarket);
    }

    // Exact Screener semantics: selected threshold is an inclusive floor OR ceiling.
    if (selectedVolumeCap > 0) {
      result = result.filter(c =>
        isVolumeWithinCap(c.volume24hUsd || 0, selectedVolumeCap, selectedVolumeMode));
    }

    // Tab category filter
    if (filterTab === 'formations') {
      result = result.filter((c) => c.formations && c.formations.length > 0);
      result = [...result].sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    } else if (filterTab === 'watchlist') {
      result = result.filter((c) => watchlist.includes(c.symbol));
    } else if (filterTab === 'gainers') {
      result = [...result].sort((a, b) => b.priceChange24h - a.priceChange24h);
    } else if (filterTab === 'losers') {
      result = [...result].sort((a, b) => a.priceChange24h - b.priceChange24h);
    } else if (filterTab === 'volume' || filterTab === 'all') {
      const direction = preferredVolumeSortOrder(selectedVolumeMode);
      result = [...result].sort((a, b) => direction === 'asc'
        ? (a.volume24hUsd || 0) - (b.volume24hUsd || 0)
        : (b.volume24hUsd || 0) - (a.volume24hUsd || 0));
    }

    // Text search query filter
    if (search.trim()) {
      const q = search.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      result = result.filter((c) => {
        const sym = c.symbol.toLowerCase();
        const base = c.baseAsset.toLowerCase();
        return (
          sym.includes(q) ||
          base.includes(q) ||
          c.formations?.some((f) => f.name?.toLowerCase().includes(q) || f.nameEn?.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [unifiedCoins, filterTab, selectedExchange, selectedMarket, selectedVolumeCap, selectedVolumeMode, watchlist, search, isOpen]);

  // The modal is portaled to body, and the underlying Terminal should not scroll.
  useEffect(() => {
    if (!isOpen) return;
    const originalBody = document.body.style.overflow;
    const originalHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalBody;
      document.documentElement.style.overflow = originalHtml;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Clean custom search ticker candidate
  const cleanSearchSymbol = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Prefer a real pair's quote asset, including USDC/FDUSD/BTC; only infer
  // unambiguous stablecoin suffixes for a symbol not found in our market list.
  const knownPair = unifiedCoins.find(c => c.symbol === cleanSearchSymbol);
  const inferredQuote = knownPair?.quoteAsset
    || ['USDT', 'USDC', 'FDUSD', 'BUSD'].find(q => cleanSearchSymbol.length > q.length && cleanSearchSymbol.endsWith(q))
    || 'USDT';
  const quickAddInstrument = normalizeTerminalMarketPair(cleanSearchSymbol, inferredQuote);
  const hasExactMatch = cleanSearchSymbol && filteredCoins.some((c) =>
    c.symbol === cleanSearchSymbol || c.symbol === quickAddInstrument.symbol);

  const handleQuickAddCustom = (ex: ExchangeId, mt: MarketType) => {
    if (atChartLimit) return;
    const exactMarket = unifiedCoins.find(c => c.symbol === cleanSearchSymbol && c.exchange === ex && c.marketType === mt);
    const { symbol, quoteAsset } = normalizeTerminalMarketPair(
      cleanSearchSymbol, exactMarket?.quoteAsset || inferredQuote,
    );
    const base = exactMarket?.baseAsset || symbol.slice(0, -quoteAsset.length);
    onAddChart({ symbol, baseAsset: base, quoteAsset, exchange: ex, marketType: mt }, selectedTimeframe);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center overflow-x-hidden bg-black/80 p-2 backdrop-blur-sm sm:p-4"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-add-chart-title"
        className="terminal-add-chart-modal flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex min-w-0 shrink-0 items-start justify-between gap-2 border-b border-slate-800 bg-slate-950/90 px-3 py-3 sm:px-4 sm:py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="w-8 h-8 shrink-0 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
              {mode === 'replace' ? <ArrowUpDown className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 id="terminal-add-chart-title" className="min-w-0 break-words text-sm font-bold leading-snug text-white sm:text-base">
                  {mode === 'replace'
                    ? ({ uk: 'Змінити монету на графіку', en: 'Change chart coin', pl: 'Zmień monetę na wykresie', ru: 'Изменить монету на графике' } as const)[language]
                    : context === 'fullscreen' ? {
                      uk: 'Додати графік', en: 'Add chart', pl: 'Dodaj wykres', ru: 'Добавить график',
                    }[language] : 'Додати графік у термінал'}
                </h3>
                <span className="shrink-0 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                  {unifiedCoins.length > 0 ? t('terminal.modal.coinCount', { count: formatCount(unifiedCoins.length) }) : 'Завантаження...'}
                </span>
              </div>
              <p className="break-words text-[11px] leading-snug text-slate-400 sm:text-xs">
                Повний список монет на біржі від $50k до $10B (Binance & Bybit, Futures & Spot)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрити вибір монети" className="shrink-0 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {atChartLimit && (
          <p role="status" className="border-b border-amber-500/30 bg-amber-950/40 px-4 py-2 text-xs text-amber-200">
            {context === 'fullscreen' ? {
              uk: `Максимум ${maxCharts} графіки на екрані. Закрийте додатковий графік, щоб додати інший.`,
              en: `Maximum ${maxCharts} charts on screen. Close an extra chart to add another.`,
              pl: `Maksymalnie ${maxCharts} wykresy na ekranie. Zamknij dodatkowy wykres, aby dodać kolejny.`,
              ru: `Максимум ${maxCharts} графика на экране. Закройте дополнительный график, чтобы добавить другой.`,
            }[language] : 'Досягнуто ліміт 50 графіків. Видаліть один із поточних графіків, щоб додати інший. Збережені графіки не видаляються автоматично.'}
          </p>
        )}

        {/* Bounded scroll area: filters plus coin list. */}
        <div className="terminal-add-chart-body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar & Filter Parameters */}
        <div className="terminal-add-chart-filters min-h-0 min-w-0 shrink-0 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain border-b border-slate-800/80 bg-slate-950/50 p-3 sm:p-4">
          {/* Search Bar */}
          <div className="relative min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDisplayCount(80);
              }}
              placeholder="Пошук за символом монети (напр. BTC, ETH, SOL, PEPE, WIF, RENDER, SUI, DOGE, TAO...)"
              className="block w-full min-w-0 rounded-xl border border-slate-800 bg-slate-900 py-2 pl-9 pr-8 text-base text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 sm:text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Add Custom Symbol Card if typing a symbol */}
          {cleanSearchSymbol && !hasExactMatch && (
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-indigo-950/40 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-xs text-slate-300">
                  {t("terminal.modal.quickAddPrefix")} <strong className="text-white font-mono">{quickAddInstrument.symbol}</strong>:
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => handleQuickAddCustom('binance', 'futures')}
                  disabled={atChartLimit}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  + Binance Futures
                </button>
                <button
                  onClick={() => handleQuickAddCustom('bybit', 'futures')}
                  disabled={atChartLimit}
                  className="px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  + Bybit Linear
                </button>
                <button
                  onClick={() => handleQuickAddCustom('binance', 'spot')}
                  disabled={atChartLimit}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all active:scale-95 cursor-pointer"
                >
                  + Binance Spot
                </button>
              </div>
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 pb-1 sm:gap-2">
            <span className="text-[11px] text-slate-400 font-semibold mr-1 flex items-center gap-1 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              Вкладка:
            </span>

            <button
              onClick={() => { setFilterTab('all'); setDisplayCount(80); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-cyan-600 text-white font-bold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('terminal.modal.allCount', { count: formatCount(unifiedCoins.length) })}
            </button>

            <button
              onClick={() => { setFilterTab('volume'); setDisplayCount(80); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'volume'
                  ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3 h-3 text-cyan-400 inline mr-1" />
              Топ за обсягом
            </button>

            <button
              onClick={() => { setFilterTab('gainers'); setDisplayCount(80); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'gainers'
                  ? 'bg-slate-800 text-emerald-300 font-bold border border-emerald-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3 h-3 text-emerald-400 inline mr-1" />
              Топ зростання
            </button>

            <button
              onClick={() => { setFilterTab('losers'); setDisplayCount(80); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'losers'
                  ? 'bg-slate-800 text-rose-300 font-bold border border-rose-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingDown className="w-3 h-3 text-rose-400 inline mr-1" />
              Топ падіння
            </button>

            <button
              onClick={() => { setFilterTab('formations'); setDisplayCount(80); loadFormationsOnDemand(); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'formations'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <FormationsIcon className="w-3 h-3 text-purple-400" />
              З формаціями
            </button>

            <button
              onClick={() => { setFilterTab('watchlist'); setDisplayCount(80); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterTab === 'watchlist'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Star className="w-3 h-3 text-amber-400" />
              {t('terminal.modal.favoritesCount', { count: formatCount(watchlist.length) })}
            </button>
          </div>

          {/* Secondary Filters: Exchange, Market, Volume Range */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-800/60 pt-1 text-xs">
            {/* Exchange Selector */}
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-[11px]">
              <span className="text-slate-500 px-1 font-semibold">Біржа:</span>
              <button
                onClick={() => setSelectedExchange('all')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  selectedExchange === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Всі
              </button>
              <button
                onClick={() => setSelectedExchange('binance')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  selectedExchange === 'binance' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Binance
              </button>
              <button
                onClick={() => setSelectedExchange('bybit')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  selectedExchange === 'bybit' ? 'bg-orange-500/20 text-orange-300 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Bybit
              </button>
            </div>

            {/* Market Type Selector */}
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-[11px]">
              <span className="text-slate-500 px-1 font-semibold">Ринок:</span>
              <button
                onClick={() => setSelectedMarket('all')}
                className={`px-2 py-0.5 rounded cursor-pointer ${selectedMarket === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Усі
              </button>
              <button
                onClick={() => setSelectedMarket('futures')}
                className={`px-2 py-0.5 rounded cursor-pointer ${selectedMarket === 'futures' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Фʼючерси
              </button>
              <button
                onClick={() => setSelectedMarket('spot')}
                className={`px-2 py-0.5 rounded cursor-pointer ${selectedMarket === 'spot' ? 'bg-indigo-500/20 text-indigo-300 font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Спот
              </button>
            </div>

            {/* Same inclusive volume filter and direction switch as the main Screener. */}
            <div data-terminal-filter="volume" className="flex min-h-9 w-full min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs sm:w-72">
              <span id="terminal-volume-cap-label" className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">{t('screenerVolume24h')}</span>
              <ScreenerVolumeDropdown
                id="terminal-volume-cap"
                labelId="terminal-volume-cap-label"
                value={selectedVolumeCap}
                mode={selectedVolumeMode}
                portalZIndex={280}
                onChange={value => { setSelectedVolumeCap(value); setDisplayCount(80); }}
              />
              <button
                type="button"
                data-terminal-volume-direction
                aria-label={t(selectedVolumeMode === 'to' ? 'screener.main.volumeSwitchFrom' : 'screener.main.volumeSwitchTo')}
                aria-pressed={selectedVolumeMode === 'from'}
                title={t(selectedVolumeMode === 'to' ? 'screener.main.volumeTooltipTo' : 'screener.main.volumeTooltipFrom')}
                onClick={() => { setSelectedVolumeMode(mode => mode === 'to' ? 'from' : 'to'); setDisplayCount(80); }}
                className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center bg-transparent text-cyan-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                {selectedVolumeMode === 'to' ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpToLine className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Coins List (Virtualized / Paginated) */}
        <div className="terminal-add-chart-list min-h-0 min-w-0 flex-1 divide-y divide-slate-800/60 overflow-x-hidden overflow-y-auto overscroll-contain p-3 touch-scroll">
          {filterTab === 'formations' && formationScanStatus === 'loading' && !haveIncomingFormations ? (
            <div role="status" className="flex flex-col items-center gap-3 py-16 text-center text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-purple-300" />
              <p className="text-xs font-semibold text-slate-200">{formationFeedback.loading}</p>
              <p className="max-w-sm text-[11px]">{formationFeedback.info}</p>
            </div>
          ) : isLoadingAllCoins && availableMarketCoins.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <Loader2 className="w-8 h-8 mx-auto text-cyan-400 animate-spin" />
              <p className="text-xs font-semibold text-white">Завантаження повного списку монет з біржі ($50k - $10B)...</p>
              <p className="text-[11px] text-slate-500">Синхронізація Binance Futures, Binance Spot, Bybit Linear та Spot</p>
            </div>
          ) : filteredCoins.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Activity className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs font-semibold text-white">За вашим фільтром монет не знайдено</p>
              <p className="text-[11px] text-slate-500">{filterTab === 'formations'
                ? formationScanStatus === 'error' ? formationScanError
                  : formationFeedback.empty
                : 'Спробуйте змінити фільтр обсягу або введіть інший символ у пошук'}</p>
              {filterTab === 'formations' && formationScanStatus === 'error' && (
                <button type="button" onClick={loadFormationsOnDemand}
                  className="rounded-lg border border-purple-600/40 px-3 py-2 text-xs text-purple-200 hover:bg-purple-950/40">
                  {formationFeedback.retry}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-1 px-2 py-1 text-[11px] text-slate-500">
                <span>{t("terminal.modal.foundCount", { count: formatCount(filteredCoins.length) })}</span>
                <span>Обсяг 24г: <strong className="text-cyan-400 font-mono">{selectedVolumeCap > 0
                  ? `${selectedVolumeMode === 'from' ? '≥' : '≤'} ${formatVolume(selectedVolumeCap)}`
                  : t('screenerVolumeUnlimited')}</strong></span>
              </div>

              {filteredCoins.slice(0, displayCount).map((coin) => {
                const isPositive = coin.priceChange24h >= 0;
                const hasFormations = coin.formations && coin.formations.length > 0;
                const firstFormation = hasFormations ? coin.formations[0] : null;

                return (
                  <div
                    key={`${coin.exchange}-${coin.symbol}-${coin.marketType}`}
                    aria-disabled={atChartLimit}
                    onClick={() => {
                      if (atChartLimit) return;
                      onAddChart(coin, selectedTimeframe, firstFormation?.id);
                      onClose();
                    }}
                    className="terminal-add-chart-coin-row group flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-800/60 sm:px-3"
                  >
                    <div className="terminal-add-chart-coin-main flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                      <div data-no-translate className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/50 flex items-center justify-center font-bold text-xs font-mono text-white group-hover:bg-cyan-600/20 group-hover:text-cyan-300 group-hover:border-cyan-500/40 transition-colors shrink-0 shadow-sm">
                        {coin.baseAsset.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span data-no-translate className="min-w-0 break-all font-mono text-sm font-bold text-white transition-colors group-hover:text-cyan-300">
                            {coin.symbol}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              coin.exchange === 'binance'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                            }`}
                          >
                            {coin.exchange}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              coin.marketType === 'futures'
                                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {coin.marketType === 'futures' ? 'Perp' : 'Spot'}
                          </span>
                        </div>

                        {/* Volume and Details */}
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span>
                            Обсяг 24h: <strong className="text-slate-300 font-mono">{formatVolume(coin.volume24hUsd || 0)}</strong>
                          </span>
                          {hasFormations && (
                            <span className="text-[10px] text-purple-300 flex items-center gap-1 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/40">
                              <FormationsIcon className="w-2.5 h-2.5" />
                              {firstFormation?.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="terminal-add-chart-coin-action flex min-w-0 shrink-0 items-center gap-2 sm:gap-3.5">
                      <div className="text-right">
                        <div className="font-mono font-bold text-xs sm:text-sm text-white">
                          {formatTerminalQuotedPrice(coin.currentPrice, coin.quoteAsset)}
                        </div>
                        <div
                          className={`text-[10px] sm:text-xs font-mono flex items-center justify-end gap-0.5 font-bold ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span>
                            {isPositive ? '+' : ''}
                            {coin.priceChange24h.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={atChartLimit}
                        className="px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer group-hover:bg-cyan-600 group-hover:text-white"
                      >
                        {mode === 'replace' ? <ArrowUpDown className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        <span>{mode === 'replace' ? ({ uk: 'Змінити', en: 'Replace', pl: 'Zmień', ru: 'Заменить' } as const)[language] : 'Додати'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Show more button if filteredCoins exceeds displayCount */}
              {filteredCoins.length > displayCount && (
                <div className="p-3 text-center">
                  <button
                    onClick={() => setDisplayCount((prev) => prev + 80)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white text-xs font-bold transition-all cursor-pointer border border-slate-700"
                  >
                    {t("terminal.modal.moreCoins", { count: formatCount(filteredCoins.length - displayCount) })}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

