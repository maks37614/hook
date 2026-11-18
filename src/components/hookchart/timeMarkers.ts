export interface HookTimeMarker {
  id: string; time: number; price: number; label: string; side: 'BUY' | 'SELL'; color: string;
  startAt: number; endAt: number | null; points: { time: number; price: number }[];
  selected?: boolean; detail: string[];
}
interface Geometry { plotW: number; plotH: number; x: (time: number) => number; y: (price: number) => number }
/** All times use server/exchange milliseconds, the same unit as HookChart candles. */
export function drawHookTimeMarkers(ctx: CanvasRenderingContext2D, g: Geometry, markers: HookTimeMarker[], mouse: { x: number; y: number } | null) {
  let hovered: HookTimeMarker | undefined;
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.beginPath(); ctx.rect(0, 0, g.plotW, g.plotH); ctx.clip();
  for (const marker of markers) {
    const x = g.x(marker.time), y = Math.max(22, Math.min(g.plotH - 22, g.y(marker.price) + (marker.side === 'BUY' ? 18 : -18)));
    if (x < 0 || x > g.plotW) continue;
    const direction = marker.side === 'BUY' ? -1 : 1;
    ctx.strokeStyle = marker.color; ctx.fillStyle = marker.color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y + 7 * direction); ctx.lineTo(x - 4, y - 2 * direction); ctx.lineTo(x + 4, y - 2 * direction); ctx.closePath(); ctx.fill();
    ctx.font = '600 9px system-ui'; const width = ctx.measureText(marker.label).width, tx = Math.max(3, Math.min(g.plotW - width - 3, x + 6));
    ctx.lineWidth = 3; ctx.strokeStyle = '#131722'; ctx.strokeText(marker.label, tx, y - 9); ctx.fillText(marker.label, tx, y - 9);
    if (mouse && mouse.x >= Math.min(x - 8, tx) && mouse.x <= Math.max(x + 8, tx + width) && Math.abs(mouse.y - y) < 24) hovered = marker;
  }
  const cycle = hovered || markers.find(marker => marker.selected);
  if (cycle) {
    ctx.strokeStyle = cycle.color; ctx.fillStyle = cycle.color; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (const [time, label] of [[cycle.startAt, 'старт'], [cycle.endAt, 'кінець']] as const) if (time !== null) {
      const x = g.x(time); if (x < 0 || x > g.plotW) continue;
      ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, g.plotH - 8); ctx.stroke(); ctx.fillText(label, Math.max(3, Math.min(g.plotW - 40, x + 4)), label === 'старт' ? 13 : 25);
    }
    ctx.setLineDash([]);
    for (const point of cycle.points) {
      const x = g.x(point.time), y = g.y(point.price); if (x < 0 || x > g.plotW || y < 0 || y > g.plotH) continue;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (hovered && mouse) {
    ctx.font = '600 10px system-ui'; const lines = hovered.detail.slice(0, 4), width = Math.min(g.plotW - 8, Math.max(120, ...lines.map(line => ctx.measureText(line).width + 16)));
    const x = Math.max(4, Math.min(g.plotW - width - 4, mouse.x + 10)), y = Math.max(4, Math.min(g.plotH - lines.length * 15 - 10, mouse.y + 20));
    ctx.fillStyle = '#0a1726f2'; ctx.fillRect(x, y, width, lines.length * 15 + 10); ctx.fillStyle = '#d8e9f5';
    lines.forEach((line, i) => ctx.fillText(line, x + 8, y + 16 + i * 15, width - 16));
  }
  ctx.restore();
}
