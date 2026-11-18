import type { CoinGeckoHolderSnapshot, SmartAnalysisData } from '../types';

/** A zero-valued market measurement is valid; null, NaN and Infinity are not. */
export const isMeasured = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export type SmartAnalysisModule = 'btc' | 'tech' | 'orderbook' | 'derivatives' | 'institutional';
export type SmartAnalysisTab = 'all' | SmartAnalysisModule;

export function getSmartAnalysisVisibility(
  data: SmartAnalysisData,
  holderSnapshot: CoinGeckoHolderSnapshot | null,
) {
  const holders = holderSnapshot?.status === 'available' &&
    isMeasured(holderSnapshot.count) && holderSnapshot.count >= 0;
  const holderConcentration = holders && isMeasured(holderSnapshot.distribution?.top_10);
  const largeOrders = data.orderbook.available &&
    data.participants.largePlayer.trackedClusters.some(order =>
      isMeasured(order.price) && order.price > 0 &&
      isMeasured(order.volumeUsd) && order.volumeUsd > 0);
  // A spread alone cannot identify a market maker.
  const marketMaker = data.participants.marketMaker.detected === true &&
    data.participants.marketMaker.activityLevel !== 'unknown';
  const vulnerability = isMeasured(data.participants.manipulativeCoin.riskScore) &&
    data.participants.manipulativeCoin.signals.length > 0;

  const btcPrice = isMeasured(data.btcContext.btcPrice) && data.btcContext.btcPrice > 0;
  const btcChange = isMeasured(data.btcContext.change24h);
  const btcTimeframes = (['15m', '5m', '1m'] as const).filter(
    tf => data.btcContext.timeframes[tf].structure !== 'unknown');
  const btcOverall = data.btcContext.overallStructure !== 'unknown';
  const btcNews = data.btcContext.upcomingNews.length > 0;

  const rsi = isMeasured(data.trend.rsi14);
  const emas = isMeasured(data.trend.ema20) && isMeasured(data.trend.ema50);
  const ema200 = isMeasured(data.trend.ema200);
  const volume1h = isMeasured(data.volumeMetrics.volume1hUsd);
  const volume24h = isMeasured(data.volumeMetrics.volume24hUsd);
  const spread = isMeasured(data.spread.spreadPct);
  const dayRange = isMeasured(data.volatility.positionInDayRangePct) &&
    isMeasured(data.volatility.low24h) && isMeasured(data.volatility.high24h);

  const bid = data.orderbook.available &&
    isMeasured(data.orderbook.bidWallPrice) && isMeasured(data.orderbook.bidWallUsd);
  const ask = data.orderbook.available &&
    isMeasured(data.orderbook.askWallPrice) && isMeasured(data.orderbook.askWallUsd);
  const imbalance = data.orderbook.available && isMeasured(data.orderbook.bidAskRatio);
  const poc = isMeasured(data.levels.pocPrice) && data.levels.pocPrice > 0;
  const liquidityLevels = data.levels.liquidityLevels.some(level =>
    isMeasured(level.price) && level.price > 0);
  const support = isMeasured(data.levels.strongSupport) && data.levels.strongSupport > 0;
  const resistance = isMeasured(data.levels.strongResistance) && data.levels.strongResistance > 0;

  const isFutures = data.derivatives.hasPerpFutures;
  const binanceOI = isFutures && isMeasured(data.derivatives.binanceOI.currentUsd);
  const bybitOI = isFutures && isMeasured(data.derivatives.bybitOI.currentUsd);
  const binanceFunding = isFutures && isMeasured(data.derivatives.fundingRate);
  const bybitFunding = isFutures && isMeasured(data.derivatives.predictedFundingRate);
  const totalOI = isFutures && isMeasured(data.derivatives.totalOIUsd);

  const modules: Record<SmartAnalysisModule, boolean> = {
    btc: btcPrice || btcChange || btcTimeframes.length > 0 || btcOverall || btcNews,
    tech: rsi || emas || volume1h || volume24h || spread || dayRange,
    orderbook: bid || ask || imbalance || poc || liquidityLevels || support || resistance,
    derivatives: binanceOI || bybitOI || binanceFunding || bybitFunding || totalOI,
    institutional: holders || largeOrders || marketMaker || vulnerability,
  };
  return {
    modules, holders, holderConcentration, largeOrders, marketMaker, vulnerability,
    btcPrice, btcChange, btcTimeframes, btcOverall, btcNews,
    rsi, emas, ema200, volume1h, volume24h, spread, dayRange,
    bid, ask, imbalance, poc, liquidityLevels, support, resistance,
    binanceOI, bybitOI, binanceFunding, bybitFunding, totalOI,
  };
}

/** Never leave users on a blank tab after a coin/exchange refresh. */
export function selectVisibleTab(
  active: SmartAnalysisTab,
  modules: Record<SmartAnalysisModule, boolean>,
): SmartAnalysisTab {
  return active === 'all' || modules[active] ? active : 'all';
}
