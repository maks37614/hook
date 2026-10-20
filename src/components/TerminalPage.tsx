import { useChartProvider } from '../utils/useChartProvider';
import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  ListChecks,
  ChevronDown,
  Send,
  Zap,
  Star,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  RefreshCw,
  Loader2,
  Plus,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  ArrowLeft,
  X,
  Grid,
} from 'lucide-react';
import {
  TerminalChartBlock,
  TerminalWorkspaceConfig,
  ScannedCoin,
  DetectedFormation,
  Timeframe,
  ExchangeId,
  MarketType,
  Kline,
  TerminalBlockMode,
  MarketCoin,
  TerminalSavedPreset,
} from '../types';
import { TerminalChartWidget } from './terminal/TerminalChartWidget';
import { ExchangeCandlestickChart } from './ExchangeCandlestickChart';
import { getTradingViewSymbol } from '../utils/marketSymbols';
import { AddChartModal } from './terminal/AddChartModal';
import { TerminalSettingsDrawer } from './terminal/TerminalSettingsDrawer';
import { formatCryptoPrice, formatVolume } from '../utils/formatters';
import { getStoredPreferences, useAppPreferences } from '../utils/userPreferences';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';
import { useTerminalWorkspace } from '../utils/useTerminalWorkspace';
import { blocksForMarketPreset } from '../utils/terminalPresets';
import { coinMarketKey, type TerminalMarketPreset } from '../utils/marketPresets';
import { loadMarketCoins, type MarketCoinSnapshot } from '../utils/marketCoinLoader';
import { TerminalPresetPanel } from './terminal/TerminalPresetPanel';
import { TerminalClock } from './terminal/TerminalClock';
import { toggleFullscreenSafe } from '../utils/fullscreenUtils';
import { fitTerminalColumns, terminalChartHeight } from '../utils/terminalGridLayout';

interface TerminalPageProps {
  coins: ScannedCoin[];
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenTelegramAlerts?: (prefill?: any) => void;
  onOpenFullscreenModal?: (coin: ScannedCoin, formation?: DetectedFormation) => void;
  onReturnToPatterns?: () => void;
}

export const TerminalPage: React.FC<TerminalPageProps> = ({
  coins: formationCoins,
  watchlist,
  onToggleWatchlist,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onOpenTelegramAlerts,
  onOpenFullscreenModal,
  onReturnToPatterns,
}) => {
  const chartProvider = useChartProvider();
  const { preferences } = useAppPreferences();
  const { user, profile } = useAuth();
  const { language } = useLanguage();
  const tr = (value: string) => translatePhrase(language, value);
  const { blocks, config, customPresets, setBlocks: updateBlocks, setConfig, setCustomPresets, syncError, retrySync } = useTerminalWorkspace();
  const [activeMarketPreset, setActiveMarketPreset] = useState<TerminalMarketPreset | null>(null);
  const [autoUpdatePresets, setAutoUpdatePresets] = useState(true);
  const [showCoinPresets, setShowCoinPresets] = useState(false);
  const [showTradingSessions, setShowTradingSessions] = useState(false);
  const clockButtonRef = useRef<HTMLButtonElement>(null);
  const presetsButtonRef = useRef<HTMLButtonElement>(null);
  const presetsMenuRef = useRef<HTMLDivElement>(null);
  const [presetsMenuPosition, setPresetsMenuPosition] = useState<React.CSSProperties>({});
  const [marketSnapshot, setMarketSnapshot] = useState<MarketCoinSnapshot>({ coins: [], timestamp: null, warning: null });
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketRefresh, setMarketRefresh] = useState(0);
  const marketCoins = marketSnapshot.coins;
  const terminalCoinCount = new Set(blocks.map(coinMarketKey)).size;

  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      setMarketLoading(true);
      try {
        const next = await loadMarketCoins({ exchange: 'all', marketType: 'all' }, controller.signal);
        if (controller.signal.aborted) return;
        setMarketSnapshot(next);
        setMarketError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setMarketError(cause instanceof Error ? cause.message : tr('Не вдалося оновити монети.'));
      } finally {
        busy = false;
        if (!controller.signal.aborted) setMarketLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [marketRefresh]);

  const coinPresetSelection = useMemo(() => ({
    exchange: config.coinPresetExchange ?? preferences.defaultExchange,
    marketType: config.coinPresetMarketType ?? preferences.defaultMarketType,
  }), [config.coinPresetExchange, config.coinPresetMarketType, preferences.defaultExchange, preferences.defaultMarketType]);
  const coinPresetLimit = config.coinPresetLimit ?? 4;
  const coins = useMemo(() => {
    if (!marketCoins.length) return formationCoins;
    const formations = new Map(formationCoins.map(coin => [coinMarketKey(coin), coin]));
    return marketCoins.map(coin => ({
      ...formations.get(coinMarketKey(coin)), ...coin,
      currentPrice: coin.price, priceChange24h: coin.change24h, volume24hUsd: coin.volumeUsd,
      highPrice24h: coin.high24h, lowPrice24h: coin.low24h,
      formations: formations.get(coinMarketKey(coin))?.formations || [],
      timeframe: preferences.defaultTimeframe, lastUpdated: Date.now(),
    } as ScannedCoin));
  }, [marketCoins, formationCoins, preferences.defaultTimeframe]);
  // Any manual edit stops the automatic selection from restoring a removed chart.
  const setBlocks: typeof updateBlocks = useCallback(update => {
    setActiveMarketPreset(null);
    updateBlocks(update);
  }, [updateBlocks]);

  // Active coin for single-chart full view (matching FullscreenChartModal)
  const [activeCoin, setActiveCoin] = useState<ScannedCoin>(() => {
    const firstBlock = blocks[0];
    const found = coins.find((c) => firstBlock && coinMarketKey(c) === coinMarketKey(firstBlock));
    if (found) return found;
    return {
      symbol: firstBlock?.symbol || 'BTCUSDT',
      baseAsset: firstBlock?.baseAsset || 'BTC',
      quoteAsset: firstBlock?.quoteAsset || 'USDT',
      exchange: firstBlock?.exchange || ('binance' as ExchangeId),
      marketType: firstBlock?.marketType || ('futures' as MarketType),
      currentPrice: 0,
      priceChange24h: 0,
      formations: [],
    } as unknown as ScannedCoin;
  });

  // Saved presets also work for a coin whose live quote is temporarily unavailable.
  useEffect(() => {
    const firstBlock = blocks[0];
    if (!firstBlock) return;
    const match = coins.find(coin => coinMarketKey(coin) === coinMarketKey(firstBlock));
    setActiveCoin(current => match || (coinMarketKey(current) === coinMarketKey(firstBlock) ? current : {
      ...firstBlock, currentPrice: 0, priceChange24h: 0, highPrice24h: 0, lowPrice24h: 0,
      volume24hUsd: 0, formations: [], lastUpdated: 0, exchangeUrl: '',
    }));
  }, [coins, blocks]);

  const [timeframe, setTimeframe] = useState<Timeframe>(() => getStoredPreferences().defaultTimeframe);

  useEffect(() => {
    setTimeframe(preferences.defaultTimeframe);
  }, [preferences.defaultTimeframe]);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDrawingToolbar, setShowDrawingToolbar] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('fullscreen_show_drawing_toolbar');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);

  // Modal / Drawer state for multi-chart mode
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalInitialMode, setAddModalInitialMode] = useState<TerminalBlockMode>('tradingview');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [maximizedBlockId, setMaximizedBlockId] = useState<string | null>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);
  const [dragOverBlockIndex, setDragOverBlockIndex] = useState<number | null>(null);
  const workspaceAreaRef = useRef<HTMLElement>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });

  const [localWatchlist, setLocalWatchlist] = useState<string[]>(() => [...new Set(watchlist)]);
  useEffect(() => { setLocalWatchlist([...new Set(watchlist)]); }, [watchlist]);

  // Browser fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Device rotation, split screen and the terminal header change the real
  // workspace size independently of CSS breakpoints.
  useLayoutEffect(() => {
    const element = workspaceAreaRef.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const nextWidth = Math.round(width);
      const nextHeight = Math.round(height);
      setWorkspaceSize(current => current.width === nextWidth && current.height === nextHeight
        ? current : { width: nextWidth, height: nextHeight });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    if (!showCoinPresets) return;
    presetsMenuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }, [showCoinPresets]);

  useLayoutEffect(() => {
    if (!showCoinPresets) return;
    const positionMenu = () => {
      const anchor = presetsButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const margin = 12;
      const width = Math.min(360, Math.max(0, window.innerWidth - margin * 2));
      const headerBottom = presetsButtonRef.current?.closest('header')?.getBoundingClientRect().bottom ?? anchor.bottom;
      const top = headerBottom + 6;
      const left = (window.innerWidth - width) / 2;
      setPresetsMenuPosition({ top, left, width, maxHeight: Math.max(0, window.innerHeight - top - margin) });
    };
    const dismissOutside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && !presetsMenuRef.current?.contains(target) && !presetsButtonRef.current?.contains(target)) {
        setShowCoinPresets(false);
        if (event.type === 'pointerdown') presetsButtonRef.current?.focus();
      }
    };
    const repositionOnScroll = (event: Event) => {
      if (event.target === window || !presetsMenuRef.current?.contains(event.target as Node)) positionMenu();
    };
    const dismissOnWindowBlur = () => setShowCoinPresets(false);
    positionMenu();
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', repositionOnScroll, true);
    window.addEventListener('blur', dismissOnWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', repositionOnScroll, true);
      window.removeEventListener('blur', dismissOnWindowBlur);
    };
  }, [showCoinPresets, terminalCoinCount]);

  const closePresetsMenu = useCallback(() => {
    setShowCoinPresets(false);
    presetsButtonRef.current?.focus();
  }, []);

  const handlePresetsMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePresetsMenu();
    }
  };

  // Handle Escape key to close the presets menu, drawer or return to screener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showTradingSessions) {
          e.preventDefault();
          setShowTradingSessions(false);
          clockButtonRef.current?.focus();
        } else if (showCoinPresets) {
          e.preventDefault();
          closePresetsMenu();
        } else if (isFavoritesDrawerOpen) {
          setIsFavoritesDrawerOpen(false);
        } else if (onReturnToPatterns) {
          e.preventDefault();
          onReturnToPatterns();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTradingSessions, showCoinPresets, closePresetsMenu, isFavoritesDrawerOpen, onReturnToPatterns]);

  const toggleBrowserFullscreen = () => {
    toggleFullscreenSafe();
  };

  const handleToggleDrawingToolbar = useCallback(() => {
    setShowDrawingToolbar((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('fullscreen_show_drawing_toolbar', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Watchlist favorites items
  const favoriteCoins = useMemo(() => {
    const uniqueSymbols: string[] = Array.from(new Set<string>(localWatchlist));
    const coinsMap = new Map<string, ScannedCoin>();
    coins.forEach((c) => {
      if (!coinsMap.has(c.symbol)) {
        coinsMap.set(c.symbol, c);
      }
    });

    return uniqueSymbols.map((sym: string) => {
      const found = coinsMap.get(sym);
      if (found) return found;
      const clean = sym.toUpperCase();
      const base = clean.replace(/(USDT|BUSD|USDC)$/, '') || clean;
      const quote = clean.slice(base.length) || 'USDT';
      return {
        symbol: clean,
        baseAsset: base,
        quoteAsset: quote,
        exchange: 'binance' as ExchangeId,
        marketType: 'futures' as MarketType,
        currentPrice: 0,
        priceChange24h: 0,
        formations: [],
      } as unknown as ScannedCoin;
    });
  }, [coins, localWatchlist]);

  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favoriteCoins;
    const q = searchQuery.toLowerCase().trim();
    return favoriteCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.baseAsset.toLowerCase().includes(q)
    );
  }, [favoriteCoins, searchQuery]);

  const handleRemoveFromWatchlist = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalWatchlist((prev) => {
      const next = prev.filter((s) => s !== sym);
      return next;
    });
    onToggleWatchlist?.(sym);
  };

  const handleSelectFavoriteCoin = (favCoin: ScannedCoin) => {
    setActiveCoin(favCoin);
    setIframeLoading(true);
    // Update the first block to match the selected coin
    if (blocks.length === 1) {
      setBlocks([
        {
          id: `block-${favCoin.symbol}-${Date.now()}`,
          symbol: favCoin.symbol,
          baseAsset: favCoin.baseAsset,
          quoteAsset: favCoin.quoteAsset,
          exchange: favCoin.exchange,
          marketType: favCoin.marketType,
          timeframe,
          mode: 'tradingview',
          colSpan: 1,
        },
      ]);
    }
  };

  // Build TradingView Embed URL
  const tradingViewUrl = useMemo(() => {
    if (chartProvider === 'hookchart') return null;
    const tvSymbol = getTradingViewSymbol(activeCoin.symbol, activeCoin.exchange, activeCoin.marketType);
    if (!tvSymbol) return null;

    let interval = '15';
    switch (timeframe) {
      case '1m': interval = '1'; break;
      case '5m': interval = '5'; break;
      case '15m': interval = '15'; break;
      case '1h': interval = '60'; break;
      case '4h': interval = '240'; break;
      case '1d': interval = 'D'; break;
      default: interval = '15';
    }

    const params = new URLSearchParams({
      symbol: tvSymbol,
      interval: interval,
      theme: 'dark',
      style: '1',
      timezone: 'exchange',
      withdateranges: '0',
      hide_top_toolbar: '1',
      hide_side_toolbar: '0',
      allow_symbol_change: '0',
      save_image: '0',
      hide_legend: '1',
      locale: 'uk',
      toolbar_bg: '#090d16',
      gridColor: 'rgba(0,0,0,0)',
      gridTransparency: '100',
    });

    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }, [chartProvider, activeCoin.symbol, activeCoin.exchange, activeCoin.marketType, timeframe]);

  // Block management
  const handleAddChart = (
    coin: any,
    tf: Timeframe,
    mode: TerminalBlockMode,
    formationId?: string
  ) => {
    const rawSymbol = (coin.symbol || 'BTCUSDT').toUpperCase().replace('/', '').trim();
    const symbol = rawSymbol.endsWith('USDT') ? rawSymbol : `${rawSymbol}USDT`;
    const base = coin.baseAsset || symbol.replace(/(USDT|BUSD|USDC)$/, '') || symbol;
    const quote = coin.quoteAsset || 'USDT';
    const exchange = coin.exchange || 'binance';
    const marketType = coin.marketType || 'futures';

    const newBlock: TerminalChartBlock = {
      id: `block-${symbol}-${Date.now()}`,
      symbol,
      baseAsset: base,
      quoteAsset: quote,
      exchange,
      marketType,
      timeframe: tf || config.globalTimeframe || '15m',
      mode: mode || 'tradingview',
      formationId,
      colSpan: 1,
    };
    setBlocks((prev) => [...prev, newBlock]);
  };

  const handleUpdateBlock = (blockId: string, updated: Partial<TerminalChartBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, ...updated } : b))
    );
  };

  const handleRemoveBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (maximizedBlockId === blockId) {
      setMaximizedBlockId(null);
    }
  };

  // Combine / Merge two blocks (e.g. orderbook block dragged onto chart block)
  const handleMergeBlocks = (sourceIndex: number, targetIndex: number) => {
    setBlocks((prev) => {
      if (sourceIndex < 0 || sourceIndex >= prev.length || targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      const source = updated[sourceIndex];
      const target = updated[targetIndex];

      // Build combined block (chart on top, orderbook below)
      const mergedBlock: TerminalChartBlock = {
        ...target,
        mode: 'combined',
        colSpan: target.colSpan || 1,
        domSettings: source.domSettings || target.domSettings,
      };

      updated[targetIndex] = mergedBlock;
      updated.splice(sourceIndex, 1);
      return updated;
    });
    setDraggedBlockIndex(null);
    setDragOverBlockIndex(null);
  };

  // Split a combined block back into 2 separate blocks (1 chart + 1 orderbook)
  const handleSplitBlock = (blockId: string) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const target = prev[idx];
      const chartBlock: TerminalChartBlock = {
        ...target,
        id: `block-${target.symbol}-chart-${Date.now()}`,
        mode: 'tradingview',
        colSpan: 1,
      };
      const domBlock: TerminalChartBlock = {
        ...target,
        id: `block-${target.symbol}-dom-${Date.now() + 1}`,
        mode: 'orderbook',
        colSpan: 1,
      };
      const updated = [...prev];
      updated.splice(idx, 1, chartBlock, domBlock);
      return updated;
    });
  };

  const handleDragStart = (index: number) => {
    setDraggedBlockIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedBlockIndex === null || draggedBlockIndex === targetIndex) {
      setDraggedBlockIndex(null);
      setDragOverBlockIndex(null);
      return;
    }

    const sourceBlock = blocks[draggedBlockIndex];
    const targetBlock = blocks[targetIndex];

    if (!sourceBlock || !targetBlock) {
      setDraggedBlockIndex(null);
      setDragOverBlockIndex(null);
      return;
    }

    // Merge when an orderbook block is dropped on a chart or vice versa,
    // or when either block is an orderbook block:
    const canCombine =
      (sourceBlock.mode === 'orderbook' && targetBlock.mode === 'tradingview') ||
      (sourceBlock.mode === 'tradingview' && targetBlock.mode === 'orderbook') ||
      sourceBlock.mode === 'orderbook' ||
      targetBlock.mode === 'orderbook';

    if (canCombine) {
      handleMergeBlocks(draggedBlockIndex, targetIndex);
      return;
    }

    // Reorder blocks
    setBlocks((prev) => {
      const updated = [...prev];
      const [movedItem] = updated.splice(draggedBlockIndex, 1);
      updated.splice(targetIndex, 0, movedItem);
      return updated;
    });
    setDraggedBlockIndex(null);
    setDragOverBlockIndex(null);
  };

  const handleApplyGlobalTimeframe = (tf: Timeframe) => {
    setTimeframe(tf);
    setConfig((prev) => ({ ...prev, globalTimeframe: tf }));
    setBlocks((prev) => prev.map((b) => ({ ...b, timeframe: tf })));
  };

  const handleTimeframeSelect = (tf: Timeframe) => {
    setTimeframe(tf);
    handleApplyGlobalTimeframe(tf);
    setIframeLoading(true);
  };

  const handleApplyPreset = (presetKey: 'focus_btc' | 'top_3' | 'top_4_patterns' | 'grid_4') => {
    if (presetKey === 'focus_btc') {
      const btc = coins.find((c) => c.symbol === 'BTCUSDT') || {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        exchange: 'binance' as ExchangeId,
        marketType: 'futures' as MarketType,
      };
      setBlocks([
        {
          id: `block-btc-${Date.now()}`,
          symbol: btc.symbol,
          baseAsset: btc.baseAsset,
          quoteAsset: btc.quoteAsset,
          exchange: btc.exchange,
          marketType: btc.marketType,
          timeframe: '15m',
          mode: 'tradingview',
          colSpan: 'full',
        },
      ]);
      setConfig((prev) => ({ ...prev, layoutPreset: '1x1', columns: 1, autoFitScreen: true }));
    } else if (presetKey === 'top_3') {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const newBlocks = symbols.map((sym, i) => {
        const c = coins.find((coin) => coin.symbol === sym) || {
          symbol: sym,
          baseAsset: sym.replace('USDT', ''),
          quoteAsset: 'USDT',
          exchange: 'binance' as ExchangeId,
          marketType: 'futures' as MarketType,
        };
        return {
          id: `block-${sym}-${Date.now()}-${i}`,
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          exchange: c.exchange,
          marketType: c.marketType,
          timeframe: '15m' as Timeframe,
          mode: 'tradingview' as const,
          colSpan: (i === 0 ? 2 : 1) as any,
        };
      });
      setBlocks(newBlocks);
      setConfig((prev) => ({ ...prev, layoutPreset: 'custom', columns: 2, autoFitScreen: true }));
    } else if (presetKey === 'grid_4') {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT'];
      const newBlocks = symbols.map((sym, i) => {
        const c = coins.find((coin) => coin.symbol === sym) || {
          symbol: sym,
          baseAsset: sym.replace('USDT', ''),
          quoteAsset: 'USDT',
          exchange: 'binance' as ExchangeId,
          marketType: 'futures' as MarketType,
        };
        return {
          id: `block-${sym}-${Date.now()}-${i}`,
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          exchange: c.exchange,
          marketType: c.marketType,
          timeframe: '15m' as Timeframe,
          mode: 'tradingview' as const,
          colSpan: 1 as const,
        };
      });
      setBlocks(newBlocks);
      setConfig((prev) => ({ ...prev, layoutPreset: '2x2', columns: 2, autoFitScreen: true }));
    } else if (presetKey === 'top_4_patterns') {
      const coinsWithPatterns = coins
        .filter((c) => c.formations && c.formations.length > 0)
        .slice(0, 4);

      if (coinsWithPatterns.length > 0) {
        const newBlocks = coinsWithPatterns.map((c, i) => ({
          id: `block-pattern-${c.symbol}-${Date.now()}-${i}`,
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          exchange: c.exchange,
          marketType: c.marketType,
          timeframe: c.timeframe || '15m',
          mode: 'tradingview' as const,
          formationId: c.formations[0]?.id,
          colSpan: 1 as const,
        }));
        setBlocks(newBlocks);
        setConfig((prev) => ({ ...prev, layoutPreset: '2x2', columns: 2, autoFitScreen: true }));
      }
    }
  };

  const handleApplyMarketCoins = useCallback((selected: MarketCoin[]) => {
    if (!selected.length) return;
    updateBlocks(current => blocksForMarketPreset(current, selected, timeframe));
    setConfig(current => {
      const columns = selected.length === 1 ? 1 : selected.length <= 4 ? 2 : selected.length <= 9 ? 3 : 4;
      return current.columns === columns && current.layoutPreset === 'custom' ? current
        : { ...current, columns, layoutPreset: 'custom' };
    });
    setMaximizedBlockId(null);
  }, [updateBlocks, setConfig, timeframe]);

  const handleSaveCoinPreset = (name: string, selected: TerminalChartBlock[]) => {
    const preset: TerminalSavedPreset = {
      id: `preset-${crypto.randomUUID()}`, name, blocks: selected.map(block => ({ ...block })),
      columns: config.columns, blockHeight: config.blockHeight, createdAt: Date.now(),
    };
    setCustomPresets(current => [...current, preset]);
  };

  const handleLoadCoinPreset = (preset: TerminalSavedPreset) => {
    setBlocks(preset.blocks.map(block => ({ ...block })));
    setConfig(current => ({ ...current, columns: preset.columns, blockHeight: preset.blockHeight, layoutPreset: 'custom' }));
    setTimeframe(preset.blocks[0]?.timeframe || timeframe);
    setMaximizedBlockId(null);
    setIframeLoading(true);
  };

  const handleResetWorkspace = () => {
    setBlocks([]);
    setMaximizedBlockId(null);
  };

  const getCoinForBlock = useCallback(
    (block: TerminalChartBlock): ScannedCoin | undefined => {
      return coins.find(
        (c) =>
          c.symbol === block.symbol &&
          c.exchange === block.exchange &&
          c.marketType === block.marketType
      );
    },
    [coins]
  );

  // The selected column count is a preference; never force narrow charts
  // or silently delete/replace coins when the viewport gets smaller.
  const effectiveColumns = fitTerminalColumns(workspaceSize.width, config.columns);
  const computedHeightStyle = terminalChartHeight(
    workspaceSize.height, blocks.length, effectiveColumns, config.autoFitScreen, config.blockHeight,
    blocks.map(block => block.colSpan),
  );

  const formation = activeCoin.formations?.[0] || null;
  const isBullish = formation?.bias === 'bullish';
  const isBearish = formation?.bias === 'bearish';

  return (
    <div
      className="terminal-workspace fixed inset-0 z-40 w-screen h-[100dvh] max-h-[100dvh] min-h-[100dvh] bg-[#090d16] flex flex-col overflow-hidden select-none animate-in fade-in duration-200"
      role="region"
      aria-label={tr("Термінал трейдера")}
    >
      {/* Top Header & Controls — Exactly styled like FullscreenChartModal */}
      <header className="terminal-workspace-header min-h-12 sm:min-h-14 bg-slate-950/95 border-b border-slate-800 px-2.5 sm:px-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 shrink-0 z-20">
        <div className="terminal-header-left flex min-w-0 w-full items-center justify-end gap-2 overflow-x-auto no-scrollbar touch-scroll">
          {/* Accessible on phones too. A layout change must not remove or
              replace any of the existing charts. */}
          <div className="terminal-layout-switcher flex shrink-0 items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs font-mono" role="group" aria-label={tr("Кількість колонок на екрані")}>
            {([1, 2, 3, 4, 5, 6] as const).map(columns => (
              <button
                key={columns}
                type="button"
                onClick={() => setConfig(prev => ({
                  ...prev,
                  columns,
                  layoutPreset: columns === 1 ? '1x1' : 'custom',
                  autoFitScreen: true,
                }))}
                className={`shrink-0 px-2 py-1 rounded-lg transition-colors ${
                  config.columns === columns ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
                aria-pressed={config.columns === columns}
                title={tr(`${columns} колонок (адаптивно до екрана)`)}
              >
                {columns}x
              </button>
            ))}
          </div>

          {/* Timeframe Selector */}
          <div className="flex shrink-0 items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs font-mono">
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => {
                  setTimeframe(tf);
                  handleApplyGlobalTimeframe(tf);
                  setIframeLoading(true);
                }}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                  timeframe === tf
                    ? 'bg-cyan-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setAddModalInitialMode('tradingview');
              setIsAddModalOpen(true);
            }}
            className="flex shrink-0 items-center justify-center border-0 bg-transparent p-1.5 text-slate-300 shadow-none transition-colors hover:text-cyan-300 active:scale-95 cursor-pointer sm:p-2"
            title={tr("Додати новий графік монети (понад 2,400+ монет на біржі від $50k до $10B)")}
            aria-label={tr("Додати графік")}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <TerminalClock timeZone={profile?.timeZone} open={showTradingSessions} buttonRef={clockButtonRef}
          onOpenChange={setShowTradingSessions} onOpen={() => setShowCoinPresets(false)} />

        <div className="terminal-header-right flex min-w-0 w-full items-center justify-self-end gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar touch-scroll">

          <button
            ref={presetsButtonRef}
            type="button"
            onClick={() => { if (showCoinPresets) closePresetsMenu(); else { setShowTradingSessions(false); setShowCoinPresets(true); } }}
            className={`flex items-center gap-1 p-1.5 sm:p-2 rounded-xl border-0 transition-colors cursor-pointer ${showCoinPresets
              ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white'}`}
            title={tr(showCoinPresets ? 'Закрити пресети монет' : 'Відкрити пресети монет')}
            aria-label={tr("Пресети монет")}
            aria-expanded={showCoinPresets}
            aria-controls="terminal-coin-presets"
          >
            <ListChecks className="w-4 h-4" />
            <ChevronDown className={`h-3 w-3 transition-transform ${showCoinPresets ? 'rotate-180' : ''}`} />
          </button>

          <button
            type="button"
            aria-label={tr("Оновити монети пресетів")}
            title={tr("Оновити монети пресетів")}
            disabled={marketLoading}
            onClick={() => setMarketRefresh(value => value + 1)}
            className="rounded-xl border-0 bg-slate-900 p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-cyan-300 disabled:opacity-40 sm:p-2"
          >
            {marketLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <span
            title={tr('Кількість монет у терміналі')}
            aria-label={tr(`Монет у терміналі: ${terminalCoinCount}`)}
            className="shrink-0 whitespace-nowrap font-mono text-xs text-cyan-400"
          >
            {tr('Монет:')} {terminalCoinCount}
          </span>

          <label
            className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-300"
            title={tr("Автооновлення монет пресету кожні 30 секунд")}
          >
            <input
              type="checkbox"
              aria-label={tr("Автооновлення монет пресету кожні 30 секунд")}
              checked={autoUpdatePresets}
              onChange={event => setAutoUpdatePresets(event.target.checked)}
              className="h-3.5 w-3.5 accent-cyan-500"
            />
            {tr("30сек")}
          </label>

          {/* Telegram, MetaScalp, Settings, Fullscreen */}
          <div className="terminal-header-actions ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Telegram Alert shortcut */}
            {onOpenTelegramAlerts && (
              <button
                onClick={() =>
                  onOpenTelegramAlerts({
                    symbol: activeCoin.symbol,
                    exchange: activeCoin.exchange,
                    marketType: activeCoin.marketType,
                    currentPrice: activeCoin.currentPrice,
                    targetPrice: formation?.levels?.targetPrice,
                    formationName: formation?.name,
                  })
                }
                className="p-1.5 sm:p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-0 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                title={tr("Створити сповіщення в Telegram")}
                aria-label={tr("Створити сповіщення в Telegram")}
              >
                <Send className="w-4 h-4 text-sky-400" />
              </button>
            )}

            {/* MetaScalp shortcut */}
            {onSendMetaScalp && (
              <button
                onClick={() => onSendMetaScalp(activeCoin)}
                className="p-1.5 sm:p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-0 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                title={tr(`Надіслати в MetaScalp (Група ${metaScalpBinding})`)}
                aria-label={tr(`Надіслати в MetaScalp (Група ${metaScalpBinding})`)}
              >
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400/20" />
              </button>
            )}

            {/* Settings Drawer */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border-0 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={tr('Налаштування робочого простору')}
              aria-label={tr('Налаштування робочого простору')}
            >
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            </button>

            {/* Browser Fullscreen Button */}
            <button
              onClick={toggleBrowserFullscreen}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border-0 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={tr(isBrowserFullscreen ? 'Вийти з повноекранного режиму' : 'На весь екран браузера')}
            >
              {isBrowserFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close / Return X button */}
            {onReturnToPatterns && (
              <button
                onClick={onReturnToPatterns}
                className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border-0 transition-colors cursor-pointer"
                title={tr("Закрити термінал (повернутися до скрінера)")}
                aria-label={tr("Закрити термінал")}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div
        ref={presetsMenuRef}
        id="terminal-coin-presets"
        role="region"
        aria-label={tr("Пресети монет")}
        hidden={!showCoinPresets}
        onKeyDown={handlePresetsMenuKeyDown}
        style={presetsMenuPosition}
        className={`${showCoinPresets ? 'flex' : 'hidden'} fixed z-50 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl`}
      >
        <div className="min-h-0 overflow-y-auto">
          <TerminalPresetPanel
            blocks={blocks} watchlist={localWatchlist} presets={customPresets}
            selection={coinPresetSelection} limit={coinPresetLimit} timeframe={timeframe} activePreset={activeMarketPreset} autoUpdate={autoUpdatePresets}
            snapshot={marketSnapshot} loading={marketLoading} error={marketError}
            onRefresh={() => setMarketRefresh(value => value + 1)}
            onActivePresetChange={setActiveMarketPreset}
            onApplyCoins={handleApplyMarketCoins} onSavePreset={handleSaveCoinPreset}
            onLoadPreset={handleLoadCoinPreset} onDeletePreset={id => setCustomPresets(current => current.filter(preset => preset.id !== id))}
            syncError={syncError} onRetrySync={retrySync} signedIn={Boolean(user)}
          />
        </div>
      </div>

      {/* Sub-header: 24h Coin Market Stats Bar */}
      {blocks.length === 1 && (
        <div className="h-8 sm:h-9 bg-slate-950/80 border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between gap-2 text-[11px] font-mono shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3 sm:gap-6 shrink-0">
            <span className="flex items-center gap-1 text-slate-300">
              {tr("Об'єм 24г:")} <strong className="text-white">{formatVolume(activeCoin.volume24hUsd || 0)}</strong>
            </span>
            {activeCoin.highPrice24h ? (
              <span className="flex items-center gap-1 text-emerald-400">
                {tr('Max 24г:')} <strong>${formatCryptoPrice(activeCoin.highPrice24h)}</strong>
              </span>
            ) : null}
            {activeCoin.lowPrice24h ? (
              <span className="flex items-center gap-1 text-rose-400">
                {tr('Min 24г:')} <strong>${formatCryptoPrice(activeCoin.lowPrice24h)}</strong>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3 text-slate-400 text-[11px] shrink-0">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {tr("Синхронізація:")} <strong className="text-cyan-400 font-bold">WLive</strong>
            </span>
            <span className="text-slate-500">|</span>
            <span>
              {tr("Таймфрейм:")} <strong className="text-cyan-400 font-bold">{timeframe}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Main Content Area (100% remaining space) */}
      <main ref={workspaceAreaRef} className="terminal-workspace-main flex-1 min-h-0 w-full relative overflow-hidden bg-[#090d16]">
        {/* Collapsible Left Drawer (Шторка зліва з обраними монетами) */}
        <div
          className={`absolute top-0 bottom-0 left-0 z-30 w-72 sm:w-80 bg-slate-950/95 border-r border-slate-800 backdrop-blur-md flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
            isFavoritesDrawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          }`}
        >
          {/* Drawer Header */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="font-bold text-xs sm:text-sm text-white">{tr("Обрані монети")}</span>
              <span className="text-[10px] font-mono font-bold text-amber-300">
                {localWatchlist.length}
              </span>
            </div>
            <button
              onClick={() => setIsFavoritesDrawerOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title={tr("Сховати")}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Search Input in Drawer */}
          <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr("Пошук в обраному...")}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Quick Add Chart button in Drawer */}
          <div className="p-2 border-b border-slate-800/60 bg-slate-900/40">
            <button
              onClick={() => {
                setAddModalInitialMode('tradingview');
                setIsAddModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-bold transition-all cursor-pointer shadow-sm"
              title={tr("Додати графік будь-якої монети з біржі")}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tr("+ Додати графік у термінал")}</span>
            </button>
          </div>

          {/* Coins List in Drawer */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 touch-scroll">
            {filteredFavorites.length === 0 ? (
              <div className="text-center py-10 px-4 text-slate-500 text-xs space-y-2">
                <Star className="w-6 h-6 text-slate-700 mx-auto" />
                <p className="font-semibold text-slate-400">{tr("Немає обраних монет")}</p>
                <p className="text-[11px] text-slate-600">
                  {tr("Натисніть на зірочку біля монет у скрінері, щоб вони з'явились тут.")}
                </p>
              </div>
            ) : (
              filteredFavorites.map((favCoin, idx) => {
                const isSelected = favCoin.symbol === activeCoin.symbol;
                const isFavPositive = (favCoin.priceChange24h || 0) >= 0;
                return (
                  <div
                    key={`${favCoin.exchange}-${favCoin.symbol}-${favCoin.marketType}-${idx}`}
                    onClick={() => handleSelectFavoriteCoin(favCoin)}
                    className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/60 shadow-sm shadow-cyan-950/50'
                        : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-white truncate">
                          {favCoin.baseAsset}/{favCoin.quoteAsset}
                        </span>
                        {isSelected && (
                          <span className="flex h-1.5 w-1.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] uppercase font-bold px-1 rounded bg-slate-800 text-slate-400">
                          {favCoin.exchange || 'binance'}
                        </span>
                        <span className="text-[9px] uppercase font-semibold px-1 rounded bg-slate-800/80 text-slate-500">
                          {favCoin.marketType === 'futures' ? 'Fut' : 'Spot'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {favCoin.currentPrice > 0 && (
                          <div className="font-mono text-xs font-semibold text-slate-200">
                            ${formatCryptoPrice(favCoin.currentPrice)}
                          </div>
                        )}
                        <div
                          className={`text-[10px] font-mono font-semibold ${
                            isFavPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isFavPositive ? '+' : ''}
                          {(favCoin.priceChange24h || 0).toFixed(2)}%
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleRemoveFromWatchlist(favCoin.symbol, e)}
                        className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title={tr("Видалити з обраного")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Workspace Display: If 1 block or maximized block, show full single chart. If multiple blocks, show multi-chart grid */}
        {blocks.length === 1 && blocks[0].mode === 'tradingview' ? (
          /* Single Screen 100% View TradingView Pro */
          <div className="w-full h-full relative overflow-hidden">
            {tradingViewUrl ? (
              <>
                {iframeLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-3 z-10 pointer-events-none">
                    <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                    <span className="text-sm font-medium">{tr(`Завантаження графіку ${activeCoin.symbol}...`)}</span>
                  </div>
                )}
                <div
                  className={`absolute top-0 h-full transition-[width,left] duration-200 ease-in-out ${
                    showDrawingToolbar ? 'left-0 w-full' : '-left-[54px] w-[calc(100%+54px)]'
                  }`}
                >
                  <iframe
                    key={tradingViewUrl}
                    src={tradingViewUrl}
                    className="h-full w-full border-0"
                    title={`TradingView Chart ${activeCoin.symbol}`}
                    onLoad={() => setIframeLoading(false)}
                    allow="fullscreen"
                    loading="lazy"
                  />
                </div>
                <div
                  className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-[54px] bg-transparent transition-transform duration-200 ${
                    showDrawingToolbar ? '-translate-x-full' : 'translate-x-0'
                  }`}
                  aria-hidden={showDrawingToolbar}
                />
                <div className="absolute bottom-2 left-2 z-20 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleDrawingToolbar}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-cyan-300 shadow-md backdrop-blur-sm transition-all cursor-pointer group"
                    title={tr(showDrawingToolbar ? 'Сховати панель TradingView' : 'Показати панель TradingView')}
                    aria-label={tr(showDrawingToolbar ? 'Сховати панель TradingView' : 'Показати панель TradingView')}
                  >
                    {showDrawingToolbar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                  </button>
                </div>
              </>
            ) : (
              <ExchangeCandlestickChart
                symbol={activeCoin.symbol}
                exchange={activeCoin.exchange}
                marketType={activeCoin.marketType}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
              />
            )}
          </div>
        ) : (
          /* Multi-chart Grid Layout */
          <div className="w-full h-full p-2 sm:p-3 overflow-y-auto no-scrollbar">
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 sm:p-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/40 my-8 max-w-lg mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 shadow-inner">
                  <Plus className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{tr("Робоча область порожня")}</h3>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  {tr("Додайте графік будь-якої монети з біржі Binance або Bybit. Доступно понад 2,400+ монет від $50k до $10B.")}
                </p>
                <button
                  onClick={() => {
                    setAddModalInitialMode('tradingview');
                    setIsAddModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-xs font-bold shadow-lg shadow-cyan-950/50 transition-all active:scale-95 cursor-pointer border border-cyan-400/30"
                >
                  <Plus className="w-4 h-4" />
                  {tr("+ Додати перший графік")}
                </button>
              </div>
            ) : (
              <div className="terminal-workspace-grid grid gap-2 sm:gap-3 transition-all duration-200" style={{ gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))` }}>
                {blocks.map((block, index) => {
                  const coinData = getCoinForBlock(block);
                  const isMaximized = maximizedBlockId === block.id;

                  return (
                    <TerminalChartWidget
                      key={block.id}
                      block={block}
                      coin={coinData}
                      allCoins={coins}
                      isSingleBlock={blocks.length === 1}
                      isMaximized={isMaximized}
                      gridColumns={effectiveColumns}
                      onToggleMaximize={() =>
                        setMaximizedBlockId((prev) => (prev === block.id ? null : block.id))
                      }
                      onRemove={() => handleRemoveBlock(block.id)}
                      onUpdateBlock={(updated) => handleUpdateBlock(block.id, updated)}
                      onOpenFullscreenModal={onOpenFullscreenModal}
                      onSendMetaScalp={onSendMetaScalp}
                      metaScalpBinding={metaScalpBinding}
                      onOpenTelegramAlerts={onOpenTelegramAlerts}
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedBlockIndex !== null && draggedBlockIndex !== index) {
                          setDragOverBlockIndex(index);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverBlockIndex === index) {
                          setDragOverBlockIndex(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(index);
                      }}
                      isDragOverMerge={dragOverBlockIndex === index && draggedBlockIndex !== null && draggedBlockIndex !== index}
                      canMerge={
                        draggedBlockIndex !== null &&
                        draggedBlockIndex !== index &&
                        ((blocks[draggedBlockIndex]?.mode === 'orderbook' && block.mode === 'tradingview') ||
                          (blocks[draggedBlockIndex]?.mode === 'tradingview' && block.mode === 'orderbook') ||
                          blocks[draggedBlockIndex]?.mode === 'orderbook' ||
                          block.mode === 'orderbook')
                      }
                      onSplitBlock={() => handleSplitBlock(block.id)}
                      heightStyle={computedHeightStyle}
                    />
                  );
                })}

                {/* "+ Додати графік" Tile Card at the end of grid */}
                <div
                  onClick={() => {
                    setAddModalInitialMode('tradingview');
                    setIsAddModalOpen(true);
                  }}
                  className="terminal-add-chart-tile flex flex-col items-center justify-center gap-2.5 p-4 sm:p-6 rounded-xl border border-dashed border-slate-800 hover:border-cyan-500/50 bg-slate-950/25 hover:bg-cyan-950/15 transition-all cursor-pointer group text-slate-500 hover:text-cyan-400 min-h-[96px] sm:min-h-[160px] select-none"
                  title={tr("Додати ще один графік монети у термінал")}
                >
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 group-hover:bg-cyan-500/20 border border-slate-800 group-hover:border-cyan-500/40 flex items-center justify-center text-slate-400 group-hover:text-cyan-300 transition-colors shadow-sm">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors block">
                      {tr("+ Додати графік")}
                    </span>
                    <span className="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors block mt-0.5">
                      {tr("2,400+ монет на біржі ($50k - $10B)")}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Chart / Order Book Modal */}
      <AddChartModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        coins={coins}
        watchlist={localWatchlist}
        initialMode={addModalInitialMode}
        onAddChart={handleAddChart}
      />

      {/* Workspace Settings Drawer */}
      <TerminalSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        coinSelection={coinPresetSelection}
        coinLimit={coinPresetLimit}
        onUpdateConfig={(updated) => setConfig((prev) => ({ ...prev, ...updated }))}
        onApplyGlobalTimeframe={handleApplyGlobalTimeframe}
        onApplyPreset={handleApplyPreset}
        onResetWorkspace={handleResetWorkspace}
        totalBlocks={blocks.length}
      />
    </div>
  );
};
