/**
 * Restore the latest visible candles instead of a fixed 9px/78-bar preset.
 * Only invoked on a user reset; never on ticks, renders, or feed updates.
 */
export function latestCandleResetViewport(
  plotWidth: number,
  candleCount: number,
  requestedBars: number,
  rightGapBars: number,
) {
  const width = Number.isFinite(plotWidth) ? Math.max(1, plotWidth) : 1;
  const count = Number.isFinite(candleCount) ? Math.max(0, Math.floor(candleCount)) : 0;
  const requested = Number.isFinite(requestedBars) ? Math.max(15, Math.floor(requestedBars)) : 65;
  // Newly listed pairs should not show 15 tiny candles in a 110-bar viewport.
  const visibleBars = count > 0 ? Math.max(15, Math.min(requested, count)) : requested;
  const gap = Number.isFinite(rightGapBars) ? Math.max(0, rightGapBars) : 0;
  const barWidth = Math.max(.12, Math.min(34, width / (visibleBars + gap)));
  return {
    barWidth,
    rightOffset: 0,
    autoY: true,
    manualCenter: null,
    manualRange: null,
    yZoom: 1,
    fitAll: false,
    candleFit: true,
  };
}
