/**
 * Reserve room for the volume histogram in a terminal chart without moving it.
 * The geometry is O(1); candle extrema come from the renderer's existing visible range.
 */
export function terminalCandlePriceRange(
  minimum: number,
  maximum: number,
  plotHeight: number,
  showVolumes: boolean,
): { low: number; high: number } {
  const low = Math.min(minimum, maximum);
  const high = Math.max(minimum, maximum);
  // Respect real, narrow candle ranges (e.g. USDC/USDT). A 1% floor
  // visually flattens stablecoins; use a fallback only for identical OHLC.
  const observedSpread = high - low;
  const spread = observedSpread > 0 ? observedSpread : Math.max(Math.abs(high) * .0001, 1e-12);
  const topPadding = spread * .12;
  const height = Math.max(80, plotHeight);
  const gapPx = Math.min(14, Math.max(8, height * .05));
  // Keep the lower wick above both the volume band and a clear visual gap.
  const volumeBandPx = showVolumes ? Math.max(56, Math.min(108, height * .14)) + 3 : 0;
  const reservedFraction = Math.min(.88, (volumeBandPx + gapPx) / height);
  const bottomPadding = reservedFraction * (spread + topPadding) / (1 - reservedFraction);
  return { low: low - bottomPadding, high: high + topPadding };
}

/**
 * Respect a Terminal profile's requested vertical zoom without clipping the
 * visible high/low wick or letting the lower wick overlap the volume band.
 *
 * Zooming out (<1) is unrestricted. Zooming in is limited to the space left
 * between visible wick extremes and the canvas/volume safety margins.
 * The calculation is O(1) and runs only on the already-known price range.
 */
export function terminalSafeVerticalZoomRange(
  fitted: { low: number; high: number },
  candleLow: number,
  candleHigh: number,
  plotHeight: number,
  showVolumes: boolean,
  requestedZoom: number,
): { low: number; high: number } {
  const span = fitted.high - fitted.low;
  if (!Number.isFinite(span) || span <= 0 ||
      !Number.isFinite(candleLow) || !Number.isFinite(candleHigh) ||
      !Number.isFinite(requestedZoom) || requestedZoom <= 0 || requestedZoom === 1) {
    return fitted;
  }
  const height = Math.max(80, plotHeight);
  const volumeBandPx = showVolumes ? Math.max(56, Math.min(108, height * .14)) + 3 : 0;
  const topFraction = Math.max(3, height * .015) / height;
  const bottomFraction = (volumeBandPx + 5) / height;
  const usableFraction = 1 - topFraction - bottomFraction;
  if (usableFraction <= 0) return fitted;

  // A tiny Terminal card reserves most of its height for volume. Symmetric
  // zoom-out around the fitted midpoint can actually push the lower wick
  // into that band. Enforce enough total price span for both wick margins,
  // then shift that span without changing its width to keep both visible.
  const zoom = Math.max(.01, Math.min(100, requestedZoom));
  const priceSpan = Math.max(0, candleHigh - candleLow);
  const requestedSpan = span / zoom;
  const safeSpan = Math.max(requestedSpan, priceSpan / usableFraction);
  const midpoint = (fitted.low + fitted.high) / 2;
  const minimumLowBound = candleHigh - (1 - topFraction) * safeSpan;
  const maximumLowBound = candleLow - bottomFraction * safeSpan;
  const low = Math.min(maximumLowBound, Math.max(minimumLowBound, midpoint - safeSpan / 2));
  return { low, high: low + safeSpan };
}


/**
 * Restore a user-configured, non-automatic Terminal price viewport safely.
 *
 * Large stored vertical zooms (for example 15.85×) must not clip the visible
 * candle wicks or place them inside the volume band when auto-fit is switched
 * off. Preserve the requested zoom as far as the *visible candle range* allows.
 * The saved slider value is not modified. No history scans or feed work here.
 */
export function terminalSafeManualPriceViewport(
  candleLow: number,
  candleHigh: number,
  plotHeight: number,
  showVolumes: boolean,
  requestedZoom: number,
): { manualCenter: number; manualRange: number } {
  const fitted = terminalCandlePriceRange(candleLow, candleHigh, plotHeight, showVolumes);
  const safe = terminalSafeVerticalZoomRange(
    fitted, candleLow, candleHigh, plotHeight, showVolumes, requestedZoom,
  );
  return {
    manualCenter: safe.low + (safe.high - safe.low) / 2,
    manualRange: safe.high - safe.low,
  };
}

/**
 * A fresh Terminal timeframe can receive WS candles before REST history.
 * Candle counts do not indicate readiness: a new coin can have two historical
 * bars, while a delayed history response can arrive after many live bars.
 * Refit only when exchange history has actually arrived, without new polling.
 */
export function terminalViewportHistoryPhase(
  timeframe: string,
  _candleCount: number,
  isTerminalView: boolean,
  historyLoaded = false,
): 'seed' | 'ready' {
  // The 30s interval is built from live trades and has no REST history.
  return !isTerminalView || timeframe === '30s' || historyLoaded ? 'ready' : 'seed';
}


/**
 * Protect compact Terminal charts from an isolated flash wick (or a bad
 * exchange high/low) that is many times larger than all candle bodies.
 *
 * This changes only the *display range*: the underlying OHLC is never
 * altered and manual vertical navigation still exposes the entire wick.
 * Ordinary candles, sustained trends and repeated extreme wicks always
 * retain their genuine high/low in automatic scaling.
 *
 * A single pass handles the common case. Only a confirmed extreme wick
 * needs a second, linear pass across the already-visible candle window.
 */
export function terminalReadableCandleExtrema(
  candles: readonly { o: number; h: number; l: number; c: number }[],
): { low: number; high: number; clippedHigh: boolean; clippedLow: boolean } {
  const validPriceCandle = (candle: { o: number; h: number; l: number; c: number }) =>
    Number.isFinite(candle.o) && candle.o > 0 &&
    Number.isFinite(candle.h) && candle.h > 0 &&
    Number.isFinite(candle.l) && candle.l > 0 &&
    Number.isFinite(candle.c) && candle.c > 0;
  let low = Infinity;
  let high = -Infinity;
  let bodyLow = Infinity;
  let bodyHigh = -Infinity;
  let validCount = 0;
  for (const candle of candles) {
    if (!validPriceCandle(candle)) continue;
    validCount++;
    low = Math.min(low, candle.l, candle.o, candle.c);
    high = Math.max(high, candle.h, candle.o, candle.c);
    bodyLow = Math.min(bodyLow, candle.o, candle.c);
    bodyHigh = Math.max(bodyHigh, candle.o, candle.c);
  }
  if (validCount === 0) return { low: 0, high: 1, clippedHigh: false, clippedLow: false };
  if (validCount < 5) return { low, high, clippedHigh: false, clippedLow: false };

  const bodySpan = Math.max(bodyHigh - bodyLow, bodyHigh * 0.0005, 1e-12);
  const upperGuard = Math.max(bodyHigh * 1.6, bodyHigh + bodySpan * 7);
  const lowerGuard = Math.min(bodyLow / 1.6, bodyLow - bodySpan * 7);
  const checkUpper = high > upperGuard;
  const checkLower = low < lowerGuard;
  if (!checkUpper && !checkLower) return { low, high, clippedHigh: false, clippedLow: false };

  let regularHigh = bodyHigh, regularLow = bodyLow;
  let excludedHigh = 0, excludedLow = 0;
  for (const candle of candles) {
    if (!validPriceCandle(candle)) continue;
    if (checkUpper) {
      if (candle.h > upperGuard) excludedHigh++;
      else regularHigh = Math.max(regularHigh, candle.h);
    }
    if (checkLower) {
      if (candle.l < lowerGuard) excludedLow++;
      else regularLow = Math.min(regularLow, candle.l);
    }
  }
  // Repeated spikes should not be silently treated as measurement noise.
  const maxIsolated = Math.max(1, Math.ceil(validCount * .08));
  const clippedHigh = checkUpper && excludedHigh > 0 && excludedHigh <= maxIsolated;
  const clippedLow = checkLower && excludedLow > 0 && excludedLow <= maxIsolated;
  return {
    low: clippedLow ? regularLow : low,
    high: clippedHigh ? regularHigh : high,
    clippedHigh,
    clippedLow,
  };
}
