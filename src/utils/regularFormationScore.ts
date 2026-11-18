import type { ConfluenceBreakdown, ConfluenceComponent } from '../types';

export const REGULAR_BASE_QUALITY_WEIGHTS = {
  formation: 12,
  extremeLocation: 8,
  trigger: 16,
  retest: 7,
  volume: 5,
  volatility: 3,
  level: 6,
  riskReward: 8,
  dataQuality: 7,
} as const;

export const REGULAR_FLOW_QUALITY_WEIGHTS = { openInterest: 5, delta: 5, cvd20: 3 } as const;
export const REGULAR_TECHNICAL_QUALITY_WEIGHTS = { roundNumber: 4, density: 5, rsi: 3, atr: 2 } as const;
export const REGULAR_SUPPLEMENTARY_WEIGHTS = {
  ...REGULAR_FLOW_QUALITY_WEIGHTS, ...REGULAR_TECHNICAL_QUALITY_WEIGHTS,
};
export const REGULAR_BASE_MAX = 72;
export const REGULAR_SUPPLEMENTARY_MAX = 27;
export const roundScore = (value: number) => Number(value.toFixed(1));

export function qualityGrade(total: number): ConfluenceBreakdown['grade'] {
  return total >= 90 ? 'A+' : total >= 82 ? 'A' : total >= 72 ? 'B' : total >= 60 ? 'C' : 'D';
}

export function qualityRow(
  points: number, max: number, evidence: string,
  availability?: ConfluenceComponent['availability'], conflict = false,
): ConfluenceComponent {
  const score = availability ? 0 : roundScore(Math.max(0, Math.min(max, points)));
  return { score, max, evidence, available: !availability, ...(availability ? { availability } : {}),
    status: conflict ? 'CONFLICT' : score >= max * .8 ? 'CONFIRMED' : score > 0 ? 'PARTIAL' : 'MISSING' };
}

export function summarizeRegularScore(confluence: ConfluenceBreakdown): ConfluenceBreakdown {
  const components = confluence.components;
  let basePoints = 0;
  for (const key of Object.keys(REGULAR_BASE_QUALITY_WEIGHTS) as (keyof typeof REGULAR_BASE_QUALITY_WEIGHTS)[]) {
    basePoints += components[key].score;
  }
  let supplementaryPoints = 0;
  let supplementaryAvailable = 0;
  for (const key of Object.keys(REGULAR_SUPPLEMENTARY_WEIGHTS) as (keyof typeof REGULAR_SUPPLEMENTARY_WEIGHTS)[]) {
    const row = components[key];
    if (row?.available) {
      supplementaryPoints += row.score;
      supplementaryAvailable += row.max;
    }
  }
  basePoints = roundScore(basePoints);
  supplementaryPoints = roundScore(supplementaryPoints);
  const total = roundScore(basePoints / REGULAR_BASE_MAX * 100);
  return { ...confluence, scoreVersion: 2, total, grade: qualityGrade(total), basePoints,
    supplementaryPoints, supplementaryAvailable,
    rawTotal: roundScore(basePoints + supplementaryPoints), availableMax: REGULAR_BASE_MAX + supplementaryAvailable };
}
