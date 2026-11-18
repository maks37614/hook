/**
 * Limit React/HookChart paint frequency as the Terminal workspace grows.
 * The exchange WS, kline ordering, closed-candle signals and alert service
 * remain untouched. This controls only presentation of the latest tick.
 */
export function terminalRenderIntervalMs(chartCount: number, ecoMode: boolean): number {
  if (ecoMode) return 200;
  const count = Number.isFinite(chartCount) ? Math.max(1, chartCount) : 1;
  if (count <= 4) return 80;
  if (count <= 12) return 110;
  if (count <= 24) return 140;
  return 180;
}
