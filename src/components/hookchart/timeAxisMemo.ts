/** The time axis depends on horizontal viewport position, not the price scale. */
export type TimeAxisMemoInputs = {
  candles: readonly unknown[];
  tf: string;
  timezone: string;
  language?: string;
  viewport: {barWidth:number;rightOffset:number;fitAll?:boolean};
  rightPadding?: number;
  rightPaddingBars?: number;
  countdownRef?: unknown;
  crosshair?: unknown;
};

/** React.memo comparator: preserve all time-label updates while ignoring price-only gestures. */
export function sameTimeAxisInputs(a: TimeAxisMemoInputs, b: TimeAxisMemoInputs): boolean {
  return a.candles === b.candles
    && a.tf === b.tf
    && a.timezone === b.timezone
    && a.language === b.language
    && a.rightPadding === b.rightPadding
    && a.rightPaddingBars === b.rightPaddingBars
    && a.countdownRef === b.countdownRef
    && a.crosshair === b.crosshair
    && a.viewport.barWidth === b.viewport.barWidth
    && a.viewport.rightOffset === b.viewport.rightOffset
    && a.viewport.fitAll === b.viewport.fitAll;
}
