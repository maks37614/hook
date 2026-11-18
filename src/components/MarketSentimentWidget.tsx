import React, { useState, useEffect, useRef } from 'react';
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  BarChart2,
  PieChart,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';
import { MarketSentimentData, MarketCoin } from '../types';
import { formatVolume, formatPercent } from '../utils/formatters';
import { MarketSentimentScale } from './MarketSentimentScale';
import { MarketDataFreshnessIcon } from './MarketDataFreshnessIcon';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';
import { localizeBybitDerivativesLabel, localizeSentimentSummary, localizeSentimentVolatility, localizeTakerDeltaLabel } from '../utils/marketSentimentLocalization';
import { getMarketSentimentExpanded } from '../utils/marketSentimentPreferences';
import { createMarketSentimentSocket } from '../utils/marketSentimentSocket';

interface MarketSentimentWidgetProps {
  coins?: MarketCoin[];
}

export const MarketSentimentWidget: React.FC<MarketSentimentWidgetProps> = ({ coins }) => {
  const { language, t } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  const [data, setData] = useState<MarketSentimentData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { user, profile, updateProfileData } = useAuth();
  const accountUid = user?.uid ?? null;
  const accountScope = accountUid ?? 'guest';
  // Optimistic UI while the account settings are saved; newer clicks win.
  const [localExpansion, setLocalExpansion] = useState<{
    accountScope: string;
    value: boolean;
    revision: number;
  } | null>(null);
  const [preferenceError, setPreferenceError] = useState<{ accountScope: string; message: string } | null>(null);
  const preferenceRevision = useRef(0);
  const expanded = localExpansion?.accountScope === accountScope
    ? localExpansion.value
    : getMarketSentimentExpanded(accountUid, profile);

  const toggleExpanded = () => {
    const next = !expanded;
    const revision = ++preferenceRevision.current;
    const scope = accountScope;
    setLocalExpansion({ accountScope: scope, value: next, revision });
    setPreferenceError(null);

    // Guests can open/close this session, but their choice is not saved to an
    // unrelated signed-in profile. Signed-in users persist across devices.
    if (!accountUid) return;

    void updateProfileData({ marketSentimentExpanded: next }).then(() => {
      setLocalExpansion(current =>
        current?.accountScope === scope && current.revision === revision ? null : current,
      );
    }).catch(() => {
      setLocalExpansion(current =>
        current?.accountScope === scope && current.revision === revision ? null : current,
      );
      setPreferenceError({
        accountScope: scope,
        message: 'Не вдалося зберегти стан блока у вашому профілі.',
      });
    });
  };

  const sentimentRequestBusy = useRef(false);
  const lastSentimentRequestAt = useRef(0);
  const lastStreamSnapshotAt = useRef(0);
  const streamHealthyRef = useRef(false);
  const streamGraceUntil = useRef(Date.now() + 3_000);
  const fetchSentiment = async () => {
    // Manual refresh still works exactly as before. When WS is down this is
    // the bounded 30s REST fallback, not an additional concurrent feed.
    if (sentimentRequestBusy.current) return;
    sentimentRequestBusy.current = true;
    const requestStartedAt = Date.now();
    lastSentimentRequestAt.current = requestStartedAt;
    setLoading(true);
    try {
      const res = await fetch('/api/market/sentiment');
      const json = await res.json();
      if (!res.ok || json.success !== true || !json.data ||
          !Number.isFinite(json.data.compositeScore) ||
          json.data.compositeScore < 0 || json.data.compositeScore > 100) {
        throw new Error('Ринкові дані тимчасово недоступні');
      }
      // A slow REST fallback may complete after a newer validated WS result.
      if (lastStreamSnapshotAt.current <= requestStartedAt) {
        setData(json.data);
        setError(null);
      }
    } catch (err) {
      if (!streamHealthyRef.current)
        setError('Не вдалося оновити індекс. Перевірте з’єднання або стан бірж.');
    } finally {
      sentimentRequestBusy.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    // The payload is the same MarketSentimentData produced by the existing
    // REST endpoint; no client-side recalculation or new exchange sockets.
    const socket = createMarketSentimentSocket(
      packet => {
        lastStreamSnapshotAt.current = Date.now();
        streamHealthyRef.current = true;
        setData(packet.data);
        setError(null);
        setLoading(false);
      },
      healthy => { streamHealthyRef.current = healthy; },
      () => {
        // A failed server calculation is visible even if older verified data
        // remain on screen, exactly as with the previous REST-only refresh.
        setError('Не вдалося оновити індекс. Перевірте з’єднання або стан бірж.');
        setLoading(false);
      },
    );
    socket.start();
    const refreshVisible = () => {
      if (document.visibilityState === 'hidden' || sentimentRequestBusy.current) return;
      // No periodic REST requests while a healthy WebSocket delivers updates.
      if (streamHealthyRef.current && Date.now() - lastStreamSnapshotAt.current < 65_000) return;
      if (Date.now() < streamGraceUntil.current) return;
      if (Date.now() - lastSentimentRequestAt.current < 30_000) return;
      void fetchSentiment();
    };
    const initialFallback = setTimeout(refreshVisible, 3_250);
    const interval = setInterval(refreshVisible, 30000);
    let resumedFallback: ReturnType<typeof setTimeout> | null = null;
    const resetGraceOnResume = () => {
      if (document.visibilityState === 'hidden') return;
      streamGraceUntil.current = Date.now() + 3_000;
      if (resumedFallback !== null) clearTimeout(resumedFallback);
      resumedFallback = setTimeout(refreshVisible, 3_250);
    };
    document.addEventListener('visibilitychange', resetGraceOnResume);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      socket.stop();
      clearTimeout(initialFallback);
      if (resumedFallback !== null) clearTimeout(resumedFallback);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', resetGraceOnResume);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, []);

  if (!data) {
    return (
      <div className="w-full min-w-0 rounded-2xl border border-slate-800/90 bg-slate-900/90 p-4 text-sm text-slate-300" role="status">
        <div className="flex items-center justify-between gap-3">
          <span>{t('sentiment.title')}: {loading ? t('sentiment.loading') : t('sentiment.noData')}</span>
          <button type="button" onClick={fetchSentiment} disabled={loading}
            className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-cyan-300 disabled:opacity-50">
            {tr('Оновити')}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-amber-300">{t('sentiment.fetchError')}</p>}
      </div>
    );
  }

  const sentimentPartial = !!data.dataQuality && data.dataQuality.totalSources > 0
    && data.dataQuality.freshSources < data.dataQuality.totalSources;

  return (
    <div className="w-full min-w-0 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/85 to-indigo-950/40 border border-slate-800/90 shadow-lg backdrop-blur-md overflow-hidden">
      {/* Symmetric side columns keep the whole meter exactly at page center.
          Below md there is not enough room for all three, so the meter uses
          a full-width centered second row instead of overlapping controls. */}
      <div data-market-sentiment-header className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-b border-slate-800/70 px-3 pt-3 sm:px-4 md:grid-cols-[minmax(200px,1fr)_minmax(0,900px)_minmax(200px,1fr)] md:py-2">
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 text-indigo-400 shadow-inner">
            <Gauge className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-white sm:text-sm">
              {t('sentiment.title')}
            </h3>
            <p className="sr-only">
              {t('sentiment.description')}
            </p>
          </div>
        </div>

        {/* At desktop widths this is the center grid column between heading
            and buttons; on narrow screens it sits below them without overlap.
            From lg (1024px), shift the entire meter 12px right where side rails
            leave room. The value pointer and localized labels move together. */}
        <div data-market-sentiment-center className="col-span-2 row-start-2 min-w-0 w-full md:col-span-1 md:col-start-2 md:row-start-1 lg:translate-x-3">
          <MarketSentimentScale score={data.compositeScore} sentimentLabel={t(`sentiment.state.${data.sentimentState}`)} language={language} />
        </div>

        <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-self-end gap-1.5 md:col-start-3">
          {(error || sentimentPartial) && (
            <MarketDataFreshnessIcon
              label={error ? t('sentiment.refreshFail') :
                t('sentiment.staleSources', {
                  fresh: data.dataQuality?.freshSources,
                  total: data.dataQuality?.totalSources,
                })}
              kind={error ? 'refresh-failed' : 'partial'} />
          )}
          <button
            onClick={fetchSentiment}
            disabled={loading}
            className="cursor-pointer rounded-lg border border-slate-700/60 bg-slate-800/80 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title={tr('Оновити дані')}
            aria-label={tr('Оновити дані')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={toggleExpanded}
            className="cursor-pointer rounded-lg border border-slate-700/60 bg-slate-800/80 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title={tr(expanded ? 'Згорнути' : 'Розгорнути')}
            aria-label={tr(expanded ? 'Згорнути' : 'Розгорнути')}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {preferenceError?.accountScope === accountScope && (
        <p role="alert" className="px-3 py-2 text-xs text-amber-300 sm:px-4">
          {t('sentiment.preferenceError')}
        </p>
      )}

      {/* Main Content Body */}
      {expanded && (
        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Summary Banner */}
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/50 p-2.5 sm:p-3 rounded-xl border border-slate-800/60">
            {localizeSentimentSummary(data, language)}
          </p>

          {/* 6 Sub-Indicators Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 text-xs font-mono">
            {/* 1. Динаміка ціни та тренду */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">{t('sentiment.trend')}</span>
                {data.priceTrendDynamics.trendBias === 'bullish' ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-white block">
                  {data.priceTrendDynamics.advancingPct}%
                </span>
                <span className="text-[10px] text-slate-400 font-sans block">
                  {t('sentiment.trendCounts', { up: data.priceTrendDynamics.advancingCount, down: data.priceTrendDynamics.decliningCount })}
                </span>
                <span className="block text-[10px] text-slate-500">
                  {t('sentiment.unchanged', { count: data.priceTrendDynamics.unchangedCount ?? t('sentiment.notAvailable') })}
                </span>
              </div>
            </div>

            {/* 2. Обсяги торгів */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">{t('sentiment.volume')}</span>
                <DollarSign className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-white block">
                  {formatVolume(data.tradingVolume.total24hUsd)}
                </span>
                <span className="text-[10px] text-emerald-400 font-sans block">
                  {t('sentiment.turnover')}
                </span>
              </div>
            </div>

            {/* 3. Волатильність */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">{t('sentiment.volatility')}</span>
                <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-amber-300 block">
                  {data.marketVolatility.avgDailyRangePct}%
                </span>
                <span className="text-[10px] text-slate-400 font-sans block truncate" title={localizeSentimentVolatility(data, language)}>
                  {t('sentiment.index', { score: data.marketVolatility.index })}
                </span>
              </div>
            </div>

            {/* 4. Ширина ринку */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">{t('sentiment.breadth')}</span>
                <BarChart2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-indigo-300 block">
                  {data.marketBreadth.breadthScore} / 100
                </span>
                <span className="text-[10px] text-slate-400 font-sans block truncate">
                  {data.marketBreadth.aboveEma20Pct === null ? t('sentiment.emaUnavailable') : t('sentiment.emaAbove', { pct: data.marketBreadth.aboveEma20Pct })}
                </span>
                {data.dataQuality && (
                  <span className="block truncate text-[10px] text-slate-400" title={t('sentiment.historyHelp')}>
                    {t('sentiment.history', { pct: data.dataQuality.locationCoveragePct, status: t(data.dataQuality.locationReliable ? 'sentiment.historyReliable' : 'sentiment.historyUnreliable') })}
                  </span>
                )}
              </div>
            </div>

            {/* 5. Припливи / Відтоки капіталу */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">{t('sentiment.capitalFlows')}</span>
                <PieChart className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </div>

              <div>
                <span
                  className={`block text-base font-bold sm:text-lg ${data.capitalFlow.takerDeltaUsd == null
                    ? 'text-slate-400' : data.capitalFlow.takerDeltaUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                >
                  {data.capitalFlow.takerDeltaUsd == null ? t('sentiment.notAvailable') :
                    `${data.capitalFlow.takerDeltaUsd > 0 ? '+' : data.capitalFlow.takerDeltaUsd < 0 ? '−' : ''}${formatVolume(Math.abs(data.capitalFlow.takerDeltaUsd))}`}
                </span>
                <span className="block truncate font-sans text-[10px] text-slate-400" title={localizeTakerDeltaLabel(data, language)}>
                  {localizeTakerDeltaLabel(data, language)}
                </span>
              </div>
            </div>

            {/* 6. Відкритий інтерес та Funding Rate */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                <span className="truncate">{t('sentiment.oiFunding')}</span>
                <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              </div>

              <div>
                <span className="text-base sm:text-lg font-bold text-cyan-300 block">
                  {data.derivativesOverview.aggregatedOIUsd === null ? t('sentiment.notAvailable') : formatVolume(data.derivativesOverview.aggregatedOIUsd)}
                </span>
                <span className="text-[10px] text-slate-400 font-sans block truncate">
                  {t('sentiment.funding', { rate: data.derivativesOverview.avgFundingRate === null ? t('sentiment.notAvailable') : `${data.derivativesOverview.avgFundingRate > 0 ? '+' : ''}${data.derivativesOverview.avgFundingRate.toFixed(4)}%` })}
                </span>
                <span className="block truncate text-[10px] text-slate-500" title={localizeBybitDerivativesLabel(data, language)}>
                  {localizeBybitDerivativesLabel(data, language)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
