import React from 'react';
import { useSharedChartClock } from './useSharedChartClock';

export function countdownBarLeftMs(now: number, intervalMs: number, lastBarStart?: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(intervalMs) || intervalMs <= 0) return 0;
  const currentBarStart = Math.floor(now / intervalMs) * intervalMs;
  // The countdown must roll forward at the candle boundary even if the
  // next Kline packet arrives late. It must not freeze at 00:00 for a bar.
  const barStart = lastBarStart != null && lastBarStart <= now && now - lastBarStart < intervalMs
    ? lastBarStart : currentBarStart;
  return Math.max(0, barStart + intervalMs - now);
}

export function formatCountdownBarLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * The one-second clock subscribes only this tiny label, not the Canvas Chart.
 * Every HookChart may show a countdown, but no chart scene or indicators need
 * to execute React work for the passage of one wall-clock second.
 */
export const ChartBarCountdown = React.memo(function ChartBarCountdown({ tf, intervalMs, lastBarStart }: {
  tf: string;
  intervalMs: number;
  lastBarStart?: number;
}) {
  const now = useSharedChartClock(true);
  const ms = countdownBarLeftMs(now, intervalMs, lastBarStart);
  return <div className="barCountdown" role="timer" aria-label="Час до закриття бару" title={`До закриття свічки ${tf}`}>
    <b>{formatCountdownBarLeft(ms)}</b>
  </div>;
});
