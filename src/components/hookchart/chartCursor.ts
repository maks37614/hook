import { HOOKCHART_PRICE_LABEL_HEIGHT, HOOKCHART_PRICE_SCALE_WIDTH } from './priceScale';

export interface CursorGeometry {
  width: number; height: number; plotWidth: number; plotHeight: number;
}
export interface CursorPoint { x: number; y: number }

export const DEFAULT_CROSSHAIR_LINE_WIDTH = 1;
export function normalizeCrosshairLineWidth(value?: number): number {
  return Number.isFinite(value) ? Math.max(.5, Math.min(2, value!)) : DEFAULT_CROSSHAIR_LINE_WIDTH;
}

/** Mobile hold/Shift measurement belongs to the same cheap pointer layer. */
export function paintChartRuler(
  context: CanvasRenderingContext2D, geometry: CursorGeometry,
  start: CursorPoint, end: CursorPoint, text: string,
): void {
  context.save();
  context.beginPath();
  context.rect(0, 0, geometry.plotWidth, geometry.plotHeight);
  context.clip();
  context.fillStyle = '#22d3ee18';
  context.strokeStyle = '#22d3ee';
  context.lineWidth = 1;
  context.setLineDash([3, 3]);
  context.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
  context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  context.setLineDash([]);
  context.font = '600 11px system-ui';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#0d2734';
  context.fillRect(8, 7, Math.max(0, Math.min(geometry.plotWidth - 16, context.measureText(text).width + 16)), 24);
  context.fillStyle = '#adf2f2';
  context.fillText(text, 15, 23);
  context.restore();
}

/** Constant-size presentation work: no candle/indicator data or React state updates. */
export function paintChartCrosshair(
  context: CanvasRenderingContext2D, geometry: CursorGeometry,
  point: CursorPoint, priceText: string, color = '#758696', lineWidth = DEFAULT_CROSSHAIR_LINE_WIDTH,
): void {
  const { width, height, plotWidth, plotHeight } = geometry;
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  context.strokeStyle = color;
  context.lineWidth = normalizeCrosshairLineWidth(lineWidth);
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(point.x, 0);
  context.lineTo(point.x, plotHeight);
  context.moveTo(0, point.y);
  context.lineTo(plotWidth, point.y);
  context.stroke();
  const labelHeight = HOOKCHART_PRICE_LABEL_HEIGHT, labelWidth = HOOKCHART_PRICE_SCALE_WIDTH - 2;
  const top = Math.max(1, Math.min(plotHeight - labelHeight - 1, point.y - labelHeight / 2));
  context.fillStyle = '#303946';
  context.fillRect(plotWidth + 1, top, labelWidth, labelHeight);
  context.fillStyle = '#ffffff';
  context.font = '700 12px system-ui';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(priceText, plotWidth + 1 + labelWidth / 2, top + labelHeight / 2 + .5, labelWidth - 2);
  context.restore();
}
