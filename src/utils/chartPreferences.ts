import type { ChartProvider, UserProfile } from '../types';

export const DEFAULT_CHART_PROVIDER: ChartProvider = 'hookchart';

export function normalizeChartProvider(value: unknown): ChartProvider {
  return value === 'tradingview' || value === 'hookchart' ? value : DEFAULT_CHART_PROVIDER;
}

export function chartProviderStorageKey(uid: string): string {
  return `signalhook_chart_provider_${uid}`;
}

export function resolveChartProvider(
  uid: string | undefined,
  profile: Pick<UserProfile, 'uid' | 'defaultChartProvider'> | null,
  cachedValue?: string | null,
): ChartProvider {
  if (!uid) return DEFAULT_CHART_PROVIDER;
  if (profile?.uid === uid) return normalizeChartProvider(profile.defaultChartProvider);
  return normalizeChartProvider(cachedValue);
}
