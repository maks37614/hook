import type { Timeframe } from '../src/types';

export const FORMATION_TIMEFRAMES: readonly Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
export const FORMATION_CANDIDATE_BUDGET = 75;

/** Divide one existing worker's budget; this function starts no scans or timers. */
export function formationScanPlan(env: Record<string, string | undefined> = process.env) {
  let timeframes: Timeframe[];
  if (env.HOOK_SCREENER_TIMEFRAMES !== undefined) {
    const requested = env.HOOK_SCREENER_TIMEFRAMES.split(',').map(value => value.trim());
    if (!requested.length || requested.some(value => !FORMATION_TIMEFRAMES.includes(value as Timeframe))) {
      throw new Error('HOOK_SCREENER_TIMEFRAMES must contain only 1m,5m,15m,1h,4h,1d');
    }
    timeframes = [...new Set(requested)] as Timeframe[];
  } else {
    // Existing installations keep their configured single timeframe until opted in.
    const legacy = env.HOOK_SCREENER_TIMEFRAME || '1h';
    timeframes = [FORMATION_TIMEFRAMES.includes(legacy as Timeframe) ? legacy as Timeframe : '1h'];
  }
  const each = Math.floor(FORMATION_CANDIDATE_BUDGET / timeframes.length);
  const remainder = FORMATION_CANDIDATE_BUDGET % timeframes.length;
  return {
    timeframes, candidateBudget: FORMATION_CANDIDATE_BUDGET,
    allocations: timeframes.map((timeframe, index) => ({ timeframe, maxCandidates: each + (index < remainder ? 1 : 0) })),
  };
}
