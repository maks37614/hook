import type { Candle } from './engine';
import { formatCryptoPrice } from '../../utils/formatters';

export type MeasurementPoint = { t: number; p: number };
export type MeasurementView = { x: (t: number) => number; y: (p: number) => number; plotW: number; plotH: number };
export type MeasurementHit = 'start' | 'end' | 'body' | null;

const compact = (value: number) => {
  const n = Math.abs(value);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

export function measurementStats(candles: readonly Candle[], a: MeasurementPoint, b: MeasurementPoint, intervalMs: number) {
  const from = Math.min(a.t, b.t), to = Math.max(a.t, b.t);
  let lo = 0, hi = candles.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (candles[mid].t < from) lo = mid + 1; else hi = mid; }
  const first = lo;
  lo = first; hi = candles.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (candles[mid].t <= to) lo = mid + 1; else hi = mid; }
  let volume = 0, quoteVolume = 0;
  for (let i = first; i < lo; i++) {
    const k = candles[i];
    if (!Number.isFinite(k.v) || k.v < 0) continue;
    volume += k.v;
    quoteVolume += k.v * ((k.h + k.l + k.c) / 3);
  }
  const ms = Math.abs(b.t - a.t);
  return {
    pct: a.p ? (b.p - a.p) / a.p * 100 : 0,
    delta: b.p - a.p,
    ms,
    bars: intervalMs > 0 ? Math.round(ms / intervalMs) : Math.max(0, lo - first - 1),
    volume,
    quoteVolume
  };
}

const localization: Record<string, { bars: string; volume: string; day: string; hour: string; min: string; sec: string }> = {
  uk: { bars: 'барів', volume: 'Обсяг', day: 'д', hour: 'год', min: 'хв', sec: 'с' },
  en: { bars: 'bars', volume: 'Volume', day: 'd', hour: 'h', min: 'm', sec: 's' },
  pl: { bars: 'świec', volume: 'Wolumen', day: 'd', hour: 'godz', min: 'min', sec: 's' },
  ru: { bars: 'баров', volume: 'Объём', day: 'д', hour: 'ч', min: 'мин', sec: 'с' }
};

function duration(ms: number, lang: string) {
  const l = localization[lang] || localization.uk;
  const s = Math.round(ms / 1000);
  const days = Math.floor(s / 86400), hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days) return days + l.day + ' ' + hours + l.hour;
  if (hours) return hours + l.hour + ' ' + mins + l.min;
  if (mins) return mins + l.min + ' ' + (s % 60) + l.sec;
  return s + l.sec;
}

export function measurementLabelLayout(g: MeasurementView, a: MeasurementPoint, b: MeasurementPoint) {
  const x1 = g.x(a.t), x2 = g.x(b.t), y1 = g.y(a.p), y2 = g.y(b.p);
  const width = Math.max(100, Math.min(218, g.plotW - 12)), height = 79;
  const x = Math.max(5, Math.min(g.plotW - width - 5, (x1 + x2) / 2 - width / 2));
  const above = Math.min(y1, y2) - height - 12;
  const y = above >= 6 ? above : Math.min(Math.max(6, Math.max(y1, y2) + 12), Math.max(6, g.plotH - height - 6));
  return { x, y, width, height };
}

/** Place the single accessible edit/delete dock INSIDE the tooltip, away
 * from its percentage text. It follows the actual tooltip when the chart pans,
 * the user resizes the ruler, or the visible viewport changes. */
export function measurementActionPosition(g: MeasurementView, a: MeasurementPoint, b: MeasurementPoint) {
  const label = measurementLabelLayout(g, a, b);
  // Dock buttons are 26px wide plus a 2px gap, leaving 4px inset.
  return { x: label.x + label.width - 58, y: label.y + 2 };
}

export function measurementHit(g: MeasurementView, a: MeasurementPoint, b: MeasurementPoint, x: number, y: number): MeasurementHit {
  const x1 = g.x(a.t), x2 = g.x(b.t), y1 = g.y(a.p), y2 = g.y(b.p);
  if (Math.max(x1, x2) < 0 || Math.min(x1, x2) > g.plotW || Math.max(y1, y2) < 0 || Math.min(y1, y2) > g.plotH) return null;
  const label = measurementLabelLayout(g, a, b);
  if (x >= label.x && x <= label.x + label.width && y >= label.y && y <= label.y + label.height) return 'body';
  if (Math.hypot(x - x1, y - y1) <= 13) return 'start';
  if (Math.hypot(x - x2, y - y2) <= 13) return 'end';
  const left = Math.min(x1, x2), right = Math.max(x1, x2), top = Math.min(y1, y2), bottom = Math.max(y1, y2);
  if (x >= left - 6 && x <= right + 6 && y >= top - 6 && y <= bottom + 6) return 'body';
  const vx = x2 - x1, vy = y2 - y1, sq = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / sq));
  return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy)) <= 9 ? 'body' : null;
}

function paintArrow(ctx: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number, color: string) {
  const angle = Math.atan2(endY - startY, endX - startX);
  ctx.strokeStyle = color; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(endX - 7 * Math.cos(angle - .48), endY - 7 * Math.sin(angle - .48));
  ctx.lineTo(endX, endY);
  ctx.lineTo(endX - 7 * Math.cos(angle + .48), endY - 7 * Math.sin(angle + .48));
  ctx.stroke();
}

export function paintMeasurement(
  q: CanvasRenderingContext2D, g: MeasurementView, a: MeasurementPoint, b: MeasurementPoint,
  stats: ReturnType<typeof measurementStats>, lang: string, hovered: boolean, selected: boolean
) {
  const x1 = g.x(a.t), x2 = g.x(b.t), y1 = g.y(a.p), y2 = g.y(b.p);
  if (Math.max(x1, x2) < 0 || Math.min(x1, x2) > g.plotW || Math.max(y1, y2) < 0 || Math.min(y1, y2) > g.plotH) return;
  const positive = stats.delta >= 0;
  const color = positive ? '#34cda7' : '#f47e9c';
  const label = measurementLabelLayout(g, a, b);
  const l = localization[lang] || localization.uk;
  q.save();
  q.beginPath(); q.rect(0, 0, g.plotW, g.plotH); q.clip();
  q.fillStyle = positive ? 'rgba(38,166,154,.12)' : 'rgba(239,83,103,.12)';
  q.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  q.strokeStyle = color; q.lineWidth = 1; q.globalAlpha = .75;
  q.setLineDash([5, 4]); q.beginPath(); q.moveTo(x1, y1); q.lineTo(x2, y2); q.stroke();
  q.setLineDash([]); q.globalAlpha = 1;
  if (Math.abs(x2 - x1) >= 14) paintArrow(q, x1, y2, x2, y2, color);
  if (Math.abs(y2 - y1) >= 14) paintArrow(q, (x1 + x2) / 2, y1, (x1 + x2) / 2, y2, color);
  for (const [px, py] of [[x1, y1], [x2, y2]]) {
    q.beginPath(); q.arc(px, py, hovered || selected ? 5 : 3.5, 0, Math.PI * 2);
    q.fillStyle = hovered || selected ? '#ffffff' : color; q.fill();
    q.strokeStyle = color; q.lineWidth = 1.6; q.stroke();
  }
  q.fillStyle = 'rgba(19,23,34,.96)';
  q.fillRect(label.x, label.y, label.width, label.height);
  q.strokeStyle = color; q.lineWidth = 1.3;
  q.strokeRect(label.x + .5, label.y + .5, label.width - 1, label.height - 1);
  q.textBaseline = 'middle';
  const textX = label.x + 10;
  q.fillStyle = color; q.font = '700 15px system-ui';
  q.fillText((stats.pct > 0 ? '+' : '') + stats.pct.toFixed(2) + '%', textX, label.y + 16, Math.max(10, label.width - 76));
  q.font = '600 11px system-ui';
  q.fillText((stats.delta > 0 ? '+' : '') + formatCryptoPrice(stats.delta), textX, label.y + 34, label.width - 20);
  q.fillStyle = '#e1e8f2'; q.font = '500 10px system-ui';
  q.fillText(stats.bars + ' ' + l.bars + ' · ' + duration(stats.ms, lang), textX, label.y + 51, label.width - 18);
  q.fillText(l.volume + ' ' + compact(stats.volume) + ' (~$' + compact(stats.quoteVolume) + ')', textX, label.y + 67, label.width - 18);
  q.restore();
}
