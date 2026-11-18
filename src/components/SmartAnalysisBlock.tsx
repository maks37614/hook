import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  Activity,
  Layers,
  BarChart3,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Clock,
  RefreshCw,
  ChevronUp,
  Gauge,
  Sliders,
  Radio,
  Eye,
  Crosshair,
  Zap,
  Info,
  Wallet,
  Users,
  Fingerprint,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { SmartAnalysisData, ScannedCoin, DetectedFormation, Kline, Timeframe, CoinGeckoHolderSnapshot } from '../types';
import { formatCryptoPrice, formatVolume, formatPercent } from '../utils/formatters';
import { getSmartAnalysisVisibility, selectVisibleTab, type SmartAnalysisTab, type SmartAnalysisModule } from '../utils/smartAnalysisVisibility';

interface SmartAnalysisBlockProps {
  coin: ScannedCoin;
  formation?: DetectedFormation | null;
  klines?: Kline[];
  timeframe?: Timeframe;
  /** Canonical detected-formation setup and its Telegram actions from detail view. */
  tradeSetup?: React.ReactNode;
  /** Close the panel without changing the analysis refresh behavior. */
  onCollapse?: () => void;
}

export const SmartAnalysisBlock: React.FC<SmartAnalysisBlockProps> = ({
  coin,
  formation,
  klines,
  timeframe,
  tradeSetup,
  onCollapse,
}) => {
  const [data, setData] = useState<SmartAnalysisData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SmartAnalysisTab>('all');
  const analysisAbortRef = useRef<AbortController | null>(null);
  const [holderSnapshot, setHolderSnapshot] = useState<CoinGeckoHolderSnapshot | null>(null);
  const [holdersLoading, setHoldersLoading] = useState(true);

  // Holders are independent of the expensive Quant snapshot. Reuse the backend
  // cache across users and only load on the open details page, not every chart.
  useEffect(() => {
    const controller = new AbortController();
    setHolderSnapshot(null);
    setHoldersLoading(true);
    void (async () => {
      try {
        const response = await fetch('/api/market/holders?symbol=' +
          encodeURIComponent(coin.symbol), { signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json();
        if (!controller.signal.aborted && result.success === true && result.data) {
          setHolderSnapshot(result.data as CoinGeckoHolderSnapshot);
        }
      } catch {
        // Keep n/d. CoinGecko must never break HookChart or the Quant panel.
      } finally {
        if (!controller.signal.aborted) setHoldersLoading(false);
      }
    })();
    return () => controller.abort();
  }, [coin.symbol]);

  const holdersAvailable = holderSnapshot?.status === 'available' &&
    holderSnapshot.count !== null;
  const holderDistribution = holdersAvailable ? holderSnapshot?.distribution : null;
  const holderCountDisplay = holdersAvailable
    ? new Intl.NumberFormat('uk-UA').format(holderSnapshot!.count!) : 'н/д';
  const holderTop10Display = holderDistribution &&
    typeof holderDistribution.top_10 === 'number'
      ? holderDistribution.top_10.toFixed(2) + '%' : 'н/д';

  const fetchAnalysis = async () => {
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setLoading(true);
    setError(null);
    // Old ATR/market data must not be shown under another coin/timeframe.
    setData(null);
    try {
      const queryParams = new URLSearchParams({
        symbol: coin.symbol,
        exchange: coin.exchange,
        marketType: coin.marketType,
        timeframe: timeframe || coin.timeframe || '1h',
        price: String(coin.currentPrice),
      });

      const res = await fetch(`/api/market/smart-analysis?${queryParams.toString()}`, {
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(
        typeof json?.error === 'string' ? json.error : `HTTP ${res.status}`);
      if (!json) throw new Error('Сервер не повернув коректну відповідь розумного аналізу');
      if (controller.signal.aborted) return;
      if (json.success && json.data) {
        setData(json.data);
      } else {
        throw new Error(json.error || 'Failed to parse smart analysis');
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      console.error('Smart analysis error:', err);
      setError(err.message || 'Не вдалося завантажити розумний аналіз');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAnalysis();
    return () => analysisAbortRef.current?.abort();
  }, [coin.symbol, coin.exchange, coin.marketType, coin.timeframe, timeframe]);

  const collapseControl = onCollapse ? (
    <button
      type="button"
      onClick={onCollapse}
      aria-expanded={true}
      aria-label="Згорнути Розумний аналіз AI + Quant"
      title="Згорнути Розумний аналіз"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-500/40 bg-slate-900 text-slate-300 transition-colors hover:text-indigo-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
    >
      <ChevronUp className="h-4 w-4" />
    </button>
  ) : null;

  if (loading && !data) {
    return (
      <>
      {tradeSetup}
      <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-indigo-900/40 text-center space-y-3 animate-pulse">
        {onCollapse && <div className="mb-1 flex justify-end">{collapseControl}</div>}
        <div className="flex items-center justify-center gap-2 text-indigo-400">
          <Sparkles className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold uppercase tracking-wider">Генерація Розумного Аналізу...</span>
        </div>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Аналізуємо мультитаймфреймовий BTC (15m → 5m → 1m), стакан ордерів, зону POC, інституційний Open Interest та ATR волатильність. Entry, SL і TP беруться з виявленої формації.
        </p>
      </div>
      </>
    );
  }

  if (error && !data) {
    return (
      <>
      {tradeSetup}
      <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/40 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-300">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalysis}
            className="px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-900/60 text-white font-medium flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Спробувати знову
          </button>
          {collapseControl}
        </div>
        {holdersAvailable && (
          <div className="w-full rounded-md border border-slate-700/50 bg-slate-950/60 px-3 py-2 text-slate-300">
            <span className="font-semibold">CoinGecko · Holders: {holderCountDisplay}</span>
          </div>
        )}
      </div>
      </>
    );
  }

  if (!data) return <>{tradeSetup}</>;

  const visible = getSmartAnalysisVisibility(data, holderSnapshot);
  const availableModuleCount = Object.values(visible.modules).filter(Boolean).length;
  // The chosen tab can disappear after a refresh. Fall back to the overview
  // without mutating state during render or showing an empty selected panel.
  const selectedTab = selectVisibleTab(activeTab, visible.modules);
  const showModule = (module: SmartAnalysisModule) =>
    visible.modules[module] && (selectedTab === 'all' || selectedTab === module);
  const joinPresent = (...names: Array<string | false | null | undefined>) =>
    names.filter((name): name is string => typeof name === 'string').join(' / ');
  const tabs: Array<{ id: SmartAnalysisModule; label: string }> = [
    {
      id: 'btc',
      label: visible.btcTimeframes.length > 0
        ? 'Контекст BTC (15m → 5m → 1m)' : 'BTC/USDT',
    },
    {
      id: 'tech',
      label: visible.rsi && visible.emas && (visible.volume1h || visible.volume24h) && visible.spread
        ? "RSI, EMA, Об'єми та Спред"
        : joinPresent(visible.rsi && 'RSI', visible.emas && 'EMA',
          (visible.volume1h || visible.volume24h) && 'Об’єми',
          visible.spread && 'Спред', visible.dayRange && 'High/Low'),
    },
    {
      id: 'orderbook',
      label: (visible.bid || visible.ask || visible.imbalance) && visible.poc && visible.liquidityLevels
        ? 'Стакан, POC та Ліквідність'
        : joinPresent((visible.bid || visible.ask || visible.imbalance) && 'Стакан',
          visible.poc && 'POC', visible.liquidityLevels && 'Ліквідність',
          (visible.support || visible.resistance) && 'S/R'),
    },
    {
      id: 'derivatives',
      label: (visible.binanceOI || visible.bybitOI) && (visible.binanceFunding || visible.bybitFunding)
        ? 'Open Interest та Деривативи'
        : joinPresent((visible.binanceOI || visible.bybitOI || visible.totalOI) && 'Open Interest',
          (visible.binanceFunding || visible.bybitFunding) && 'Funding Rate'),
    },
    {
      id: 'institutional',
      label: visible.holders && visible.largeOrders && visible.marketMaker && visible.vulnerability
        ? 'Holders / Заявки / ММ / Ризики'
        : joinPresent(visible.holders && 'Holders', visible.largeOrders && 'Заявки',
          visible.marketMaker && 'Маркет-мейкер', visible.vulnerability && 'Ризики'),
    },
  ];

  const priceOrNA = (value: number | null) => value === null ? 'н/д' : formatCryptoPrice(value);
  const volumeOrNA = (value: number | null) => value === null ? 'н/д' : formatVolume(value);

  return (
    <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-indigo-500/30 shadow-xl shadow-indigo-950/20 space-y-5">
      {/* Header controls have their own grid column: no absolute overlay over the title on mobile. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-1 pb-3 border-b border-slate-800">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/20 text-indigo-400">
          <Zap className="h-4 w-4 fill-current" />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h4 className="min-w-0 text-[13px] sm:text-base font-bold text-white uppercase tracking-wider">
            РОЗУМНИЙ АНАЛІЗ
          </h4>
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono">
            AI + Quant
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={fetchAnalysis}
            disabled={loading}
            aria-label="Оновити розрахунок"
            title="Оновити розрахунок"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {collapseControl}
        </div>
        <p className="col-span-3 min-w-0 text-[11px] leading-relaxed text-slate-400 sm:col-start-2 sm:col-span-1">
          Автоматичні кількісні розрахунки з біржових даних, не генеративний AI. Відображаються тільки показники, для яких є доступні дані.
        </p>
      </div>

      <p className="text-[10px] text-slate-500">
        Біржові дані: {data.exchange} · {data.marketType}.
        {(visible.bid || visible.ask || visible.imbalance) && <> Стакан: {data.orderbook.source}.</>}
        {' '}Оновлено: {new Date(data.lastUpdated).toLocaleTimeString('uk-UA')}.
        {' '}Свічкові рівні — оцінки, не підтверджені стоп-ордери.
      </p>
      {/* Replace ONLY the two upper ratings with the detected formation. */}
      {/* Canonical detected setup: includes real formation Entry/TP/SL and Telegram alerts. */}
      {tradeSetup}

      {/* Only ATR remains from the former independent quantitative trade plan. */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2 text-slate-300 font-semibold">
            <Activity className="w-4 h-4 text-cyan-400" />
            ATR (14) / Волатильність
          </span>
          <span className="font-mono text-slate-200">
            {data.volatility.atr} · {data.volatility.atrPct}% від ціни
          </span>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Волатильність — окремий показник, не альтернативні рівні Entry, SL або TP.
        </p>
      </div>

      {/* Summaries are only rendered for verified data. An unavailable maker,
          missing CoinGecko asset or empty orderbook leaves no placeholder card. */}
      {(visible.holders || visible.largeOrders || visible.marketMaker || visible.vulnerability) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {visible.holders && (
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
              <span className="flex items-center gap-1.5 text-slate-400"><Wallet className="w-3.5 h-3.5" /> Аналіз Holders</span>
              <strong className="block text-white font-mono">{holderCountDisplay}</strong>
              <p className="text-slate-400 text-[10px]">Адреси-власники · CoinGecko · {holderSnapshot?.network}</p>
            </div>
          )}
          {visible.largeOrders && (
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
              <span className="flex items-center gap-1.5 text-slate-400"><Eye className="w-3.5 h-3.5" /> Великі заявки</span>
              <strong className="block text-white font-mono">{formatVolume(data.participants.largePlayer.clusterVolumeUsd!)}</strong>
              <p className="text-slate-400 text-[10px]">Лімітні заявки, не угоди китів</p>
            </div>
          )}
          {visible.marketMaker && (
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
              <span className="flex items-center gap-1.5 text-slate-400"><Radio className="w-3.5 h-3.5" /> Маркет-мейкер</span>
              <strong className="block text-white">{data.participants.marketMaker.activityLabel}</strong>
            </div>
          )}
          {visible.vulnerability && (
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
              <span className="flex items-center gap-1.5 text-slate-400"><ShieldAlert className="w-3.5 h-3.5" /> Вразливість ринку</span>
              <strong className="block text-white font-mono">{data.participants.manipulativeCoin.riskScore}/100</strong>
              <p className="text-slate-400 text-[10px]">Евристика, не доказ маніпуляцій</p>
            </div>
          )}
        </div>
      )}

      {/* Never offer an empty tab. A single remaining module is shown directly. */}
      {availableModuleCount > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 border-b border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
              selectedTab === 'all' ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Усі модулі (Повний огляд)
          </button>
          {tabs.filter(tab => visible.modules[tab.id]).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedTab === tab.id ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.id === 'institutional' && <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{tab.label}</span>
              {tab.id === 'btc' && data.btcContext.hasSharpImpulse && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Module 1: BTC Context (15m -> 5m -> 1m) */}
      {showModule('btc') && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                Контекст BTC (Binance Futures) на 15m → 5m → 1m
              </h5>
            </div>
            {(visible.btcPrice || visible.btcChange) && (
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">BTC/USDT:</span>
                {visible.btcPrice && <span className="font-bold text-white">{'$' + priceOrNA(data.btcContext.btcPrice)}</span>}
                {visible.btcChange && (
                  <span className="font-bold text-slate-200">
                    {(data.btcContext.change24h! >= 0 ? '+' : '') + data.btcContext.change24h!.toFixed(2) + '%'}
                  </span>
                )}
              </div>
            )}
            {visible.btcPrice && data.btcContext.priceSource === 'closed_1m_candle' && (
              <p className="text-[10px] text-slate-500">
                Ціна: закриття останньої підтвердженої 1m свічки; не live-котирування.
              </p>
            )}
          </div>

          {/* Sharp impulse alert banner if active */}
          {data.btcContext.hasSharpImpulse && (
            <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/50 flex items-center gap-2 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
              <span>
                <strong>Увага!</strong> {data.btcContext.impulseDescription}
              </span>
            </div>
          )}

          {/* Timeframe Cards */}
          {visible.btcTimeframes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {visible.btcTimeframes.map((tf) => {
              const item = data.btcContext.timeframes[tf];
              const isUp = item.direction === 'up';
              const unknown = item.structure === 'unknown';
              const isHH = item.structure === 'HH_HL';
              const isLL = item.structure === 'LH_LL';

              return (
                <div
                  key={tf}
                  className={`p-3 rounded-lg border flex flex-col justify-between space-y-2 ${
                    isHH
                      ? 'bg-emerald-950/20 border-emerald-800/40'
                      : isLL
                      ? 'bg-rose-950/20 border-rose-800/40'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-cyan-300">BTC {tf}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase font-mono ${
                        isHH
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : isLL
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-slate-700/40 text-slate-300'
                      }`}
                    >
                      {unknown ? 'н/д' : item.structure}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {unknown ? null : isUp ? (
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    ) : item.direction === 'down' ? (
                      <TrendingDown className="w-4 h-4 text-rose-400" />
                    ) : null}
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {item.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          )}

          {/* Render only confirmed contextual signals, never an empty calendar. */}
          {(visible.btcOverall || visible.btcNews) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 text-xs">
            {visible.btcOverall && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1 font-medium">Загальна структура BTC:</span>
              <p className="text-slate-200 font-medium leading-relaxed">
                {data.btcContext.overallStructureLabel}
              </p>
            </div>
            )}

            {visible.btcNews && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-amber-400 flex items-center gap-1 mb-1 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                Календар подій (лише підтверджені дані):
              </span>
              <div className="space-y-1">
                {data.btcContext.upcomingNews.map((news, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] text-slate-300">
                    <span className="truncate mr-2">• {news.title}</span>
                    <span className="font-mono text-amber-300 shrink-0">{news.timeUntil}</span>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Module 2: Technicals (RSI, EMA, Volume Spike, Spread, Range) */}
      {showModule('tech') && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-400" />
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">
              Тренд на основі RSI, Ковзних Середніх та Волатильності
            </h5>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {/* RSI */}
            {visible.rsi && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span>RSI (14)</span>
                <span className="font-mono font-bold text-white">{data.trend.rsi14}</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    data.trend.rsi14 > 70
                      ? 'bg-rose-500'
                      : data.trend.rsi14 < 30
                      ? 'bg-emerald-500'
                      : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.min(data.trend.rsi14, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-300 block">{data.trend.rsiLabel}</span>
            </div>
            )}

            {/* EMA Cross & Status */}
            {visible.emas && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
              <span className="text-slate-400 block">Сигнал ковзних середніх</span>
              <span className="font-bold text-white block truncate">{visible.ema200 ? data.trend.crossSignalLabel : 'Ковзні середні EMA20 / EMA50'}</span>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                <span>EMA20: {data.trend.ema20}</span>
                <span>•</span>
                <span>EMA50: {data.trend.ema50}</span>
                {visible.ema200 && <><span>•</span><span>EMA200: {data.trend.ema200}</span></>}
              </div>
            </div>
            )}

            {/* 1h Volume & Spike */}
            {(visible.volume1h || visible.volume24h) && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400">
                <span>{visible.volume1h ? 'Обсяг останньої закритої 1h свічки (≈ USD)' : 'Обсяг 24 закритих 1h свічок (≈ USD)'}</span>
                {data.volumeMetrics.hasVolumeSpike && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                    СПЛЕСК x{data.volumeMetrics.volume1hSpikeRatio}
                  </span>
                )}
              </div>
              {visible.volume1h && <span className="font-bold text-white text-sm font-mono block">
                {formatVolume(data.volumeMetrics.volume1hUsd!)}
              </span>}
              {visible.volume24h && <span className="text-[10px] text-slate-400 block font-sans">
                Обсяг 24 закритих 1h свічок (≈ USD): {formatVolume(data.volumeMetrics.volume24hUsd!)}
              </span>}
            </div>
            )}

            {/* Spread & Quality */}
            {visible.spread && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
              <span className="text-slate-400 block">Поточний Спред (Spread)</span>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-white text-sm font-mono">
                  {data.spread.spreadPct}%
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {data.spread.spreadUsd !== null && '($' + data.spread.spreadUsd + ')'}
                </span>
              </div>
              <span className="text-[10px] text-emerald-400 block font-medium">
                {data.spread.quality === 'ultra_tight'
                  ? 'Ультра-вузький (найвища ліквідність)'
                  : data.spread.quality === 'normal'
                  ? 'Звичайний робочий спред'
                  : 'Широкий спред (ризик прослизання)'}
              </span>
            </div>
            )}
          </div>

          {/* Position in Day Range */}
          {visible.dayRange && (
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-medium">
                Де знаходиться ціна відносно денного High/Low:
              </span>
              <span className="font-mono font-bold text-cyan-400">
                {data.volatility.positionInDayRangePct}% від мінімуму 24 закритих 1h
              </span>
            </div>

            <div className="w-full bg-slate-800 h-2.5 rounded-full relative overflow-hidden flex">
              <div
                className="bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 h-full rounded-full"
                style={{ width: `${data.volatility.positionInDayRangePct ?? 0}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>24h Low: {'$' + priceOrNA(data.volatility.low24h)}</span>
              <span>24h High: {'$' + priceOrNA(data.volatility.high24h)}</span>
            </div>
          </div>
          )}
        </div>
      )}

      {/* Module 3: Orderbook, POC & Liquidity Pools */}
      {showModule('orderbook') && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                Стакан ордерів, Зона POC та Рівні Ліквідності
              </h5>
            </div>
            {visible.imbalance && <span className="text-xs text-slate-400 font-mono">
              Стакан {data.orderbook.source}: Bid/Ask = <strong className="text-white">{data.orderbook.bidAskRatio}</strong>
            </span>}
          </div>

          {/* Orderbook Walls & POC */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs font-mono">
            {/* Long Wall (Bid) */}
            {visible.bid && (
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-1">
              <span className="text-[10px] text-emerald-400 font-sans block font-semibold">
                Найбільша стіна в лонг (Bid Wall):
              </span>
              <div className="text-sm font-bold text-white">
                {priceOrNA(data.orderbook.bidWallPrice)}
              </div>
              <div className="text-[11px] text-emerald-300">
                Обсяг заявки: {formatVolume(data.orderbook.bidWallUsd!)}
              </div>
            </div>
            )}

            {/* POC Zone */}
            {visible.poc && (
            <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-800/40 space-y-1">
              <span className="text-[10px] text-indigo-300 font-sans block font-semibold">
                Оціночний POC за свічками · 24 закриті 1h (не профіль угод):
              </span>
              <div className="text-sm font-bold text-white">
                {priceOrNA(data.levels.pocPrice)}
              </div>
              <div className="text-[11px] text-indigo-300">
                {data.levels.pocVolumePct !== null && 'Частка обсягу в ціновому кошику: ' + data.levels.pocVolumePct + '%'}
              </div>
            </div>
            )}

            {/* Short Wall (Ask) */}
            {visible.ask && (
            <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-800/40 space-y-1">
              <span className="text-[10px] text-rose-400 font-sans block font-semibold">
                Найбільша стіна в шорт (Ask Wall):
              </span>
              <div className="text-sm font-bold text-white">
                {priceOrNA(data.orderbook.askWallPrice)}
              </div>
              <div className="text-[11px] text-rose-300">
                Обсяг заявки: {formatVolume(data.orderbook.askWallUsd!)}
              </div>
            </div>
            )}
          </div>

          {/* Detected Large Orders List */}
          {data.orderbook.largeOrders.length > 0 && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5 text-xs">
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                Великі лімітні заявки поточного стакана (не виконані угоди):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {data.orderbook.largeOrders.slice(0, 4).map((order, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded border flex items-center justify-between text-xs font-mono ${
                      order.side === 'bid'
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                        : 'bg-rose-950/20 border-rose-800/40 text-rose-300'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] uppercase font-bold block">
                        {order.side === 'bid' ? 'КУПІВЛЯ (BID)' : 'ПРОДАЖ (ASK)'}
                      </span>
                      <span className="font-bold text-white">
                        {formatCryptoPrice(order.price)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold block">{formatVolume(order.amountUsd)}</span>
                      <span className="text-[9px] text-slate-400">{order.distancePct}% від найкращої {order.side === 'bid' ? 'Bid' : 'Ask'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liquidity Levels & S/R */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {visible.liquidityLevels && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-semibold text-slate-300 block mb-1.5">
                Розрахункові цінові орієнтири (не підтверджені стоп-ордери):
              </span>
              <div className="space-y-1 font-mono text-[11px]">
                {data.levels.liquidityLevels.filter(liq => Number.isFinite(liq.price) && liq.price > 0).map((liq, i) => (
                  <div key={i} className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400 truncate mr-2">{liq.label}</span>
                    <span className="text-white font-bold">{formatCryptoPrice(liq.price)}</span>
                  </div>
                ))}
              </div>
            </div>
            )}

            {(visible.support || visible.resistance) && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="font-semibold text-slate-300 block mb-1.5">
                Оціночні рівні Support / Resistance (екстремуми 15 закритих свічок з відступом 0,4%):
              </span>
              <div className="space-y-1.5 font-mono text-[11px]">
                {visible.support && <div className="flex items-center justify-between">
                  <span className="text-emerald-400">Орієнтовна підтримка:</span>
                  <span className="text-white font-bold">{formatCryptoPrice(data.levels.strongSupport)}</span>
                </div>}
                {visible.resistance && <div className="flex items-center justify-between">
                  <span className="text-rose-400">Орієнтовний опір:</span>
                  <span className="text-white font-bold">{formatCryptoPrice(data.levels.strongResistance)}</span>
                </div>}
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* Module 4: Show only exchanges with verified OI/funding measurements. */}
      {showModule('derivatives') && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">
              Деривативи, Open Interest та Funding Rate
            </h5>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
            {([
              { label: 'Binance Futures', info: data.derivatives.binanceOI, color: 'bg-cyan-500/60', visible: visible.binanceOI },
              { label: 'Bybit Linear', info: data.derivatives.bybitOI, color: 'bg-indigo-500/60', visible: visible.bybitOI },
            ]).filter(source => source.visible).map(source => (
              <div key={source.label} className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-400 font-sans gap-2">
                  <span>OI {source.label}</span>
                  {source.info.change1hPct !== null && Number.isFinite(source.info.change1hPct) && (
                    <span className="text-[10px]">
                      {source.info.change1hPct > 0 ? '+' : ''}{source.info.change1hPct}% (1h)
                    </span>
                  )}
                </div>
                <div className="text-base font-bold text-white">{formatVolume(source.info.currentUsd!)}</div>
                {source.info.history.length >= 3 && (
                  <div className="flex items-end gap-1 h-6 pt-1" title="Реальна історія OI, лише послідовні свічки">
                    {source.info.history.filter(Number.isFinite).map((value, index) => {
                      const history = source.info.history.filter(Number.isFinite);
                      const low = Math.min(...history);
                      const high = Math.max(...history);
                      const heightPct = high > low ? Math.max(((value - low) / (high - low)) * 100, 15) : 50;
                      return <div key={index} className={`flex-1 rounded-t ${source.color}`}
                        style={{ height: `${heightPct}%` }} title={formatVolume(value)} />;
                    })}
                  </div>
                )}
              </div>
            ))}
            {(visible.binanceFunding || visible.bybitFunding) && (
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
                <span className="text-slate-400 font-sans block">Funding Rate · Binance / Bybit</span>
                {visible.binanceFunding && (
                  <div className="flex justify-between gap-2 text-[11px]">
                    <span className="text-slate-400">Binance Futures</span>
                    <strong className="font-mono text-white">
                      {data.derivatives.fundingRate! > 0 ? '+' : ''}{data.derivatives.fundingRate}%
                    </strong>
                  </div>
                )}
                {visible.bybitFunding && (
                  <div className="flex justify-between gap-2 text-[11px]">
                    <span className="text-slate-400">Bybit Linear</span>
                    <strong className="font-mono text-white">
                      {data.derivatives.predictedFundingRate! > 0 ? '+' : ''}{data.derivatives.predictedFundingRate}%
                    </strong>
                  </div>
                )}
              </div>
            )}
            {visible.totalOI && (
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
                <span className="text-slate-400 font-sans block">
                  {data.derivatives.oiCoverage === 'partial' ? 'OI доступної біржі' : 'Сумарний OI'}
                </span>
                <strong className="text-base font-bold text-white">
                  {formatVolume(data.derivatives.totalOIUsd!)}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Only verified, available institutions-related indicators are shown. */}
      {showModule('institutional') && (
        <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-900/40 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Fingerprint className="w-4 h-4 text-cyan-400" />
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">
              Ончейн-дані, великі заявки та ринкова вразливість
            </h5>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 text-xs">
            {visible.holders && (
              <section className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <h6 className="flex items-center gap-2 font-bold text-white">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  Аналіз Holders & Розподіл Гаманців
                </h6>
                <dl className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <dt className="text-slate-400">Кількість адрес-власників</dt>
                    <dd className="font-mono font-semibold text-white">{holderCountDisplay}</dd>
                  </div>
                  {visible.holderConcentration && (
                    <div>
                      <dt className="text-slate-400">Частка токенів у топ-10% адрес</dt>
                      <dd className="font-mono font-semibold text-white">{holderTop10Display}</dd>
                    </div>
                  )}
                </dl>
                {holderDistribution && (
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {(['11_20', '21_40', '11_30', '31_50', 'rest'] as const).map(key =>
                      typeof holderDistribution[key] === 'number' && Number.isFinite(holderDistribution[key]) ? (
                        <div key={key} className="flex justify-between gap-2 rounded bg-slate-950/70 px-2 py-1">
                          <span className="text-slate-400">{key === 'rest' ? 'Решта' : key.replace('_', '–')}</span>
                          <span className="font-mono text-white">{holderDistribution[key].toFixed(2)}%</span>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
                <div className="space-y-1 text-[10px] text-slate-500">
                  {holderSnapshot?.network && holderSnapshot?.contractAddress && (
                    <p>Мережа: {holderSnapshot.network} · Контракт: {holderSnapshot.contractAddress.slice(0, 10)}…{holderSnapshot.contractAddress.slice(-5)}</p>
                  )}
                  {holderSnapshot?.lastUpdated && (
                    <p>CoinGecko: {new Date(holderSnapshot.lastUpdated).toLocaleString('uk-UA')}</p>
                  )}
                  <p>Власники — це адреси, а не окремі люди. Біржі й контракти можуть володіти великими частками.</p>
                </div>
                <a href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer"
                  className="inline-flex text-[11px] text-cyan-300 underline underline-offset-2">
                  Джерело: CoinGecko
                </a>
              </section>
            )}

            {visible.largeOrders && (
              <section className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <h6 className="flex items-center gap-2 font-bold text-white">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  Великі лімітні заявки
                </h6>
                {data.participants.largePlayer.clusterVolumeUsd !== null && (
                  <p className="text-[11px] text-slate-400">
                    Обсяг у поточному знімку: <strong className="text-white">
                      {formatVolume(data.participants.largePlayer.clusterVolumeUsd)}
                    </strong>
                  </p>
                )}
                <div className="space-y-1.5">
                  {data.participants.largePlayer.trackedClusters
                    .filter(cluster => Number.isFinite(cluster.price) && cluster.price > 0 &&
                      Number.isFinite(cluster.volumeUsd) && cluster.volumeUsd > 0)
                    .map((cluster, index) => (
                      <div key={index} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-950/70 border border-slate-800 px-2 py-1.5 text-[11px]">
                        <span className="text-slate-300">
                          {cluster.side === 'buy' ? 'BID' : 'ASK'} · {formatCryptoPrice(cluster.price)}
                        </span>
                        <strong className="font-mono text-white">{formatVolume(cluster.volumeUsd)}</strong>
                      </div>
                    ))}
                </div>
                <p className="text-slate-400 text-[11px]">Це лімітні заявки у стакані, не підтверджені виконані угоди.</p>
              </section>
            )}

            {visible.marketMaker && (
              <section className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <h6 className="flex items-center gap-2 font-bold text-white">
                  <Radio className="w-4 h-4 text-indigo-400" />
                  Маркет-мейкер
                </h6>
                <p className="text-white text-[11px]">{data.participants.marketMaker.activityLabel}</p>
                {visible.spread && (
                  <p className="text-slate-300 text-[11px]">
                    Підтверджений спред: <strong className="text-white">{data.spread.spreadPct}%</strong>
                  </p>
                )}
              </section>
            )}

            {visible.vulnerability && (
              <section className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <h6 className="flex items-center gap-2 font-bold text-white">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Евристичний індекс ринкової вразливості
                </h6>
                <p className="font-mono text-lg font-bold text-white">
                  {data.participants.manipulativeCoin.riskScore} / 100
                </p>
                <div className="space-y-1.5">
                  {data.participants.manipulativeCoin.signals
                    .filter(sig => sig.detected !== null)
                    .map((sig, index) => (
                      <div key={index} className="flex items-start gap-2 rounded bg-slate-950/70 border border-slate-800 p-2 text-[11px]">
                        {sig.detected === true
                          ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          : <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-cyan-400" />}
                        <div>
                          <span className="font-semibold text-white">{sig.name}</span>
                          <p className="text-slate-400">{sig.description}</p>
                        </div>
                      </div>
                    ))}
                </div>
                <p className="text-amber-200 text-[11px]">
                  {data.participants.manipulativeCoin.warningSummary}
                </p>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
