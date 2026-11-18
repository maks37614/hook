import type { TerminalChartBlock, TerminalWorkspaceConfig } from '../types';

type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide';

/** Match TerminalPage Tailwind columns at base / md / lg / xl. */
export function terminalResponsiveColumns(columns: number, breakpoint: Breakpoint): number {
  const configured = Number.isInteger(columns) ? Math.max(1, Math.min(6, columns)) : 2;
  if (breakpoint === 'mobile' || configured === 1) return 1;
  if (breakpoint === 'tablet') return 2;
  if (breakpoint === 'desktop') return configured >= 4 ? 3 : 2;
  return configured;
}


/** Compute responsive columns with no chart polling or resize listeners. */
export function terminalResponsiveLayoutColumns(
  columns: number, count: number, breakpoint: Breakpoint,
  layoutPreset: TerminalWorkspaceConfig['layoutPreset'] = 'custom',
  freeLayoutAutoColumns = true,
): number {
  if (count <= 1) return 1;
  if (layoutPreset !== 'custom' || !freeLayoutAutoColumns)
    return terminalResponsiveColumns(columns, breakpoint);
  if (breakpoint === 'mobile') return 1;
  if (breakpoint === 'tablet') return 2;
  if (breakpoint === 'desktop') return count >= 10 ? 3 : 2;
  if (count === 3) return 3;
  if (count <= 4) return 2;
  return count <= 9 ? 3 : 4;
}

/** Tailwind class list mirrors the breakpoint decisions above. */
export function terminalGridColumnClasses(
  layoutPreset: TerminalWorkspaceConfig['layoutPreset'],
  columns: number, count: number, freeLayoutAutoColumns = true,
): string {
  if (count <= 1) return 'grid-cols-1';
  if (layoutPreset === 'custom' && freeLayoutAutoColumns) {
    if (count === 3) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 9) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  }
  switch (columns) {
    case 1: return 'grid-cols-1';
    case 2: return 'grid-cols-1 md:grid-cols-2';
    case 3: return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    case 4: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    case 5: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5';
    case 6: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';
    default: return 'grid-cols-1 md:grid-cols-2';
  }
}

/** Match the span of each TerminalChartWidget at each Tailwind breakpoint. */
function terminalSpan(span: TerminalChartBlock['colSpan'], columns: number, breakpoint: Breakpoint): number {
  if (span === 'full' || span === 4) return columns;
  if (breakpoint === 'mobile') return 1;
  if (span === 3 && breakpoint !== 'tablet') return Math.min(3, columns);
  if (span === 2 || span === 3) return Math.min(2, columns);
  return 1;
}

/**
 * Count real CSS-grid rows instead of dividing by the SAVED number of columns.
 * On a phone even a 3-column preset renders as one column; counting it as one
 * row made each coin appear as a fullscreen chart with others below the fold.
 * Takes no listeners, chart streams, or market requests.
 */
export function terminalResponsiveRows(
  blocks: readonly Pick<TerminalChartBlock, 'colSpan'>[],
  configuredColumns: number,
  breakpoint: Breakpoint,
  layoutPreset: TerminalWorkspaceConfig['layoutPreset'] = 'custom',
  freeLayoutAutoColumns = false,
): number {
  const columns = terminalResponsiveLayoutColumns(
    configuredColumns, blocks.length, breakpoint, layoutPreset, freeLayoutAutoColumns,
  );
  let rows = 0;
  let used = 0;
  for (const block of blocks) {
    const span = terminalSpan(block.colSpan, columns, breakpoint);
    if (used > 0 && used + span > columns) { rows++; used = 0; }
    used += span;
    if (used === columns) { rows++; used = 0; }
  }
  return rows + (used > 0 ? 1 : 0);
}

function heightForRows(rows: number): string {
  if (rows <= 1) return 'calc(100dvh - 110px)';
  if (rows === 2) return 'calc((100dvh - 120px) / 2)';
  return 'calc((100dvh - 130px) / 3)';
}

export function terminalResponsiveAutoHeights(
  blocks: readonly Pick<TerminalChartBlock, 'colSpan'>[],
  columns: number,
  layoutPreset: TerminalWorkspaceConfig['layoutPreset'] = 'custom',
  freeLayoutAutoColumns = false,
): Record<Breakpoint, string> {
  return {
    mobile: heightForRows(terminalResponsiveRows(blocks, columns, 'mobile', layoutPreset, freeLayoutAutoColumns)),
    tablet: heightForRows(terminalResponsiveRows(blocks, columns, 'tablet', layoutPreset, freeLayoutAutoColumns)),
    desktop: heightForRows(terminalResponsiveRows(blocks, columns, 'desktop', layoutPreset, freeLayoutAutoColumns)),
    wide: heightForRows(terminalResponsiveRows(blocks, columns, 'wide', layoutPreset, freeLayoutAutoColumns)),
  };
}
