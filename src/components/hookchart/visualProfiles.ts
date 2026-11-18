import type { HookChartPreferences } from '../../types';

export const VISUAL_CONTEXTS = [
  { id: 'screenerQuick', label: 'Скрінер · Швидкий перегляд' },
  { id: 'screenerFull', label: 'Скрінер · Повний графік' },
  { id: 'formationsQuick', label: 'Формації · Швидкий перегляд' },
  { id: 'formationsFull', label: 'Формації · Повний графік' },
  { id: 'terminalLarge', label: 'Термінал · Великий графік' },
  { id: 'terminalMedium', label: 'Термінал · Середній графік' },
  { id: 'terminalCompact', label: 'Термінал · Компактний графік' },
] as const;
export type VisualContextId = typeof VISUAL_CONTEXTS[number]['id'];

/** The Scale picker has only two choices. Terminal layouts retain independent
 * stored profiles, but do not appear as choices here. */
export const SHARED_SCALE_CONTEXTS = [
  { id: 'screenerQuick', label: 'Швидкий перегляд' },
  { id: 'screenerFull', label: 'Повний графік' },
] as const;

export function selectableVisualContexts(_includeTerminalContexts = false) {
  return SHARED_SCALE_CONTEXTS;
}

/** Screener and Formations use the same profile for the same chart size. */
export function canonicalVisualContext(context: VisualContextId): VisualContextId {
  if (context === 'formationsQuick') return 'screenerQuick';
  if (context === 'formationsFull') return 'screenerFull';
  return context;
}

/** Select a visible Scale-tab option without selecting a Terminal-only layout. */
export function visibleScaleContext(context?: VisualContextId): 'screenerQuick' | 'screenerFull' {
  return context === 'screenerFull' || context === 'formationsFull' ? 'screenerFull' : 'screenerQuick';
}
export type VisualDevice = 'mobile' | 'desktop';
export type VisualProfileKey = `${VisualContextId}:${VisualDevice}`;

export interface VisualChartProfile {
  visibleBars: number;
  /** Price-axis zoom relative to the automatically calculated visible price range. */
  verticalZoom: number;
  autoPriceScale: boolean;
  rightGapBars: number;
}
export type VisualProfiles = Partial<Record<VisualProfileKey, VisualChartProfile>>;

// Broad practical bounds keep scales finite and avoid empty/overflowing chart canvases.
export const VISUAL_ZOOM_MIN = 0.01;
export const VISUAL_ZOOM_MAX = 100;
export const VISUAL_GAP_MAX = 2000;

const BASE: Record<VisualContextId, VisualChartProfile> = {
  screenerQuick: { visibleBars: 65, verticalZoom: 1, autoPriceScale: true, rightGapBars: 10 },
  screenerFull: { visibleBars: 110, verticalZoom: 1, autoPriceScale: true, rightGapBars: 12 },
  formationsQuick: { visibleBars: 78, verticalZoom: 1, autoPriceScale: true, rightGapBars: 12 },
  formationsFull: { visibleBars: 125, verticalZoom: 1, autoPriceScale: true, rightGapBars: 15 },
  terminalLarge: { visibleBars: 120, verticalZoom: 1, autoPriceScale: true, rightGapBars: 8 },
  terminalMedium: { visibleBars: 70, verticalZoom: 1, autoPriceScale: true, rightGapBars: 7 },
  terminalCompact: { visibleBars: 36, verticalZoom: 1, autoPriceScale: true, rightGapBars: 5 },
};

export function visualDeviceForWidth(viewportWidth: number): VisualDevice {
  return Number.isFinite(viewportWidth) && viewportWidth < 768 ? 'mobile' : 'desktop';
}

export function visualContextForTerminalWidth(chartWidth: number): VisualContextId {
  if (chartWidth < 440) return 'terminalCompact';
  if (chartWidth < 800) return 'terminalMedium';
  return 'terminalLarge';
}

export function makeVisualProfileKey(context: VisualContextId, device: VisualDevice): VisualProfileKey {
  return `${canonicalVisualContext(context)}:${device}`;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value)) : fallback;
}

export function normalizeVisualProfile(value: unknown, context: VisualContextId): VisualChartProfile {
  const defaults = BASE[canonicalVisualContext(context)];
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<VisualChartProfile> : {};
  return {
    visibleBars: Math.round(clamp(raw.visibleBars, 15, 500, defaults.visibleBars)),
    verticalZoom: Math.round(clamp(raw.verticalZoom, VISUAL_ZOOM_MIN, VISUAL_ZOOM_MAX, defaults.verticalZoom) * 1000) / 1000,
    autoPriceScale: typeof raw.autoPriceScale === 'boolean' ? raw.autoPriceScale : defaults.autoPriceScale,
    rightGapBars: Math.round(clamp(raw.rightGapBars, 0, VISUAL_GAP_MAX, defaults.rightGapBars)),
  };
}

export function normalizedVisualProfiles(value: unknown): VisualProfiles {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const profiles: VisualProfiles = {};
  // The Screener key takes precedence if both old page-specific keys exist.
  // Otherwise migrate the saved Formation key instead of losing its settings.
  for (const context of VISUAL_CONTEXTS) {
    for (const device of ['mobile', 'desktop'] as const) {
      const legacyKey = `${context.id}:${device}` as VisualProfileKey;
      const sharedKey = makeVisualProfileKey(context.id, device);
      if (source[legacyKey] !== undefined && profiles[sharedKey] === undefined) {
        profiles[sharedKey] = normalizeVisualProfile(source[legacyKey], context.id);
      }
    }
  }
  return profiles;
}

export function getVisualProfile(
  settings: Pick<HookChartPreferences, 'visualProfiles'> | undefined,
  context: VisualContextId,
  device: VisualDevice,
): VisualChartProfile {
  const profiles = settings?.visualProfiles;
  const sharedKey = makeVisualProfileKey(context, device);
  const oldFormationKey = canonicalVisualContext(context) === 'screenerQuick'
    ? `formationsQuick:${device}` : canonicalVisualContext(context) === 'screenerFull'
      ? `formationsFull:${device}` : null;
  const value = profiles?.[sharedKey] ?? (oldFormationKey ? profiles?.[oldFormationKey as VisualProfileKey] : undefined);
  return normalizeVisualProfile(value, context);
}

export function patchVisualProfile(
  source: VisualProfiles | undefined,
  key: VisualProfileKey,
  update: Partial<VisualChartProfile> | null,
): VisualProfiles {
  const result = normalizedVisualProfiles(source);
  const [context, device] = key.split(':') as [VisualContextId, VisualDevice];
  const sharedKey = makeVisualProfileKey(context, device);
  if (update === null) { delete result[sharedKey]; return result; }
  result[sharedKey] = normalizeVisualProfile({
    ...getVisualProfile({ visualProfiles: result }, context, device), ...update,
  }, context);
  return result;
}

/** Make this device's chosen view the default for every Screener, Formation and Terminal chart. */
export function applyVisualDefaultsForDevice(
  source: VisualProfiles | undefined,
  device: VisualDevice,
  selected: VisualChartProfile,
): VisualProfiles {
  return VISUAL_CONTEXTS.reduce<VisualProfiles>((acc, context) =>
    patchVisualProfile(acc, makeVisualProfileKey(context.id, device), selected),
  { ...(source || {}) });
}

export function captureVisualProfile(
  current: VisualChartProfile,
  plotWidth: number,
  viewport: { barWidth: number; rightOffset: number; autoY: boolean; manualRange: number | null; yZoom?: number; fitAll?: boolean },
  autoPriceRange?: number,
): VisualChartProfile {
  const horizontalStep = viewport.fitAll || !Number.isFinite(viewport.barWidth) || viewport.barWidth <= 0
    ? plotWidth / current.visibleBars : viewport.barWidth;
  // Right-side empty slots are configured separately in the Graph tab.
  // Do not accidentally store them as visible candles when capturing the view.
  const visibleBars = Math.round(clamp(
    plotWidth / Math.max(.12, horizontalStep) - current.rightGapBars,
    15, 500, current.visibleBars,
  ));
  const verticalZoom = !viewport.autoY && viewport.manualRange && autoPriceRange && autoPriceRange > 0
    ? autoPriceRange / viewport.manualRange : (viewport.yZoom ?? current.verticalZoom);
  return normalizeVisualProfile({
    ...current,
    visibleBars,
    verticalZoom,
    autoPriceScale: viewport.autoY,
    // Only the Graph tab slider owns this setting; a saved pan/zoom must not rewrite it.
    rightGapBars: current.rightGapBars,
  }, 'screenerQuick');
}
