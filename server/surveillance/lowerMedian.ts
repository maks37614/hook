/**
 * Exact lower median for price-level notionals, in expected O(n) time.
 * Mutates its scratch array; callers pass a newly built array.
 * For even-length arrays this intentionally selects index (n - 1) / 2,
 * identical to the previous numeric sort in OrderBookEngine.
 */
/** In-place lower empirical quantile using the same linear-time selection
 * as lowerMedian. Scratch arrays are caller-owned; prices/quantities are not changed. */
export function lowerQuantile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const target = Math.floor((values.length - 1) * Math.max(0, Math.min(1, quantile)));
  let left = 0;
  let right = values.length - 1;

  while (left <= right) {
    const middle = left + Math.floor((right - left) / 2);
    const a = values[left], b = values[middle], c = values[right];
    // Median-of-three pivot and three-way partition handle sorted/duplicate levels.
    const pivot = a < b ? (b < c ? b : a < c ? c : a)
      : (a < c ? a : b < c ? c : b);
    let low = left, scan = left, high = right;

    while (scan <= high) {
      if (values[scan] < pivot) {
        [values[low], values[scan]] = [values[scan], values[low]];
        low++;
        scan++;
      } else if (values[scan] > pivot) {
        [values[scan], values[high]] = [values[high], values[scan]];
        high--;
      } else {
        scan++;
      }
    }

    if (target < low) right = low - 1;
    else if (target > high) left = high + 1;
    else return values[target];
  }
  return values[target];
}

/** Preserve the original exact lower-median semantics for existing callers. */
export function lowerMedian(values: number[]): number {
  return lowerQuantile(values, 0.5);
}
