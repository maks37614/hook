export const HOOKCHART_PRICE_SCALE_WIDTH = 50;
export const HOOKCHART_PRICE_LABEL_HEIGHT = 18;

// Return positions in input order while keeping nearby price badges readable.
export function layoutPriceScaleLabels(labels: { y: number; current?: boolean }[], height: number): number[] {
  const labelHeight = HOOKCHART_PRICE_LABEL_HEIGHT, gap = 1, padding = 1, step = labelHeight + gap;
  const ordered = labels.map((label, index) => ({ ...label, index })).sort((a, b) => a.y - b.y);
  const tops: number[] = new Array(labels.length);
  let previousBottom = padding - gap;
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].y - ordered[end - 1].y < step) end++;
    const group = ordered.slice(start, end), groupHeight = group.length * step - gap;
    const active = group.findIndex(label => label.current);
    const desiredTop = active >= 0
      ? group[active].y - labelHeight / 2 - active * step
      : group.reduce((sum, label) => sum + label.y, 0) / group.length - groupHeight / 2;
    const top = Math.max(padding, previousBottom + gap, Math.min(height - padding - groupHeight, desiredTop));
    group.forEach((label, offset) => { tops[label.index] = top + offset * step; });
    previousBottom = top + groupHeight;
    start = end;
  }
  // Keep a packed group inside the column when it approaches the lower edge.
  let nextTop = height - padding + gap;
  for (let index = ordered.length - 1; index >= 0; index--) {
    const label = ordered[index];
    tops[label.index] = Math.max(padding, Math.min(tops[label.index], nextTop - step));
    nextTop = tops[label.index];
  }
  return tops;
}
