import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const brand = source.slice(
  source.indexOf('<div data-header-brand-row'),
  source.indexOf('{/* Navigation Category Tabs */}'),
);
const desktop = source.slice(
  source.indexOf('{/* Navigation Category Tabs */}'),
  source.indexOf('<SiteNotificationBell'),
);

test('desktop header centers the existing logo, fullscreen and language controls', () => {
  assert.match(source, /xl:relative xl:justify-between/);
  assert.match(brand, /xl:absolute xl:left-1\/2 xl:top-1\/2 xl:z-10 xl:flex xl:w-auto xl:-translate-x-1\/2 xl:-translate-y-1\/2/);
  assert.match(brand, /src="\/h00k-robot-logo\.svg"/);
  assert.match(brand, /onClick=\{toggleFullScreen\}/);
  assert.match(brand, /onChange=\{\(e\) => changeSiteLanguage\(e\.target\.value as SupportedLanguage\)\}/);
  assert.equal((source.match(/data-header-brand-row/g) ?? []).length, 1);
});

test('mobile keeps its original symmetric brand grid and controls', () => {
  assert.match(brand, /grid min-h-9 w-full min-w-0 grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(brand, /sm:min-h-10 sm:gap-x-2/);
  assert.match(brand, /id="screener-help-btn"/);
  assert.match(brand, /justify-self-end/);
  assert.ok(brand.indexOf('id="screener-help-btn"') < brand.indexOf('src="/h00k-robot-logo.svg"'));
  assert.ok(brand.indexOf('src="/h00k-robot-logo.svg"') < brand.indexOf('data-screener-guide="fullscreen"'));
  assert.match(brand, /<option value="uk">🇺🇦 UA<\/option>/);
});

test('desktop quick formation totals are removed without removing nav formation count', () => {
  assert.doesNotMatch(source, /Quick Stats Bar|Формацій:|▲ \{bullishCount\}|▼ \{bearishCount\}/);
  assert.doesNotMatch(desktop, /bullishCount|bearishCount/);
  assert.match(source, /\{formationsCount\}/);
  assert.match(source, /id="nav-category-patterns-btn"/);
});

test('site header retains icon borders but does not show a manual refresh button', () => {
  assert.ok(!css.includes('.app-header:is([data-page="screener"], [data-page="patterns"]) button'));
  assert.ok(!source.includes('id="refresh-screener-btn"'));
  assert.ok(!source.includes('<RefreshCw'));
  assert.ok(source.includes('<SiteNotificationBell'));
  const actions = source.slice(source.indexOf('<SiteNotificationBell'));
  assert.ok(actions.includes('border-sky-500/40'));
  assert.ok(actions.includes('border-slate-800'));
});

test('header language selector is transparent and immediately right of the logo', () => {
  const selectStart = brand.indexOf('<select');
  const selectEnd = brand.indexOf('</select>', selectStart);
  const languageSelect = brand.slice(selectStart, selectEnd + '</select>'.length);
  const logoStart = brand.indexOf("onClick={() => onPageChange('screener')}");
  const logoEnd = brand.indexOf('</button>', logoStart) + '</button>'.length;
  const fullscreen = brand.indexOf('onClick={toggleFullScreen}');

  assert.ok(logoEnd > 0 && logoEnd < selectStart, 'language selector must follow logo');
  assert.ok(selectStart < fullscreen, 'fullscreen button must follow language selector');
  assert.match(languageSelect, /appearance-none/);
  assert.match(languageSelect, /border-0 bg-transparent/);
  assert.match(languageSelect, /rounded-none/);
  assert.match(languageSelect, /shadow-none/);
  assert.match(languageSelect, /backgroundColor: 'transparent'/);
  assert.match(languageSelect, /WebkitAppearance: 'none'/);
  assert.doesNotMatch(languageSelect, /bg-slate-900|sm:px-2|rounded-lg/);
  assert.match(languageSelect, /focus-visible:outline-cyan-400/);
  assert.ok(languageSelect.includes("aria-label={t('language')}"));
  assert.ok(languageSelect.includes("onChange={(e) => changeSiteLanguage(e.target.value as SupportedLanguage)}"));
  for (const code of ['uk', 'en', 'ru', 'pl']) {
    assert.match(languageSelect, new RegExp('<option value="' + code + '">'));
  }
  assert.equal((languageSelect.match(/<option /g) ?? []).length, 4);
});
