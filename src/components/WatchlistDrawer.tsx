import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Star, Zap, FolderPlus, ArrowUpDown, ChevronDown, ChevronUp, Check, Copy, ExternalLink } from 'lucide-react';
import { copyTextToClipboard } from '../utils/copyTextToClipboard';
import type { ExchangeId, MarketType, ScannedCoin } from '../types';
import {
  getCoinWatchlistKey, resolveWatchlistEntries, isWatchlistMarketQuote,
  watchlistQuoteToScannedCoin, watchlistDisplayName,
} from '../utils/watchlistUtils';
import type { ResolvedWatchlistEntry } from '../utils/watchlistUtils';
import { formatCryptoPrice } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';

interface WatchlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  watchlistSymbols: string[];
  allCoins: ScannedCoin[];
  onRemove: (sourceKeys: string[]) => void;
  folders: Record<string, string[]>;
  onFoldersChange: (folders: Record<string, string[]>) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  /** Opens the selected exact exchange + market pair in the existing chart route. */
  onOpenChart: (entry: ResolvedWatchlistEntry) => void;
  metaScalpBinding?: string;
}

export const WatchlistDrawer: React.FC<WatchlistDrawerProps> = ({
  isOpen,
  onClose,
  watchlistSymbols,
  allCoins,
  onRemove,
  folders,
  onFoldersChange,
  onSendMetaScalp,
  onOpenChart,
  metaScalpBinding = '001',
}) => {
  const { t } = useLanguage();
  const [newFolderName, setNewFolderName] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'change' | 'volume'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  // A single visual-only, dark menu replaces the browser's white native
  // folder picker. Folder assignments still use the same moveCoin handler.
  const [folderMenu, setFolderMenu] = useState<{
    entryKey: string; left: number; top: number; width: number; maxHeight: number;
  } | null>(null);
  // Separate, custom dark action menu on the symbol (not the folder selector).
  const [coinMenu, setCoinMenu] = useState<{
    entryKey: string; left: number; top: number; width: number;
  } | null>(null);
  const [coinMenuFeedback, setCoinMenuFeedback] = useState<{
    entryKey: string; status: 'copied' | 'failed';
  } | null>(null);
  const coinMenuRef = useRef<HTMLDivElement>(null);
  const coinMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const folderTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerOverlayRef = useRef<HTMLDivElement>(null);
  const [marketQuotes, setMarketQuotes] = useState<ScannedCoin[]>([]);
  const [quoteSources, setQuoteSources] = useState<Array<{
    exchange: ExchangeId; marketType: MarketType;
    status: 'live' | 'stale' | 'unavailable'; updatedAt: number | null;
  }>>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesFailed, setQuotesFailed] = useState(false);

  // Screener formation scans only include a subset of instruments. Fetch
  // public tickers for saved pairs absent from that subset, regardless of the
  // current Screener exchange, volume filter or timeframe.
  const missingQuoteKeys = useMemo(() => {
    const scanned = new Set(allCoins.map(getCoinWatchlistKey));
    return [...new Set(watchlistSymbols.map(getCoinWatchlistKey))]
      .filter((key) => !scanned.has(key));
  }, [allCoins, watchlistSymbols]);
  const missingKeySignature = missingQuoteKeys.join('|');

  useEffect(() => {
    if (!isOpen || !missingKeySignature) return;
    const keys = missingKeySignature.split('|');
    const controller = new AbortController();
    let disposed = false;
    let inFlight = false;

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      setQuotesLoading(true);
      setQuotesFailed(false);
      try {
        // Bounded batch sizes: no giant responses or query strings when an
        // account has hundreds of favorites. Feed refresh is shared by VPS.
        const batches: string[][] = [];
        for (let i = 0; i < keys.length; i += 100) batches.push(keys.slice(i, i + 100));
        const responses = await Promise.all(batches.map(async (batch) => {
          const response = await fetch('/api/market/favorite-quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: batch }),
            cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
          });
          if (!response.ok) throw new Error('Failed to load favorite quotes');
          const json = await response.json();
          if (!json.success || !Array.isArray(json.data)) throw new Error('Invalid favorite quotes');
          return json;
        }));
        if (disposed) return;
        const sources = responses.flatMap((response) => Array.isArray(response.sources) ? response.sources : [])
          .filter((source) => source && (source.exchange === 'binance' || source.exchange === 'bybit')
            && (source.marketType === 'futures' || source.marketType === 'spot')
            && ['live', 'stale', 'unavailable'].includes(source.status));
        const updatedAt = Date.now();
        const quotes = responses.flatMap((response) => response.data)
          .filter(isWatchlistMarketQuote)
          .map((quote) => watchlistQuoteToScannedCoin(quote, updatedAt));
        setMarketQuotes(quotes);
        setQuoteSources(sources);
      } catch {
        if (!disposed && !controller.signal.aborted) setQuotesFailed(true);
      } finally {
        inFlight = false;
        if (!disposed) setQuotesLoading(false);
      }
    };

    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      controller.abort();
    };
  }, [isOpen, missingKeySignature]);

  // Prevent background scrolling, but allow normal zoom and text input.
  // A portal also avoids clipping caused by the chart/page stacking context.
  useEffect(() => {
    if (!isOpen) return;
    const oldBodyOverflow = document.body.style.overflow;
    const oldHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (coinMenu) {
          setCoinMenu(null);
        } else if (folderMenu) {
          setFolderMenu(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = oldBodyOverflow;
      document.documentElement.style.overflow = oldHtmlOverflow;
    };
  }, [isOpen, onClose, folderMenu, coinMenu]);

  // Mobile browser bars and the keyboard change the *visible* viewport
  // independently of 100vh/100dvh on some iOS Safari versions. Keep this
  // portal within the actually visible area, including when bars expand,
  // the device rotates, or the on-screen keyboard opens.
  useEffect(() => {
    if (!isOpen) return;
    const overlay = drawerOverlayRef.current;
    if (!overlay) return;

    const syncVisibleViewport = () => {
      const viewport = window.visualViewport;
      if (!viewport) return; // 100dvh / 100vw remain the CSS fallback.
      overlay.style.top = `${viewport.offsetTop}px`;
      overlay.style.left = `${viewport.offsetLeft}px`;
      overlay.style.width = `${viewport.width}px`;
      overlay.style.height = `${viewport.height}px`;
    };

    syncVisibleViewport();
    window.visualViewport?.addEventListener('resize', syncVisibleViewport);
    window.visualViewport?.addEventListener('scroll', syncVisibleViewport);
    window.addEventListener('resize', syncVisibleViewport);
    return () => {
      window.visualViewport?.removeEventListener('resize', syncVisibleViewport);
      window.visualViewport?.removeEventListener('scroll', syncVisibleViewport);
      window.removeEventListener('resize', syncVisibleViewport);
    };
  }, [isOpen]);

  // Close action popovers when the drawer is hidden.
  useEffect(() => {
    if (!isOpen) {
      setCoinMenu(null);
      setCoinMenuFeedback(null);
    }
  }, [isOpen]);

  // Same viewport anchoring and keyboard behavior as the dark folder dropdown.
  useEffect(() => {
    if (!coinMenu) return;
    const dismiss = () => setCoinMenu(null);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    coinMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [coinMenu]);

  // The floating list is measured relative to the viewport, not to a coin
  // card with overflow:hidden. Close it on viewport changes / list scroll.
  useEffect(() => {
    if (!folderMenu) return;
    const closeOnPositionChange = () => setFolderMenu(null);
    document.addEventListener('scroll', closeOnPositionChange, true);
    window.addEventListener('resize', closeOnPositionChange);
    folderMenuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('scroll', closeOnPositionChange, true);
      window.removeEventListener('resize', closeOnPositionChange);
    };
  }, [folderMenu]);

  if (!isOpen) return null;

  // Prefer a full scanned coin when available, then the lightweight exact
  // exchange quote. Neither price nor MetaScalp needs a formation scan.
  const entries = resolveWatchlistEntries(watchlistSymbols, [...allCoins, ...marketQuotes]);
  const unavailableText = (entry: ResolvedWatchlistEntry): string => {
    if (quotesLoading) return t('ui.watchlist.quoteLoading');
    if (quotesFailed) return t('ui.watchlist.quoteRetry');
    const source = quoteSources.find((item) =>
      item.exchange === entry.exchange && item.marketType === entry.marketType);
    if (source?.status === 'unavailable')
      return t('ui.watchlist.quoteUnavailable');
    if (source?.status === 'live' || source?.status === 'stale')
      return t('ui.watchlist.quoteMissing');
    return t('ui.watchlist.quoteWaiting');
  };
  const folderNames = Object.keys(folders);
  const getFolderForEntry = (entry: ResolvedWatchlistEntry) =>
    folderNames.find((folder) => {
      const symbols = Array.isArray(folders[folder]) ? folders[folder] : [];
      return symbols.some((key) => key === entry.key || entry.sourceKeys.includes(key));
    }) || '';
  const sortEntries = (items: ResolvedWatchlistEntry[]) => [...items].sort((a, b) => {
    let result = 0;
    if (sortBy === 'name') result = a.symbol.localeCompare(b.symbol);
    if (sortBy === 'price') result = (a.coin?.currentPrice ?? 0) - (b.coin?.currentPrice ?? 0);
    if (sortBy === 'change') result = (a.coin?.priceChange24h ?? 0) - (b.coin?.priceChange24h ?? 0);
    if (sortBy === 'volume') result = (a.coin?.volume24hUsd ?? 0) - (b.coin?.volume24hUsd ?? 0);
    return sortDirection === 'asc' ? result : -result;
  });
  // Show unassigned favorites first. Folders are optional and never
  // automatically receive newly bookmarked coins.
  const groups = [{
    name: '',
    entries: sortEntries(entries.filter((entry) => !getFolderForEntry(entry))),
  }, ...folderNames.map((folder) => ({
    name: folder,
    entries: sortEntries(entries.filter((entry) => getFolderForEntry(entry) === folder)),
  }))];

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name || folders[name]) return;
    onFoldersChange({ ...folders, [name]: [] });
    setNewFolderName('');
  };

  const openFolderMenu = (entry: ResolvedWatchlistEntry, button: HTMLButtonElement) => {
    setCoinMenu(null);
    if (folderMenu?.entryKey === entry.key) {
      setFolderMenu(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(Math.max(rect.width, 250), Math.max(100, viewportWidth - 16));
    const left = Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8));
    const desiredHeight = Math.min(320, (folderNames.length + 1) * 48 + 12);
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 12);
    const spaceAbove = Math.max(0, rect.top - 12);
    const openAbove = spaceAbove > spaceBelow && spaceBelow < desiredHeight;
    const maxHeight = Math.max(48, Math.min(desiredHeight,
      openAbove ? spaceAbove : spaceBelow, viewportHeight - 16));
    const top = openAbove
      ? Math.max(8, rect.top - maxHeight - 4)
      : Math.max(8, Math.min(rect.bottom + 4, viewportHeight - maxHeight - 8));
    folderTriggerRef.current = button;
    setFolderMenu({ entryKey: entry.key, left, top, width, maxHeight });
  };

  const openCoinMenu = (entry: ResolvedWatchlistEntry, button: HTMLButtonElement) => {
    if (coinMenu?.entryKey === entry.key) {
      setCoinMenu(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(232, Math.max(160, viewportWidth - 16));
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const height = 112;
    const openAbove = rect.bottom + height + 8 > viewportHeight && rect.top > height + 8;
    const top = Math.max(8, Math.min(
      openAbove ? rect.top - height - 4 : rect.bottom + 4,
      Math.max(8, viewportHeight - height - 8),
    ));
    setFolderMenu(null);
    setCoinMenuFeedback(null);
    coinMenuTriggerRef.current = button;
    setCoinMenu({ entryKey: entry.key, left, top, width });
  };

  const copyCoinName = async (entry: ResolvedWatchlistEntry) => {
    const copied = await copyTextToClipboard(entry.symbol);
    setCoinMenuFeedback({ entryKey: entry.key, status: copied ? 'copied' : 'failed' });
  };

  const onFolderMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setFolderMenu(null);
      folderTriggerRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    const active = options.indexOf(document.activeElement as HTMLButtonElement);
    const target = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (active + 1) % options.length
      : (active + options.length - 1) % options.length;
    options[target]?.focus({ preventScroll: true });
  };

  const moveCoin = (entry: ResolvedWatchlistEntry, folder: string) => {
    const aliases = new Set([...entry.sourceKeys, entry.key]);
    const next: Record<string, string[]> = {};
    Object.entries(folders).forEach(([name, symbols]) => {
      next[name] = (Array.isArray(symbols) ? symbols : []).filter((item) => !aliases.has(item));
    });
    if (folder) next[folder] = [...(next[folder] || []), entry.key];
    onFoldersChange(next);
  };

  const removeCoin = (entry: ResolvedWatchlistEntry) => {
    // Explicit removal never toggles an unavailable favorite back on.
    onRemove(entry.sourceKeys);
    moveCoin(entry, '');
  };

  const formatPrice = (price: number) => formatCryptoPrice(price);

  return createPortal(
    <div
      ref={drawerOverlayRef}
      className="fixed left-0 top-0 z-[270] flex h-[100dvh] w-screen min-h-0 items-start justify-end overflow-hidden bg-black/60 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[max(12px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="watchlist-drawer-title"
        className="vq-modal-shell watchlist-drawer flex min-h-0 min-w-0 w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl animate-in slide-in-from-right duration-200"
        style={{
          // Content-sized when empty or short; never stretch to the bottom
          // of mobile Safari's browser chrome. Long lists scroll internally.
          minHeight: 'min(340px, calc(100% - 48px))',
          maxHeight: 'calc(100% - 48px)',
        }}
      >
        {/* Header */}
        <div className="vq-modal-header flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
            <h3 id="watchlist-drawer-title" className="min-w-0 text-sm font-bold text-white sm:text-base">{t('ui.watchlist.heading')}</h3>
            <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
              {entries.length}
            </span>
          </div>

          <button
            type="button"
            aria-label={t('ui.watchlist.close')}
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="vq-modal-controls min-w-0 shrink-0 space-y-2 border-b border-slate-800 bg-slate-900/80 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="vq-input-frame flex min-w-0 flex-1 basis-[165px] items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1">
              <FolderPlus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && createFolder()}
                placeholder={t('ui.watchlist.newFolder')}
                aria-label={t('ui.watchlist.newFolderName')}
                className="w-full min-w-0 flex-1 bg-transparent text-base text-slate-200 outline-none placeholder:text-slate-600 sm:text-xs"
              />
            </div>
            <button
              type="button"
              onClick={createFolder}
              className="shrink-0 rounded-lg bg-cyan-500/15 px-2.5 py-2 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25"
            >
              {t('ui.watchlist.add')}
            </button>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              aria-label={t('ui.watchlist.sort')}
              className="block w-full min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-base text-slate-300 outline-none sm:text-xs"
            >
              <option value="name">{t('ui.watchlist.sortName')}</option>
              <option value="price">{t('ui.watchlist.sortPrice')}</option>
              <option value="change">{t('ui.watchlist.sortChange')}</option>
              <option value="volume">{t('ui.watchlist.sortVolume')}</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')}
              className="shrink-0 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-300 transition-colors hover:text-white"
              title={t('ui.watchlist.sortDirection')}
              aria-label={t('ui.watchlist.sortDirection')}
            >
              {sortDirection === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="watchlist-drawer-list min-h-0 min-w-0 flex-auto space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain p-3 touch-scroll sm:p-4">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs space-y-2">
              <Star className="w-8 h-8 text-slate-700 mx-auto" />
              <p>{t('ui.watchlist.emptyTitle')}</p>
              <p className="text-[11px] text-slate-600">
                {t('ui.watchlist.emptyHelp')}
              </p>
            </div>
          ) : (
            groups.filter((group) => group.entries.length > 0).map((group) => (
              <div key={group.name || 'unfiled'} className="space-y-2">
                <button
                  type="button"
                  aria-expanded={!collapsedFolders[group.name || 'unfiled']}
                  onClick={() => setCollapsedFolders((current) => ({
                    ...current,
                    [group.name || 'unfiled']: !current[group.name || 'unfiled'],
                  }))}
                  className="flex w-full min-w-0 items-center gap-2 overflow-hidden text-left text-xs font-semibold text-slate-400 transition-colors hover:text-slate-200"
                >
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  <span className="min-w-0 truncate">{group.name || t('ui.watchlist.general')}</span>
                  <span className="shrink-0 font-mono text-slate-600">{group.entries.length}</span>
                  <span className="ml-auto">
                    {collapsedFolders[group.name || 'unfiled'] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </span>
                </button>
                {!collapsedFolders[group.name || 'unfiled'] && group.entries.map((entry, index) => (
              <div
                key={`${entry.key}-${index}`}
                className="min-w-0 space-y-2.5 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 transition-colors hover:border-slate-700 sm:p-3"
              >
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex min-w-0 flex-1 basis-[120px] flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => openCoinMenu(entry, event.currentTarget)}
                      aria-label={t('ui.watchlist.coinActionsFor', { name: watchlistDisplayName(entry) })}
                      aria-haspopup="menu"
                      aria-expanded={coinMenu?.entryKey === entry.key}
                      title={t('ui.watchlist.openOrCopy')}
                      className="inline-flex min-h-[32px] min-w-0 max-w-full items-center gap-1 rounded-md px-1 py-1 text-left font-mono text-sm font-bold text-white transition-colors hover:bg-slate-800 hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                    >
                      <span data-no-translate className="min-w-0 truncate">{watchlistDisplayName(entry)}</span>
                      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    </button>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase bg-slate-800 text-slate-400">
                      {entry.exchange}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 basis-[185px] flex-wrap items-center justify-end gap-1.5">
                    {entry.coin ? (
                      <span className="min-w-0 break-all font-mono text-xs font-bold text-white sm:whitespace-nowrap">${formatPrice(entry.coin.currentPrice)}</span>
                    ) : (
                      <span className="text-[10px] font-medium text-amber-300" title={unavailableText(entry)}>{t(quotesLoading ? 'ui.watchlist.loading' : 'ui.watchlist.noQuotes')}</span>
                    )}
                    {onSendMetaScalp && entry.coin && (
                      <button
                        onClick={() => entry.coin && onSendMetaScalp(entry.coin)}
                        title={t('ui.watchlist.openTerminal', { group: metaScalpBinding })}
                        className="text-amber-400/80 hover:text-amber-300 p-1 rounded hover:bg-amber-500/10 transition-colors"
                      >
                        <Zap className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(event) => openFolderMenu(entry, event.currentTarget)}
                      className="flex min-w-0 max-w-[165px] flex-1 items-center justify-between gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-left text-sm text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 sm:max-w-[110px]"
                      title={t('ui.watchlist.moveFolder')}
                      aria-label={t('ui.watchlist.folderFor', { symbol: entry.symbol, exchange: entry.exchange })}
                      aria-haspopup="listbox"
                      aria-expanded={folderMenu?.entryKey === entry.key}
                    >
                      <span className="min-w-0 truncate">{getFolderForEntry(entry) || t('ui.watchlist.general')}</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    </button>
                    <button
                      onClick={() => removeCoin(entry)}
                      title={t('ui.watchlist.remove')}
                      className="shrink-0 rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {!entry.coin && (
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-amber-300/80">
                    <span>{unavailableText(entry)}</span>
                    <span className="font-mono text-slate-500"><span data-no-translate>{entry.symbol}</span> · {entry.exchange} {entry.marketType}</span>
                  </div>
                )}
              </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      {coinMenu && (
        <>
          <div
            className="fixed inset-0 z-[12]"
            aria-hidden="true"
            onMouseDown={() => setCoinMenu(null)}
            onClick={() => setCoinMenu(null)}
          />
          <div
            ref={coinMenuRef}
            role="menu"
            aria-label={t('ui.watchlist.coinActions')}
            data-watchlist-coin-actions
            className="fixed z-[13] min-w-0 overflow-hidden rounded-xl border border-slate-700/80 bg-[#070c20] p-1.5 shadow-2xl shadow-black/60"
            style={{ left: coinMenu.left, top: coinMenu.top, width: coinMenu.width }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                event.preventDefault();
                setCoinMenu(null);
                coinMenuTriggerRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            {(() => {
              const entry = entries.find(item => item.key === coinMenu.entryKey);
              if (!entry) return null;
              const symbol = entry.symbol;
              const copied = coinMenuFeedback?.entryKey === entry.key && coinMenuFeedback.status === 'copied';
              const failed = coinMenuFeedback?.entryKey === entry.key && coinMenuFeedback.status === 'failed';
              return (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCoinMenu(null);
                      onOpenChart(entry);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800 hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-400" />
                    <span>{t('ui.watchlist.openChart')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void copyCoinName(entry)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800 hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    {copied ? <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-400" />
                      : <Copy aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-400" />}
                    <span role="status" aria-live="polite">
                      {copied ? t('ui.watchlist.copied', { symbol }) : failed ? t('ui.watchlist.copyFailed') : t('ui.watchlist.copySymbol', { symbol })}
                    </span>
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}
      {folderMenu && (
        <>
          <div
            className="fixed inset-0 z-[10]"
            aria-hidden="true"
            onMouseDown={() => setFolderMenu(null)}
          />
          <div
            ref={folderMenuRef}
            role="listbox"
            aria-label={t('ui.watchlist.chooseFolder')}
            data-watchlist-folder-menu
            onKeyDown={onFolderMenuKeyDown}
            className="fixed z-[11] min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-slate-700/80 bg-[#070c20] p-1.5 shadow-2xl shadow-black/60"
            style={{ left: folderMenu.left, top: folderMenu.top, width: folderMenu.width, maxHeight: folderMenu.maxHeight }}
          >
            {(() => {
              const entry = entries.find((item) => item.key === folderMenu.entryKey);
              if (!entry) return null;
              const selectedFolder = getFolderForEntry(entry);
              return ['', ...folderNames].map((folder) => (
                <button
                  key={folder || 'general'}
                  type="button"
                  role="option"
                  aria-selected={selectedFolder === folder}
                  onClick={() => {
                    moveCoin(entry, folder);
                    setFolderMenu(null);
                    folderTriggerRef.current?.focus({ preventScroll: true });
                  }}
                  className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-3 text-left text-base transition-colors ${
                    selectedFolder === folder
                      ? 'bg-slate-800 text-cyan-300'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {selectedFolder === folder && <Check className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{folder || t('ui.watchlist.general')}</span>
                </button>
              ));
            })()}
          </div>
        </>
      )}
    </div>,
    document.body
  );
};
