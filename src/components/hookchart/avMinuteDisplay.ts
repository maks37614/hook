/**
 * Minute AV must be measured from a completed 1m exchange candle, never 24h/1440.
 * Keep server time and client elapsed time separate: devices with a clock
 * offset must not discard a valid fresh public response.
 */
export type MinuteVolume = { minuteStart: number; volume1mUsd: number };
export type ReceivedMinuteVolume = MinuteVolume & { receivedAt: number; serverNow: number };

export function expectedCompletedMinute(now: number): number {
  return Math.floor((now - 3_000) / 60_000) * 60_000 - 60_000;
}
export function validMinuteVolume(value: unknown): value is MinuteVolume {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MinuteVolume>;
  return typeof row.minuteStart === 'number' && Number.isSafeInteger(row.minuteStart)
    && row.minuteStart > 0 && row.minuteStart % 60_000 === 0
    && typeof row.volume1mUsd === 'number' && Number.isFinite(row.volume1mUsd)
    && row.volume1mUsd >= 0;
}
/** A valid candle on the currently-open 1m chart can avoid a separate request. */
export function freshChartMinute(candle: MinuteVolume | null, now: number): MinuteVolume | null {
  return validMinuteVolume(candle) && candle.minuteStart === expectedCompletedMinute(now)
    ? candle : null;
}
export function parseMinuteVolumeResponse(response: unknown, receivedAt: number): ReceivedMinuteVolume | null {
  if (!response || typeof response !== 'object') return null;
  const data = response as { success?: unknown; serverNow?: unknown; minuteStart?: unknown; volume1mUsd?: unknown };
  if (data.success !== true || !validMinuteVolume(data)) return null;
  const serverNow = (response as { serverNow?: unknown }).serverNow;
  // Clock on the server is authoritative for validating the returned minute.
  // Never accept a still-forming candle or a minutes-old cached response.
  if (typeof serverNow !== 'number' || !Number.isFinite(serverNow)
      || serverNow < data.minuteStart! + 60_000
      || serverNow - data.minuteStart! > 195_000) return null;
  return { minuteStart: data.minuteStart as number, volume1mUsd: data.volume1mUsd as number,
    serverNow, receivedAt };
}
export function selectMinuteVolume(
  chart: MinuteVolume | null, remote: ReceivedMinuteVolume | null,
  now: number,
): MinuteVolume | null {
  const chartNow = freshChartMinute(chart, now);
  const remoteNow = remote && validMinuteVolume(remote)
    && remote.receivedAt <= now && now - remote.receivedAt <= 85_000
    && remote.serverNow >= remote.minuteStart + 60_000
    && remote.serverNow - remote.minuteStart <= 195_000 ? remote : null;
  // An exact local 1m candle takes precedence over an older remote observation.
  if (chartNow && (!remoteNow || chartNow.minuteStart >= remoteNow.minuteStart)) return chartNow;
  return remoteNow;
}
