import test from 'node:test';
import assert from 'node:assert/strict';
import { supportResistanceLevels } from '../src/components/hookchart/supportResistance.ts';

const series = () => Array.from({ length: 80 }, (_, i) => ({ t: i * 900_000, o: 100, c: 100, h: i === 20 ? 110 : 101, l: i === 20 ? 90 : 99, v: 100, n: 0 }));

test('support and resistance use exact highs/lows, including both extremes of an outside candle', () => {
  const levels = supportResistanceLevels(series(), '15m');
  assert.deepEqual(levels.map(({ kind, p, t }) => ({ kind, p, t })).sort((a, b) => a.p - b.p), [
    { kind: 'S', p: 90, t: 20 * 900_000 }, { kind: 'R', p: 110, t: 20 * 900_000 },
  ]);
});

test('confirmed breaks retire old labels even after price returns, while wick penetrations do not', () => {
  const rows = series();
  rows[40].h = 112;
  assert.ok(supportResistanceLevels(rows, '15m').some(level => level.kind === 'R' && level.p === 110));
  rows[40].c = 111;
  rows[41] = { ...rows[41], h: 112, c: 111 };
  assert.equal(supportResistanceLevels(rows, '15m').some(level => level.kind === 'R' && level.p === 110), false);
  rows[50] = { ...rows[50], l: 88, c: 89 };
  rows[51] = { ...rows[51], l: 88, c: 89 };
  assert.equal(supportResistanceLevels(rows, '15m').some(level => level.kind === 'S' && level.p === 90), false);
});

test('labels stay on the correct side of live price and do not use an unfinished candle to confirm a pivot', () => {
  const rows = series();
  rows.at(-1)!.c = 111;
  assert.ok(supportResistanceLevels(rows, '15m').every(level => level.kind === 'S' ? level.p <= 111 : level.p >= 111));
  rows.at(-1)!.c = 89;
  assert.ok(supportResistanceLevels(rows, '15m').every(level => level.kind === 'S' ? level.p <= 89 : level.p >= 89));
  const unconfirmed = series().map(row => ({ ...row, h: 101, l: 99 }));
  unconfirmed[74].h = 115;
  assert.equal(supportResistanceLevels(unconfirmed, '15m').length, 0);
  unconfirmed.push({ ...unconfirmed.at(-1)!, t: 80 * 900_000 });
  assert.ok(supportResistanceLevels(unconfirmed, '15m').some(level => level.kind === 'R' && level.p === 115));
});
