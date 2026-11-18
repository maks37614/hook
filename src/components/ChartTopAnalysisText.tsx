import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ScannedCoin, DetectedFormation, Kline, Timeframe } from '../types';
import { formatCryptoPrice } from '../utils/formatters';
import { reconcileChartOi } from '../utils/chartOiDisplay';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';

interface ChartTopAnalysisTextProps {
  coin: ScannedCoin;
  formation?: DetectedFormation | null;
  klines: Kline[];
  livePrice: number;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
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
}) => {
  const { language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  const timeframes: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

  // Keep livePrice in ref to avoid recreation of fetchOI on every live price tick
  const livePriceRef = useRef<number>(livePrice);
  useEffect(() => {
    livePriceRef.current = livePrice;
  }, [livePrice]);
  const quoteFallbackRef = useRef(coin.currentPrice);
  useEffect(() => { quoteFallbackRef.current = coin.currentPrice; }, [coin.currentPrice]);

  // Open Interest state for Binance and Bybit with auto-updating
  const [binanceOI, setBinanceOI] = useState<OpenInterestData | null>(null);
  const [bybitOI, setBybitOI] = useState<OpenInterestData | null>(null);
  const [loadingOI, setLoadingOI] = useState<boolean>(true);
  const [oiPulse, setOiPulse] = useState<boolean>(false);
  const [binanceOiStale, setBinanceOiStale] = useState(false);
  const [bybitOiStale, setBybitOiStale] = useState(false);
  const previousBinanceOI = useRef<OpenInterestData | null>(null);
  const previousBybitOI = useRef<OpenInterestData | null>(null);
  const pulseTimerRef = useRef<any>(null);
  const oiRequestGeneration = useRef(0);

  const fetchOI = useCallback(async (isAuto = false, generation = oiRequestGeneration.current) => {
    const curPrice = livePriceRef.current > 0 ? livePriceRef.current : quoteFallbackRef.current || 1;
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

                fetchedBybit = {
                  valueUsd: val > 0 ? val : coins * curPrice,
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

    // A slow Binance/Bybit reply must never overwrite the next symbol's OI.
    if (generation !== oiRequestGeneration.current) return;
    const checkedAt = Date.now();
    // A single missed request must not erase the last confirmed value.
    // Keep it explicitly marked stale for at most 90 seconds, never indefinitely.
    const binanceResult = reconcileChartOi(previousBinanceOI.current, fetchedBinance, checkedAt);
    const bybitResult = reconcileChartOi(previousBybitOI.current, fetchedBybit, checkedAt);
    previousBinanceOI.current = binanceResult.reading;
    previousBybitOI.current = bybitResult.reading;
    setBinanceOI(binanceResult.reading);
    setBybitOI(bybitResult.reading);
    setBinanceOiStale(binanceResult.stale);
    setBybitOiStale(bybitResult.stale);

    if (isAuto && (fetchedBinance || fetchedBybit)) {
      setOiPulse(true);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setOiPulse(false), 900);
    }
    setLoadingOI(false);
  }, [coin.symbol, coin.baseAsset]);

  // OI is slower-moving than trades. Only one request per instrument is
  // allowed at a time; avoid accumulating requests in background charts.
  // A visible tab refreshes immediately when the user returns to it.
  useEffect(() => {
    const generation = ++oiRequestGeneration.current;
    let inFlight = false;
    setLoadingOI(true);
    previousBinanceOI.current = null;
    previousBybitOI.current = null;
    setBinanceOI(null);
    setBybitOI(null);
    setBinanceOiStale(false);
    setBybitOiStale(false);
    const refresh = async (isAuto: boolean) => {
      if (inFlight) return;
      inFlight = true;
      try { await fetchOI(isAuto, generation); }
      finally { inFlight = false; }
    };
    void refresh(false);
    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh(true);
    }, 10_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      ++oiRequestGeneration.current;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [fetchOI]);

  // Recalculate analysis strictly based on the active timeframe and its klines
  const analysis = useMemo(() => {
    const cur = livePrice > 0 ? livePrice : coin.currentPrice;
    const vol24h = coin.volume24hUsd || 10_000_000;

    let swingHigh = cur * 1.025;
    let swingLow = cur * 0.975;
    let pocPrice = cur;

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
          volumeBins[idx] += k.volume || 1;
        }

        let maxIdx = 0;
        let maxVol = 0;
        for (let i = 0; i < binsCount; i++) {
          if (volumeBins[i] > maxVol) {
            maxVol = volumeBins[i];
            maxIdx = i;
          }
        }
        pocPrice = minLow + (maxIdx + 0.5) * binSize;
      }
    } else {
      if (coin.high24h && coin.high24h > cur) swingHigh = coin.high24h;
      if (coin.low24h && coin.low24h < cur) swingLow = coin.low24h;
      pocPrice = (swingHigh + swingLow + cur) / 3;
    }

    // Sell-Side Liquidity (SSL) - short stops above recent swing high
    const sslMultiplier =
      timeframe === '5m' ? 1.0006 : timeframe === '15m' ? 1.001 : timeframe === '1h' ? 1.002 : 1.0035;
    const sslPrice =
      swingHigh > cur ? swingHigh * sslMultiplier : cur * (1 + (timeframe === '1d' ? 0.045 : 0.025));
    const sslDistPct = ((sslPrice - cur) / cur) * 100;

    // Buy-Side Liquidity (BSL) - long stops below recent swing low
    const bslMultiplier =
      timeframe === '5m' ? 0.9994 : timeframe === '15m' ? 0.999 : timeframe === '1h' ? 0.998 : 0.9965;
    const bslPrice =
      swingLow < cur ? swingLow * bslMultiplier : cur * (1 - (timeframe === '1d' ? 0.045 : 0.025));
    const bslDistPct = ((bslPrice - cur) / cur) * 100;

    // POC deviation
    const pocDistPct = ((cur - pocPrice) / pocPrice) * 100;

    // Strong Support & Resistance (Demand & Supply)
    let strongDemand = swingLow < cur ? swingLow : cur * 0.97;
    let strongSupply = swingHigh > cur ? swingHigh : cur * 1.03;

    if (formation?.levels) {
      if (formation.levels.stopLossPrice && formation.levels.stopLossPrice < cur) {
        strongDemand = Math.min(strongDemand, formation.levels.stopLossPrice);
      }
      if (formation.levels.targetPrice && formation.levels.targetPrice > cur) {
        strongSupply = Math.max(strongSupply, formation.levels.targetPrice);
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
    <div className="w-full min-w-0 text-slate-300 text-xs font-sans select-text pb-1 space-y-2">
      {/* Center both analysis columns as one compact group over the chart.
          The pair fills smaller screens but stops expanding on wide desktops. */}
      <div
        data-testid="chart-top-analysis-columns"
        className="mx-auto grid w-full max-w-[680px] min-w-0 grid-cols-2 items-start gap-x-3 gap-y-2 px-1 text-[11px] leading-relaxed sm:gap-x-6 sm:px-2 sm:text-xs lg:gap-x-10"
      >
        {/* Section 1: Найближчі пули ліквідності */}
        <div className="min-w-0 space-y-1 break-words [overflow-wrap:anywhere]">
          <div>
            <span className="text-slate-400">{tr("Стопи шорт:")}{" "}</span>
            <span className="font-mono font-bold text-white">
              ${formatCryptoPrice(analysis.sslPrice)}
            </span>
            <span className="font-mono text-rose-400 text-[11px] ml-1">
              (+{analysis.sslDistPct.toFixed(2)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400">POC: </span>
            <span className="font-mono font-bold text-amber-300">
              ${formatCryptoPrice(analysis.pocPrice)}
            </span>
            <span className="font-mono text-slate-400 text-[11px] ml-1">
              ({analysis.pocDistPct >= 0 ? `+${analysis.pocDistPct.toFixed(2)}%` : `${analysis.pocDistPct.toFixed(2)}%`})
            </span>
          </div>

          <div>
            <span className="text-slate-400">{tr("Стопи лонг:")}{" "}</span>
            <span className="font-mono font-bold text-white">
              ${formatCryptoPrice(analysis.bslPrice)}
            </span>
            <span className="font-mono text-emerald-400 text-[11px] ml-1">
              ({analysis.bslDistPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Section 2: Сильні опорні рівні (Support / Resistance) */}
        <div className="min-w-0 space-y-1 break-words [overflow-wrap:anywhere]">
          <div>
            <span className="text-slate-400">{tr("Супротив:")}{" "}</span>
            <span className="font-mono font-bold text-rose-400">
              ${formatCryptoPrice(analysis.strongSupply)}
            </span>
            <span className="font-mono text-slate-400 text-[11px] ml-1">
              (+{analysis.supplyDistPct.toFixed(2)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400">{tr("Підтримка:")}{" "}</span>
            <span className="font-mono font-bold text-emerald-400">
              ${formatCryptoPrice(analysis.strongDemand)}
            </span>
            <span className="font-mono text-slate-400 text-[11px] ml-1">
              ({analysis.demandDistPct.toFixed(2)}%)
            </span>
          </div>

          <div>
            <span className="text-slate-400">OI Binance: </span>
            {loadingOI && !binanceOI ? (
              <span className="font-mono text-slate-500 text-[11px] animate-pulse">{tr("оновлення...")}</span>
            ) : binanceOI ? (
              <>
                <span className="font-mono font-bold text-amber-300">
                  {formatOI(binanceOI.valueUsd)}
                </span>
                <span className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap align-middle">
                {binanceOI.change5mPct !== null && (
                  <span
                    className={`font-mono text-[10px] sm:text-[11px] font-semibold ${
                      binanceOI.change5mPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ({binanceOI.change5mPct >= 0 ? '+' : ''}{binanceOI.change5mPct.toFixed(2)}%)
                  </span>
                )}
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300 ${
                    binanceOiStale ? 'bg-slate-400' : oiPulse ? 'bg-amber-400 scale-125' : 'bg-emerald-500/70'
                  }`}
                  title={binanceOiStale ? tr('Попереднє підтверджене значення OI; очікується оновлення') : tr("Авто-оновлення кожні 10 сек")}
                />
              </span>
              </>
            ) : (
              <span className="font-mono text-slate-500 text-[11px]">—</span>
            )}
          </div>

          <div>
            <span className="text-slate-400">OI Bybit: </span>
            {loadingOI && !bybitOI ? (
              <span className="font-mono text-slate-500 text-[11px] animate-pulse">{tr("оновлення...")}</span>
            ) : bybitOI ? (
              <>
                <span className="font-mono font-bold text-orange-300">
                  {formatOI(bybitOI.valueUsd)}
                </span>
                <span className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap align-middle">
                {bybitOI.change5mPct !== null && (
                  <span
                    className={`font-mono text-[10px] sm:text-[11px] font-semibold ${
                      bybitOI.change5mPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ({bybitOI.change5mPct >= 0 ? '+' : ''}{bybitOI.change5mPct.toFixed(2)}%)
                  </span>
                )}
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300 ${
                    bybitOiStale ? 'bg-slate-400' : oiPulse ? 'bg-orange-400 scale-125' : 'bg-emerald-500/70'
                  }`}
                  title={bybitOiStale ? tr('Попереднє підтверджене значення OI; очікується оновлення') : tr("Авто-оновлення кожні 10 сек")}
                />
              </span>
              </>
            ) : (
              <span className="font-mono text-slate-500 text-[11px]">—</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
