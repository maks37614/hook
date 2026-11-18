import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../context/LanguageContext';
import { translateReplayPresetTag } from '../../locales/replayPresetTags20261115';
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Clock,
  Camera,
  Download,
  ZoomIn,
  Minimize2,
  Trash2,
  Tag,
  ExternalLink,
  X,
  Target,
  Shield,
  Layers,
  Award,
  AlertCircle,
  ChartCandlestick,
} from 'lucide-react';
import { ReplayTradeJournalItem, ReplayPendingOrder } from '../../types';
import { formatCryptoPrice, formatLargeNumber } from '../../utils/formatters';
import { loadReplayScreenshot } from '../../utils/replayScreenshots';

// Code-split historical HookChart; normal journal and screenshot open do not load it.
const ReplayTradeHistoryPreview = React.lazy(() => import('./ReplayTradeHistoryPreview'));

function ReplayScreenshotThumbnail({ imageOwner, trade }: {
  imageOwner: string | null; trade: ReplayTradeJournalItem;
}) {
  const image = trade.screenshotUrl;
  const ref = useRef<HTMLImageElement>(null);
  const [source, setSource] = useState<string | undefined>(
    image?.startsWith('data:image/') ? image : undefined,
  );
  useEffect(() => {
    if (!image?.startsWith('idb:') || !imageOwner) {
      setSource(image?.startsWith('data:image/') ? image : undefined);
      return;
    }
    let disposed = false;
    let blobUrl: string | undefined;
    // Do not display a different owner's/trade's previous thumbnail while
    // this IndexedDB request is in flight.
    setSource(undefined);
    const load = () => {
      void loadReplayScreenshot(imageOwner, trade.id).then(blob => {
        if (disposed || !blob) return;
        blobUrl = URL.createObjectURL(blob);
        setSource(blobUrl);
      }).catch(() => {
        if (!disposed) setSource(undefined);
      });
    };
    const target = ref.current;
    if (target && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      }, { rootMargin: '150px' });
      observer.observe(target);
      return () => {
        disposed = true;
        observer.disconnect();
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      };
    }
    load();
    return () => {
      disposed = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [imageOwner, image, trade.id]);
  return <img ref={ref} src={source} alt="Chart snapshot"
    loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-110" />;
}


// No extra market feed or renderer is mounted for saved trade screenshots.
const previewLabels = {
  uk: { zoom: 'Збільшити до оригінального розміру', fit: 'Вмістити зображення у вікно', photo: 'Знімок', chart: 'Історичний HookChart', missing: 'Знімок недоступний у цьому браузері. Відкрийте історичний графік.' },
  en: { zoom: 'View at original image size', fit: 'Fit image to window', photo: 'Snapshot', chart: 'Historical HookChart', missing: 'Snapshot is unavailable on this device. Open historical chart.' },
  pl: { zoom: 'Pokaż oryginalny rozmiar obrazu', fit: 'Dopasuj obraz do okna', photo: 'Zrzut', chart: 'Historyczny HookChart', missing: 'Zrzut ekranu niedostępny na tym urządzeniu. Otwórz wykres.' },
  ru: { zoom: 'Показать оригинальный размер изображения', fit: 'Вписать изображение в окно', photo: 'Снимок', chart: 'Исторический HookChart', missing: 'Снимок недоступен в этом браузере. Откройте исторический график.' },
} as const;

interface ReplayJournalProps {
  journalItems: ReplayTradeJournalItem[];
  pendingOrders: ReplayPendingOrder[];
  onCancelPendingOrder: (orderId: string) => void;
  onClearJournal: () => void;
  onDeleteJournalItem: (id: string) => void;
  imageOwner?: string | null;
}

export const ReplayJournal: React.FC<ReplayJournalProps> = ({
  journalItems,
  pendingOrders,
  onCancelPendingOrder,
  onClearJournal,
  onDeleteJournalItem,
  imageOwner = null,
}) => {
  const { language, t } = useLanguage();
  const previewLabel = previewLabels[language] || previewLabels.uk;
  const [screenshotZoomed, setScreenshotZoomed] = useState(false);
  const [previewMode, setPreviewMode] = useState<'photo' | 'chart'>('photo');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'journal' | 'stats' | 'pending'>('journal');
  const [selectedScreenshot, setSelectedScreenshot] = useState<{
    url: string;
    trade: ReplayTradeJournalItem;
  } | null>(null);

  useEffect(() => {
    if (!selectedScreenshot) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedScreenshot(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedScreenshot]);

  useEffect(() => {
    if (!selectedScreenshot) { setPreviewUrl(null); return; }
    const image = selectedScreenshot.url;
    if (image.startsWith('data:image/')) { setPreviewUrl(image); return; }
    if (!image.startsWith('idb:') || !imageOwner) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    setPreviewUrl(null);
    void loadReplayScreenshot(imageOwner, selectedScreenshot.trade.id).then(blob => {
      if (cancelled || !blob) return;
      blobUrl = URL.createObjectURL(blob);
      setPreviewUrl(blobUrl);
    }).catch(() => {
      if (!cancelled) setPreviewUrl(null);
    });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [selectedScreenshot, imageOwner]);

  // Do not keep deleted screenshot bytes alive in a portal or object URL.
  useEffect(() => {
    if (selectedScreenshot && !journalItems.some(trade => trade.id === selectedScreenshot.trade.id))
      setSelectedScreenshot(null);
  }, [journalItems, selectedScreenshot]);

  // Statistics calculation
  const stats = useMemo(() => {
    if (journalItems.length === 0) {
      return {
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        totalNetPnl: 0,
        totalProfit: 0,
        totalLoss: 0,
        profitFactor: 0,
        avgTrade: 0,
        bestTrade: 0,
        worstTrade: 0,
        longCount: 0,
        shortCount: 0,
      };
    }

    let winCount = 0;
    let lossCount = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let bestTrade = -Infinity;
    let worstTrade = Infinity;
    let longCount = 0;
    let shortCount = 0;

    for (const item of journalItems) {
      if (item.side === 'long') longCount++;
      else shortCount++;

      if (item.pnlUsd > 0) {
        winCount++;
        totalProfit += item.pnlUsd;
      } else if (item.pnlUsd < 0) {
        lossCount++;
        totalLoss += Math.abs(item.pnlUsd);
      }

      if (item.pnlUsd > bestTrade) bestTrade = item.pnlUsd;
      if (item.pnlUsd < worstTrade) worstTrade = item.pnlUsd;
    }

    const totalTrades = journalItems.length;
    const totalNetPnl = totalProfit - totalLoss;
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99 : 0;
    const avgTrade = totalTrades > 0 ? totalNetPnl / totalTrades : 0;

    return {
      totalTrades,
      winCount,
      lossCount,
      winRate,
      totalNetPnl,
      totalProfit,
      totalLoss,
      profitFactor,
      avgTrade,
      bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
      worstTrade: worstTrade === Infinity ? 0 : worstTrade,
      longCount,
      shortCount,
    };
  }, [journalItems]);

  // Export to CSV
  const handleExportCsv = () => {
    if (journalItems.length === 0) return;
    const headers = [
      'ID',
      'Symbol',
      'Exchange',
      'Timeframe',
      'Side',
      'Entry Time (UTC)',
      'Exit Time (UTC)',
      'Entry Price',
      'Exit Price',
      'Size USD',
      'Leverage',
      'SL Price',
      'TP Price',
      'Net PnL USD',
      'PnL %',
      'Reason / Tag',
      'Exit Reason',
    ];

    const rows = journalItems.map((j) => [
      j.id,
      j.symbol,
      j.exchange,
      j.timeframe,
      j.side.toUpperCase(),
      new Date(j.entryTime * 1000).toISOString(),
      new Date(j.exitTime * 1000).toISOString(),
      j.entryPrice,
      j.exitPrice,
      j.sizeUsd,
      `${j.leverage}x`,
      j.slPrice || '',
      j.tpPrice || '',
      j.pnlUsd.toFixed(2),
      `${j.pnlPct.toFixed(2)}%`,
      `"${(j.tag || '').replace(/"/g, '""')}"`,
      j.exitReason,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `replay_journal_${Date.now()}.csv`;
    link.click();
  };

  const formatHistoricalTime = (timestampSec: number) => {
    return new Date(timestampSec * 1000).toLocaleString('uk-UA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  };

  return (
    <div className="flex flex-col rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
      {/* Header Tabs & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('journal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'journal'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t('replay.static.journal.title')}</span>
            {journalItems.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-950 text-amber-200 font-mono">
                {journalItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{t('replay.static.journal.stats')}</span>
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{t('replay.static.journal.pending')}</span>
            {pendingOrders.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-mono">
                {pendingOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Global Journal Actions */}
        <div className="flex items-center gap-2">
          {journalItems.length > 0 && (
            <>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                title={t('replay.static.journal.exportTitle')}
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">{t('replay.static.journal.export')}</span>
              </button>

              <button
                onClick={() => {
                  if (window.confirm(t('replay.dynamic.clearJournalConfirm'))) {
                    onClearJournal();
                  }
                }}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                title={t('replay.static.journal.clear')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="p-3.5 sm:p-4">
        {/* Tab 1: Trade Journal Table */}
        {activeTab === 'journal' && (
          <div>
            {journalItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-center space-y-2">
                <BookOpen className="w-10 h-10 text-slate-600 stroke-1" />
                <div className="text-sm font-semibold text-slate-400">
                  {t('replay.static.journal.empty')}
                </div>
                <p className="text-xs max-w-sm text-slate-500">
                  {t('replay.static.journal.emptyHelp')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">{t('replay.static.journal.coin')}</th>
                      <th className="py-2.5 px-3">{t('replay.static.journal.time')}</th>
                      <th className="py-2.5 px-3">{t('replay.static.journal.price')}</th>
                      <th className="py-2.5 px-3">{t('replay.static.journal.size')}</th>
                      <th className="py-2.5 px-3">Stop / TP</th>
                      <th className="py-2.5 px-3">P&L ($ / %)</th>
                      <th className="py-2.5 px-3">{t('replay.static.journal.reason')}</th>
                      <th className="py-2.5 px-3">{t('replay.static.journal.screenshot')}</th>
                      <th className="py-2.5 px-2 text-right">{t('replay.static.journal.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {journalItems.map((trade) => {
                      const isProfit = trade.pnlUsd >= 0;
                      return (
                        <tr
                          key={trade.id}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          {/* Symbol & Direction */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  trade.side === 'long'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                }`}
                              >
                                {trade.side.toUpperCase()}
                              </span>
                              <span data-no-translate className="font-extrabold text-white">
                                {trade.symbol}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {trade.timeframe}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {trade.exitReason === 'tp' ? (
                                <span className="text-emerald-400 font-bold">{t('replay.static.journal.tp')}</span>
                              ) : trade.exitReason === 'sl' ? (
                                <span className="text-rose-400 font-bold">{t('replay.static.journal.sl')}</span>
                              ) : trade.exitReason === 'liquidation' ? (
                                <span className="text-purple-400 font-bold">{t('replay.static.journal.liq')}</span>
                              ) : (
                                <span className="text-sky-400">{t('replay.static.journal.manual')}</span>
                              )}
                            </div>
                          </td>

                          {/* Times */}
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                            <div className="text-[11px]">
                              {t('replay.static.journal.entry')} {formatHistoricalTime(trade.entryTime)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {t('replay.static.journal.exit')} {formatHistoricalTime(trade.exitTime)}
                            </div>
                          </td>

                          {/* Prices */}
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                            <div>${formatCryptoPrice(trade.entryPrice)}</div>
                            <div className="text-[10px] text-slate-400">
                              → ${formatCryptoPrice(trade.exitPrice)}
                            </div>
                          </td>

                          {/* Size & Leverage */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="text-white font-semibold">
                              ${formatLargeNumber(trade.sizeUsd)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {trade.leverage}x ({t('replay.dynamic.marginAmount', { amount: trade.marginUsd.toFixed(1) })})
                            </div>
                          </td>

                          {/* SL / TP */}
                          <td className="py-3 px-3 text-[11px] whitespace-nowrap">
                            <div className="text-rose-400">
                              SL: {trade.slPrice ? `$${formatCryptoPrice(trade.slPrice)}` : '—'}
                            </div>
                            <div className="text-emerald-400">
                              TP: {trade.tpPrice ? `$${formatCryptoPrice(trade.tpPrice)}` : '—'}
                            </div>
                          </td>

                          {/* P&L */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div
                              className={`font-extrabold text-sm ${
                                isProfit ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isProfit ? '+' : ''}
                              ${trade.pnlUsd.toFixed(2)}
                            </div>
                            <div
                              className={`text-[10px] ${
                                isProfit ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              ({isProfit ? '+' : ''}
                              {trade.pnlPct.toFixed(2)}%)
                            </div>
                          </td>

                          {/* Tag & Notes */}
                          <td className="py-3 px-3">
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-200 border border-slate-700 whitespace-nowrap">
                              <Tag className="w-2.5 h-2.5 text-cyan-400" />
                              <span>{trade.tag ? translateReplayPresetTag(language, trade.tag) : t('replay.static.journal.noTag')}</span>
                            </div>
                            {trade.notes && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5" title={trade.notes}>
                                {trade.notes}
                              </div>
                            )}
                          </td>

                          {/* PNG remains in per-user IndexedDB; the historical
                              chart mounts only after an explicit second click. */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              {trade.screenshotUrl && (
                                <button type="button"
                                  onClick={() => {
                                    setScreenshotZoomed(false);
                                    setPreviewMode('photo');
                                    setSelectedScreenshot({ url: trade.screenshotUrl!, trade });
                                  }}
                                  className="group relative h-8 w-12 shrink-0 overflow-hidden rounded border border-slate-700 bg-slate-950 hover:border-cyan-400"
                                  title={t('replay.static.journal.preview')}>
                                  <ReplayScreenshotThumbnail imageOwner={imageOwner} trade={trade} />
                                  <span className="absolute inset-0 flex items-center justify-center bg-slate-950/40 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Camera className="h-3.5 w-3.5 text-white" />
                                  </span>
                                </button>
                              )}
                              <button type="button"
                                title={previewLabel.chart} aria-label={previewLabel.chart + ': ' + trade.symbol}
                                onClick={() => {
                                  setScreenshotZoomed(false);
                                  setPreviewMode('chart');
                                  setSelectedScreenshot({ url: trade.screenshotUrl || '', trade });
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded border border-slate-700 bg-slate-950 text-cyan-400 hover:bg-slate-800">
                                <ChartCandlestick className="h-4 w-4" />
                              </button>
                            </div>
                          </td>

                          {/* Delete Item */}
                          <td className="py-3 px-2 text-right">
                            <button
                              onClick={() => onDeleteJournalItem(trade.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                              title={t('replay.static.journal.delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Performance Statistics */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Total Trades */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  {t('replay.static.journal.total')}
                </div>
                <div className="text-xl font-extrabold text-white font-mono mt-1">
                  {stats.totalTrades}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Long: {stats.longCount} | Short: {stats.shortCount}
                </div>
              </div>

              {/* Win Rate */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  Win Rate
                </div>
                <div
                  className={`text-xl font-extrabold font-mono mt-1 ${
                    stats.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {stats.winRate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {t('replay.dynamic.winLoss', { wins: stats.winCount, losses: stats.lossCount })}
                </div>
              </div>

              {/* Net PnL */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  {t('replay.static.journal.net')}
                </div>
                <div
                  className={`text-xl font-extrabold font-mono mt-1 ${
                    stats.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {stats.totalNetPnl >= 0 ? '+' : ''}${stats.totalNetPnl.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {t('replay.dynamic.profitLoss', { profit: stats.totalProfit.toFixed(0), loss: stats.totalLoss.toFixed(0) })}
                </div>
              </div>

              {/* Profit Factor */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  Profit Factor
                </div>
                <div className="text-xl font-extrabold text-cyan-400 font-mono mt-1">
                  {stats.profitFactor.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {t('replay.static.journal.factor')}
                </div>
              </div>

              {/* Best Trade */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  {t('replay.static.journal.best')}
                </div>
                <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                  +${stats.bestTrade.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {t('replay.static.journal.maxProfit')}
                </div>
              </div>

              {/* Worst Trade */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  {t('replay.static.journal.worst')}
                </div>
                <div className="text-xl font-extrabold text-rose-400 font-mono mt-1">
                  ${stats.worstTrade.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {t('replay.static.journal.maxLoss')}
                </div>
              </div>
            </div>

            {/* Recommendations / Performance notes */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <Award className="w-4 h-4 text-amber-400" />
                <span>{t('replay.static.journal.analysis')}</span>
              </div>
              <p>
                {stats.totalTrades < 5
                  ? t('replay.static.journal.needTrades')
                  : stats.winRate >= 50 && stats.profitFactor > 1.5
                  ? t('replay.static.journal.positive')
                  : t('replay.static.journal.risk')}
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Pending Orders */}
        {activeTab === 'pending' && (
          <div>
            {pendingOrders.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                {t('replay.static.journal.noPending')}
              </div>
            ) : (
              <div className="space-y-2">
                {pendingOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          order.side === 'buy'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {order.side.toUpperCase()} {order.orderType.toUpperCase()}
                      </span>
                      <span data-no-translate className="font-bold text-white">{order.symbol}</span>
                      <span className="text-amber-400">
                        {t('replay.dynamic.orderPrice', { price: formatCryptoPrice(order.price) })}
                      </span>
                      <span className="text-slate-400">
                        {t('replay.dynamic.orderSize', { size: formatLargeNumber(order.sizeUsd), leverage: order.leverage })}
                      </span>
                    </div>

                    <button
                      onClick={() => onCancelPendingOrder(order.id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 text-xs font-semibold transition-colors"
                    >
                      {t('replay.static.toolbar.cancel')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Portaled to body so the journal card's overflow/backdrop-filter cannot
          clip or shrink the fullscreen screenshot. No extra chart is mounted. */}
      {selectedScreenshot && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/90 p-1.5 sm:p-3"
          data-replay-screenshot-overlay>
          <section role="dialog" aria-modal="true" aria-label={t('replay.static.journal.screenshotHeading')}
            className="flex h-[96dvh] max-h-[1100px] w-[98vw] max-w-[1900px] min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-xl">
            {/* Header stays outside the scrollable image viewport. */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 sm:px-4 sm:py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Camera className="h-4 w-4 shrink-0 text-cyan-400" />
                <h3 className="min-w-0 text-xs font-bold text-white sm:text-sm">
                  {t('replay.static.journal.screenshotHeading')}
                </h3>
                <span data-no-translate className="truncate rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300">
                  {selectedScreenshot.trade.symbol} • {selectedScreenshot.trade.timeframe}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <div className="flex items-center gap-0.5 rounded-md border border-slate-700 bg-slate-950 p-0.5">
                  <button type="button" onClick={() => setPreviewMode('photo')}
                    disabled={!selectedScreenshot.url}
                    aria-pressed={previewMode === 'photo'}
                    className={`rounded px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40 ${previewMode === 'photo' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                    {previewLabel.photo}
                  </button>
                  <button type="button" onClick={() => setPreviewMode('chart')}
                    aria-pressed={previewMode === 'chart'}
                    className={`rounded px-2 py-1.5 text-[11px] font-semibold ${previewMode === 'chart' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                    HookChart
                  </button>
                </div>
                {previewMode === 'photo' && <button type="button"
                  onClick={() => setScreenshotZoomed(value => !value)}
                  aria-pressed={screenshotZoomed}
                  aria-label={screenshotZoomed ? previewLabel.fit : previewLabel.zoom}
                  title={screenshotZoomed ? previewLabel.fit : previewLabel.zoom}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2 text-[11px] font-semibold text-cyan-200 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                  {screenshotZoomed ? <Minimize2 className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
                  {screenshotZoomed ? previewLabel.fit : '1:1'}
                </button>}
                <button type="button" onClick={() => setSelectedScreenshot(null)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label={t('replay.static.toolbar.close')}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {previewMode === 'photo' ? (
              <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-[#090d16] p-1.5 sm:p-2"
                data-replay-screenshot-viewport>
                {previewUrl ? (
                  <div className={screenshotZoomed
                    ? 'flex min-h-full min-w-full w-max items-center justify-center'
                    : 'flex h-full w-full items-center justify-center'}>
                    <img src={previewUrl} alt="Trade Chart Screenshot" draggable={false}
                      className={screenshotZoomed
                        ? 'block h-auto w-auto max-w-none shrink-0 rounded border border-slate-800'
                        : 'block h-auto w-auto max-h-full max-w-full shrink-0 rounded border border-slate-800 object-contain'} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                    {previewLabel.missing}
                  </div>
                )}
              </div>
            ) : (
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[#090d16]">
                <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-slate-400">HookChart…</div>}>
                  <ReplayTradeHistoryPreview trade={selectedScreenshot.trade} />
                </Suspense>
              </div>
            )}

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950 px-3 py-2 text-xs sm:px-4 sm:py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3 font-mono">
                <span className="text-slate-400">
                  P&L:{' '}
                  <b className={selectedScreenshot.trade.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {selectedScreenshot.trade.pnlUsd >= 0 ? '+' : ''}$
                    {selectedScreenshot.trade.pnlUsd.toFixed(2)}
                  </b>
                </span>
                <span className="min-w-0 truncate text-slate-400">
                  {t('replay.static.journal.tag')}{' '}
                  <b className="text-cyan-300">{translateReplayPresetTag(language, selectedScreenshot.trade.tag)}</b>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {previewUrl && <a href={previewUrl}
                  download={`trade_${selectedScreenshot.trade.symbol}_${selectedScreenshot.trade.id}.png`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-2.5 py-1.5 font-bold text-slate-950 transition-colors hover:bg-cyan-400">
                  <Download className="h-3.5 w-3.5" />
                  <span>{t('replay.static.journal.download')}</span>
                </a>}
                <button type="button" onClick={() => setSelectedScreenshot(null)}
                  className="rounded-md bg-slate-800 px-2.5 py-1.5 font-semibold text-slate-300 hover:bg-slate-700">
                  {t('replay.static.toolbar.close')}
                </button>
              </div>
            </div>
          </section>
        </div>, document.body
      )}
    </div>
  );
};
