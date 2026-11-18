import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
const header = source.slice(source.indexOf('{/* Under 720px controls use two rows'), source.indexOf('</header>'));
const secondRow = header.slice(header.lastIndexOf('grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'));
const clockSource = readFileSync(new URL('../src/components/terminal/TerminalClock.tsx', import.meta.url), 'utf8');

test('terminal becomes a single row at 720px and keeps two rows below', () => {
  // Count only the two mobile child rows, not the desktop >=1280px
  // parent override (which intentionally uses the same three columns).
  assert.equal((header.match(/className="grid w-full min-w-0 grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/g) ?? []).length, 2);
  assert.match(header, /min-\[1280px\]:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(header, /min-\[720px\]:grid min-\[720px\]:grid-cols-\[minmax\(0,1fr\)_auto_auto_auto_minmax\(0,1fr\)\]/);
  assert.match(header, /min-\[720px\]:items-center/);
  assert.equal((header.match(/min-\[720px\]:contents/g) ?? []).length, 2);
  assert.match(header, /col-start-2 row-start-1 justify-self-center min-\[720px\]:col-start-2 min-\[720px\]:row-start-1/);
  assert.match(header, /col-start-3 row-start-1 flex shrink-0 items-center justify-self-end[^"]*min-\[720px\]:col-start-5/);
  assert.match(header, /min-\[720px\]:col-start-5[^"]*min-\[1280px\]:col-start-3/);
  assert.match(secondRow, /col-start-1 row-start-1 flex[^"]*min-\[720px\]:col-start-1 min-\[720px\]:row-start-1/);
  assert.match(secondRow, /col-start-2 row-start-1 flex[^"]*min-\[720px\]:col-start-3 min-\[720px\]:row-start-1/);
  assert.match(secondRow, /col-start-3 row-start-1 flex[^"]*min-\[720px\]:col-start-4 min-\[720px\]:row-start-1/);
});

test('wide desktop header gives the clock equal left and right grid columns', () => {
  assert.match(header, /min-\[1280px\]:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(header, /col-start-2 row-start-1 justify-self-center min-\[720px\]:col-start-2/);
  assert.match(header, /min-\[1280px\]:col-start-3/, 'right actions move into the right half');
  assert.match(secondRow, /min-\[1280px\]:flex min-\[1280px\]:items-center/, 'timeframe and presets stay together');
});

test('720px toolbar uses compact clock, timeframes, actions and preserves full desktop sizes', () => {
  assert.match(clockSource, /min-\[720px\]:text-base min-\[720px\]:leading-6 lg:text-2xl lg:leading-7/);
  assert.match(clockSource, /min-\[720px\]:gap-1 min-\[720px\]:px-1\.5 min-\[720px\]:py-1 lg:gap-2/);
  assert.match(secondRow, /min-\[720px\]:px-1 lg:px-2/);
  assert.match(secondRow, /hidden shrink-0 items-center bg-slate-900 p-0\.5 lg:flex/);
  assert.match(header, /min-\[720px\]:\[&>button\]:w-7 min-\[720px\]:\[&>button\]:p-1 lg:\[&>button\]:h-8/);
});

test('on wide screens autoscale comes before 1x–4x on the left, presets and plus after timeframe', () => {
  const counter = secondRow.indexOf("{t('terminal.page.coinsCount', { count: terminalCoinCount })}");
  const auto = secondRow.indexOf('{renderAutoScaleButton()}');
  const one = secondRow.indexOf('title="1 колонка (зберегти всі графіки)"');
  const four = secondRow.indexOf('title="4 Колонки"');
  const timeframe = secondRow.indexOf('{/* Timeframe Selector */}');
  const preset = secondRow.indexOf('ref={presetsButtonRef}');
  const add = secondRow.indexOf('aria-label="Додати графік"');
  assert.ok(counter >= 0 && counter < auto && auto < one && one < four &&
    four < timeframe && timeframe < preset && preset < add);
  assert.match(secondRow, /hidden shrink-0 items-center min-\[720px\]:ml-auto min-\[720px\]:flex/);
  assert.match(secondRow, /col-start-3 row-start-1 flex items-center justify-self-start/);
  assert.equal((secondRow.match(/title="4 Колонки"/g) ?? []).length, 1);
  const layouts = secondRow.slice(secondRow.indexOf('title="1 колонка (зберегти всі графіки)"'), timeframe);
  assert.doesNotMatch(layouts, /setBlocks\(/, 'column buttons must never discard open charts');
  assert.doesNotMatch(layouts, /handleApplyPreset\(/, 'column buttons must not replace selected coins');
});

test('top-right shortcuts are anchored to the right and bordered on desktop', () => {
  assert.match(header, /col-start-3 row-start-1 flex shrink-0 items-center justify-self-end/);
  for (const label of [
    'На весь екран браузера', 'Закрити термінал',
  ]) assert.ok(header.includes(label));
  assert.doesNotMatch(header, /Створити сповіщення в Telegram|<Send\b/,
    'Telegram shortcut is replaced, not added as an extra top-row button');
  assert.equal((header.match(/aria-pressed=\{terminalAlertsEnabled\}/g) ?? []).length, 1,
    'workspace notifications have a single header control');
  assert.match(header, /t\('terminal\.drawer\.settingsTooltip'\)/,
    'settings tooltip must be localized');
  assert.match(header, /t\('terminal\.page\.metaScalpGroup'/);
  assert.equal((header.match(/lg:h-8 lg:w-8 lg:rounded-lg lg:border/g) ?? []).length, 5);
  assert.match(header, /lg:border-cyan-400\/60/);
  assert.match(header, /lg:border-amber-500\/35/);
});

test('smaller screens keep the original positions and all actions remain connected', () => {
  assert.match(header, /justify-self-start min-\[720px\]:hidden/);
  assert.equal((header.match(/\{renderAutoScaleButton\(\)\}/g) ?? []).length, 2);
  assert.equal((source.match(/onClick=\{\(\) => setAutoScaleCharts\(enabled => !enabled\)\}/g) ?? []).length, 1);
  assert.match(secondRow, /col-start-1 row-start-1/);
  assert.match(secondRow, /col-start-2 row-start-1/);
  assert.match(secondRow, /col-start-3 row-start-1/);
  assert.match(secondRow, /handleApplyGlobalTimeframe\(tf\)/);
  assert.match(secondRow, /setShowCoinPresets\(true\)/);
  assert.match(secondRow, /setIsAddModalOpen\(true\)/);
  assert.match(header, /onClick=\{onReturnToPatterns\}/);
});

test('mobile header keeps its original single-row positions with alerts in the Telegram slot', () => {
  assert.doesNotMatch(header, /max-\[519px\]:grid|max-\[519px\]:\[&>button\]/,
    'reverted two-tier layout must not return');
  assert.match(header, /grid w-full min-w-0 grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\] items-center sm:gap-2 min-\[720px\]:contents/);
  assert.match(header, /flex items-center gap-1 justify-self-start min-\[720px\]:hidden/);
  assert.match(header, /col-start-3 row-start-1 flex shrink-0 items-center justify-self-end gap-0 min-\[375px\]:gap-0\.5 sm:gap-2/);
  assert.match(header, /<TerminalClock timeZone=\{profile\?\.timeZone\}/);

  const alertIndex = header.indexOf('aria-pressed={terminalAlertsEnabled}');
  const metaScalpIndex = header.indexOf('{/* MetaScalp shortcut */}');
  const settingsIndex = header.indexOf('{/* Settings Drawer */}');
  assert.ok(alertIndex >= 0 && alertIndex < metaScalpIndex && metaScalpIndex < settingsIndex);
  assert.match(header, /h-7 w-6 shrink-0 items-center justify-center rounded-xl border-0 p-0/);
  for (const button of ['ChartNoAxesCombined', 'BellRing', 'Zap', 'SlidersHorizontal', 'Maximize2', 'Minimize2']) {
    assert.ok(header.includes('<' + button), 'mobile control missing: ' + button);
  }
  assert.match(header, /onClick=\{\(\) => setConfig\(current => \(\{ \.\.\.current, terminalMarketAlerts:/);
  assert.match(header, /onClick=\{\(\) => setIsSettingsOpen\(true\)\}/);
  assert.match(header, /onClick=\{toggleBrowserFullscreen\}/);
});
