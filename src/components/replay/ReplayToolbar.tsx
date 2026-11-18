import React, { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { createPortal } from 'react-dom';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Calendar,
  Shuffle,
  Clock,
  Sparkles,
  ChevronDown,
  Search,
  Filter,
  Activity,
  CheckCircle2,
  X,
  Sliders,
} from 'lucide-react';
import { ExchangeId, MarketType, ScannedCoin } from '../../types';
import { formatCryptoPrice, formatLargeNumber } from '../../utils/formatters';
import { getReplayPresetDate } from '../../utils/replayService';

interface ReplayToolbarProps {
  // Coin & Market
  selectedSymbol: string;
  selectedExchange: ExchangeId;
  selectedMarketType: MarketType;
  availableCoins: ScannedCoin[];
  onSelectCoin: (symbol: string, exchange: ExchangeId, marketType: MarketType) => void;

  // Replay State & Actions
  isReplayActive: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onResetToCutoff: () => void;

  // Date selection
  currentDateText: string;
  onSelectHistoricalDate: (date: Date) => void;
  onRandomHistoricalDate: () => void;

  // Progress
  currentIndex: number;
  totalCandles: number;
  isLoadingHistoricalData: boolean;
}

export const ReplayToolbar: React.FC<ReplayToolbarProps> = ({
  selectedSymbol,
  selectedExchange,
  selectedMarketType,
  availableCoins,
  onSelectCoin,
  isReplayActive,
  isPlaying,
  onTogglePlay,
  onStepForward,
  onResetToCutoff,
  currentDateText,
  onSelectHistoricalDate,
  onRandomHistoricalDate,
  currentIndex,
  totalCandles,
  isLoadingHistoricalData,
}) => {
  const { t } = useLanguage();
  const [isCoinModalOpen, setIsCoinModalOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Both Replay dialogs live above chart stacking contexts in document.body.
  // Keep the underlying page from scrolling while either dialog is open.
  useEffect(() => {
    if (!isDatePickerOpen && !isCoinModalOpen) return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isCoinModalOpen) setIsCoinModalOpen(false);
        else setIsDatePickerOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [isDatePickerOpen, isCoinModalOpen]);
  const [coinSearchQuery, setCoinSearchQuery] = useState('');
  const [coinExchangeFilter, setCoinExchangeFilter] = useState<'all' | 'binance' | 'bybit'>('all');
  const [coinMarketFilter, setCoinMarketFilter] = useState<'all' | 'futures' | 'spot'>('all');
  const [coinVolumeFilter, setCoinVolumeFilter] = useState<'all' | '100k-1m' | '1m-10m' | '10m-100m' | '100m-10b'>('all');
  const [coinSortBy, setCoinSortBy] = useState<'volumeDesc' | 'volumeAsc' | 'changeDesc' | 'changeAsc' | 'nameAsc'>('volumeDesc');
  const [displayCount, setDisplayCount] = useState<number>(300);

  // Datetime input state
  const [customDateTime, setCustomDateTime] = useState<string>(() => {
    // Default 90 days ago
    const d = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });

  // Filter and sort all coins with volume from 100,000 USD to 10,000,000,000 USD ($10B)
  const filteredCoins = useMemo(() => {
    return availableCoins
      .filter((c) => {
        const vol = c.volume24hUsd || 0;
        // Volume boundary: $100k to $10B
        if (vol < 100_000 || vol > 10_000_000_000) return false;

        // Exchange filter
        if (coinExchangeFilter !== 'all' && c.exchange !== coinExchangeFilter) return false;

        // Market filter
        if (coinMarketFilter !== 'all' && c.marketType !== coinMarketFilter) return false;

        // Volume tier filter
        if (coinVolumeFilter === '100k-1m' && (vol < 100_000 || vol >= 1_000_000)) return false;
        if (coinVolumeFilter === '1m-10m' && (vol < 1_000_000 || vol >= 10_000_000)) return false;
        if (coinVolumeFilter === '10m-100m' && (vol < 10_000_000 || vol >= 100_000_000)) return false;
        if (coinVolumeFilter === '100m-10b' && (vol < 100_000_000 || vol > 10_000_000_000)) return false;

        // Search query
        if (coinSearchQuery.trim()) {
          const q = coinSearchQuery.toLowerCase().trim();
          return (
            c.symbol.toLowerCase().includes(q) ||
            c.baseAsset.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (coinSortBy === 'volumeDesc') return (b.volume24hUsd || 0) - (a.volume24hUsd || 0);
        if (coinSortBy === 'volumeAsc') return (a.volume24hUsd || 0) - (b.volume24hUsd || 0);
        if (coinSortBy === 'changeDesc') return (b.priceChange24h || 0) - (a.priceChange24h || 0);
        if (coinSortBy === 'changeAsc') return (a.priceChange24h || 0) - (b.priceChange24h || 0);
        if (coinSortBy === 'nameAsc') return a.symbol.localeCompare(b.symbol);
        return 0;
      });
  }, [availableCoins, coinExchangeFilter, coinMarketFilter, coinVolumeFilter, coinSortBy, coinSearchQuery]);

  const activeCoinInfo = useMemo(() => {
    return availableCoins.find(
      (c) => c.symbol === selectedSymbol && c.exchange === selectedExchange
    );
  }, [availableCoins, selectedSymbol, selectedExchange]);

  const handleApplyCustomDate = () => {
    if (!customDateTime) return;
    const parsed = new Date(customDateTime);
    if (!isNaN(parsed.getTime())) {
      onSelectHistoricalDate(parsed);
      setIsDatePickerOpen(false);
    }
  };

  const handleApplyPresetDaysAgo = (days: number) => {
    // Calendar-day presets begin at local midnight (not N*24h before now).
    // This also avoids shifting into the previous date around DST changes.
    onSelectHistoricalDate(getReplayPresetDate(days));
    setIsDatePickerOpen(false);
  };

  const shownCandles = totalCandles > 0 ? Math.min(totalCandles, currentIndex + 1) : 0;
  const progressPercent = totalCandles > 0 ? Math.min(100, (shownCandles / totalCandles) * 100) : 0;
  const remainingCandles = Math.max(0, totalCandles - shownCandles);

  return (
    <div className="flex flex-col gap-2.5 p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
      {/* Top Row: Coin Picker and Historical Date Controls; timeframes live above the chart. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Coin Selector */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Coin Selector Button */}
          <button
            onClick={() => setIsCoinModalOpen(true)}
            className="flex items-center gap-2.5 px-3 py-1.5 sm:py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/60 transition-all text-left group cursor-pointer shadow-inner hover:bg-slate-900/60"
            title={t('replay.static.toolbar.coinTitle')}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm sm:text-base text-white font-mono group-hover:text-cyan-400 transition-colors">
                  {selectedSymbol}
                </span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                  {selectedExchange}
                </span>
                <span className="text-[10px] uppercase font-semibold px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                  {selectedMarketType}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                <span>
                  {activeCoinInfo && activeCoinInfo.volume24hUsd
                    ? t('replay.dynamic.volumeAmount', { volume: formatLargeNumber(activeCoinInfo.volume24hUsd) })
                    : t('replay.dynamic.volumeRange')}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-400/90 font-semibold">
                  {availableCoins.length > 0 ? t('replay.dynamic.coinCount', { count: availableCoins.length }) : '$100k-$10B'}
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors ml-1" />
          </button>

        </div>

        {/* Right: Bar Replay Trigger & Date Picker */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Bar Replay Main Button */}
          <button
            onClick={() => setIsDatePickerOpen(true)}
            disabled={isLoadingHistoricalData}
            className={`group relative flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-all duration-150 cursor-pointer shadow-lg active:scale-95 select-none ${
              isReplayActive
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:via-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/25 hover:shadow-amber-500/40 ring-2 ring-amber-400/70 hover:ring-amber-300'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30 hover:border-amber-400'
            }`}
            title={t('replay.static.toolbar.replayTitle')}
          >
            <Clock className="w-4 h-4 text-slate-950 stroke-[2.5] group-hover:rotate-12 transition-transform duration-200" />
            <span className="tracking-tight">{t('replay.static.toolbar.replay')}</span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-950/20 text-slate-950 font-mono font-black border border-slate-950/20">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
              {t('replay.static.toolbar.focus')}
            </span>
          </button>

          {/* Quick Random Date Generator */}
          <button
            onClick={onRandomHistoricalDate}
            disabled={isLoadingHistoricalData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 transition-all cursor-pointer shadow-sm"
            title={t('replay.static.toolbar.randomTitle')}
          >
            <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">{t('replay.static.toolbar.random')}</span>
            <span className="sm:hidden">{t('replay.static.toolbar.randomShort')}</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: Playback Controls (Play/Pause, Step +1, Progress Bar) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-800/70 min-w-0">
        <div className="flex flex-wrap items-center gap-2 w-full min-w-0 xl:w-auto">
          {/* Play / Pause */}
          <button
            onClick={onTogglePlay}
            disabled={isLoadingHistoricalData || remainingCandles <= 0}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
              isPlaying
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-950/40'
                : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-950/40'
            }`}
            title={t(isPlaying ? 'replay.static.toolbar.pauseShortcut' : 'replay.static.toolbar.playShortcut')}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-white" />
                <span>{t('replay.static.toolbar.pause')}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-slate-950" />
                <span>{t('replay.static.toolbar.play')}</span>
              </>
            )}
          </button>

          {/* Step Forward +1 Candle */}
          <button
            onClick={onStepForward}
            disabled={isLoadingHistoricalData || isPlaying || remainingCandles <= 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-all cursor-pointer"
            title={t('replay.static.toolbar.stepTitle')}
          >
            <SkipForward className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t('replay.static.toolbar.step')}</span>
          </button>

          {/* Reset / Jump to Start */}
          <button
            onClick={onResetToCutoff}
            disabled={isLoadingHistoricalData}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors"
            title={t('replay.static.toolbar.resetTitle')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

        </div>

        {/* Live Replay Date & Progress */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {isLoadingHistoricalData ? (
            <div className="flex items-center gap-2 text-amber-400">
              <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              <span>{t('replay.static.toolbar.loading')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="text-right">
                <div className="text-[11px] text-slate-400">
                  {t('replay.static.toolbar.candle')} <b className="text-cyan-400">{shownCandles}</b> / {totalCandles}
                </div>
                <div className="text-[10px] text-slate-500">
                  {t('replay.dynamic.candlesRemaining', { count: remainingCandles })}
                </div>
              </div>

              {/* Mini progress bar */}
              <div className="w-24 sm:w-36 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700/50">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-amber-500 transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Date picker must escape the toolbar/chart stacking and clipping contexts. */}
      {isDatePickerOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-sm sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsDatePickerOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="replay-date-picker-title"
            className="flex w-full min-w-0 max-w-md max-h-[calc(100dvh-16px)] min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[calc(100dvh-32px)]"
          >
            {/* The title and close button stay visible even on short iPhone screens. */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2">
                <Calendar className="h-5 w-5 shrink-0 text-amber-400" />
                <h3 id="replay-date-picker-title" className="text-sm font-bold text-white sm:text-base">
                  {t('replay.static.toolbar.dateHeading')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDatePickerOpen(false)}
                aria-label={t('replay.static.toolbar.closeDate')}
                className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Only this area scrolls; the chart stays behind the overlay. */}
            <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              <p className="text-xs leading-relaxed text-slate-400">
                {t('replay.static.toolbar.dateHelp')}
              </p>
              <div className="flex items-center gap-1.5 rounded-xl border border-cyan-800/40 bg-cyan-950/40 p-2 font-mono text-[11px] text-cyan-300">
                <span className="h-1.5 w-1.5 shrink-0 animate-ping rounded-full bg-cyan-400" />
                <span>{t('replay.static.toolbar.autoScale')}</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  onRandomHistoricalDate();
                  setIsDatePickerOpen(false);
                }}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-950/50 transition-all hover:from-indigo-500 hover:to-purple-500"
              >
                <Shuffle className="h-4 w-4" />
                <span>{t('replay.static.toolbar.generate')}</span>
              </button>

              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t('replay.static.toolbar.quick')}
                </span>
                <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-3">
                  {[
                    { label: '1 день тому', days: 1 },
                    { label: '3 дні тому', days: 3 },
                    { label: '5 днів тому', days: 5 },
                    { label: '14 днів тому', days: 14 },
                    { label: '30 днів тому', days: 30 },
                    { label: '60 днів тому', days: 60 },
                    { label: '90 днів тому', days: 90 },
                    { label: '180 днів тому', days: 180 },
                    { label: '1 рік тому', days: 365 },
                  ].map((item) => (
                    <button
                      key={item.days}
                      type="button"
                      onClick={() => handleApplyPresetDaysAgo(item.days)}
                      className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-800/80 px-2 py-1.5 text-center font-mono text-xs font-semibold leading-snug text-slate-200 transition-colors hover:bg-slate-700"
                    >
                      {t('replay.static.toolbar.days.' + item.days)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-800 pt-2">
                <label htmlFor="replay-history-date" className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  {t('replay.static.toolbar.exact')}
                </label>
                <input
                  id="replay-history-date"
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(event) => setCustomDateTime(event.target.value)}
                  className="block w-full min-w-0 max-w-[300px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-base text-white focus:border-cyan-500 focus:outline-none sm:text-xs"
                />
              </div>
            </div>

            {/* Buttons remain reachable without scrolling below the graph. */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-800 bg-slate-900 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setIsDatePickerOpen(false)}
                className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700"
              >
                {t('replay.static.toolbar.cancel')}
              </button>
              <button
                type="button"
                onClick={handleApplyCustomDate}
                className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-md transition-colors hover:bg-amber-400"
              >
                {t('replay.static.toolbar.start')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Coin Selection Modal */}
      {isCoinModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center overflow-x-hidden bg-slate-950/85 p-2 backdrop-blur-md sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsCoinModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="replay-coin-picker-title"
            className="replay-coin-modal flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
          >
            {/* Modal Header */}
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-800 bg-slate-950/50 p-3 sm:p-4">
              <div className="flex min-w-0 items-start gap-2 sm:gap-3">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                    <h3 id="replay-coin-picker-title" className="text-sm font-extrabold text-white sm:text-base">
                      {t('replay.static.toolbar.marketCoins')}
                    </h3>
                    <span className="shrink-0 rounded-full border border-cyan-800/60 bg-cyan-950 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300">
                      {t('replay.dynamic.coinCount', { count: filteredCoins.length })}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400 sm:text-xs">
                    {t('replay.static.toolbar.marketFrom')} <b>$100k</b> {t('replay.static.toolbar.marketTo')} <b>$10B</b>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCoinModalOpen(false)}
                type="button"
                aria-label={t('replay.static.toolbar.closeCoin')}
                className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Keep filters and results in one bounded area. On short
                landscape screens they share a single vertical scroller. */}
            <div className="replay-coin-body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {/* Search & Comprehensive Filters */}
              <div className="replay-coin-filters min-h-0 min-w-0 shrink-0 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain border-b border-slate-800/80 bg-slate-950/40 p-3 sm:p-4">
              <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                {/* Search */}
                <div className="relative w-full min-w-0 flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder={t('replay.static.toolbar.search')}
                    value={coinSearchQuery}
                    onChange={(e) => setCoinSearchQuery(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 font-mono text-base text-white focus:border-cyan-500 focus:outline-none sm:py-1.5 sm:text-xs"
                  />
                  {coinSearchQuery && (
                    <button
                      onClick={() => setCoinSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Sort Dropdown */}
                <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 text-xs sm:w-auto">
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">{t('replay.static.toolbar.sort')}</span>
                  <select
                    value={coinSortBy}
                    onChange={(e: any) => setCoinSortBy(e.target.value)}
                    className="min-w-0 max-w-full flex-1 cursor-pointer rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 font-mono text-base text-slate-200 focus:border-cyan-500 focus:outline-none sm:flex-none sm:py-1.5 sm:text-xs"
                  >
                    <option value="volumeDesc">{t('replay.static.toolbar.volumeDesc')}</option>
                    <option value="volumeAsc">{t('replay.static.toolbar.volumeAsc')}</option>
                    <option value="changeDesc">{t('replay.static.toolbar.changeDesc')}</option>
                    <option value="changeAsc">{t('replay.static.toolbar.changeAsc')}</option>
                    <option value="nameAsc">{t('replay.static.toolbar.name')}</option>
                  </select>
                </div>
              </div>

              {/* Filter Tiers: Volume & Exchange & Market */}
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2.5 pt-1 text-xs">
                {/* Volume Tiers (100k to 10B) */}
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">
                    {t('replay.static.toolbar.volume')}
                  </span>
                  {[
                    { id: 'all', label: 'Всі ($100k - $10B)' },
                    { id: '100k-1m', label: '$100k - $1M' },
                    { id: '1m-10m', label: '$1M - $10M' },
                    { id: '10m-100m', label: '$10M - $100M' },
                    { id: '100m-10b', label: '$100M - $10B' },
                  ].map((tier) => (
                    <button
                      key={tier.id}
                      onClick={() => {
                        setCoinVolumeFilter(tier.id as any);
                        setDisplayCount(300);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold transition-all cursor-pointer ${
                        coinVolumeFilter === tier.id
                          ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {tier.id === 'all' ? t('replay.static.toolbar.allVolume') : tier.label}
                    </button>
                  ))}
                </div>

                {/* Exchange & Market Tabs */}
                <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                  {/* Exchange */}
                  <div className="flex max-w-full flex-wrap items-center rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-[11px]">
                    {(['all', 'binance', 'bybit'] as const).map((ex) => (
                      <button
                        key={ex}
                        onClick={() => {
                          setCoinExchangeFilter(ex);
                          setDisplayCount(300);
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                          coinExchangeFilter === ex
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {ex === 'all' ? t('replay.static.toolbar.allExchanges') : ex}
                      </button>
                    ))}
                  </div>

                  {/* Market */}
                  <div className="flex max-w-full flex-wrap items-center rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-[11px]">
                    {(['all', 'futures', 'spot'] as const).map((mkt) => (
                      <button
                        key={mkt}
                        onClick={() => {
                          setCoinMarketFilter(mkt);
                          setDisplayCount(300);
                        }}
                        className={`px-2 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                          coinMarketFilter === mkt
                            ? 'bg-cyan-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {mkt === 'all' ? t('replay.static.toolbar.allMarkets') : mkt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

              {/* The columns depend on the dialog width, not the viewport. */}
              <div className="replay-coin-list min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain p-3 sm:p-4">
                <div className="replay-coin-card-grid grid min-w-0 gap-2">
                {filteredCoins.slice(0, displayCount).map((coin) => {
                  const isSelected =
                    coin.symbol === selectedSymbol && coin.exchange === selectedExchange;
                  return (
                    <button
                      key={`${coin.exchange}-${coin.symbol}-${coin.marketType}`}
                      onClick={() => {
                        onSelectCoin(coin.symbol, coin.exchange, coin.marketType);
                        setIsCoinModalOpen(false);
                      }}
                      className={`flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-950/40 border-amber-500/70 text-white ring-1 ring-amber-500'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span data-no-translate className="min-w-0 truncate font-mono text-sm font-extrabold text-white">
                            {coin.baseAsset}
                          </span>
                          <span data-no-translate className="text-[10px] text-slate-500 font-mono">
                            /{coin.quoteAsset}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded font-bold bg-slate-900 border border-slate-800 text-slate-400">
                            {coin.exchange}
                          </span>
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded font-semibold bg-slate-900 border border-slate-800 text-slate-500">
                            {coin.marketType}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono mt-1 font-semibold">
                          ${formatCryptoPrice(coin.currentPrice || 0)}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div
                          className={`text-xs font-mono font-extrabold ${
                            coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {coin.priceChange24h >= 0 ? '+' : ''}
                          {coin.priceChange24h?.toFixed(2)}%
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-1">
                          {t('replay.dynamic.volume24h')} <b className="text-slate-200">${formatLargeNumber(coin.volume24hUsd || 0)}</b>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {filteredCoins.length === 0 && (
                <div className="text-center py-16 text-slate-500 text-xs space-y-2">
                  <Activity className="w-8 h-8 text-slate-600 mx-auto" />
                  <div>{t('replay.static.toolbar.empty')}</div>
                  <button
                    onClick={() => {
                      setCoinSearchQuery('');
                      setCoinVolumeFilter('all');
                      setCoinExchangeFilter('all');
                      setCoinMarketFilter('all');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-cyan-400 hover:bg-slate-700 text-xs font-semibold"
                  >
                    {t('replay.static.toolbar.reset')}
                  </button>
                </div>
              )}

              {/* Load More Button if filteredCoins > displayCount */}
              {filteredCoins.length > displayCount && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2 sm:gap-3">
                  <button
                    onClick={() => setDisplayCount((prev) => prev + 300)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                  >
                    {t('replay.dynamic.showMore', { count: filteredCoins.length - displayCount })}
                  </button>
                  <button
                    onClick={() => setDisplayCount(filteredCoins.length)}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/40 transition-colors cursor-pointer"
                  >
                    {t('replay.dynamic.showAll', { count: filteredCoins.length })}
                  </button>
                </div>
              )}
            </div>

            </div>
            {/* Modal Footer */}
            <div className="replay-coin-footer flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/90 p-3 text-xs text-slate-400">
              <div className="min-w-0 font-mono">
                {t('replay.dynamic.listSummary', { shown: Math.min(displayCount, filteredCoins.length), total: filteredCoins.length })}
              </div>
              <button
                onClick={() => setIsCoinModalOpen(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                {t('replay.static.toolbar.close')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
