import type { DetectedFormation, Timeframe } from '../types';

/**
 * A user can save the current Terminal chart even when the scanner did not
 * detect a pattern on this exact instrument/timeframe. This is a personal
 * chart snapshot, NOT a 0/100 scanner signal and NOT a trading recommendation.
 *
 * Numeric fields stay at 0 only for legacy archive schema compatibility;
 * the archive UI must render missing Entry/TP/SL as "—", never as $0 orders.
 */
export function terminalArchiveFormation(
  selected: DetectedFormation | null | undefined,
  symbol: string,
  timeframe: Timeframe,
  capturedAt = Date.now(),
): DetectedFormation {
  if (selected) return selected;
  return {
    id: 'terminal-snapshot:' + symbol + ':' + timeframe,
    patternKey: 'manual',
    name: 'Збережена монета',
    nameEn: 'Saved coin',
    category: 'candlestick',
    bias: 'neutral',
    confidence: 0,
    status: 'forming',
    statusLabel: 'Без виявленої формації',
    description: 'Особистий знімок графіка без автоматичного торгового сигналу.',
    levels: { entryPrice: 0, targetPrice: 0, stopLossPrice: 0 },
    riskRewardRatio: 0,
    potentialProfitPct: 0,
    potentialRiskPct: 0,
    detectedAt: capturedAt,
  };
}
