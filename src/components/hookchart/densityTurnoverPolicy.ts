/** Decouple AUTO liquidity input from UI-only footer visibility.
 * Depth/offscreen/replay gates are deliberately independent of showMarketStatsBar.
 */
export function shouldSubscribeDensityTurnover(options: {
  replay: boolean;
  archiveMode: boolean;
  externalData: boolean;
  lightweight: boolean;
  densityAnalysis?: boolean;
  densityMode?: string;
}): boolean {
  return !options.replay && !options.archiveMode && !options.externalData &&
    !options.lightweight && options.densityAnalysis !== false &&
    options.densityMode !== 'manual';
}
