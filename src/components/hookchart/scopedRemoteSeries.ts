/**
 * A completed asynchronous analysis fetch may belong to the chart's previous
 * instrument or timeframe. Never feed it into the current chart or strategy.
 */
export type ScopedRemoteSeries<T> = {
  scope: string;
  series: Record<string, T[]>;
};

const EMPTY_REMOTE_SERIES: Readonly<Record<string, unknown[]>> = Object.freeze({});

export function visibleScopedRemoteSeries<T>(
  state: ScopedRemoteSeries<T> | null,
  scope: string,
  enabled = true,
): Readonly<Record<string, T[]>> {
  return enabled && state?.scope === scope
    ? state.series
    : EMPTY_REMOTE_SERIES as Readonly<Record<string, T[]>>;
}
