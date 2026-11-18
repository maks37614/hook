import type { Kline } from '../types';
import { toHookCandles } from './hookchartData';
import { replayHistoryChange } from './replayHistoryChange';

/** One chart's immutable, scope-bound live conversion cache. */
export interface LiveHookChartConversion {
  scope: string;
  input: readonly Kline[];
  history: readonly Kline[];
  max: number | undefined;
  candles: ReturnType<typeof toHookCandles>;
}

/**
 * Update the current candle without converting thousands of old candles on
 * every live trade. A changed prefix, invalid last candle, historical-page
 * update, rewind, timeframe or market switch always rebuilds the full series.
 * Replay keeps its own independent conversion path.
 */
export function convertLiveHookChartCandles(
  input: readonly Kline[],
  history: readonly Kline[],
  scope: string,
  max: number | undefined,
  previous: LiveHookChartConversion | null,
): LiveHookChartConversion {
  const sameScope = previous?.scope === scope &&
    previous.history === history && previous.max === max;
  const change = sameScope ? replayHistoryChange(previous!.input, input) : 'reset';
  if (change === 'same') return previous!;

  if ((change === 'append' || change === 'replace-last') && previous?.candles.length &&
      previous.input.at(-1)?.time === previous.candles.at(-1)!.t / 1000) {
    const last = toHookCandles(input.slice(-1))[0];
    const oldLast = previous.candles.at(-1)!;
    if (last && (change === 'append' ? last.t > oldLast.t : last.t === oldLast.t)) {
      const updated = change === 'append'
        ? [...previous.candles, last]
        : [...previous.candles.slice(0, -1), last];
      return { scope, input, history, max, candles: max ? updated.slice(-max) : updated };
    }
  }

  const converted = toHookCandles([...history, ...input]);
  return { scope, input, history, max, candles: max ? converted.slice(-max) : converted };
}
