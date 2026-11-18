import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Maximize2, RefreshCw, Send, Zap } from 'lucide-react';
import type { Kline, ScannedCoin, Timeframe } from '../types';
import type { EarlyFormationCandidate } from '../utils/earlyFormations';
import { earlyFormationChartMarkers } from '../utils/earlyFormations';
import { fetchDirectKlines } from '../utils/directExchangeClient';
import { formatCryptoPrice } from '../utils/formatters';
import { CopyableCoinSymbol } from './CopyableCoinSymbol';
import { FullscreenChartModal } from './FullscreenChartModal';
import { TradingViewChart } from './TradingViewChart';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';
import { localizeFormationGuideBias } from '../locales/formationGuideTranslations';

interface Props {
  coin: ScannedCoin;
  candidate: EarlyFormationCandidate;
  onClose: () => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenTelegramModal?: (prefill?: unknown) => void;
  allCoins?: ScannedCoin[];
  watchlist?: string[];
  onToggleWatchlist?: (symbol: string) => void;
}

const money = (n: number) => '$' + formatCryptoPrice(n);

/** The same analysis-page layout as FormationDetailsModal, but with no validated trading actions. */
export function EarlyFormationDetailsModal({
  coin, candidate, onClose, onSendMetaScalp, metaScalpBinding = '001',
  onOpenTelegramModal, allCoins = [], watchlist = [], onToggleWatchlist,
}: Props) {
  const { language } = useLanguage();
  const tr = (text: string) => translatePhrase(language, text);
  const [timeframe, setTimeframe] = useState<Timeframe>(coin.timeframe || '1h');
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loadingKlines, setLoadingKlines] = useState(true);
  const [livePrice, setLivePrice] = useState(coin.currentPrice);
  const [isFullscreenChartOpen, setIsFullscreenChartOpen] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const isPositive = coin.priceChange24h >= 0;
  const markers = useMemo(() => earlyFormationChartMarkers(candidate).map(marker => ({
    ...marker, label: translatePhrase(language, marker.label),
  })), [candidate, language]);
  const entryZone = money(candidate.earlyEntryMin) + ' – ' + money(candidate.earlyEntryMax);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  useEffect(() => {
    if (isFullscreenChartOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreenChartOpen, onClose]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setKlines([]);
    setLoadingKlines(true);
    const load = async () => {
      try {
        const query = new URLSearchParams({
          exchange: coin.exchange, market: coin.marketType,
          symbol: coin.symbol, timeframe, limit: '1000',
        });
        const response = await fetch('/api/klines?' + query.toString(), { signal: controller.signal });
        if (response.ok) {
          const body = await response.json();
          if (body.success && Array.isArray(body.data) && body.data.length > 1) {
            if (!cancelled) setKlines(body.data);
            return;
          }
        }
      } catch { /* Fall back to direct exchange history. */ }
      try {
        const direct = await fetchDirectKlines(coin.exchange, coin.marketType, coin.symbol, timeframe, 1000);
        if (!cancelled) setKlines(direct);
      } catch { /* Keep the empty chart while history is unavailable. */ }
    };
    void load().finally(() => { if (!cancelled) setLoadingKlines(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [coin.exchange, coin.marketType, coin.symbol, timeframe]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto no-scrollbar" role="dialog" aria-modal="true" aria-label={tr("Можлива формація")}>
      <div className="relative w-full max-w-6xl 2xl:max-w-7xl bg-slate-900 border-0 sm:border border-slate-800 rounded-none sm:rounded-3xl shadow-2xl overflow-hidden my-auto h-[100dvh] sm:h-auto sm:max-h-[95vh] flex flex-col">
        {/* Compact early-chart header: share the same responsive layout as confirmed formations. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 border-b border-slate-800 bg-slate-950/80 px-3 py-2.5 shrink-0 sm:flex sm:justify-between sm:gap-3 sm:px-6 sm:py-4">
          <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-wrap sm:items-center sm:gap-2">
            <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-2">
              <div role="status" aria-label={tr(liveConnected ? 'Котирування підключено' : 'Очікування котирування')}
                className={`flex shrink-0 items-center justify-center rounded-full border px-1.5 py-1 ${
                  liveConnected ? 'bg-emerald-950/70 border-emerald-700/60' : 'bg-slate-800/80 border-slate-700'
                }`}>
                <span className={`h-2 w-2 rounded-full ${liveConnected ? 'bg-emerald-500' : 'bg-slate-500'}`} />
              </div>
              <h2 className="shrink-0 whitespace-nowrap text-base font-extrabold tracking-wide text-white font-mono sm:text-xl">
                <CopyableCoinSymbol baseAsset={coin.baseAsset} quoteAsset={coin.quoteAsset} />
              </h2>
              <div className="inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap" aria-label={tr("Поточна ціна та зміна за 24 години")}>
                <span className="font-mono text-[11px] font-bold text-white sm:text-sm">{money(livePrice)}</span>
                <span className={`text-[10px] font-semibold sm:text-xs ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({isPositive ? '+' : ''}{coin.priceChange24h.toFixed(2)}%)
                </span>
              </div>
              <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">{coin.exchange}</span>
            </div>
            <div className="col-start-1 row-start-2 min-w-0 max-w-full">
                <span className={`inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] sm:text-[11px] font-semibold ${
                  candidate.bias === 'bullish'
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                }`} title={tr("Попередня структура; підтвердження ще немає")}>
                  <span className="truncate">{tr('Можлива формація:')} {tr(candidate.name)} · {localizeFormationGuideBias(language, candidate.bias) + '?'}</span>
                </span>
            </div>
          </div>
          <div className="col-start-2 row-start-2 flex shrink-0 items-center justify-self-end gap-1.5 sm:gap-2">
            {onOpenTelegramModal && (
              <button type="button"
                onClick={() => onOpenTelegramModal({
                  symbol: coin.symbol, exchange: coin.exchange,
                  marketType: coin.marketType, currentPrice: livePrice,
                })}
                className="p-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40"
                title={tr("Власне цінове сповіщення Telegram (не сигнал ранньої формації)")}
                aria-label={tr("Налаштувати власне сповіщення ціни")}>
                <Send className="w-4 h-4" />
              </button>
            )}
            {onSendMetaScalp && (
              <button type="button" onClick={() => onSendMetaScalp(coin)}
                className="flex items-center gap-1.5 p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40"
                title={tr("Лінковка ·") + ' ' + metaScalpBinding} aria-label={tr("Відкрити MetaScalp")}>
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline font-mono text-[10px]">{metaScalpBinding}</span>
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold"
              title={tr("Повернутися до формацій")} aria-label={tr("Назад")}>
              <ArrowLeft className="w-4 h-4" />
              <span className="sm:hidden">{tr('Назад')}</span>
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6 overflow-y-auto no-scrollbar space-y-4 sm:space-y-6">
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] sm:text-xs text-amber-100">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <div>
              <strong>{tr('Можлива формація ·')} {tr(candidate.stage === 'forming' ? 'Формується' : 'Потенційна')}</strong>
              <span className="ml-1">{tr('Сценарій без підтвердження другого екстремуму та пробою. Рівні прогнозні, не торгові ордери.')}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            {[
              ['Ранній вхід · зона', entryZone, 'text-sky-300'],
              ['Вхід після пробою', money(candidate.breakoutEntry), 'text-violet-300'],
              ['TP · проєкція', money(candidate.target), 'text-emerald-300'],
              ['SL раннього входу', money(candidate.stopLoss), 'text-rose-300'],
              ['SL після пробою', money(candidate.breakoutStopLoss), 'text-orange-300'],
              ['Лінія шиї', money(candidate.neckline), 'text-amber-300'],
            ].map(([title, value, color]) => (
              <div key={title} className="min-w-0 rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
                <div className="text-[10px] text-slate-400">{tr(title)}</div>
                <div className={`font-mono text-xs font-bold mt-1 break-words ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-300">
            <span>{tr('R:R ранній ≈')} <strong className="text-cyan-300">1:{candidate.earlyRiskReward}</strong> {tr('· після пробою ≈')} <strong className="text-cyan-300">1:{candidate.breakoutRiskReward}</strong></span>
            <span className="text-slate-500">{tr('Таймфрейм сценарію:')} {coin.timeframe}</span>
          </div>

          <div className="space-y-3">
            {loadingKlines && klines.length === 0 ? (
              <div className="w-full h-[390px] rounded-xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                <span className="text-xs">{tr("Завантаження свічок з біржі…")}</span>
              </div>
            ) : (
              <TradingViewChart
                visualContext="formationsQuick"
                key={[coin.exchange, coin.marketType, coin.symbol, timeframe].join(':')}
                forceHookChart
                klines={klines}
                formation={null}
                customMarkers={markers}
                previewMarkers
                symbol={coin.symbol}
                timeframe={timeframe}
                exchange={coin.exchange}
                marketType={coin.marketType}
                historyLimit={1000}
                onTimeframeChange={setTimeframe}
                onLivePriceUpdate={setLivePrice}
                onLiveStatusChange={(status) => setLiveConnected(status.isConnected)}
                onOpenFullscreen={() => setIsFullscreenChartOpen(true)}
                hideHeaderLiveIndicator
                hideHeaderFormationBadge
                hideSymbolAndPrice
              />
            )}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setIsFullscreenChartOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-600/20 hover:bg-cyan-600/30 px-3 py-2 text-xs font-semibold text-cyan-200">
                <Maximize2 className="w-4 h-4" /> {tr("Графік на весь екран")}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[11px] text-slate-300">
            <strong className="text-amber-200">{tr('Можлива формація:')} {tr(candidate.name)}</strong>
            <p className="mt-1">{tr(candidate.explanation)}</p>
            <p className="mt-1 text-slate-400">{tr('Ранній вхід розглядається лише за наявності відскоку або відбою. Підтвердження оцінює основний сканер.')}</p>
          </div>
        </div>
      </div>

      {isFullscreenChartOpen && (
        <FullscreenChartModal
          isOpen
          onClose={() => setIsFullscreenChartOpen(false)}
          coin={coin}
          formation={null}
          earlyCandidate={candidate}
          klines={klines}
          currentTimeframe={coin.timeframe}
          livePrice={livePrice}
          customMarkers={markers}
          allCoins={allCoins}
          watchlist={watchlist}
          onToggleWatchlist={onToggleWatchlist}
          onOpenTelegramModal={onOpenTelegramModal}
          onSendMetaScalp={onSendMetaScalp}
          metaScalpBinding={metaScalpBinding}
        />
      )}
    </div>
  );
}
