export interface MagnifierPoint { x: number; y: number }
export interface MagnifierLayout {
  x: number; y: number; radius: number; size: number;
  sourceX: number; sourceY: number; sourceSize: number;
}

export const TOUCH_MAGNIFIER_DEFAULT_ZOOM = 2;

/** Dragging upward on the right-hand price scale zooms the lens in, downward zooms out. */
export function magnifierZoomFromPriceDrag(initialZoom: number, deltaY: number): number {
  const start = Number.isFinite(initialZoom) ? initialZoom : TOUCH_MAGNIFIER_DEFAULT_ZOOM;
  const delta = Number.isFinite(deltaY) ? deltaY : 0;
  return Math.max(1.25, Math.min(6, start * Math.exp(-delta / 150)));
}

export function touchMagnifierLayout(
  width: number, height: number, point: MagnifierPoint,
  zoom = TOUCH_MAGNIFIER_DEFAULT_ZOOM, focusOnTouch = false,
): MagnifierLayout | null {
  if (![width, height, point.x, point.y].every(Number.isFinite) || width < 64 || height < 64) return null;
  const radius = Math.min(58, (width - 12) / 2, (height - 12) / 2);
  const size = radius * 2;
  const safeZoom = Number.isFinite(zoom) ? Math.max(1.25, Math.min(6, zoom)) : TOUCH_MAGNIFIER_DEFAULT_ZOOM;
  const sourceSize = size / safeZoom;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const selectedX = clamp(point.x, 0, width), selectedY = clamp(point.y, 0, height);
  // The touch stays on the selected candle/crosshair, but the magnifier
  // floats ABOVE the finger. Keep the full lens inside the chart canvas.
  const edgeInset = radius + 6;
  const fingerGap = 36; // 12px more clearance above the inspecting finger.
  let x = clamp(selectedX, edgeInset, width - edgeInset);
  const y = clamp(selectedY - radius - fingerGap, edgeInset, height - edgeInset);

  // Near the top there is not enough room for a lens entirely above the
  // touch. Shift it toward the roomier side so it doesn't cover the finger.
  if (y + radius + fingerGap > selectedY) {
    const sideOffset = size + fingerGap;
    const left = clamp(selectedX - sideOffset, edgeInset, width - edgeInset);
    const right = clamp(selectedX + sideOffset, edgeInset, width - edgeInset);
    x = selectedX - left > right - selectedX ? left : right;
  }

  return {
    x,
    y,
    radius, size, sourceSize,
    // Inspection keeps its historic lens-centred sampling. While placing a
    // drawing anchor, the floating lens must instead show the precise candle
    // beneath the obscuring fingertip, even if the lens sits above/to the side.
    sourceX: (focusOnTouch ? selectedX : x) - sourceSize / 2,
    sourceY: (focusOnTouch ? selectedY : y) - sourceSize / 2,
  };
}

/** Sample the finished chart before painting the lens, so it cannot magnify itself. */
export function drawTouchMagnifier(
  chart: HTMLCanvasElement, context: CanvasRenderingContext2D,
  sample: HTMLCanvasElement, width: number, height: number, point: MagnifierPoint,
  backgroundColor = '#131722',
  paintSourceOverlay?: (context: CanvasRenderingContext2D) => void,
  zoom = TOUCH_MAGNIFIER_DEFAULT_ZOOM,
  focusOnTouch = false,
): void {
  const layout = touchMagnifierLayout(width, height, point, zoom, focusOnTouch);
  if (!layout) return;
  const { x, y, radius, size, sourceX, sourceY, sourceSize } = layout;
  const scaleX = chart.width / width, scaleY = chart.height / height;
  // A 2x lens does not need a 3x/4x scratch bitmap on high-DPI phones.
  const sampleWidth = Math.max(1, Math.ceil(size * Math.min(2, scaleX)));
  const sampleHeight = Math.max(1, Math.ceil(size * Math.min(2, scaleY)));
  if (sample.width !== sampleWidth) sample.width = sampleWidth;
  if (sample.height !== sampleHeight) sample.height = sampleHeight;
  const buffer = sample.getContext('2d');
  if (!buffer) return;
  buffer.clearRect(0, 0, sampleWidth, sampleHeight);
  buffer.imageSmoothingEnabled = false;
  const left = Math.max(0, sourceX), top = Math.max(0, sourceY);
  const right = Math.min(width, sourceX + sourceSize), bottom = Math.min(height, sourceY + sourceSize);
  // Copy only legal source pixels and preserve their offset in the padded sample.
  // This avoids browser-dependent clipping of negative drawImage source rectangles.
  buffer.drawImage(chart,
    left * scaleX, top * scaleY, (right - left) * scaleX, (bottom - top) * scaleY,
    (left - sourceX) / sourceSize * sampleWidth, (top - sourceY) / sourceSize * sampleHeight,
    (right - left) / sourceSize * sampleWidth, (bottom - top) / sourceSize * sampleHeight);

  if (paintSourceOverlay) {
    buffer.save();
    buffer.setTransform(sampleWidth / sourceSize, 0, 0, sampleHeight / sourceSize,
      -sourceX / sourceSize * sampleWidth, -sourceY / sourceSize * sampleHeight);
    paintSourceOverlay(buffer);
    buffer.restore();
  }

  context.save();
  context.globalAlpha = 1;
  context.setLineDash([]);
  context.shadowColor = 'rgba(0,0,0,.55)';
  context.shadowBlur = 14;
  context.fillStyle = backgroundColor;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.clip();
  context.imageSmoothingEnabled = false;
  context.drawImage(sample, x - radius, y - radius, size, size);
  if (focusOnTouch) {
    // The exact touched candle/price is at the centre of the enlarged view.
    // Draw a compact target on the lens, not underneath the user's finger.
    context.lineWidth = 3;
    context.strokeStyle = '#0b1220';
    context.beginPath();
    context.moveTo(x - 12, y); context.lineTo(x - 4, y);
    context.moveTo(x + 4, y); context.lineTo(x + 12, y);
    context.moveTo(x, y - 12); context.lineTo(x, y - 4);
    context.moveTo(x, y + 4); context.lineTo(x, y + 12);
    context.stroke();
    context.lineWidth = 1.25;
    context.strokeStyle = '#f4f8ff';
    context.stroke();
  }
  context.restore();
  context.save();
  context.globalAlpha = 1;
  context.setLineDash([]);
  context.strokeStyle = '#aab5c4';
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}
