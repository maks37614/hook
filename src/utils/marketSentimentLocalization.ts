import type { MarketSentimentData } from '../types';
import { translateKey, type SupportedLanguage } from '../locales';

/**
 * Market data is computed and cached once server-side for every visitor.
 * Only the presentation is localized; never infer new market metrics.
 */
export function localizeSentimentSummary(data: MarketSentimentData, language: SupportedLanguage): string {
  const trend = data.priceTrendDynamics;
  const quality = data.dataQuality;
  const total = quality?.analyzedPairs ??
    trend.advancingCount + trend.decliningCount + (trend.unchangedCount ?? 0);
  const avgChange = trend.avgChange24h;
  const summary = translateKey(language, 'sentiment.summary', {
    label: translateKey(language, `sentiment.state.${data.sentimentState}`),
    score: data.compositeScore,
    advancing: trend.advancingCount,
    total,
    pct: trend.advancingPct,
    declining: trend.decliningCount,
    unchanged: trend.unchangedCount ?? Math.max(0, total - trend.advancingCount - trend.decliningCount),
    change: avgChange >= 0 ? `+${avgChange}` : avgChange,
    range: data.marketVolatility.avgDailyRangePct,
  });
  return quality && quality.totalSources > 0 && !quality.locationReliable
    ? `${summary} ${translateKey(language, 'sentiment.summary.history', {
        count: quality.locationPairs,
        pct: quality.locationCoveragePct,
      })}`
    : summary;
}

export function localizeSentimentVolatility(data: MarketSentimentData, language: SupportedLanguage): string {
  const index = data.marketVolatility.index;
  return translateKey(language, index > 75
    ? 'sentiment.volatility.high'
    : index > 45 ? 'sentiment.volatility.moderate' : 'sentiment.volatility.low');
}

export function localizeTakerDeltaLabel(data: MarketSentimentData, language: SupportedLanguage): string {
  const delta = data.capitalFlow;
  // Market type originates in the server's actual observed Binance source label.
  // If it cannot be verified, do not assert Spot/Futures or invent coverage.
  const market = /\bSpot\b/.test(delta.label)
    ? 'Spot' : /\bFutures\b/.test(delta.label) ? 'Futures' : null;
  if (!market || !delta.sampleCoverage) {
    return translateKey(language, 'sentiment.takerUnavailable');
  }
  return translateKey(language, 'sentiment.takerSource', {
    market,
    coverage: delta.sampleCoverage,
  });
}

export function localizeBybitDerivativesLabel(data: MarketSentimentData, language: SupportedLanguage): string {
  const overview = data.derivativesOverview;
  if (overview.aggregatedOIUsd === null) {
    return translateKey(language, 'sentiment.derivativesUnavailable');
  }
  if (overview.instrumentCount === undefined || overview.fundingInstrumentCount === undefined) {
    return translateKey(language, 'sentiment.bybitSource');
  }
  return translateKey(language, 'sentiment.derivativesSource', {
    oi: overview.instrumentCount,
    funding: overview.fundingInstrumentCount,
  });
}
