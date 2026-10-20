/**
 * The saved number of columns is a preference, not a minimum screen width.
 * Narrow windows (including landscape phones and split-screen tablets) must
 * never force a chart smaller than the available touch-friendly width.
 */
export function fitTerminalColumns(containerWidth: number, requestedColumns: number): number {
  const columns = Number.isFinite(requestedColumns) ? Math.max(1, Math.min(6, Math.floor(requestedColumns))) : 1;
  const innerWidth = Math.max(0, containerWidth - 24); // workspace padding
  const maximumThatFits = Math.max(1, Math.floor((innerWidth + 12) / 312)); // 300px chart + 12px gap
  return Math.min(columns, maximumThatFits);
}

/** Match CSS grid auto-placement when charts span multiple columns. */
export function terminalGridRows(spans: readonly (number | 'full' | undefined)[], columns: number): number {
  const totalColumns = Math.max(1, columns);
  let rows = 0;
  let occupied = 0;
  for (const span of spans) {
    const cells = span === 'full' ? totalColumns :
      Math.max(1, Math.min(totalColumns, typeof span === 'number' && Number.isFinite(span) ? Math.floor(span) : 1));
    if (occupied + cells > totalColumns) occupied = 0;
    if (occupied === 0) rows += 1;
    occupied += cells;
    if (occupied === totalColumns) occupied = 0;
  }
  return Math.max(1, rows);
}

export function terminalChartHeight(
  containerHeight: number,
  chartCount: number,
  columns: number,
  autoFitScreen: boolean,
  blockHeight: 'compact' | 'medium' | 'large',
  spans?: readonly (number | 'full' | undefined)[],
): string {
  if (!autoFitScreen) {
    return ({ compact: '280px', medium: '380px', large: '500px' })[blockHeight] || '380px';
  }
  if (!Number.isFinite(containerHeight) || containerHeight <= 0) return '360px';
  const rows = spans ? terminalGridRows(spans, columns) : Math.max(1, Math.ceil(chartCount / Math.max(1, columns)));
  const available = containerHeight - 24 - (rows - 1) * 12;
  // With more charts than can fit vertically, keep them usable and scroll
  // the workspace instead of shrinking them into unreadable thumbnails.
  return `${Math.max(300, Math.floor(available / rows))}px`;
}

export function terminalColumnSpan(span: number | 'full' | undefined, columns: number): string {
  if (span === 'full') return '1 / -1';
  const requested = typeof span === 'number' && Number.isFinite(span) ? Math.floor(span) : 1;
  return `span ${Math.max(1, Math.min(Math.max(1, columns), requested))}`;
}
