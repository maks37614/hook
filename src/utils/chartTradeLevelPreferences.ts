/** One shared choice for Entry / Take Profit / Stop Loss on every live chart.
 * Stored per account so changing coin, timeframe or page doesn't reset it. */
export interface ChartTradeLevelVisibility {
  entry: boolean;
  target: boolean;
  stop: boolean;
}

export const CHART_TRADE_LEVELS_EVENT = 'h00k:chart-trade-levels';
export const DEFAULT_CHART_TRADE_LEVELS: ChartTradeLevelVisibility = {
  entry: false,
  target: false,
  stop: false,
};

export function chartTradeLevelStorageKey(userId?: string | null): string {
  return `h00k_chart_trade_levels_${userId || 'guest'}`;
}

export function normalizeChartTradeLevelVisibility(value: unknown): ChartTradeLevelVisibility | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.entry !== 'boolean' ||
      typeof candidate.target !== 'boolean' ||
      typeof candidate.stop !== 'boolean') return null;
  return { entry: candidate.entry, target: candidate.target, stop: candidate.stop };
}

export function readChartTradeLevels(
  userId?: string | null,
  profileLevels?: ChartTradeLevelVisibility | null,
): ChartTradeLevelVisibility {
  const fromProfile = normalizeChartTradeLevelVisibility(profileLevels);
  if (fromProfile) return fromProfile;
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(chartTradeLevelStorageKey(userId));
      if (stored) return normalizeChartTradeLevelVisibility(JSON.parse(stored)) || DEFAULT_CHART_TRADE_LEVELS;
    }
  } catch { /* Storage is optional in private browsing. */ }
  return DEFAULT_CHART_TRADE_LEVELS;
}

export function saveChartTradeLevels(userId: string | null | undefined, levels: ChartTradeLevelVisibility): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(chartTradeLevelStorageKey(userId), JSON.stringify(levels));
    }
  } catch { /* Account profile remains the primary sync path. */ }
}
