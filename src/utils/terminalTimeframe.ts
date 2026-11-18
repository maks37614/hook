import type { TerminalChartBlock, Timeframe } from '../types';

/** Apply a header timeframe to every mounted and saved Terminal panel,
 * keeping instruments, chart sizes, drawing identity and other settings.
 * A no-op retains object identity and avoids needless HookChart reconnects. */
export function applyTerminalTimeframe(
  blocks: TerminalChartBlock[], timeframe: Timeframe,
): TerminalChartBlock[] {
  let changed = false;
  const next = blocks.map(block => {
    if (block.timeframe === timeframe) return block;
    changed = true;
    return { ...block, timeframe };
  });
  return changed ? next : blocks;
}
