/** Inclusive upper bounds for the screener's 24-hour USD turnover filter.
 * 'All volumes' is represented separately by zero, so even trading pairs above
 * the highest named tier remain discoverable. */
export const SCREENER_VOLUME_CAPS = [
  { value: 50_000, label: 'До $50K' },
  { value: 100_000, label: 'До $100K' },
  { value: 250_000, label: 'До $250K' },
  { value: 500_000, label: 'До $500K' },
  { value: 1_000_000, label: 'До $1M' },
  { value: 2_000_000, label: 'До $2M' },
  { value: 5_000_000, label: 'До $5M' },
  { value: 10_000_000, label: 'До $10M' },
  { value: 25_000_000, label: 'До $25M' },
  { value: 50_000_000, label: 'До $50M' },
  { value: 100_000_000, label: 'До $100M' },
  { value: 250_000_000, label: 'До $250M' },
  { value: 500_000_000, label: 'До $500M' },
  { value: 1_000_000_000, label: 'До $1B' },
  { value: 2_000_000_000, label: 'До $2B' },
  { value: 5_000_000_000, label: 'До $5B' },
  { value: 10_000_000_000, label: 'До $10B' },
  { value: 25_000_000_000, label: 'До $25B' },
  { value: 50_000_000_000, label: 'До $50B' },
] as const;

/** A selected 24-hour volume threshold can be either a ceiling or a floor. */
export type ScreenerVolumeMode = 'to' | 'from';

/** When filtering a bound, show coins nearest to that bound before distant coins. */
export function preferredVolumeSortOrder(mode: ScreenerVolumeMode): 'asc' | 'desc' {
  return mode === 'from' ? 'asc' : 'desc';
}

export function isVolumeWithinCap(
  volumeUsd: number,
  limitUsd: number,
  mode: ScreenerVolumeMode = 'to',
): boolean {
  // 0 means "Без обмежень" in both modes. The boundary itself is inclusive.
  if (limitUsd === 0) return true;
  return mode === 'from' ? volumeUsd >= limitUsd : volumeUsd <= limitUsd;
}
