import type { DetectedFormation } from '../types';

/**
 * A purely client-side 24h reference range must never be presented as a
 * scanner-detected formation or assigned a fabricated confidence score.
 * Legacy screener_* ranges created before the provenance tag are also covered.
 */
export function isScreener24hPreview(
  formation: Pick<DetectedFormation, 'id' | 'patternKey' | 'validation' | 'source'>,
): boolean {
  return formation.source === 'screener_24h_preview'
    || (formation.source === undefined && formation.id.startsWith('screener_')
      && formation.patternKey === 'range' && !formation.validation);
}

/** Checks direction and finite Entry/TP/SL before setting a bundled trading
 *  alert. This only validates the price geometry, NOT the signal quality.
 */
export function hasDirectionalTradeLevels(
  formation: Pick<DetectedFormation, 'bias' | 'levels'>,
): boolean {
  const { entryPrice: entry, targetPrice: target, stopLossPrice: stop } = formation.levels;
  if (![entry, target, stop].every(value => Number.isFinite(value) && value > 0)) return false;
  if (formation.bias === 'bullish') return stop < entry && entry < target;
  if (formation.bias === 'bearish') return target < entry && entry < stop;
  return false;
}
