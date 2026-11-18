/**
 * Interprets observed liquidity behaviour, not a calibrated probability of a bounce.
 * All evidence is scoped to one live exchange price level.
 */
export type ReactionEvidence = {
  usd: number;
  peakUsd: number;
  thresholdUsd: number;
  ageSeconds: number;
  distancePct: number;
  touches: number;
  lastTouchAgeSeconds: number;
  replenishments: number;
  unexplainedReductions: number;
  executedUsd90s: number;
};

export type ReactionAssessment = {
  score: number;
  tier: 'strong' | 'potential';
};

export function assessDensityReaction(e: ReactionEvidence): ReactionAssessment {
  if (!Number.isFinite(e.usd) || e.usd <= 0) return { score: 0, tier: 'strong' };
  const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const age = Math.max(0, e.ageSeconds);
  const size = clamp01(e.usd / Math.max(1, e.thresholdUsd) / 2);
  const persistent = clamp01(age / 120);
  const retained = clamp01(e.usd / Math.max(e.usd, e.peakUsd));
  const near = clamp01(1 - e.distancePct / .5);
  const recentTouch = e.touches > 0 && e.lastTouchAgeSeconds >= 0 && e.lastTouchAgeSeconds <= 120;
  const absorption = clamp01(e.executedUsd90s / Math.max(1, e.usd * .2));
  const replenishment = clamp01(e.replenishments / 2);
  const reductions = clamp01(e.unexplainedReductions / 2);
  const score = Math.round(Math.max(0, Math.min(100,
    size * 15 + persistent * 20 + retained * 15 + near * 10
    + (recentTouch ? 10 : 0) + absorption * 25 + replenishment * 15
    - reductions * 15
  )));
  // A large order left untouched is only a strong wall, never a high-potential setup.
  // Require actual proximity/touch AND recent opposing executions or replenishment.
  const corroboration = e.executedUsd90s >= e.usd * .08 || e.replenishments >= 1;
  const potential = age >= 30 && e.distancePct <= .5 && recentTouch &&
    retained >= .7 && corroboration && score >= 62;
  return { score, tier: potential ? 'potential' : 'strong' };
}

/** The display filter never alters the real depth book or other analyses. */
export function visibleChartDensities<T extends { reactionTier?: 'strong' | 'potential' }>(
  densities: readonly T[],
  mode: 'auto' | 'manual' | undefined,
  display: 'all' | 'potential' | undefined,
): T[] {
  if (mode === 'manual' || display === 'all') return [...densities];
  return densities.filter(density => density.reactionTier === 'potential');
}
