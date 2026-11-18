import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { liquidationTextPosition } from '../src/components/hookchart/liquidationDisplay';

test('Liq amount moves immediately below the lower candle wick with arrows off', () => {
  const withArrow = liquidationTextPosition(100, 300, 10, 9, true, true);
  const withoutArrow = liquidationTextPosition(100, 300, 10, 9, true, false);
  assert.deepEqual(withArrow, { baseY: 144, totalY: 134 }, 'arrow-on layout remains unchanged');
  assert.deepEqual(withoutArrow, { baseY: 124, totalY: 114 },
    'total sits 4 CSS pixels below the wick after accounting for its 10px font');
  assert.equal(withoutArrow.baseY - withoutArrow.totalY, 10,
    'the separate L/S line stays directly below the total');

  assert.deepEqual(liquidationTextPosition(100, 300, 10, 9, false, false),
    { baseY: 114, totalY: 114 }, 'without L/S detail there is no reserved second line');
});

test('Liq text stays inside the plot near its lower edge and scales with font settings', () => {
  const nearBottom = liquidationTextPosition(290, 300, 10, 9, true, false);
  assert.equal(nearBottom.baseY, 293);
  assert.ok(nearBottom.totalY < nearBottom.baseY);
  const largerFont = liquidationTextPosition(100, 300, 18, 12, true, false);
  assert.equal(largerFont.totalY, 122);
  assert.equal(largerFont.baseY, 135);
});

test('all chart instances use the arrow-dependent wick-relative positioning', () => {
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(engine, /liquidationTextPosition\(anchorY,g\.plotH,liqTotalFont,liqDetailFont,Boolean\(detail\),showLiquidationArrows\)/);
  assert.match(engine, /if\(showLiquidationArrows&&tailY>tipY\+6\)/,
    'disabling arrows must not interfere with the existing arrow-on draw path');
  assert.match(engine, /q\.strokeText\(summary,tx,totalY\)/);
  assert.match(engine, /q\.strokeText\(detail,tx,baseY\+2\)/);
});
