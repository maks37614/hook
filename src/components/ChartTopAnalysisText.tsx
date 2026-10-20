import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { ScannedCoin, DetectedFormation, Kline, Timeframe } from '../types';
import { formatCryptoPrice as formatKnownPrice } from '../utils/formatters';
const formatCryptoPrice = (value: number) => Number.isFinite(value) && value > 0 ? formatKnownPrice(value) : '—';
const percentage = (value: number) => Number.isFinite(value) ? value.toFixed(2) : '—';
import { useChartProvider } from '../utils/useChartProvider';

interface ChartTopAnalysisTextProps {
  coin: ScannedCoin;
  formation?: DetectedFormation | null;
  klines: Kline[];
  livePrice: number;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  hookchartLevelControlsTargetId?: string;
  onExpandFormationPanel?: () => void;
  expandFormationButtonRef?: React.Ref<HTMLButtonElement>;
  isFormationPanelSaving?: boolean;
  expandFormationLabel?: string;
}

interface OpenInterestData {
  valueUsd: number;
  amountCoins: number;
  change5mPct: number | null;
  lastUpdated: number;
}

function formatOI(val: number): string {
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function getCandidateSymbols(symbol: string, baseAsset?: string): string[] {
  let clean = (symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[-_:](SWAP|PERP|USDT|USDC)$/i, '')
    .replace(/[-_:\/]/g, '')
    .replace(/(SWAP|PERP)$/i, '');

  if (clean.endsWith('USDT')) {
    clean = clean.replace(/USDT$/, '');
  } else if (clean.endsWith('USDC')) {
    clean = clean.replace(/USDC$/, '');
  }

  let core = (baseAsset || clean)
    .toUpperCase()
    .replace(/[-_:\/]/g, '')
    .replace(/(USDT|USDC|BUSD|PERP|SWAP)$/i, '')
    .replace(/^(10000000|1000000|100000|10000|1000|1M|K)/i, '')
    .replace(/(10000000|1000000|100000|10000|1000|1M|K)$/i, '');

  if (core.endsWith('CTO')) {
    core = core.replace(/CTO$/, '');
  }

  const list: string[] = [
    `${clean}USDT`,
    `${core}USDT`,
    `1000${core}USDT`,
    `10000${core}USDT`,
    `1000000${core}USDT`,
    `1M${core}USDT`,
    `${core}1000USDT`,
    `1000${core}CTOUSDT`,
    `${clean}USDC`,
    `${core}USDC`,
    clean,
    core,
  ];

  return Array.from(new Set(list));
}

export const ChartTopAnalysisText: React.FC<ChartTopAnalysisTextProps> = ({
  coin,
  formation,
  klines,
  livePrice,
  timeframe,
  onTimeframeChange,
  hookchartLevelControlsTargetId,
  onExpandFormationPanel,
  expandFormationButtonRef,
  isFormationPanelSaving = false,
  expandFormationLabel = 'Розгорнути: Виявлена формація',
}) => {
  const chartProvider = useChartProvider();
  const timeframes: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

  // Keep livePrice in ref to avoid recreation of fetchOI on every live price tick
  const livePriceRef = useRef<number>(livePrice);
  useEffect(() => {
    livePriceRef.current = livePrice;
  }, [livePrice]);

  // Open Interest state for Binance and Bybit with auto-updating
  const [binanceOI, setBinanceOI] = useState<OpenInterestData | null>(null);
  const [bybitOI, setBybitOI] = useState<OpenInterestData | null>(null);
  const [loadingOI, setLoadingOI] = useState<boolean>(true);
  const [oiPulse, setOiPulse] = useState<boolean>(false);
  const pulseTimerRef = useRef<any>(null);
  const oiRequestId = useRef(0);

  const fetchOI = useCallback(async (isAuto = false) => {
    const requestId = ++oiRequestId.current;
    const curPrice = livePriceRef.current > 0 ? livePriceRef.current : coin.currentPrice;
    const candidates = getCandidateSymbols(coin.symbol, coin.baseAsset);

    let fetchedBinance: OpenInterestData | null = null;
    let fetchedBybit: OpenInterestData | null = null;
    let serverOk = false;

    // 1. Primary: Fast server proxy (queries Binance Futures & Bybit Linear in parallel without CORS limitations)
    try {
      const serverRes = await fetch(
        `/api/derivatives/oi?symbol=${encodeURIComponent(coin.symbol)}&baseAsset=${encodeURIComponent(coin.baseAsset || '')}&price=${curPrice}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (serverRes.ok) {
        const sData = await serverRes.json();
        if (sData.success) {
          serverOk = true;
          if (sData.binance && (sData.binance.valueUsd > 0 || sData.binance.amountCoins > 0)) {
            fetchedBinance = {
              valueUsd: sData.binance.valueUsd,
              amountCoins: sData.binance.amountCoins,
              change5mPct: sData.binance.change5mPct,
              lastUpdated: sData.binance.lastUpdated || Date.now(),
            };
          }
          if (sData.bybit && (sData.bybit.valueUsd > 0 || sData.bybit.amountCoins > 0)) {
            fetchedBybit = {
              valueUsd: sData.bybit.valueUsd,
              amountCoins: sData.bybit.amountCoins,
              change5mPct: sData.bybit.change5mPct,
              lastUpdated: sData.bybit.lastUpdated || Date.now(),
            };
          }
        }
      }
    } catch {
      // Server fallback if unreachable
    }

    // 2. Direct browser fallback for Bybit only if server proxy was unreachable
    if (!serverOk && !fetchedBybit) {
      for (const sym of candidates) {
        const mirrors = [
          `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`,
          `https://api.bytick.com/v5/market/tickers?category=linear&symbol=${sym}`,
        ];

        for (const url of mirrors) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (!res.ok) continue;
            const json = await res.json();
            const item = json?.result?.list?.[0];
            if (item) {
              const val = parseFloat(item.openInterestValue) || 0;
              const coins = parseFloat(item.openInterest) || 0;
              if (val > 0 || coins > 0) {
                let change5m: number | null = null;
                try {
                  const histRes = await fetch(
                    `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${sym}&intervalTime=5min&limit=2`,
                    { signal: AbortSignal.timeout(2000) }
                  );
                  if (histRes.ok) {
                    const histJson = await histRes.json();
                    const list = histJson?.result?.list;
                    if (Array.isArray(list) && list.length >= 2) {
                      const latestOi = parseFloat(list[0].openInterest) || 0;
                      const prevOi = parseFloat(list[1].openInterest) || 0;
                      if (prevOi > 0) {
                        change5m = ((latestOi - prevOi) / prevOi) * 100;
                      }
                    }
                  }
                } catch {}

                const valueUsd = val > 0 ? val : coins * Number(item.lastPrice);
                if (!Number.isFinite(valueUsd) || valueUsd <= 0) continue;
                fetchedBybit = {
                  valueUsd,
                  amountCoins: coins,
                  change5mPct: change5m !== null ? Number(change5m.toFixed(2)) : null,
                  lastUpdated: Date.now(),
                };
                break;
              }
            }
          } catch {}
        }
        if (fetchedBybit) break;
      }
    }

    if (requestId !== oiRequestId.current) return;
    setBinanceOI(fetchedBinance);
    setBybitOI(fetchedBybit);

    if (isAuto && (fetchedBinance || fetchedBybit)) {
      setOiPulse(true);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setOiPulse(false), 900);
    }
    setLoadingOI(false);
  }, [coin.symbol, coin.baseAsset, coin.currentPrice]);

  // Initial fetch and auto-update every 10 seconds
  useEffect(() => {
    setLoadingOI(true);
    setBinanceOI(null);
    setBybitOI(null);
    fetchOI(false);

    const interval = setInterval(() => {
      fetchOI(true);
    }, 10000);

    return () => {
      oiRequestId.current++;
      clearInterval(interval);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [fetchOI]);

  // Recalculate analysis strictly based on the active timeframe and its klines
  const analysis = useMemo(() => {
    const cur = livePrice > 0 ? livePrice : coin.currentPrice;

    let swingHigh = Number.NaN;
    let swingLow = Number.NaN;
    let pocPrice = Number.NaN;

    if (klines && klines.length >= 5) {
      // Look back window adapted to active timeframe (min 5m)
      const lookback =
        timeframe === '5m' ? 36 : timeframe === '15m' ? 30 : timeframe === '1h' ? 50 : timeframe === '4h' ? 60 : 90;
      const slice = klines.slice(-Math.min(lookback, klines.length));

      let highest = -Infinity;
      let lowest = Infinity;
      let minLow = Infinity;
      let maxHigh = -Infinity;

      for (const k of slice) {
        if (k.high > highest) highest = k.high;
        if (k.low < lowest) lowest = k.low;
        if (k.low < minLow) minLow = k.low;
        if (k.high > maxHigh) maxHigh = k.high;
      }

      if (highest > -Infinity && lowest < Infinity) {
        swingHigh = highest;
        swingLow = lowest;
      }

      // POC (Point of Control) calculation on this timeframe's candles
      const binsCount = 30;
      const binSize = (maxHigh - minLow) / binsCount;
      if (binSize > 0) {
        const volumeBins = new Array(binsCount).fill(0);
        for (const k of slice) {
          const midPrice = (k.high + k.low + k.close) / 3;
          const idx = Math.min(
            binsCount - 1,
            Math.max(0, Math.floor((midPrice - minLow) / binSize))
          );
          volumeBins[idx] += k.volume || 0;
        }

        let maxIdx = 0;
        let maxVol = 0;
        for (let i = 0; i < binsCount; i++) {
          if (volumeBins[i] > maxVol) {
            maxVol = volumeBins[i];
            maxIdx = i;
          }
        }
        if (maxVol > 0) pocPrice = minLow + (maxIdx + 0.5) * binSize;
      }
    } else {
      if (coin.high24h && coin.high24h > cur) swingHigh = coin.high24h;
      if (coin.low24h && coin.low24h < cur) swingLow = coin.low24h;

    }

    // Observable candle extrema; the public feed does not reveal other traders' stop orders.
    const sslPrice = swingHigh, bslPrice = swingLow;
    const sslDistPct = (sslPrice - cur) / cur * 100, bslDistPct = (bslPrice - cur) / cur * 100;

    // POC deviation
    const pocDistPct = ((cur - pocPrice) / pocPrice) * 100;

    // Strong Support & Resistance (Demand & Supply)
    let strongDemand = swingLow;
    let strongSupply = swingHigh;

    if (formation?.levels) {
      if (formation.levels.stopLossPrice && formation.levels.stopLossPrice < cur) {
        strongDemand = Number.isFinite(strongDemand) ? Math.min(strongDemand, formation.levels.stopLossPrice) : formation.levels.stopLossPrice;
      }
      if (formation.levels.targetPrice && formation.levels.targetPrice > cur) {
        strongSupply = Number.isFinite(strongSupply) ? Math.max(strongSupply, formation.levels.targetPrice) : formation.levels.targetPrice;
      }
    }

    const demandDistPct = ((strongDemand - cur) / cur) * 100;
    const supplyDistPct = ((strongSupply - cur) / cur) * 100;

    return {
      cur,
      sslPrice,
      sslDistPct,
      pocPrice,
      pocDistPct,
      bslPrice,
      bslDistPct,
      strongDemand,
      demandDistPct,
      strongSupply,
      supplyDistPct,
    };
  }, [livePrice, coin, klines, timeframe, formation]);

  return (
    <div className="w-full text-slate-300 font-sans select-text pb-1 flex justify-center">
      {/* Fit the analysis groups to the available chart width, including split layouts. */}
      <div className="chart-top-analysis-grid grid w-full max-w-[900px] items-start text-[12px] sm:text-sm leading-relaxed mx-auto">
  

       


        {/* Section 1: Найближчі пули ліквідності */}
        <div className="chart-top-analysis-group min-w-0 space-y-2 text-center">
          <div className="text-[12px] sm:text-[13px] font-bold text-sky-400 uppercase tracking-wide">
            
          </div>

          <div>
            <span className="text-slate-400 font-medium">Хай свічок: </span>
            <span className="font-mono font-bold text-white">
              ${formatCryptoPrice(analysis.sslPrice)}
            </span>
            <span className="font-mono text-rose-400 text-[12px] sm:text-[13px] ml-1">
              (+{percentage(analysis.sslDistPct)}%)
            </span>
          </div>

          {chartProvider === 'hookchart' ? (
            <>
              <div>
                <span className="text-slate-400 font-medium">Лоу свічок: </span>
                <span className="font-mono font-bold text-white">
                  ${formatCryptoPrice(analysis.bslPrice)}
                </span>
                <span className="font-mono text-emerald-400 text-[12px] sm:text-[13px] ml-1">
                  ({percentage(analysis.bslDistPct)}%)
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Оцінка POC: </span>
                <span className="font-mono font-bold text-amber-300">
                  ${formatCryptoPrice(analysis.pocPrice)}
                </span>
                <span className="font-mono text-slate-400 text-[12px] sm:text-[13px] ml-1">
                  ({analysis.pocDistPct >= 0 ? `+${percentage(analysis.pocDistPct)}%` : `${percentage(analysis.pocDistPct)}%`})
                </span>
              </div>

              {hookchartLevelControlsTargetId && (
                <div
                  id={hookchartLevelControlsTargetId}
                  className="mt-1 flex min-h-[24px] items-center justify-center"
                  aria-label="Керування рівнями формації"
                />
              )}
            </>
          ) : (
            <>
              <div>
                <span className="text-slate-400 font-medium">Оцінка POC: </span>
                <span className="font-mono font-bold text-amber-300">
                  ${formatCryptoPrice(analysis.pocPrice)}
                </span>
                <span className="font-mono text-slate-400 text-[12px] sm:text-[13px] ml-1">
                  ({analysis.pocDistPct >= 0 ? `+${percentage(analysis.pocDistPct)}%` : `${percentage(analysis.pocDistPct)}%`})
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Лоу свічок: </span>
                <span className="font-mono font-bold text-white">
                  ${formatCryptoPrice(analysis.bslPrice)}
                </span>
                <span className="font-mono text-emerald-400 text-[12px] sm:text-[13px] ml-1">
                  ({percentage(analysis.bslDistPct)}%)
                </span>
              </div>
            </>
          )}
        </div>

        {/* Section 2: Сильні опорні рівні (Support / Resistance) */}
        <div className="chart-top-analysis-group min-w-0 space-y-2 text-center">
          <div className="text-[12px] sm:text-[13px] font-bold text-indigo-400 uppercase tracking-wide">
          
          </div>

          <div>
            <span className="text-slate-400 font-medium">Опір: </span>
            <span className="font-mono font-bold text-rose-400">
              ${formatCryptoPrice(analysis.strongSupply)}
            </span>
            <span className="font-mono text-slate-400 text-[12px] sm:text-[13px] ml-1">
              (+{percentage(analysis.supplyDistPct)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400 font-medium">Підтримка: </span>
            <span className="font-mono font-bold text-emerald-400">
              ${formatCryptoPrice(analysis.strongDemand)}
            </span>
            <span className="font-mono text-slate-400 text-[12px] sm:text-[13px] ml-1">
              ({percentage(analysis.demandDistPct)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400 font-medium">OI Binance: </span>
            {loadingOI && !binanceOI ? (
              <span className="font-mono text-slate-500 text-[12px] sm:text-[13px] animate-pulse">оновлення...</span>
            ) : binanceOI ? (
              <>
                <span className="font-mono font-bold text-amber-300">
                  {formatOI(binanceOI.valueUsd)}
                </span>
                {binanceOI.change5mPct !== null && (
                  <span
                    className={`font-mono text-[12px] sm:text-[13px] ml-1 font-semibold ${
                      binanceOI.change5mPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ({binanceOI.change5mPct >= 0 ? '+' : ''}{binanceOI.change5mPct.toFixed(2)}%)
                  </span>
                )}
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ml-1.5 transition-all duration-300 ${
                    oiPulse ? 'bg-amber-400 scale-125' : 'bg-emerald-500/70'
                  }`}
                  title="Авто-оновлення кожні 10 сек"
                />
              </>
            ) : (
              <span className="font-mono text-slate-500 text-[12px] sm:text-[13px]">—</span>
            )}
          </div>

          <div>
            <span className="text-slate-400 font-medium">OI Bybit: </span>
            {loadingOI && !bybitOI ? (
              <span className="font-mono text-slate-500 text-[12px] sm:text-[13px] animate-pulse">оновлення...</span>
            ) : bybitOI ? (
              <>
                <span className="font-mono font-bold text-orange-300">
                  {formatOI(bybitOI.valueUsd)}
                </span>
                {bybitOI.change5mPct !== null && (
                  <span
                    className={`font-mono text-[12px] sm:text-[13px] ml-1 font-semibold ${
                      bybitOI.change5mPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ({bybitOI.change5mPct >= 0 ? '+' : ''}{bybitOI.change5mPct.toFixed(2)}%)
                  </span>
                )}
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ml-1.5 transition-all duration-300 ${
                    oiPulse ? 'bg-orange-400 scale-125' : 'bg-emerald-500/70'
                  }`}
                  title="Авто-оновлення кожні 10 сек"
                />
              </>
            ) : (
              <span className="font-mono text-slate-500 text-[12px] sm:text-[13px]">—</span>
            )}
          </div>
        </div>

        {/* Observable 24-hour prices, without invented liquidation clusters. */}
        <div className="chart-top-analysis-group min-w-0 space-y-2 text-center">
          <div className="text-[12px] sm:text-[13px] font-bold text-amber-400 uppercase tracking-wide">
          
          </div>

          <div><span className="text-slate-400 font-medium">Хай 24г: </span><span className="font-mono text-white">${formatCryptoPrice(coin.high24h || Number.NaN)}</span></div>
          <div><span className="text-slate-400 font-medium">Лоу 24г: </span><span className="font-mono text-white">${formatCryptoPrice(coin.low24h || Number.NaN)}</span></div>
          <div><span className="text-slate-400 font-medium">Поточна ціна: </span><span className="font-mono text-cyan-200">${formatCryptoPrice(analysis.cur)}</span></div>

          {onExpandFormationPanel && (
            <div className="mt-2 flex justify-end pr-2 sm:pr-3">
              <button
                ref={expandFormationButtonRef}
                type="button"
                onClick={onExpandFormationPanel}
                aria-disabled={isFormationPanelSaving}
                aria-expanded={false}
                aria-controls="formation-trade-setup-panel"
                aria-label={expandFormationLabel}
                title={expandFormationLabel}
                className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-950/80 border border-slate-700 text-slate-300 hover:text-white hover:border-cyan-500/50 transition-colors aria-disabled:opacity-50"
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
