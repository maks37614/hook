import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getReplayPresetDate, processCandlesForCutoff } from '../src/utils/replayService';

const toolbar = readFileSync(new URL('../src/components/replay/ReplayToolbar.tsx', import.meta.url), 'utf8');

test('Replay historical date picker is rendered at body level above the chart', () => {
  assert.match(toolbar, /import \{ createPortal \} from 'react-dom'/);
  assert.match(toolbar, /isDatePickerOpen && typeof document !== 'undefined' && createPortal\(/);
  assert.match(toolbar, /document\.body\s*\n\s*\)\}/);
  assert.match(toolbar, /fixed inset-0 z-\[250\]/);
  assert.match(toolbar, /role="dialog"/);
  assert.match(toolbar, /aria-modal="true"/);
  assert.match(toolbar, /aria-labelledby="replay-date-picker-title"/);
});

test('Replay date modal fits short mobile viewports and keeps content scrollable', () => {
  assert.match(toolbar, /max-h-\[calc\(100dvh-16px\)\]/);
  assert.match(toolbar, /sm:max-h-\[calc\(100dvh-32px\)\]/);
  assert.match(toolbar, /min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain/);
  assert.match(toolbar, /grid grid-cols-2 gap-2 min-\[380px\]:grid-cols-3/);
  assert.match(toolbar, /block w-full min-w-0 max-w-\[300px\]/);
  assert.match(toolbar, /shrink-0 items-center justify-between gap-3 border-b/);
  assert.match(toolbar, /shrink-0 items-center justify-end gap-2 border-t/);
  assert.match(toolbar, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(toolbar, /document\.documentElement\.style\.overflow = 'hidden'/);
  assert.match(toolbar, /document\.body\.style\.overflow = bodyOverflow/);
  assert.match(toolbar, /document\.documentElement\.style\.overflow = htmlOverflow/);
  assert.match(toolbar, /event\.key === 'Escape'/);
});

test('Replay date picker preserves date choice actions and only changes date dialog', () => {
  assert.match(toolbar, /onClick=\{\(\) => handleApplyPresetDaysAgo\(item\.days\)\}/);
  assert.match(toolbar, /onClick=\{handleApplyCustomDate\}/);
  assert.match(toolbar, /onRandomHistoricalDate\(\)/);
  assert.match(toolbar, /onChange=\{\(event\) => setCustomDateTime\(event\.target\.value\)\}/);
  assert.match(toolbar, /isCoinModalOpen && typeof document !== 'undefined' && createPortal\(/);
});

test('Replay quick dates start with 1, 3 and 5 days ago before older presets', () => {
  const expected = [
    "{ label: '1 день тому', days: 1 }",
    "{ label: '3 дні тому', days: 3 }",
    "{ label: '5 днів тому', days: 5 }",
    "{ label: '14 днів тому', days: 14 }",
  ];
  let lastOffset = -1;
  for (const label of expected) {
    const offset = toolbar.indexOf(label);
    assert.ok(offset > lastOffset, 'Missing or out-of-order preset: ' + label);
    lastOffset = offset;
  }
  assert.doesNotMatch(toolbar, /\{ label: 'Сьогодні', days: 0 \}/);
  assert.match(toolbar, /onSelectHistoricalDate\(getReplayPresetDate\(days\)\)/);
});

test('Replay presets target local calendar day midnight, even across month boundaries', () => {
  const now = new Date(2026, 10, 12, 1, 33, 52);
  for (const days of [0, 1, 3, 5, 14, 30, 60, 90, 180, 365]) {
    const expected = new Date(now);
    expected.setDate(expected.getDate() - days);
    expected.setHours(0, 0, 0, 0);
    const actual = getReplayPresetDate(days, now);
    assert.equal(actual.getTime(), expected.getTime());
    assert.equal(actual.getHours(), 0);
    assert.equal(actual.getMinutes(), 0);
  }
  assert.equal(getReplayPresetDate(0, now).getDate(), 12);
  assert.equal(getReplayPresetDate(1, now).getDate(), 11);
  assert.equal(getReplayPresetDate(3, now).getDate(), 9);
  assert.equal(getReplayPresetDate(5, now).getDate(), 7);
});

test('Near-live replay dates do not rewind 30 candles when future data is unavailable', () => {
  const now = new Date(2026, 10, 12, 1, 33, 0).getTime();
  const oneHour = 60 * 60 * 1000;
  const beginning = now - 281 * oneHour;
  const candles = Array.from({ length: 282 }, (_, n) => ({
    time: Math.floor((beginning + n * oneHour) / 1000),
    open: 10, high: 11, low: 9, close: 10, volume: 1,
  }));
  const today = getReplayPresetDate(0, new Date(now)).getTime();
  const recent = processCandlesForCutoff(candles, today, '1h', now);
  const dateCutoff = candles.reduce((index, candle, i) => candle.time * 1000 <= today ? i : index, -1);
  assert.equal(recent.cutoffIndex, dateCutoff);
  const beyondLast = processCandlesForCutoff(candles, beginning - 30 * oneHour, '1h', now);
  assert.ok(beyondLast.cutoffIndex < candles.length - 1);
});


test('Replay coin picker uses a body portal and scales across phone and desktop viewports', () => {
  assert.match(toolbar, /isCoinModalOpen && typeof document !== 'undefined' && createPortal\(/);
  assert.match(toolbar, /aria-labelledby="replay-coin-picker-title"/);
  assert.match(toolbar, /role="dialog"/);
  assert.match(toolbar, /aria-modal="true"/);
  assert.match(toolbar, /fixed inset-0 z-\[250\]/);
  assert.match(toolbar, /replay-coin-modal flex w-full min-w-0 flex-col overflow-hidden/);
  assert.match(toolbar, /replay-coin-filters min-h-0 min-w-0 shrink-0.*overflow-x-hidden overflow-y-auto/);
  assert.match(toolbar, /replay-coin-list min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto/);
  assert.match(toolbar, /replay-coin-card-grid grid min-w-0 gap-2/);
  assert.match(toolbar, /document\.body\s*\n\s*\)\}/);
});

test('Coin search and filters fit mobile width without losing sorting or market controls', () => {
  assert.match(toolbar, /relative w-full min-w-0 flex-1/);
  assert.match(toolbar, /font-mono text-base text-white focus:border-cyan-500/);
  assert.match(toolbar, /min-w-0 max-w-full flex-1 cursor-pointer/);
  assert.match(toolbar, /flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto/);
  assert.match(toolbar, /flex max-w-full flex-wrap items-center rounded-xl/);
  assert.match(toolbar, /setCoinVolumeFilter\(tier\.id as any\)/);
  assert.match(toolbar, /setCoinExchangeFilter\(ex\)/);
  assert.match(toolbar, /setCoinMarketFilter\(mkt\)/);
  assert.match(toolbar, /setCoinSortBy\(e\.target\.value\)/);
  assert.match(toolbar, /onSelectCoin\(coin\.symbol, coin\.exchange, coin\.marketType\)/);
  assert.doesNotMatch(toolbar, /relative flex-1 min-w-\[220px\]/);
  assert.doesNotMatch(toolbar, /autoFocus/);
});

test('Coin modal locks background scrolling and closes on Escape', () => {
  assert.match(toolbar, /if \(!isDatePickerOpen && !isCoinModalOpen\) return/);
  assert.match(toolbar, /if \(isCoinModalOpen\) setIsCoinModalOpen\(false\)/);
  assert.match(toolbar, /\[isDatePickerOpen, isCoinModalOpen\]/);
  assert.match(toolbar, /document\.body\.style\.overflow = bodyOverflow/);
  assert.match(toolbar, /document\.documentElement\.style\.overflow = htmlOverflow/);
});

test('Replay coin picker fluidly fits phones, tablets, desktop and landscape heights', () => {
  const css = readFileSync(new URL('../src/components/replay/replayCoinPicker.css', import.meta.url), 'utf8');
  const entry = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(entry, /import '\.\/components\/replay\/replayCoinPicker\.css'/);
  assert.doesNotMatch(toolbar, /import '\.\/replayCoinPicker\.css'/);
  assert.match(toolbar, /className="replay-coin-modal flex w-full min-w-0 flex-col overflow-hidden/);
  assert.match(toolbar, /replay-coin-body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden/);
  assert.match(toolbar, /replay-coin-filters min-h-0 min-w-0 shrink-0/);
  assert.match(toolbar, /replay-coin-list min-h-0 min-w-0 flex-1/);
  assert.match(toolbar, /replay-coin-card-grid grid min-w-0 gap-2/);
  assert.match(css, /width: min\(100%, 70rem\)/);
  assert.match(css, /height: min\(92dvh, 900px\)/);
  assert.match(css, /max-height: calc\(100dvh - 16px\)/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\)/);
  assert.match(css, /@media \(max-height: 540px\)/);
  assert.match(css, /\.replay-coin-body \{\s*overflow-x: hidden;\s*overflow-y: auto;/);
  assert.match(css, /\.replay-coin-list \{\s*flex: none;\s*overflow: visible;/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.doesNotMatch(toolbar, /grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
  assert.match(toolbar, /onSelectCoin\(coin\.symbol, coin\.exchange, coin\.marketType\)/);
  assert.match(toolbar, /onClick=\{\(\) => setDisplayCount\(filteredCoins\.length\)\}/);
});
