import React, { useState, useEffect, useId, useRef } from 'react';
import { Sparkles, RefreshCw, Zap, AlertTriangle, ChevronDown } from 'lucide-react';
import { SmartAnalysisData, ScannedCoin, DetectedFormation, Kline } from '../types';
import { formatCryptoPrice, formatVolume } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';
import { useAuth } from '../context/AuthContext';

interface SmartAnalysisBlockProps {
  coin: ScannedCoin;
  formation?: DetectedFormation | null;
  klines?: Kline[];
}

export const SmartAnalysisBlock: React.FC<SmartAnalysisBlockProps> = ({
  coin,
  formation,
  klines,
}) => {
  const { language } = useLanguage();
  const tr = (value: string) => translatePhrase(language, value);
  const { user, profile, updateProfileData } = useAuth();
  const uid = user?.uid;
  const savedCollapsed = !(uid && profile?.uid === uid && profile.smartAnalysisCollapsed === false);
  const [viewState, setViewState] = useState({ uid, collapsed: savedCollapsed });
  const [saveState, setSaveState] = useState({ uid, pending: false, failed: false });
  const isCollapsed = viewState.uid === uid ? viewState.collapsed : savedCollapsed;
  const isSaving = saveState.uid === uid && saveState.pending;
  const saveFailed = saveState.uid === uid && saveState.failed;
  const contentId = useId();

  useEffect(() => {
    setViewState({ uid, collapsed: savedCollapsed });
  }, [uid, savedCollapsed]);

  const toggleCollapsed = async () => {
    if (isSaving) return;
    const previous = isCollapsed;
    const collapsed = !previous;
    setViewState({ uid, collapsed });
    setSaveState({ uid, pending: Boolean(uid), failed: false });
    if (!uid) return;
    try {
      await updateProfileData({ smartAnalysisCollapsed: collapsed });
      setSaveState({ uid, pending: false, failed: false });
    } catch {
      setViewState({ uid, collapsed: previous });
      setSaveState({ uid, pending: false, failed: true });
    }
  };

  const [data, setData] = useState<SmartAnalysisData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'btc' | 'tech' | 'orderbook' | 'derivatives' | 'institutional'>('all');
  const request = useRef<AbortController | null>(null);

  const fetchAnalysis = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        schema: '2',
        symbol: coin.symbol,
        exchange: coin.exchange,
        marketType: coin.marketType,
        timeframe: coin.timeframe || '1h',
      });

      const res = await fetch(`/api/market/smart-analysis?${queryParams.toString()}`, { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (controller.signal.aborted) return;
      if (json.success && json.data) {
        setData(json.data);
      } else {
        throw new Error(json.error || 'Failed to parse smart analysis');
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setData(null);
      setError(err.message || tr('Не вдалося завантажити розумний аналіз'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (!isCollapsed) void fetchAnalysis();
    return () => request.current?.abort();
  }, [coin.symbol, coin.exchange, coin.marketType, coin.timeframe, isCollapsed, uid]);

  const renderBlock = (content: React.ReactNode = null) => (
    <div className={'smart-analysis-block p-4 sm:p-6 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-indigo-500/30 shadow-xl shadow-indigo-950/20' + (isCollapsed ? '' : ' space-y-5')}>
      <div className={'flex flex-wrap items-center justify-between gap-3' + (isCollapsed ? '' : ' pb-3 border-b border-slate-800')}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="w-8 h-8 shrink-0 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Zap className="w-4 h-4 fill-current" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 id={contentId + '-heading'} className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">{tr('РОЗУМНИЙ АНАЛІЗ')}</h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono">Біржові дані</span>
            </div>
            {!isCollapsed && <p className="text-[11px] text-slate-400">{tr('Технічний аналіз, справжній стакан і підтверджені дані деривативів')}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {!isCollapsed && <button
            type="button"
            onClick={fetchAnalysis}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            title={tr('Оновити розрахунок')}
            aria-label={tr('Оновити розрахунок')}
          >
            <RefreshCw className={'w-3.5 h-3.5' + (loading ? ' animate-spin' : '')} />
          </button>}
          <button
            type="button"
            onClick={() => void toggleCollapsed()}
            aria-expanded={!isCollapsed}
            aria-controls={contentId}
            aria-disabled={isSaving}
            aria-label={tr(isCollapsed ? 'Розгорнути' : 'Згорнути') + ': ' + tr('РОЗУМНИЙ АНАЛІЗ')}
            title={tr(isCollapsed ? 'Розгорнути' : 'Згорнути')}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer aria-disabled:opacity-50"
          >
            <ChevronDown className={'w-4 h-4 transition-transform' + (isCollapsed ? '' : ' rotate-180')} />
          </button>
        </div>
      </div>
      {saveFailed && <p role="alert" className="mt-3 text-xs text-rose-300">{tr('Не вдалося зберегти стан аналізу. Спробуйте ще раз.')}</p>}
      <div id={contentId} hidden={isCollapsed} aria-labelledby={contentId + '-heading'} className="space-y-5">{content}</div>
    </div>
  );

  if (isCollapsed) return renderBlock();

  if (loading && !data) {
    return renderBlock(
      <div role="status" className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-indigo-900/40 text-center space-y-3 animate-pulse">
        <div className="flex items-center justify-center gap-2 text-indigo-400">
          <Sparkles className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold uppercase tracking-wider">{tr("Генерація Розумного Аналізу...")}</span>
        </div>
        <p className="text-xs text-slate-400 max-w-md mx-auto">{tr("Аналізуємо мультитаймфреймовий BTC (15m → 5m → 1m), стакан ордерів, зону POC, інституційний Open Interest та розраховуємо оптимальні рівні SL/TP...")}</p>
      </div>
    );
  }

  if (error) {
    return renderBlock(
      <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/40 flex items-center justify-between text-xs text-rose-300">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
        <button
          onClick={fetchAnalysis}
          className="px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-900/60 text-white font-medium flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />{tr("Спробувати знову")}</button>
      </div>
    );
  }

  if (!data) return renderBlock();

  const number = (value: number | null, suffix = '') => value === null ? '—' : new Intl.NumberFormat(language, { maximumFractionDigits: 4 }).format(value) + suffix;
  const price = (value: number | null) => value === null ? '—' : formatCryptoPrice(value);
  const volume = (value: number | null) => value === null ? '—' : formatVolume(value);
  const visible = (tab: typeof activeTab) => activeTab === 'all' || activeTab === tab;
  const metric = (label: string, value: React.ReactNode) => <div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><p className="text-xs text-slate-400">{tr(label)}</p><p className="mt-1 break-words font-mono text-sm text-white">{value}</p></div>;
  const section = (title: string, children: React.ReactNode) => <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4"><h5 className="text-sm font-semibold text-white">{tr(title)}</h5>{children}</section>;
  const oiCard = (label: string, oi: SmartAnalysisData['derivatives']['binanceOI']) => <div className="space-y-2 rounded-lg bg-slate-900 p-3 text-xs">
    <h6 className="font-semibold text-slate-200">{label}</h6>
    {oi ? <><p className="font-mono text-base text-white">{volume(oi.currentUsd)}</p><p className="text-slate-400">{tr('Зміна за годину')}: {number(oi.change1hPct, '%')}</p>
      {oi.history.length > 1 ? <div className="flex h-10 items-end gap-1" aria-label={label + ' — історія з біржі'}>{oi.history.map((value, index) => <div key={index} className="min-w-0 flex-1 rounded-t bg-cyan-500/70" title={volume(value)} style={{ height: `${10 + 90 * (value - Math.min(...oi.history)) / (Math.max(...oi.history) - Math.min(...oi.history) || 1)}%` }} />)}</div>
      : <p className="text-slate-400">{tr('Історія недоступна')}</p>}</> : <p className="text-slate-400">{tr('Дані недоступні для цього інструмента')}</p>}
  </div>;
  return renderBlock(<>
    <div className="space-y-2 rounded-xl border border-indigo-800/50 bg-slate-950 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h5 className="font-semibold text-white">{data.symbol} · {data.exchange.toUpperCase()} · {data.marketType}</h5><span className="text-xs text-slate-400">{new Date(data.lastUpdated).toLocaleString(language)}</span></div>
      <p className="text-lg font-semibold text-cyan-200">{tr(data.verdictLabel)} · {number(data.score)}/10</p>
      <p className="text-xs leading-relaxed text-slate-400">{tr(data.summary)}</p>
      {data.unavailable.length > 0 && <p role="status" className="text-xs text-amber-300">{tr('Доступні не всі джерела')}: {data.unavailable.join(', ')}. {tr('Недоступні значення не замінюються розрахунковими.')}</p>}
    </div>
    <nav aria-label="Модулі аналізу" className="flex flex-wrap gap-2 text-xs">{([
      ['all', 'Усі'], ['tech', 'Технічні показники'], ['btc', 'Контекст BTC'], ['orderbook', 'Стакан'], ['derivatives', 'OI і фандинг'], ['institutional', 'Джерела даних'],
    ] as const).map(([tab, label]) => <button key={tab} onClick={() => setActiveTab(tab)} aria-pressed={activeTab === tab} className={`rounded-lg border px-3 py-2 ${activeTab === tab ? 'border-cyan-700 bg-cyan-950 text-cyan-200' : 'border-slate-700 text-slate-300'}`}>{tr(label)}</button>)}</nav>
    {visible('tech') && section('Технічні показники за біржовими свічками', <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{metric('Ціна', price(data.currentPrice))}{metric('RSI 14', number(data.trend.rsi14))}{metric('EMA 20', price(data.trend.ema20))}{metric('EMA 50', price(data.trend.ema50))}{metric('EMA 200', price(data.trend.ema200))}{metric('ATR 14', price(data.trend.atr))}{metric('Обсяг за 24 години', volume(data.volumeMetrics.volume24hUsd))}{metric('Зміна за 24 години', number(data.volumeMetrics.change24h, '%'))}{metric('Оцінка POC за свічками', price(data.levels.pocEstimate))}{metric('Підтримка за 30 свічками', price(data.levels.support))}{metric('Опір за 30 свічками', price(data.levels.resistance))}</div>
      <p className="text-xs text-slate-400">{tr('EMA 200 показується лише за наявності щонайменше 200 свічок. Оцінка POC за OHLCV не є точним профілем усіх угод.')}</p>
      <h6 className="text-xs font-semibold text-slate-200">{tr('Розрахунковий сценарій ATR')} · {data.tradeScenario.direction.toUpperCase()}</h6>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{metric('Вхід', price(data.tradeScenario.entry))}{metric('Стоп', price(data.tradeScenario.stopLoss))}{metric('Ціль 1', price(data.tradeScenario.tp1))}{metric('Ціль 2', price(data.tradeScenario.tp2))}</div>
    </>)}
    {visible('btc') && section('Контекст BTC', data.btcContext ? <>
      <div className="grid grid-cols-2 gap-2">{metric('Ціна BTC', price(data.btcContext.price))}{metric('Зміна за 24 години', number(data.btcContext.change24h, '%'))}</div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-300">{data.btcContext.timeframes.map(item => <span key={item.timeframe}>{item.timeframe}: {tr(item.direction === 'up' ? 'Зростання' : item.direction === 'down' ? 'Зниження' : 'Боковий рух')}</span>)}</div>
    </> : <p className="text-xs text-slate-400">{tr('Джерело BTC тимчасово недоступне')}</p>)}
    {visible('orderbook') && section('Агреговані рівні стакана', data.orderbook ? <>
      <div className="grid grid-cols-2 gap-2">{metric('Найкращий Bid', price(data.orderbook.bestBid))}{metric('Найкращий Ask', price(data.orderbook.bestAsk))}{metric('Спред', number(data.orderbook.spreadPct, '%'))}{metric('Співвідношення Bid/Ask', number(data.orderbook.bidAskRatio))}{metric('Найбільший рівень Bid', `${price(data.orderbook.bidWallPrice)} · ${volume(data.orderbook.bidWallUsd)}`)}{metric('Найбільший рівень Ask', `${price(data.orderbook.askWallPrice)} · ${volume(data.orderbook.askWallUsd)}`)}</div>
      <p className="text-xs text-slate-400">{tr('Показано агреговані рівні ціни. Особу учасника та його приховані ордери ці дані не розкривають.')}</p>
    </> : <p className="text-xs text-slate-400">{tr('Підтверджений стакан тимчасово недоступний')}</p>)}
    {visible('derivatives') && section('Відкритий інтерес і поточний фандинг', <>
      <div className="grid gap-3 sm:grid-cols-2">{oiCard('OI Binance Futures', data.derivatives.binanceOI)}{oiCard('OI Bybit Linear', data.derivatives.bybitOI)}{metric('Поточний фандинг Binance', number(data.derivatives.binanceFundingRate, '%'))}{metric('Поточний фандинг Bybit', number(data.derivatives.bybitFundingRate, '%'))}</div>
      <p className="text-xs text-slate-400">{tr('Історія OI походить із біржі. Пропуски та недоступні зміни показуються без симуляції.')}</p>
    </>)}
    {visible('institutional') && section('Джерела й межі аналізу', <p className="text-xs leading-relaxed text-slate-400">{tr('RSI, EMA, ATR і сценарій розраховані зі свічок. Стакан, OI та фандинг отримуються з публічних API. Дані гаманців, склад власників, особи великих учасників, приховані ордери та новинний календар не підключені й не імітуються.')}</p>)}
  </>);
};
