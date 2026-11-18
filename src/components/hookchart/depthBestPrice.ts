/**
 * Maintain the best live bid/ask incrementally while every order-book delta
 * is still applied. Only removing the current best requires a full side scan.
 * The shared depth socket uses this once for all subscribed HookCharts.
 */
export function applyDepthSide(
  levels: Map<number, number>,
  updates: readonly (readonly [number, number])[],
  best: number,
  bid: boolean,
): number {
  let deletedBest = false;
  for (const [price, quantity] of updates) {
    if (quantity > 0) {
      levels.set(price, quantity);
      if (bid ? price > best : price < best) best = price;
    } else if (levels.delete(price) && price === best) {
      deletedBest = true;
    }
  }

  if (!deletedBest) return best;
  best = bid ? -Infinity : Infinity;
  for (const price of levels.keys()) {
    if (bid ? price > best : price < best) best = price;
  }
  return best;
}
