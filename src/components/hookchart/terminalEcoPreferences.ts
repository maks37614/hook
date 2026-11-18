import type { HookChartPreferences } from '../../types';

/**
 * Ephemeral, Terminal-only presentation and analysis overrides.
 * Never save this object to a user profile: leaving ECO must immediately
 * restore whatever the user configured before enabling it.
 */
export const TERMINAL_ECO_OVERRIDES: Readonly<HookChartPreferences> = Object.freeze({
  // Depth lines/amounts and expensive market-print overlays.
  densityAnalysis: false,
  showDensityLines: false,
  showDensityLabels: false,
  showDensityAmounts: false,
  showMarketPrintSums: false,
  // Liquidation markers, totals, model and extra statistics.
  showLiquidations: false,
  showLiqRiskBlock: false,
  showModeledLiquidationZones: false,
  showMarketStatsBar: false,
  // Only candles, navigation, user drawings and price-alert markers remain.
  showVolumes: false,
  indicators: [],
  strategyId: '',
  scalperMode: false,
  levelIntervals: [],
  trendIntervals: [],
  autoSR: false,
  autoPrevDay: false,
  autoDayOpen: false,
  autoVWAP: false,
  autoLocalHL: false,
  autoRoundLevels: false,
  autoPOC: false,
  autoStops: false,
  autoChannel: false,
});

export function terminalEcoPreferences(
  saved: HookChartPreferences,
  enabled: boolean,
): HookChartPreferences {
  return enabled ? { ...saved, ...TERMINAL_ECO_OVERRIDES } : saved;
}
