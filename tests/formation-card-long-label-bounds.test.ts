import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../src/components/' + path, import.meta.url), 'utf8');
const regular = read('FormationCard.tsx');
const early = read('EarlyFormationCard.tsx');

test('formation status text remains fully readable inside constrained card width', () => {
  for (const card of [regular, early]) {
    assert.match(card, /flex min-w-0 items-start justify-between gap-2 text-\[11px\] text-slate-400 mb-1\.5/);
    assert.match(card, /<span className="shrink-0">\{tr\('Статус:'\)\}<\/span>/);
    assert.match(card, /min-w-0 max-w-\[72%\] break-words text-right|break-words text-\[10px\] font-semibold rounded px-1\.5 py-0\.5 text-right/);
    assert.match(card, /min-h-\[350px\]/);
    assert.match(card, /h-\[390px\]/);
    assert.match(card, /formation-card-info-scroll/);
  }
  assert.match(regular, /trStatus\(formation\.statusLabel\)/);
  assert.match(early, /tr\(ready \? 'Формується' : 'Потенційна'\)/);
});

test('early breakout, SL and neckline labels can wrap without moving price beyond their tile', () => {
  const start = early.indexOf("{tr('Вхід після пробою')}");
  const end = early.indexOf("{tr('R:R після пробою ≈')}", start);
  assert.ok(start > 0 && end > start);
  const area = early.slice(start - 220, end);
  assert.equal((area.match(/flex min-w-0 items-start justify-between gap-2/g) ?? []).length, 3);
  assert.equal((area.match(/min-w-0 flex-1 break-words text-slate-400/g) ?? []).length, 3);
  assert.equal((area.match(/min-w-0 max-w-\[55%\] shrink-0 truncate text-right font-mono/g) ?? []).length, 3);
  for (const field of ['breakoutEntry', 'breakoutStopLoss', 'neckline']) {
    assert.ok(area.includes('title={money(candidate.' + field + ')}'), 'full accessible price kept for ' + field);
    assert.ok(area.includes('{money(candidate.' + field + ')}'), 'actual value remains ' + field);
  }
});

test('confirmed formation level tiles keep exact amounts in titles if text is truncated', () => {
  for (const field of ['targetPrice', 'stopLossPrice', 'entryPrice']) {
    assert.ok(regular.includes('formatPrice(formation.levels.' + field + ')'), field);
    assert.ok(regular.includes('title={String.fromCharCode(36) + formatPrice(formation.levels.' + field + ')}') ||
      (field === 'entryPrice' && regular.includes("title={formation.tpSlBuilder?.touches?.ready === false ? tr('Очікування дотиків') : String.fromCharCode(36) + formatPrice(formation.levels.entryPrice)}")), field + ' title');
  }
  assert.match(regular, /title=\{formatPercent\(Math\.abs\(formation\.potentialProfitPct\)\)\}/);
  assert.match(regular, /title=\{formatPercent\(-Math\.abs\(formation\.potentialRiskPct\)\)\}/);
  assert.match(regular, /isChartExpanded \?[\s\S]*?h-\[390px\]/);
  assert.match(early, /earlyFormationChartMarkers\(candidate\)/);
});
