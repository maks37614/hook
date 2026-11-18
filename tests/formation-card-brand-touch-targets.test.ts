import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (relativePath: string) => readFileSync(new URL('../' + relativePath, import.meta.url), 'utf8');
const confirmed = read('src/components/FormationCard.tsx');
const early = read('src/components/EarlyFormationCard.tsx');
const css = read('src/index.css');

test('confirmed and early W/M exchange badges match the Screener card geometry and colors', () => {
  const screener = read('src/components/CoinScreenerPage.tsx');
  const screenerBadge = 'site-exchange-badge site-exchange-badge--compact text-[9px] px-1.5 py-0.2 rounded font-sans font-bold uppercase';
  assert.ok(screener.includes(screenerBadge), 'the Screener card reference remains unchanged');
  for (const card of [confirmed, early]) {
    const summary = card.split('data-formation-market-badges')[1]?.split('data-formation-market-timeframe')[0];
    assert.ok(summary, 'the formation summary badge row exists');
    assert.ok(summary.includes(screenerBadge), 'use exactly the Screener card exchange-badge dimensions');
    assert.match(summary, /bg-amber-950\/80 text-amber-400 border border-amber-800\/60/);
    assert.match(summary, /bg-orange-950\/80 text-orange-400 border border-orange-800\/60/);
    assert.match(summary, /whitespace-nowrap/);
  }
  assert.match(css, /#root \.site-exchange-badge\[data-exchange="binance"\]/);
  assert.match(css, /#root \.site-exchange-badge\[data-exchange="bybit"\]/);
  assert.match(early, /\{tr\(coin\.marketType === 'futures' \? "Ф'ючерси" : 'Спот'\)\}/);
});

test('early W/M symbol names remain copyable even when truncated on narrow cards', () => {
  assert.match(early, /<FormationCoinCopyButton symbol=\{coin\.symbol\} className="flex min-w-0 items-center max-w-full gap-1\.5 text-left"/);
  assert.match(early, /min-w-0 truncate font-extrabold text-base text-white tracking-wide font-mono/);
  assert.match(early, /\/\{coin\.quoteAsset\}/);
  assert.match(early, /<FormationCoinCopyButton/);
});

test('both formation card footers stay on one row with compact responsive hit targets', () => {
  for (const card of [confirmed, early]) {
    assert.match(card, /className="formation-card-footer flex flex-nowrap items-center justify-between/);
    assert.match(card, /h-\[350px\]/);
    assert.match(card, /h-\[390px\]/);
  }
  assert.match(css, /#root \.formation-card-footer button \{[\s\S]*?min-width: 30px;\s*min-height: 30px;/);
  assert.match(css, /@container formation-info \(max-width: 260px\) \{[\s\S]*?min-width: 27px;/);
  assert.match(css, /@container formation-info \(max-width: 210px\) \{[\s\S]*?min-width: 24px;/);
  assert.match(css, /#root \.formation-card-footer \{\s*min-width: 0;\s*flex-wrap: nowrap;/);
  const start = css.indexOf('#root .formation-card-footer {');
  const end = css.indexOf('/* Formations quick-chart header', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(css.slice(start, end), /(?:\.hookchart-root|canvas|WebSocket|transform:|animation:)/);
  assert.match(confirmed, /onClick=\{\(\) => setIsChartExpanded\(true\)\}/);
  assert.match(early, /onClick=\{\(\) => setIsChartExpanded\(true\)\}/);
});
