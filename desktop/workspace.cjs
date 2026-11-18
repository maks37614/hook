'use strict';

// All coordinates are Electron display-independent pixels (DIP).
const { finiteRect } = require('./layout.cjs');
const MAX_OFFSET = 100000;
function normalizeFloatingBounds(input) {
  if (!input || typeof input !== 'object') return null;
  const keys = ['x', 'y', 'width', 'height'];
  if (!keys.every(key => typeof input[key] === 'number' && Number.isFinite(input[key]))) return null;
  const { x, y, width, height } = input;
  if (Math.abs(x) > MAX_OFFSET || Math.abs(y) > MAX_OFFSET || width < 200 || height < 140
    || width > 8192 || height > 8192) return null;
  return Object.fromEntries(keys.map(key => [key, Math.round(input[key])]));
}
function normalizeFloatingBoundsMap(input, validIds) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const id of validIds) {
    const value = normalizeFloatingBounds(input[id]);
    if (value) out[id] = value;
  }
  return out;
}
function intersectionArea(a, b) {
  if (!finiteRect(a) || !finiteRect(b)) return 0;
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}
function clampRect(rect, work) {
  const width = Math.min(rect.width, work.width);
  const height = Math.min(rect.height, work.height);
  return {
    x: Math.round(Math.max(work.x, Math.min(rect.x, work.x + work.width - width))),
    y: Math.round(Math.max(work.y, Math.min(rect.y, work.y + work.height - height))),
    width: Math.round(width), height: Math.round(height),
  };
}
/** Restore saved floating position only when it is still on a connected monitor. */
function restoreFloatingBounds(saved, displays, fallback) {
  const rect = normalizeFloatingBounds(saved);
  if (!rect || !Array.isArray(displays)) return fallback;
  const viable = displays.map(d => d.workArea).filter(finiteRect);
  const area = viable.map(work => ({work, area:intersectionArea(rect,work)}))
    .sort((a,b)=>b.area-a.area)[0];
  // Saved location must still be genuinely visible, not merely touching one pixel.
  return area && area.area >= 60 * 60 ? clampRect(rect, area.work) : fallback;
}
function floatingLayoutKey(profile) {
  return [profile.mode, profile.side, profile.width, profile.height,
    profile.widgets.join(','), Boolean(profile.follow)].join('|');
}
module.exports = {
  normalizeFloatingBounds, normalizeFloatingBoundsMap, intersectionArea,
  restoreFloatingBounds, floatingLayoutKey,
};
