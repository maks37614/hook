import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const confirmed = read('src/components/FormationCard.tsx');
const early = read('src/components/EarlyFormationCard.tsx');
const css = read('src/index.css');

test('both formation types expose only their middle information as a scrollable panel', () => {
  for (const card of [confirmed, early]) {
    const marker = 'min-h-0 overflow-y-auto touch-scroll formation-card-info-scroll';
    assert.equal(card.split(marker).length - 1, 1);
    assert.match(card, /formation-chart-card/);
    assert.match(card, /h-\[350px\]/);
    assert.match(card, /h-\[390px\]/);
    assert.match(card, /<FormationCoinCopyButton/);
  }
  const begin = css.indexOf('/* Formation coin cards: conceal the visual scrollbar');
  const end = css.indexOf('/* Show a scrollbar only for the scrollable Terminal', begin);
  assert.ok(begin >= 0 && end > begin, 'scrollbar hiding is scoped to formation info');
  // CSS comments describe forbidden properties but are not declarations.
  const styling = css.slice(begin, end).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(styling, /#root \.formation-card-info-scroll \{/);
  assert.match(styling, /scrollbar-width: none !important;/);
  assert.match(styling, /#root \.formation-card-info-scroll::-webkit-scrollbar \{\s*display: none !important;\s*width: 0 !important;/);
  assert.match(styling, /overscroll-behavior-y: contain;/);
  assert.doesNotMatch(styling, /overflow:\s*hidden|overflow-y:\s*hidden/);
  assert.doesNotMatch(styling, /(?:\.hookchart-root|chartCanvas|WebSocket|animation:|transform:|filter:)/);
});

test('confirmed formation evidence labels are readable while round-number flags keep wrapping', () => {
  assert.match(confirmed, /flex flex-wrap items-center gap-x-1\.5 gap-y-1 mt-0\.5/);
  assert.match(confirmed, /text-\[10px\] px-2 py-0\.5 rounded font-bold uppercase tracking-wider whitespace-nowrap/);
  assert.match(confirmed, /flex flex-wrap gap-1 mb-1\.5 text-\[10px\] font-mono text-slate-300/);
  assert.match(confirmed, /mt-1 space-y-0\.5 text-\[10px\] text-slate-400/);
  // Wider multilingual round-number badges intentionally keep their compact
  // type and wrapping rule to protect the card's width at 320px.
  assert.match(confirmed, /min-w-0 max-w-full px-2 py-0\.5 rounded text-center text-\[9px\] leading-tight font-bold uppercase tracking-wider whitespace-normal break-words border/);
});

test('early W/M price detail captions grow without changing order inputs or chart drawing', () => {
  assert.match(early, /shrink-0 text-\[10px\] px-1\.5 py-0\.5 rounded font-bold uppercase border whitespace-nowrap/);
  assert.match(early, /text-\[10px\] text-slate-400 font-mono truncate/);
  assert.match(early, /text-\[10px\] text-slate-400 truncate/);
  assert.match(early, /text-\[10px\] text-sky-300 font-mono truncate/);
  for (const name of ['candidate.target', 'candidate.stopLoss', 'candidate.earlyEntryMin', 'candidate.earlyEntryMax']) {
    assert.ok(early.includes(name), name + ' should remain unchanged');
  }
  assert.ok(early.includes('earlyFormationChartMarkers(candidate)'));
});
