import type { HookChartPreferences } from '../../types';

/**
 * A disabled density overlay must not retain a per-chart order book.
 * Independently selected strategies that use BID/ASK imbalance still need it.
 * Executed market-print labels also need trades even when depth is disabled.
 */
export function hookChartAuxFeedPolicy(
  settings: Pick<HookChartPreferences, 'densityAnalysis' | 'showMarketPrintSums'>,
  needsStrategyBook = false,
  replay = false,
  lightweight = false,
): { depth: boolean; trades: boolean } {
  const eligible = !replay && !lightweight;
  const depth = eligible && (settings.densityAnalysis !== false || needsStrategyBook);
  return {
    depth,
    trades: eligible && (depth || settings.showMarketPrintSums === true),
  };
}
