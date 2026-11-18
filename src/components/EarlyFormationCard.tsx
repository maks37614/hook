import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart2, ExternalLink, RefreshCw, Send, ShieldAlert, Star, Target, TrendingDown, TrendingUp, X, Zap } from 'lucide-react';
import type { Kline, ScannedCoin, Timeframe } from '../types';
import type { EarlyFormationCandidate } from '../utils/earlyFormations';
import { earlyFormationChartMarkers } from '../utils/earlyFormations';
import { fetchDirectKlines } from '../utils/directExchangeClient';
import { formatCryptoPrice } from '../utils/formatters';
import { useSurveillance } from '../context/SurveillanceContext';
import { MonitoringMenuIcon } from './MonitoringIcon';
import { TradingViewChart } from './TradingViewChart';
import { FormationCoinCopyButton } from './FormationCoinCopyButton';
import { useLanguage } from '../context/LanguageContext';
import { interpolate, translatePhrase } from '../locales';
import { localizeFormationGuideBias } from '../locales/formationGuideTranslations';

export interface EarlyFormationCardProps {
  coin: ScannedCoin;
  candidate: EarlyFormationCandidate;
  isWatchlisted: boolean;
  onToggleWatchlist: (symbol: string) => void;
  onOpen: (coin: ScannedCoin, candidate: EarlyFormationCandidate) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenPriceAlert?: (coin: ScannedCoin) => void;
}

const money = (n: number) => '$' + formatCryptoPrice(n);

/** Same layout and actions as FormationCard; a draft never becomes a confirmed formation. */
export function EarlyFormationCard({
  coin, candidate, isWatchlisted, onToggleWatchlist, onOpen,
  onSendMetaScalp, metaScalpBinding = '001', onOpenPriceAlert,
}: EarlyFormationCardProps) {
  const { language } = useLanguage();
  const tr = (text: string) => translatePhrase(language, text);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [cardTimeframe, setCardTimeframe] = useState<Timeframe>(coin.timeframe || '1h');
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loadingKlines, setLoadingKlines] = useState(false);
  const [livePrice, setLivePrice] = useState(coin.currentPrice);
  const [changingSurveillance, setChangingSurveillance] = useState(false);
  const { isCoinOnSurveillance, isCoinMonitored, addCoinToSurveillance, removeCoinFromSurveillance, coins: survCoins } = useSurveillance();
  const isMonitored = isCoinOnSurveillance(coin.symbol, coin.exchange);
  const isActive = isCoinMonitored(coin.symbol, coin.exchange);
  const isBullish = candidate.bias === 'bullish';
  const isPositive = coin.priceChange24h >= 0;
  const ready = candidate.stage === 'forming';
  const earlyZone = money(candidate.earlyEntryMin) + ' – ' + money(candidate.earlyEntryMax);
  const localizedMarkers = useMemo(() => earlyFormationChartMarkers(candidate).map(marker => ({
    ...marker, label: translatePhrase(language, marker.label),
  })), [candidate, language]);
  const openDetail = () => onOpen(coin, candidate);

  useEffect(() => {
    setLivePrice(coin.currentPrice);
  }, [coin.currentPrice]);

  useEffect(() => {
    if (!isChartExpanded) return;
    let cancelled = false;
    const controller = new AbortController();
    setKlines([]);
    setLoadingKlines(true);
    const load = async () => {
      try {
        const query = new URLSearchParams({
          exchange: coin.exchange, market: coin.marketType,
          symbol: coin.symbol, timeframe: cardTimeframe, limit: '200',
        });
        const response = await fetch('/api/klines?' + query.toString(), { signal: controller.signal });
        if (response.ok) {
          const body = await response.json();
          if (body.success && Array.isArray(body.data) && body.data.length > 1) {
            if (!cancelled) setKlines(body.data);
            return;
          }
        }
      } catch { /* Fall through to direct exchange history. */ }
      try {
        const direct = await fetchDirectKlines(coin.exchange, coin.marketType, coin.symbol, cardTimeframe, 200);
        if (!cancelled) setKlines(direct);
      } catch { /* The chart will show its usual empty history state. */ }
      finally { if (!cancelled) setLoadingKlines(false); }
    };
    void load().finally(() => { if (!cancelled) setLoadingKlines(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [isChartExpanded, cardTimeframe, coin.exchange, coin.marketType, coin.symbol]);

  const toggleSurveillance = async () => {
    if (changingSurveillance) return;
    setChangingSurveillance(true);
    try {
      if (isMonitored) {
        const monitored = survCoins.find(row => row.symbol === coin.symbol && row.exchange === coin.exchange);
        if (monitored) await removeCoinFromSurveillance(monitored.id);
      } else {
        await addCoinToSurveillance(coin.symbol, coin.exchange, coin.marketType);
      }
    } finally { setChangingSurveillance(false); }
  };

  return (
    <article data-ui-a11y={isChartExpanded ? undefined : 'formation-info'} className={`bg-slate-900/80 border transition-all rounded-2xl flex flex-col justify-between hover:shadow-xl group min-w-0 w-full min-h-[350px] ${
      isChartExpanded
        ? 'formation-chart-card border-cyan-500 shadow-xl shadow-cyan-950/40 bg-slate-900 p-2 sm:p-2.5 h-[390px]'
        : 'border-slate-800 hover:border-slate-700 hover:shadow-cyan-950/20 p-3 sm:p-3.5 h-[350px]'
    }`}>
      {isChartExpanded ? (
        <div className="flex-1 flex flex-col w-full h-full min-h-0 relative">
          <div className="formation-chart-header relative z-30 px-1 py-1 mb-1 border-b border-slate-800/80 shrink-0">
            <div className="formation-chart-identity">
              <FormationCoinCopyButton
                symbol={coin.symbol}
                className="formation-chart-symbol font-mono font-extrabold text-white text-xs sm:text-sm"
              >
                {coin.baseAsset}/{coin.quoteAsset}
              </FormationCoinCopyButton>
              <span className="text-[10px] rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300 font-semibold" title={tr("Формація ще не підтверджена")}>
                {tr('МОЖЛИВА')}
              </span>
              <span className="formation-chart-price shrink-0 font-mono font-bold text-xs text-cyan-400">
                {money(livePrice)}
              </span>
            </div>
            <div className="formation-chart-header-actions">
              {onSendMetaScalp && (
                <button type="button" onClick={() => onSendMetaScalp(coin)}
                  title={`${tr("Термінал")} (${metaScalpBinding})`}
                  aria-label={interpolate(tr("Відправити в обраний термінал ({{group}})"), { group: metaScalpBinding })}
                  className="rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                </button>
              )}
              <button type="button" onClick={openDetail} title={tr("Відкрити графік на весь екран")}
                aria-label={tr("Відкрити графік можливої формації на весь екран")}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
                <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              </button>
              <button type="button" onClick={() => setIsChartExpanded(false)}
                title={tr("Повернутися до картки")} aria-label={tr("Закрити швидкий графік")}
                className="rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 w-full h-full min-h-0 relative overflow-hidden rounded-xl bg-slate-950 border border-slate-800">
            {loadingKlines && klines.length === 0 && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-950/80">
                <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                <span className="text-[11px] text-slate-400">{tr("Завантаження свічок…")}</span>
              </div>
            )}
            <TradingViewChart
              visualContext="formationsQuick"
              forceHookChart
              key={[coin.exchange, coin.marketType, coin.symbol, cardTimeframe].join(':')}
              klines={klines}
              formation={null}
              customMarkers={localizedMarkers}
              previewMarkers
              symbol={coin.symbol}
              timeframe={cardTimeframe}
              exchange={coin.exchange}
              marketType={coin.marketType}
              historyLimit={200}
              showNavigationControls={false}
              fullHeight
              onLivePriceUpdate={setLivePrice}
              onTimeframeChange={setCardTimeframe}
            />
          </div>
        </div>
      ) : (
        <>
                {/* Match the regular FormationCard coin/price header. */}
                <div className="min-w-0" data-formation-summary-header>
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <FormationCoinCopyButton symbol={coin.symbol} className="flex min-w-0 items-center max-w-full gap-1.5 text-left">
                      <span className="min-w-0 truncate font-extrabold text-base text-white tracking-wide font-mono">
                        {coin.baseAsset}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400 font-mono">/{coin.quoteAsset}</span>
                    </FormationCoinCopyButton>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-sm text-slate-100">{money(coin.currentPrice)}</div>
                      <div className={'text-xs font-semibold flex items-center justify-end gap-0.5 ' +
                        (isPositive ? 'text-emerald-400' : 'text-rose-400')}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isPositive ? '+' : ''}{coin.priceChange24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center flex-wrap gap-1 mt-0.5" data-formation-market-badges>
                    <span data-exchange={coin.exchange} className={'site-exchange-badge site-exchange-badge--compact text-[9px] px-1.5 py-0.2 rounded font-sans font-bold uppercase whitespace-nowrap ' +
                      (coin.exchange === 'binance'
                        ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                        : 'bg-orange-950/80 text-orange-400 border border-orange-800/60')}>
                      {coin.exchange}
                    </span>
                    {/* Keep futures/spot and timeframe adjacent if the exchange label wraps. */}
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

                {/* Keep preliminary scenarios visually distinct from validated formations. */}
                <div className="space-y-2 my-1 flex-1 min-h-0 overflow-y-auto touch-scroll formation-card-info-scroll">
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="block min-w-0 flex-1 truncate font-bold text-xs text-slate-200" title={tr(candidate.name)}>
                        {tr(candidate.name)}
                      </span>
                      <span className={'shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border whitespace-nowrap ' +
                        (isBullish
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30')}>
                        {localizeFormationGuideBias(language, isBullish ? 'bullish' : 'bearish') + '?'}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-start justify-between gap-2 text-[11px] text-slate-400 mb-1.5">
                      <span className="shrink-0">{tr('Статус:')}</span>
                      <span className={'min-w-0 max-w-[72%] break-words text-[10px] font-semibold rounded px-1.5 py-0.5 text-right ' +
                        (ready ? 'text-amber-200 bg-amber-400/10' : 'text-sky-200 bg-sky-400/10')}>
                        {tr(ready ? 'Формується' : 'Потенційна')}
                      </span>
                    </div>
                    {candidate.tpSlBuilder && <>
                      <p className="text-[10px] leading-4 text-cyan-300">
                        {tr('Правила профілю · дотики тінями:')} {candidate.tpSlBuilder.touches.verified
                          ? `${candidate.tpSlBuilder.touches.count}/${candidate.tpSlBuilder.touches.required}`
                          : tr('немає перевірених даних')}
                      </p>
                      {candidate.tpSlBuilder.levelStatus === 'invalid' &&
                        <p className="text-[10px] leading-4 text-amber-300">{tr('Власна ціна недопустима — рівні АВТО, дотики враховуються')}</p>}
                    </>}
                    <p className="text-[10px] leading-4 text-slate-400">{tr(candidate.explanation)}</p>
                    <p className="mt-1.5 flex items-start gap-1 text-[10px] leading-4 text-amber-300">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      {tr('Не підтверджений сигнал')}
                    </p>
                  </div>

                  {/* Three price tiles use the same geometry as regular FormationCard. */}
                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                    <div className="bg-slate-950/50 border border-slate-800/60 p-1.5 rounded-lg min-w-0">
                      <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5">
                        <Target className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{tr('Прогноз TP')}</span>
                      </div>
                      <div className="font-mono font-bold text-emerald-400 text-xs mt-0.5 truncate" title={money(candidate.target)}>
                        {money(candidate.target)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate" title={tr("R:R ранній 1:") + candidate.earlyRiskReward}>
                        R:R 1:{candidate.earlyRiskReward}
                      </div>
                    </div>
                    <div className="bg-slate-950/50 border border-slate-800/60 p-1.5 rounded-lg min-w-0">
                      <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5">
                        <ShieldAlert className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                        <span className="truncate">{tr('SL ранній')}</span>
                      </div>
                      <div className="font-mono font-bold text-rose-400 text-xs mt-0.5 truncate" title={money(candidate.stopLoss)}>
                        {money(candidate.stopLoss)}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{tr('Умовний')}</div>
                    </div>
                    <div className="bg-slate-950/50 border border-slate-800/60 p-1.5 rounded-lg min-w-0">
                      <div className="text-[10px] text-slate-400 truncate">{tr('Ранній вхід')}</div>
                      <div className="font-mono font-bold text-sky-400 text-xs mt-0.5 truncate" title={earlyZone}>
                        {candidate.tpSlBuilder?.touches.ready === false ? tr('Очікуємо дотики') : money(candidate.earlyEntryMin)}
                      </div>
                      <div className="text-[10px] text-sky-300 font-mono truncate" title={earlyZone}>
                        {candidate.tpSlBuilder?.touches.ready === false
                          ? `${candidate.tpSlBuilder.touches.count}/${candidate.tpSlBuilder.touches.required}`
                          : '– ' + money(candidate.earlyEntryMax)}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950/50 border border-slate-800/60 p-2 rounded-lg text-[10px] space-y-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 break-words text-slate-400">{tr('Вхід після пробою')}</span>
                      <span className="min-w-0 max-w-[55%] shrink-0 truncate text-right font-mono text-violet-300" title={money(candidate.breakoutEntry)}>
                        {money(candidate.breakoutEntry)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 break-words text-slate-400">{tr('SL після пробою')}</span>
                      <span className="min-w-0 max-w-[55%] shrink-0 truncate text-right font-mono text-orange-300" title={money(candidate.breakoutStopLoss)}>
                        {money(candidate.breakoutStopLoss)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 break-words text-slate-400">{tr('Лінія шиї')}</span>
                      <span className="min-w-0 max-w-[55%] shrink-0 truncate text-right font-mono text-slate-300" title={money(candidate.neckline)}>
                        {money(candidate.neckline)}
                      </span>
                    </div>
                    <div className="text-cyan-300 font-mono">
                      {tr('R:R після пробою ≈')} 1:{candidate.breakoutRiskReward}
                    </div>
                    <div className="text-amber-200/80">
                      {tr('Ранній вхід — лише за відскоку / відбою.')}
                    </div>
                    {!candidate.tickVerified && (
                      <div className="text-orange-300/90">
                        {tr('Біржовий крок ціни не перевірено: прогноз не готовий до виставлення ордера.')}
                      </div>
                    )}
                  </div>
                </div>


          {/* Identical six-action footer layout to the validated formation cards. */}
          <div className="formation-card-footer flex flex-nowrap items-center justify-between gap-1 pt-2 border-t border-slate-800/60">
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => setIsChartExpanded(true)}
                className="p-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300"
                title={tr("Швидкий перегляд графіка")} aria-label={tr("Швидкий перегляд графіка")}>
                <BarChart2 className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={openDetail}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-cyan-300"
                title={tr("Відкрити графік на весь екран")} aria-label={tr("Відкрити графік можливої формації на весь екран")}>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1">
              {onSendMetaScalp && (
                <button type="button" onClick={() => onSendMetaScalp(coin)}
                  className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300"
                  title={`${tr("Відкрити в обраному терміналі")} (${metaScalpBinding})`} aria-label={tr("Лінковка з терміналом")}>
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                </button>
              )}
              {onOpenPriceAlert && (
                <button type="button" onClick={() => onOpenPriceAlert(coin)}
                  className="p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400"
                  title={tr("Власне сповіщення ціни в Telegram, не сигнал ранньої формації")}
                  aria-label={tr("Налаштувати власне сповіщення ціни")}>
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
              <button type="button" onClick={() => { void toggleSurveillance(); }} disabled={changingSurveillance}
                className={`p-2 rounded-xl border transition-colors disabled:opacity-50 ${
                  isMonitored ? 'bg-violet-500/20 border-violet-500/40 text-violet-400'
                    : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-violet-400'
                }`}
                title={isMonitored ? `${tr('Монета під 24/7 наглядом')} (${tr(isActive ? 'активна' : 'призупинена')})` : tr('Взяти монету на 24/7 нагляд')}
                aria-label={tr(isMonitored ? 'Зняти монету з нагляду' : 'Додати монету до нагляду')}
                aria-pressed={isMonitored}>
                <MonitoringMenuIcon className={`w-3.5 h-3.5 ${isActive ? 'animate-pulse' : ''}`} active={isActive} />
              </button>
              <button type="button" onClick={() => onToggleWatchlist(coin.symbol)}
                className={`p-2 rounded-xl border transition-colors ${
                  isWatchlisted ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-amber-400'
                }`}
                title={tr(isWatchlisted ? 'Видалити з обраного' : 'Додати в обране')}
                aria-label={tr(isWatchlisted ? 'Видалити з обраного' : 'Додати в обране')}
                aria-pressed={isWatchlisted}>
                <Star className={`w-3.5 h-3.5 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
              </button>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
