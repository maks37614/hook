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
  assert.match(brand, /xl:pointer-events-none xl:absolute xl:inset-x-0 xl:top-1\/2 xl:z-10 xl:-translate-y-1\/2/);
  assert.match(brand, /justify-self-center[^"]*xl:pointer-events-auto/, 'the logo alone must sit in the center column');
  assert.match(brand, /src="\/h00k-robot-logo\.svg"/);
  assert.match(brand, /onClick=\{toggleFullScreen\}/);
  assert.match(brand, /onChange=\{\(e\) => changeSiteLanguage\(e\.target\.value as SupportedLanguage\)\}/);
  assert.equal((source.match(/data-header-brand-row/g) ?? []).length, 1);
});

test('mobile keeps its original symmetric brand grid and controls', () => {
  assert.match(brand, /grid min-h-9 w-full min-w-0 grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(brand, /sm:min-h-10 sm:gap-x-2/);
  assert.match(brand, /id="screener-help-btn"/);
  assert.match(brand, /<span aria-hidden="true" className="min-w-0" \/>/);
  assert.ok(brand.indexOf('src="/h00k-robot-logo.svg"') < brand.indexOf('id="screener-help-btn"'));
  assert.ok(brand.indexOf('id="screener-help-btn"') < brand.indexOf('data-screener-guide="fullscreen"'));
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

test('header language selector remains transparent to the right of logo and help', () => {
  const selectStart = brand.indexOf('<select');
  const selectEnd = brand.indexOf('</select>', selectStart);
  const languageSelect = brand.slice(selectStart, selectEnd + '</select>'.length);
  const logoStart = brand.indexOf("onClick={() => onPageChange('screener')}");
  const logoEnd = brand.indexOf('</button>', logoStart) + '</button>'.length;
  const fullscreen = brand.indexOf('onClick={toggleFullScreen}');

  const helpStart = brand.indexOf('id="screener-help-btn"');
  assert.ok(logoEnd > 0 && logoEnd < helpStart && helpStart < selectStart,
    'centered logo must be followed by help, then language');
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

test('desktop Terminal gap is reduced without moving the centered logo or hiding categories', () => {
  const nav = source.slice(source.indexOf('{/* Navigation Category Tabs */}'), source.indexOf('</nav>'));
  assert.match(nav, /xl:gap-0 xl:p-0\.5/);
  assert.equal((nav.match(/xl:px-1\.5/g) ?? []).length, 4);
  assert.match(nav, /xl:right-auto xl:left-1/, 'PC badge must remain inside Terminal, away from the logo');
  assert.match(brand, /xl:pointer-events-none/);
  assert.match(brand, /xl:pointer-events-auto/);
  for (const tab of ['screener', 'patterns', 'replay', 'terminal']) {
    assert.match(nav, new RegExp('id="nav-category-' + tab + '-btn"'));
  }
});

test('Desktop header cannot mask the right-side notification and terminal buttons',()=>{
  // The outer centered logo overlay occupies the full header width but must
  // never be a hit target. Its utility child must be its intrinsic width only.
  assert.match(brand, /xl:pointer-events-none xl:absolute xl:inset-x-0/);
  assert.match(brand, /xl:w-max xl:justify-self-start xl:pointer-events-auto/);
  assert.match(source, /xl:relative xl:z-20 xl:w-auto xl:flex-nowrap/);
  assert.match(source, /<SiteNotificationBell/);
  for(const id of ['open-metascalp-btn','open-watchlist-btn','open-telegram-btn',
    'open-surveillance-btn','open-archive-btn','open-guide-btn'])
    assert.ok(source.includes('id="' + id + '"'), 'Missing interactive header button ' + id);
});
