import type { ArchivedAutoOverlayScene } from '../types';

export type ArchiveOverlayKey = keyof ArchivedAutoOverlayScene;
const KEYS: readonly ArchiveOverlayKey[] = [
  'sr', 'prevDay', 'dayOpen', 'vwap', 'localHL', 'roundLevels', 'poc', 'channel', 'stops',
];

const price = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const time = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const point = (value: any) => value && price(value.p) && time(value.t);

/** The existence of a field means that the tool actually painted a real
 * observation at save time, not merely that a profile toggle was enabled. */
export function archiveVisibleOverlayKeys(scene: ArchivedAutoOverlayScene | undefined): ArchiveOverlayKey[] {
  if (!scene) return [];
  return KEYS.filter(key => Object.prototype.hasOwnProperty.call(scene, key));
}

/** Sanitize captured geometry. No generic arbitrary user preference or indicator
 * is accepted. Missing/disabled overlays cannot be resurrected on re-open. */
export function sanitizeArchivedOverlayScene(input: ArchivedAutoOverlayScene | undefined): ArchivedAutoOverlayScene {
  if (!input) return {};
  const out: ArchivedAutoOverlayScene = {};
  if (Array.isArray(input.sr)) {
    const rows = input.sr.filter(p => point(p) && (p.kind === 'R' || p.kind === 'S'))
      .map(p => ({ kind:p.kind, p:p.p, t:p.t }));
    if (rows.length) out.sr = rows;
  }
  if (input.prevDay && price(input.prevDay.h) && price(input.prevDay.l) && time(input.prevDay.t)) {
    out.prevDay = { h:input.prevDay.h, l:input.prevDay.l, t:input.prevDay.t };
  }
  if (input.dayOpen && point(input.dayOpen)) out.dayOpen = { ...input.dayOpen };
  if (Array.isArray(input.vwap)) {
    const rows = input.vwap.filter(point).map(p => ({t:p.t,p:p.p}));
    if (rows.length >= 2) out.vwap = rows;
  }
  if (Array.isArray(input.localHL)) {
    const rows = input.localHL.filter(p => point(p) && (p.kind === 'R' || p.kind === 'S'))
      .map(p => ({kind:p.kind,p:p.p,t:p.t}));
    if (rows.length) out.localHL = rows;
  }
  if (Array.isArray(input.roundLevels)) {
    const rows = input.roundLevels.filter(price);
    if (rows.length) out.roundLevels = rows;
  }
  if (input.poc && price(input.poc.pLo) && price(input.poc.pHi) &&
    price(input.poc.pMid) && input.poc.pHi >= input.poc.pMid &&
    input.poc.pMid >= input.poc.pLo) out.poc = { ...input.poc };
  if (input.channel) {
    const ch = input.channel;
    if (time(ch.t0) && time(ch.t1) && ch.t1 > ch.t0 &&
      [ch.up0, ch.up1, ch.dn0, ch.dn1, ch.c0, ch.c1].every(price)) {
      out.channel = { t0:ch.t0, t1:ch.t1, up0:ch.up0, up1:ch.up1,
        dn0:ch.dn0, dn1:ch.dn1, c0:ch.c0, c1:ch.c1 };
    }
  }
  if (Array.isArray(input.stops)) {
    const rows = input.stops.filter(p => point(p) && (p.side === 'LONG' || p.side === 'SHORT'))
      .map(p => ({side:p.side,p:p.p,t:p.t}));
    if (rows.length) out.stops = rows;
  }
  return out;
}
