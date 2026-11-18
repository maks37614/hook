import { readRegularBreakoutRvol, readRegularFormationEvidence } from '../utils/regularFormationIndicators';
import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Star,
  Target,
  ShieldAlert,
  Zap,
  Send,
  BarChart2,
  X,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { ScannedCoin, DetectedFormation, Kline, Timeframe } from '../types';
import { formatCryptoPrice, formatPercent } from '../utils/formatters';
import { useSurveillance } from '../context/SurveillanceContext';
import { MonitoringMenuIcon } from './MonitoringIcon';
import { TradingViewChart } from './TradingViewChart';
import { FormationCoinCopyButton } from './FormationCoinCopyButton';
import { useLanguage } from '../context/LanguageContext';
import { interpolate } from '../locales';
import { localizeFormationRuntime } from '../utils/localizeFormationRuntime';
import { fetchSharedHistoricalKlines } from '../utils/sharedHistoricalKlines';
import type { CoinIdentifier } from '../utils/watchlistUtils';
import { localizeFormationGuideBias } from '../locales/formationGuideTranslations';

const QUALITY_LABELS: Record<string, string> = {
  formation: 'Формація', extremeLocation: 'Екстремум', trigger: 'Пробій',
  retest: 'Ретест', volume: 'RVOL', volatility: 'ATR',
  level: 'Рівень', riskReward: 'R:R', dataQuality: 'Якість даних',
  openInterest: 'OI · Δ', delta: 'Дельта', cvd20: 'CVD20',
  roundNumber: 'Кругле число', density: 'Щільність BID/ASK',
  rsi: 'RSI14', atr: 'ATR/SL/TP', rvol: 'RVOL пробою',
};

interface FormationCardProps {
  coin: ScannedCoin;
  formation: DetectedFormation;
  formations?: DetectedFormation[];
  isWatchlisted: boolean;
  onToggleWatchlist: (coin: CoinIdentifier | string) => void;
  onSelect: (coin: ScannedCoin, formation: DetectedFormation) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenAlert?: (coin: ScannedCoin, formation: DetectedFormation) => void;
}

export const FormationCard: React.FC<FormationCardProps> = ({
  coin,
  formation: primaryFormation,
  formations,
  isWatchlisted,
  onToggleWatchlist,
  onSelect,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onOpenAlert,
}) => {
  const { language } = useLanguage();
  const tr = (source: string) => localizeFormationRuntime(language, source);
  const tp = (source: string, values: Record<string, string | number>) => interpolate(tr(source), values);
  // Scanner statuses combine independent phrases; translate each segment at render time.
  const trStatus = (source: string) => source.split(' · ').map(tr).join(' · ');
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const formation = formations?.find((pattern) => pattern.id === selectedPatternId) ?? primaryFormation;
  const quality = formation.validation?.confluence;
  const evidence = readRegularFormationEvidence(coin.regularIndicators, coin.exchange, coin.marketType,
    formation.validation?.regularPlan?.closedAt);
  const breakoutRvol = readRegularBreakoutRvol(formation.validation);
  const { addCoinToSurveillance, removeCoinFromSurveillance, coins: survCoins } = useSurveillance();
  // A symbol can exist on both spot and futures. Never monitor or remove
  // an entry from a different market just because its ticker matches.
  const monitoredEntry = survCoins.find((item) => item.symbol === coin.symbol
    && item.exchange === coin.exchange && item.marketType === coin.marketType);
  const isMonitored = Boolean(monitoredEntry);
  const isActive = monitoredEntry?.isActive === true;

  const [isChartExpanded, setIsChartExpanded] = useState<boolean>(false);
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loadingKlines, setLoadingKlines] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [loadedHistoryScope, setLoadedHistoryScope] = useState<string | null>(null);
  const [cardTimeframe, setCardTimeframe] = useState<Timeframe>(coin.timeframe || '1h');
  const [livePrice, setLivePrice] = useState<number>(coin.currentPrice);
  // Background scans replace coin objects without remounting this card.
  // Refresh the displayed quote while the mini-chart is closed; its own
  // live stream remains the source of truth when the chart is expanded.
  useEffect(() => {
    if (!isChartExpanded && Number.isFinite(coin.currentPrice) && coin.currentPrice > 0) {
      setLivePrice(coin.currentPrice);
    }
  }, [coin.currentPrice, coin.exchange, coin.marketType, coin.symbol]);
  const [isConfluenceExpanded, setIsConfluenceExpanded] = useState<boolean>(false);

  const selectFormation = (pattern: DetectedFormation) => {
    setSelectedPatternId(pattern.id);
    setIsConfluenceExpanded(false);
  };

  // Native dropdowns open above scroll containers on desktop and mobile without
  // enlarging the card or clipping the list of patterns.
  const renderFormationSelector = () => {
    if (!formations || formations.length < 2) {
      return <span className="block min-w-0 truncate font-bold text-xs text-slate-200" title={tr(formation.name)}>{tr(formation.name)}</span>;
    }

    return (
      <div className="relative flex min-w-0 max-w-full flex-1 items-center">
        <select
          value={formation.id}
          onChange={(event) => {
            const selected = formations.find((pattern) => pattern.id === event.target.value);
            if (selected) selectFormation(selected);
          }}
          aria-label={tp('Вибрати формацію для {{asset}} — {{count}} варіанти', { asset: coin.baseAsset, count: formations.length })}
          title={tp('Натисніть на назву, щоб вибрати одну з {{count}} формацій', { count: formations.length })}
          className="block w-full min-w-0 appearance-none truncate rounded-md border border-cyan-500/40 bg-cyan-500/10 py-1 pl-1.5 pr-8 text-left text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20 focus:outline-none focus:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer"
        >
          {formations.map((pattern) => (
            <option key={pattern.id} value={pattern.id} className="bg-slate-900 text-slate-100">
              {tr(pattern.name)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-cyan-300" />
      </div>
    );
  };

  const historyScope = [coin.exchange, coin.marketType, coin.symbol, cardTimeframe].join('|');
  const historyReady = loadedHistoryScope === historyScope && klines.length > 0;

  // Only an expanded chart needs history. A fresh scan replaces coin objects
  // each minute: depend on the exchange identity instead, not the entire coin.
  // Share public candle requests with HookChart; avoid duplicate 200/1000-bar
  // loads while the mini-chart is waiting for its first real candles.
  // A newly listed pair with one confirmed candle can still open HookChart;
  // its existing self-healing history request remains available.
  useEffect(() => {
    if (!isChartExpanded) return;
    let cancelled = false;
    setLoadingKlines(true);
    setHistoryError(false);
    setLoadedHistoryScope(null);
    setKlines([]);
    void fetchSharedHistoricalKlines({
      exchange: coin.exchange, marketType: coin.marketType, symbol: coin.symbol,
      timeframe: cardTimeframe, limit: 200,
    }).then(rows => {
      if (cancelled) return;
      if (rows.length === 0) {
        setHistoryError(true);
        return;
      }
      setKlines(rows);
      setLoadedHistoryScope([coin.exchange, coin.marketType, coin.symbol, cardTimeframe].join('|'));
      setLivePrice(rows[rows.length - 1].close);
    }).catch(() => {
      if (!cancelled) setHistoryError(true);
    }).finally(() => {
      if (!cancelled) setLoadingKlines(false);
    });
    return () => { cancelled = true; };
  }, [isChartExpanded, cardTimeframe, coin.exchange, coin.marketType, coin.symbol, historyRetry]);

  const isPositive = coin.priceChange24h >= 0;
  const isBullish = formation.bias === 'bullish';
  const isBearish = formation.bias === 'bearish';

  const formatPrice = (price: number) => formatCryptoPrice(price);

  return (
    <div
      data-ui-a11y={isChartExpanded ? undefined : 'formation-info'}
      className={`bg-slate-900/80 border transition-all rounded-2xl flex flex-col justify-between hover:shadow-xl group min-w-0 w-full min-h-[350px] ${
        isChartExpanded
          ? 'formation-chart-card border-cyan-500 shadow-xl shadow-cyan-950/40 bg-slate-900 p-2 sm:p-2.5 h-[390px]'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-cyan-950/20 p-3 sm:p-3.5 h-[350px]'
      }`}
    >
      {/* If Chart is expanded, the interactive chart takes over the entire block */}
      {isChartExpanded ? (
        <div className="flex-1 flex flex-col w-full h-full min-h-0 relative">
          {/* Use the card's available width: desktop grid columns may be narrower than mobile. */}
          <div className="formation-chart-header relative z-30 px-1 py-1 mb-1 border-b border-slate-800/80 shrink-0">
            <div className="formation-chart-identity">
              <FormationCoinCopyButton
                symbol={coin.symbol}
                className="formation-chart-symbol font-mono font-extrabold text-white text-xs sm:text-sm"
              >
                {coin.baseAsset}/{coin.quoteAsset}
              </FormationCoinCopyButton>
              <span className="site-exchange-badge site-exchange-badge--compact shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase" data-exchange={coin.exchange}>
                {coin.exchange}
              </span>
              <span className="formation-chart-price shrink-0 font-mono font-bold text-xs text-cyan-400">
                ${formatPrice(livePrice)}
              </span>
            </div>

            <div className="formation-chart-header-actions">
              {onSendMetaScalp && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendMetaScalp(coin);
                  }}
                  title={`${tr("Термінал")} (${metaScalpBinding})`}
                  aria-label={tp('Відправити в обраний термінал ({{group}})', { group: metaScalpBinding })}
                  className="rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(coin, formation);
                }}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                title={tr("Повний детальний огляд")}
                aria-label={tr("Повний детальний огляд")}
              >
                <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsChartExpanded(false)}
                className="rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
                title={tr("Закрити графік (повернутися до картки)")}
                aria-label={tr("Закрити графік (повернутися до картки)")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Chart occupying entire remaining area of the block */}
          <div className="flex-1 w-full h-full min-h-0 relative overflow-hidden rounded-xl bg-slate-950 border border-slate-800">
            {!historyReady ? (
              <div role="status" aria-live="polite" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 z-20 p-3 text-center">
                {historyError && !loadingKlines ? (
                  <>
                    <span className="text-[11px] text-amber-300">{tr("Не вдалося завантажити свічки")}</span>
                    <button type="button" onClick={() => setHistoryRetry(value => value + 1)}
                      className="rounded-lg border border-cyan-500/50 px-3 py-1.5 text-[11px] text-cyan-300 hover:bg-cyan-500/10">
                      {tr("Повторити завантаження")}
                    </button>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                    <span className="text-[11px] text-slate-400 font-mono">{tr("Завантаження свічок…")}</span>
                  </>
                )}
              </div>
            ) : (
              <TradingViewChart
                visualContext="formationsQuick"
                klines={klines}
                formation={formation}
                symbol={coin.symbol}
                timeframe={cardTimeframe}
                exchange={coin.exchange}
                marketType={coin.marketType}
                showNavigationControls={false}
                fullHeight={true}
                onLivePriceUpdate={(p) => setLivePrice(p)}
                onTimeframeChange={(tf) => setCardTimeframe(tf)}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Give badges the full card width; price no longer squeezes the timeframe. */}
          <div className="min-w-0" data-formation-summary-header>
            <div className="flex min-w-0 items-start justify-between gap-2">
              <FormationCoinCopyButton symbol={coin.symbol} className="flex min-w-0 max-w-full items-center gap-1.5 text-left">
                <span className="min-w-0 truncate font-extrabold text-base text-white tracking-wide font-mono">
                  {coin.baseAsset}
                </span>
                <span className="shrink-0 text-xs text-slate-400 font-mono">/{coin.quoteAsset}</span>
              </FormationCoinCopyButton>

              {/* Price & 24h Change */}
              <div className="shrink-0 text-right">
                <div className="font-mono font-bold text-sm text-slate-100">
                  ${formatPrice(livePrice)}
                </div>
                <div
                  className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${
                    isPositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isPositive ? '+' : ''}{coin.priceChange24h.toFixed(2)}%
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-0.5" data-formation-market-badges>
              <span
                data-exchange={coin.exchange}
                className={`site-exchange-badge site-exchange-badge--compact text-[9px] px-1.5 py-0.2 rounded font-sans font-bold uppercase whitespace-nowrap ${
                  coin.exchange === 'binance'
                    ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                    : 'bg-orange-950/80 text-orange-400 border border-orange-800/60'
                }`}
              >
                {coin.exchange}
              </span>
              {/* The market and its timeframe always wrap together, even in narrow columns. */}
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap" data-formation-market-timeframe>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-medium">
                  {tr(coin.marketType === 'futures' ? "Ф'ючерси" : 'Спот')}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                  {coin.timeframe}
                </span>
              </span>
            </div>
          </div>

          {/* Middle Content: Formation Details */}
          <div className="space-y-2 my-1 flex-1 min-h-0 overflow-y-auto touch-scroll formation-card-info-scroll">
            {/* Formation Info Block */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                {renderFormationSelector()}
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider whitespace-nowrap ${
                    isBullish
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : isBearish
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {localizeFormationGuideBias(language, isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral')}{isBullish ? ' ▲' : isBearish ? ' ▼' : ''}
                </span>
                {formation.roundNumberContext?.detected && (
                  <span
                    className={`min-w-0 max-w-full px-2 py-0.5 rounded text-center text-[9px] leading-tight font-bold uppercase tracking-wider whitespace-normal break-words border ${
                      formation.roundNumberContext.densityConfirmed
                        ? 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/50'
                        : 'bg-amber-500/15 text-amber-200 border-amber-400/40'
                    }`}
                    title={tr(formation.roundNumberContext.densityConfirmed ? 'Кругле число + велика лімітна заявка у поточному знімку стакана. Заявка може зникнути; це не гарантія підтримки або опору.' : 'Формація біля круглого числа')}
                  >
                    {tr(formation.roundNumberContext.densityConfirmed ? 'КРУГЛИЙ + ЩІЛЬНІСТЬ' : 'КРУГЛИЙ РІВЕНЬ')}
                  </span>
                )}
              </div>

              <div className="flex min-w-0 items-start justify-between gap-2 text-[11px] text-slate-400 mb-1.5">
                <span className="shrink-0">{tr('Статус:')}</span>
                <span className="min-w-0 max-w-[72%] break-words text-right font-medium text-slate-300 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px]">
                  {trStatus(formation.statusLabel)}
                </span>
              </div>
              {formation.tpSlBuilder && <div className="mb-1.5 space-y-1">
                <p className="text-[10px] text-cyan-300">{tr("Правила профілю")}
                  {formation.tpSlBuilder.touches
                    ? formation.tpSlBuilder.touches.verified
                      ? interpolate(tr(' · дотики {{count}}/{{required}}'), { count: formation.tpSlBuilder.touches.count, required: formation.tpSlBuilder.touches.required })
                      : tr(' · дотики не підтверджені (немає даних)')
                    : ''}
                </p>
                {formation.tpSlBuilder.levelStatus === 'invalid' &&
                  <p className="text-[10px] text-amber-300">{tr('Некоректний власний TP/SL — показано автоматичні ціни')}</p>}
              </div>}

              {/* The same verified metrics drive the regular screener's technical filters. */}
              {(Object.values(evidence).some(value => value !== undefined) || breakoutRvol !== undefined) && (
                <div className="flex flex-wrap gap-1 mb-1.5 text-[10px] font-mono text-slate-300"
                  aria-label={tr("Технічні показники звичайного сканування")}>
                  {evidence.atrPct !== undefined && (
                    <span className="rounded border border-cyan-900/50 bg-cyan-950/25 px-1.5 py-0.5"
                      title={tr("ATR(14) у відсотках від ціни, розрахований із закритих свічок")}>
                      ATR {evidence.atrPct.toFixed(2)}%
                    </span>
                  )}
                  {evidence.rsi14 !== undefined && (
                    <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5"
                      title={tr("RSI(14) останньої закритої свічки")}>
                      RSI {evidence.rsi14.toFixed(1)}
                    </span>
                  )}
                  {evidence.oiChangePct !== undefined && (
                    <span className="rounded border border-purple-900/50 bg-purple-950/25 px-1.5 py-0.5"
                      title={tr("Зміна реального OI у нативних контрактах за вибраний таймфрейм; лише ф'ючерси")}>
                      OI {evidence.oiChangePct > 0 ? '+' : ''}{evidence.oiChangePct.toFixed(2)}%
                    </span>
                  )}
                  {evidence.deltaPct !== undefined && (
                    <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5"
                      title={tr('Дельта агресивних покупок мінус продажів за останню закриту свічку')}>
                      Δ {evidence.deltaPct > 0 ? '+' : ''}{evidence.deltaPct.toFixed(1)}%
                    </span>
                  )}
                  {evidence.cvd20Pct !== undefined && (
                    <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5"
                      title={tr('Сумарна дельта за 20 закритих свічок відносно їхнього обороту')}>
                      CVD20 {evidence.cvd20Pct > 0 ? '+' : ''}{evidence.cvd20Pct.toFixed(1)}%
                    </span>
                  )}
                  {breakoutRvol !== undefined && (
                    <span className="rounded border border-emerald-900/50 bg-emerald-950/25 px-1.5 py-0.5"
                      title={tr("RVOL обсягу свічки підтвердженого пробою проти попередніх 20 закритих свічок")}>
                      RVOL {breakoutRvol.toFixed(2)}×
                    </span>
                  )}
                </div>
              )}

              {formation.validation && (
                <div className={`text-[10px] mb-2 ${formation.validation.passed ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {tr(formation.validation.passed ? 'Вхід підтверджено' : 'Вхід ще не підтверджено')}
                  {!formation.validation.passed && (
                    <p className="text-slate-400 mt-1">{(isConfluenceExpanded ? formation.validation.rejectionReasons
                      : formation.validation.rejectionReasons.slice(0, 2)).map(tr).join(' · ')}</p>
                  )}
                </div>
              )}

              {/* Status of additional flow confirmation, never a replacement for structure. */}
              {formation.validation?.confluence?.flow && (
                <p className={`mb-2 text-[10px] ${formation.validation.confluence.flow.status === 'contradicted'
                  ? 'text-rose-300' : formation.validation.confluence.flow.entryConfirmedWithFlow
                    ? 'text-emerald-300' : 'text-slate-400'}`}
                  title={tr("OI сам не визначає напрямок позицій; дельта й CVD — взаємопов'язані дані.")}>
                  {formation.validation.confluence.flow.status === 'unavailable'
                    ? tr('Перевірені дані потоку недоступні')
                    : formation.validation.confluence.flow.entryConfirmedWithFlow
                      ? tr('✓ Вхід додатково підтверджено потоком')
                      : formation.validation.confluence.flow.status === 'contradicted'
                        ? tr('⚠ Дельта та CVD суперечать входу')
                        : formation.validation.confluence.flow.status === 'supported'
                          ? tr('Потік підтримує напрямок; основний вхід ще очікується')
                          : interpolate(tr('Потік: {{supportive}}/{{available}} факторів підтримують'), {
                              supportive: formation.validation.confluence.flow.independentSupport,
                              available: formation.validation.confluence.flow.independentAvailable
                                ?? formation.validation.confluence.flow.available,
                            })}
                </p>
              )}

              {/* Detailed confluence */}
              {formation.validation?.confluence && (
                <div className="mt-2 border-t border-slate-800/70 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsConfluenceExpanded((value) => !value)}
                    className="w-full flex items-center justify-between text-[10px] hover:text-slate-200 transition-colors cursor-pointer"
                    aria-expanded={isConfluenceExpanded}
                    title={tr(isConfluenceExpanded ? 'Сховати' : 'Показати')}
                  >
                    <span className="text-slate-400" title={tr(quality?.scoreVersion === 2
                      ? 'Структура оцінюється за однаковою шкалою для всіх ринків. Потік і технічні показники наведені окремо.'
                      : 'Структура та ринковий потік, нормовані за наявними перевіреними показниками до 100. Не ймовірність успіху.')}>
                      {tr(quality?.scoreVersion === 2 ? 'Якість структури' : 'Якість сигналу:')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-cyan-300">{formation.validation.confluence.total}/100 · {formation.validation.confluence.grade}</span>
                      <ChevronDown
                        className={`w-3 h-3 text-slate-500 transition-transform ${isConfluenceExpanded ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>

                  {isConfluenceExpanded && (
                    <div className="mt-1">
                      <div className="grid grid-cols-3 gap-1 text-[10px]">
                        {Object.entries(formation.validation.confluence.components).map(([key, item]) => (
                          <details key={key}
                            className={`bg-slate-900/70 rounded px-1.5 py-1 border ${item.available === false
                              ? 'border-slate-800/50 opacity-70'
                              : item.status === 'CONFLICT' ? 'border-rose-800/60' : 'border-slate-800'}`}>
                            <summary className="cursor-pointer list-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                              title={tr(item.evidence)}>
                              <div className="text-slate-400 truncate">{tr(QUALITY_LABELS[key] ?? key)}</div>
                              <div className={`font-mono ${item.status === 'CONFLICT' ? 'text-rose-300' : 'text-slate-200'}`}>
                                {item.available !== false ? `${item.score}/${item.max}`
                                  : tr(item.availability === 'pending' ? 'Очікує пробою'
                                    : item.availability === 'notApplicable' ? 'Не застосовується' : 'Дані недоступні')}
                              </div>
                            </summary>
                            <p className="mt-1 border-t border-slate-800 pt-1 text-[10px] text-slate-400 break-words leading-3">
                              {tr(item.evidence)}
                            </p>
                          </details>
                        ))}
                      </div>
                      {quality?.scoreVersion === 2 ? (
                        <div className="mt-1 space-y-0.5 text-[10px] text-slate-400">
                          <p>{tp('Структурні бали {{base}}/72 · Додаткові бали {{points}}', {
                            base: quality.basePoints ?? 0, points: quality.supplementaryPoints ?? 0,
                          })}</p>
                          <p>{tp('Доступність додаткових показників {{available}}/27', { available: quality.supplementaryAvailable ?? 0 })}</p>
                          {formation.validation.regularPlan && <p>{tp('Оцінка за свічкою, закритою о {{time}}', {
                            time: new Date(formation.validation.regularPlan.closedAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }),
                          })}</p>}
                          {formation.regularSetupAdjustment?.tickVerified === false && <p>{tr('Крок ціни біржі недоступний')}</p>}
                        </div>
                      ) : formation.validation.confluence.rawTotal !== undefined
                        && formation.validation.confluence.availableMax !== undefined && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          {interpolate(tr('Нормовано: {{raw}}/{{max}} доступних балів → {{total}}/100. Відсутні показники не зменшують оцінку. Натисни на складову для пояснення.'), {
                            raw: formation.validation.confluence.rawTotal,
                            max: formation.validation.confluence.availableMax,
                            total: formation.validation.confluence.total,
                          })}
                        </p>
                      )}
                      {(formation.validation.confluence.conflicts.length > 0 || formation.validation.confluence.missing.length > 0) && (
                        <div className="mt-1 text-[10px] text-amber-300">
                          {formation.validation.confluence.conflicts.slice(0, 2).map(tr).join(' · ')}
                          {formation.validation.confluence.missing.length > 0 && `${tr('Очікується:')} ${formation.validation.confluence.missing.slice(0, 2).map(tr).join(', ')}`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Confidence meter */}
              <div className="mt-2">
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      formation.confidence >= 85
                        ? 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                        : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                    }`}
                    style={{ width: `${formation.confidence}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Trade Geometry: Target, Stop Loss, Risk/Reward */}
            <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
              <div className="bg-slate-950/50 border border-slate-800/60 p-1.5 rounded-lg min-w-0">
                <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 truncate">
                  <Target className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{tr('Ціль')}</span>
                </div>
                <div className="font-mono font-bold text-emerald-400 text-xs mt-0.5 truncate" title={formatPercent(Math.abs(formation.potentialProfitPct))}>
                  {formatPercent(Math.abs(formation.potentialProfitPct))}
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate" title={String.fromCharCode(36) + formatPrice(formation.levels.targetPrice)}>
                  ${formatPrice(formation.levels.targetPrice)}
                </div>
              </div>

              <div className="bg-slate-950/50 border border-slate-800/60 p-1.5 rounded-lg min-w-0">
                <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5 truncate">
                  <ShieldAlert className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                  <span className="truncate">{tr('Стоп')}</span>
                </div>
                <div className="font-mono font-bold text-rose-400 text-xs mt-0.5 truncate" title={formatPercent(-Math.abs(formation.potentialRiskPct))}>
                  {formatPercent(-Math.abs(formation.potentialRiskPct))}
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate" title={String.fromCharCode(36) + formatPrice(formation.levels.stopLossPrice)}>
                  ${formatPrice(formation.levels.stopLossPrice)}
                </div>
              </div>

              <div className="bg-slate-950/50 border border-slate-800/60 p-1.5 rounded-lg min-w-0">
                <div className="text-[10px] text-slate-400 truncate">{tr('Вхід / R:R')}</div>
                <div className="font-mono font-bold text-sky-400 text-xs mt-0.5 truncate" title={formation.tpSlBuilder?.touches?.ready === false ? tr('Очікування дотиків') : String.fromCharCode(36) + formatPrice(formation.levels.entryPrice)}>
                  {formation.tpSlBuilder?.touches?.ready === false
                    ? tr('Очікування дотиків') : String.fromCharCode(36) + formatPrice(formation.levels.entryPrice)}
                </div>
                <div className="text-[10px] text-cyan-300 font-mono font-medium">
                  1:{formation.riskRewardRatio}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="formation-card-footer flex flex-nowrap items-center justify-between gap-1 pt-2 border-t border-slate-800/60">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setIsChartExpanded(true)}
                className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                title={tr("Відкрити графік на цілий блок")}
                aria-label={tr("Відкрити графік на цілий блок")}
              >
                <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                <span></span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(coin, formation);
                }}
                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                title={tr("Повний детальний огляд монети")}
                aria-label={tr("Повний детальний огляд монети")}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-1">
              {onSendMetaScalp && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendMetaScalp(coin);
                  }}
                  title={tp('Відкрити в обраному терміналі (Група {{group}})', { group: metaScalpBinding })}
                  aria-label={tp('Відкрити в обраному терміналі (Група {{group}})', { group: metaScalpBinding })}
                  className="flex items-center gap-1 py-1.5 px-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                </button>
              )}

              {onOpenAlert && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAlert(coin, formation);
                  }}
                  title={tr("Створити сповіщення ціни в Telegram")}
                  aria-label={tr("Створити сповіщення ціни в Telegram")}
                  className="p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (isMonitored) {
                    if (monitoredEntry) await removeCoinFromSurveillance(monitoredEntry.id);
                  } else {
                    await addCoinToSurveillance(coin.symbol, coin.exchange, coin.marketType);
                  }
                }}
                title={
                  isMonitored
                    ? tp('Монета на системному нагляді ({{status}}). Натисніть щоб зняти', { status: tr(isActive ? 'Активна 24/7' : 'Призупинена') })
                    : tr('Взяти на 24/7 системний нагляд')
                }
                aria-label={isMonitored
                  ? tp('Монета на системному нагляді ({{status}}). Натисніть щоб зняти', { status: tr(isActive ? 'Активна 24/7' : 'Призупинена') })
                  : tr('Взяти на 24/7 системний нагляд')}
                aria-pressed={isMonitored}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  isMonitored
                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-400'
                    : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-violet-400'
                }`}
              >
                <MonitoringMenuIcon className={`w-3.5 h-3.5 ${isActive ? 'animate-pulse' : ''}`} active={isActive} />
              </button>

              <button
                onClick={() => onToggleWatchlist(coin)}
                title={tr(isWatchlisted ? 'Видалити з обраного' : 'Додати в обране')}
                aria-label={tr(isWatchlisted ? 'Видалити з обраного' : 'Додати в обране')}
                aria-pressed={isWatchlisted}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  isWatchlisted
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-amber-400'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
