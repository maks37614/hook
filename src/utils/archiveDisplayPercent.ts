/** Display-only formatting: never modify the stored entry, TP, SL or score. */
const archivePercentFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatArchivePercent(value: number): string {
  return Number.isFinite(value) ? archivePercentFormatter.format(Math.abs(value)) : '—';
}
