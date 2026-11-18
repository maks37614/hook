import type { SurveillanceEvent } from '../types';

export type SurveillanceEventCategory = 'level' | 'structure' | 'density' | 'setup' | 'other';
export type SurveillanceEventFilter = 'all' | 'critical' | Exclude<SurveillanceEventCategory, 'other'>;
type EventForCategory = Pick<SurveillanceEvent, 'type' | 'details' | 'severity'>;

/** Classify by stable server code, never translated event titles. */
const CATEGORY_CODES: Readonly<Record<string, SurveillanceEventCategory>> = {
  LEVEL_DETECTED: 'level',
  LEVEL_CROSS_4H: 'level', LEVEL_CROSS_1H: 'level', LEVEL_CROSS_15M: 'level',
  FIBONACCI: 'level',
  THIRD_TOUCH_APPROACHING: 'level', THIRD_TOUCH_ACTIVE: 'level', THIRD_TOUCH_REACTION: 'level',
  SUPPORT_RESISTANCE_FLIP: 'level', PRESSURE_TO_HIGH: 'level', PRESSURE_TO_LOW: 'level',
  STRUCTURE_SHIFT: 'structure', BOS: 'structure', CHOCH: 'structure',
  CHANNEL_BREAK: 'structure', CHANNEL_BREAKOUT: 'structure',
  DENSITY_APPEARED: 'density', DENSITY_PERSISTENT: 'density', DENSITY_REMOVED: 'density',
  FORMATION_DETECTED: 'setup', FORMATION_INVALIDATED: 'setup',
  FORMATION_SETUP_CONFIRMED: 'setup', SUPPORT_RETEST_WATCH: 'setup',
  SUPPORT_RETEST_CONFIRMED: 'setup', RESISTANCE_RETEST_CONFIRMED: 'setup',
  BREAKOUT_REALTIME: 'setup', BREAKOUT_CONFIRMED: 'setup', BREAKOUT_RETEST: 'setup',
};

export function getSurveillanceEventCategory(event: Pick<EventForCategory, 'type' | 'details'>): SurveillanceEventCategory {
  const code = typeof event.details?.notificationType === 'string'
    ? event.details.notificationType
    : typeof event.details?.type === 'string'
      ? event.details.type
      : '';
  const normalized = code.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (CATEGORY_CODES[normalized]) return CATEGORY_CODES[normalized];
  // Older stored events have only broad, non-localized types.
  if (event.type === 'level' || event.type === 'structure') return event.type;
  return 'other';
}

export function matchesSurveillanceEventFilter(event: EventForCategory, filter: SurveillanceEventFilter): boolean {
  if (filter === 'all') return true;
  // Criticality is an independent severity dimension.
  if (filter === 'critical') return event.severity === 'critical';
  return getSurveillanceEventCategory(event) === filter;
}

export function countSurveillanceEventCategories(events: readonly EventForCategory[]) {
  const count = { all: 0, critical: 0, level: 0, structure: 0, density: 0, setup: 0 };
  for (const event of events) {
    count.all++;
    if (event.severity === 'critical') count.critical++;
    const category = getSurveillanceEventCategory(event);
    if (category !== 'other') count[category]++;
  }
  return count;
}
