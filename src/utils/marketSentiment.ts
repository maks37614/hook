/**
 * Shared display thresholds for the screener sentiment index.
 * These boundaries also define the server's state names.
 */
export type SentimentState = 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';

export const SENTIMENT_SEGMENTS = [
  { start: 0, end: 12.5, color: '#ff294e' },
  { start: 12.5, end: 25, color: '#f43f5e' },
  { start: 25, end: 33.5, color: '#fb5263' },
  { start: 33.5, end: 42, color: '#ff6578' },
  { start: 42, end: 51, color: '#ffb02e' },
  { start: 51, end: 60, color: '#ffdf40' },
  { start: 60, end: 78, color: '#32e5b1' },
  { start: 78, end: 100, color: '#0fbc83' },
] as const;

export function clampSentimentScore(score: number): number {
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
}

export function sentimentStateForScore(score: number): SentimentState {
  const n = Math.round(clampSentimentScore(score));
  if (n <= 25) return 'extreme_fear';
  if (n <= 42) return 'fear';
  if (n < 60) return 'neutral';
  if (n < 78) return 'greed';
  return 'extreme_greed';
}

/** The numeric marker uses the same thresholds as the server label. */
export function sentimentColorForScore(score: number): string {
  switch (sentimentStateForScore(score)) {
    case 'extreme_fear': return '#ff294e';
    case 'fear': return '#fb5263';
    case 'neutral': return '#ffdf40';
    case 'greed': return '#32e5b1';
    case 'extreme_greed': return '#0fbc83';
  }
}
