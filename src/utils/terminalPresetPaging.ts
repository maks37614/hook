export const TERMINAL_PRESET_PAGE_SIZES = [4, 6, 9, 10, 12, 16, 25, 36, 50] as const;

export function resolveTerminalPresetPageSize(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 4 && value <= 50 ? value : 12;
}

export function getTerminalPresetPage<T>(items: readonly T[], requestedPage: number, pageSize: number) {
  const size = resolveTerminalPresetPageSize(pageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const safePage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0;
  const page = Math.max(0, Math.min(pageCount - 1, safePage));
  const start = page * size;
  const end = Math.min(start + size, items.length);
  return { page, pageCount, start, end, coins: items.slice(start, end) };
}

/**
 * The selector controls automatic market-preset pages, not how many charts a
 * trader can add or remove manually. Keep the entire manually edited grid
 * visible up to the existing 50-chart per-page safety limit. Older imported
 * workspaces with more than 50 charts remain paged rather than mounting all
 * their live feeds at once.
 */
export function resolveTerminalWorkspacePageSize(
  configuredLimit: unknown, blockCount: number, automaticMarketPreset: boolean,
): number {
  const presetSize = resolveTerminalPresetPageSize(configuredLimit);
  if (automaticMarketPreset) return presetSize;
  const manualCount = Number.isFinite(blockCount) ? Math.max(0, Math.trunc(blockCount)) : 0;
  return Math.min(50, Math.max(presetSize, manualCount));
}

/** Keep the first visible coin in view when the user changes page size. */
export function pageAfterLimitChange(page: number, oldSize: number, newSize: number): number {
  return Math.floor(Math.max(0, page) * resolveTerminalPresetPageSize(oldSize) / resolveTerminalPresetPageSize(newSize));
}
