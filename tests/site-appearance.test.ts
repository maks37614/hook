
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { locales, translatePhrase } from '../src/locales';
import {
  DEFAULT_SITE_APPEARANCE, SITE_ACCENTS, SITE_SURFACES, SITE_FONTS, SITE_TEXT_SCALES,
  isSafeChartColor, SITE_CHART_PRESETS,
  compilePersonalCss, normalizeSiteAppearance, validateSiteAppearance,
  applySiteAppearance, cacheSiteAppearance, readCachedSiteAppearance,
  setSiteAppearanceIdentity, subscribeSiteChartBackground, getSiteChartBackground,
  initializeSiteAppearance, ensureSiteFontLoaded,
} from '../src/utils/siteAppearance';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/index.css');
const profile = read('../src/components/UserProfileModal.tsx');
const editor = read('../src/components/profile/ProfileInterfaceSettings.tsx');
const hook = read('../src/components/hookchart/HookChartCanvas.tsx');
const terminal = read('../src/components/terminal/TerminalChartWidget.tsx');
const auth = read('../src/context/AuthContext.tsx');
const server = read('../server/pgIdentity.ts');
const startup = read('../src/main.tsx');

test('site appearance remains backward compatible with the two-field legacy profile', () => {
  assert.deepEqual(normalizeSiteAppearance(null), DEFAULT_SITE_APPEARANCE);
  assert.deepEqual(normalizeSiteAppearance({ surface: 'graphite', accent: 'violet' }),
    { ...DEFAULT_SITE_APPEARANCE, surface: 'graphite', accent: 'violet' });
  assert.deepEqual(normalizeSiteAppearance({ surface: 'url(https://evil.test)', accent: 'var(--evil)' }),
    DEFAULT_SITE_APPEARANCE);
  assert.deepEqual(readCachedSiteAppearance(), DEFAULT_SITE_APPEARANCE);
  assert.equal(SITE_SURFACES.length, 9);
  assert.equal(SITE_ACCENTS.length, 5);
  assert.ok(SITE_FONTS.length >= 5);
  assert.deepEqual([...SITE_TEXT_SCALES], [.9, 1, 1.1, 1.2]);
});

test('Verdana is the default for guests, new profiles and reset, but explicit choices are preserved', () => {
  assert.equal(DEFAULT_SITE_APPEARANCE.font, 'verdana');
  assert.equal(normalizeSiteAppearance(null).font, 'verdana');
  assert.equal(normalizeSiteAppearance({ surface: 'plum', accent: 'cyan' }).font, 'verdana');
  assert.equal(normalizeSiteAppearance({ font: 'inter-light' }).font, 'inter-light');
  assert.equal(normalizeSiteAppearance({ font: 'arial' }).font, 'arial');
  assert.equal(normalizeSiteAppearance({ font: 'jakarta' }).font, 'jakarta');
  assert.ok(SITE_FONTS.some(font => font.id === 'verdana' && font.css.includes('Verdana')));
  assert.match(css, /font-family: var\(--site-font-family, Verdana, Geneva, sans-serif\);/);
  assert.match(editor, /const defaults: SiteAppearance = \{ \.\.\.DEFAULT_SITE_APPEARANCE \};/);
});

test('global CSS tokens update fonts, light pages and chart frames without overriding candle colors', () => {
  assert.match(startup, /initializeSiteAppearance\(\)/);
  assert.match(css, /background-color: var\(--site-body-background, #090d16\)/);
  assert.match(css, /--site-text-scale/);
  assert.match(css, /--site-font-family/);
  for (const surface of SITE_SURFACES.filter(item => item.id !== 'classic')) {
    assert.ok(css.includes('html[data-site-surface="' + surface.id + '"]'));
  }
  for (const accent of SITE_ACCENTS.filter(item => item.id !== 'cyan')) {
    assert.ok(css.includes('html[data-site-accent="' + accent.id + '"]'));
  }
  assert.match(css, /--site-chart-frame-color/);
  assert.match(css, /--color-slate-950:/);
  assert.match(css, /--color-cyan-500:/);
  assert.doesNotMatch(css, /--color-(?:rose|red|emerald|green)-[0-9]+\s*:/);
  assert.doesNotMatch(hook, /useSyncExternalStore\(subscribeSiteChartBackground/);
  assert.match(hook, /backgroundColor=\{externalData\?\.appearance\.background\}/);
  assert.doesNotMatch(hook, /siteChartBackground/);
  assert.match(css, /#root \.terminal-chart-block::after/);
  assert.match(css, /#root \.formation-chart-card::after/);
  assert.match(css, /#root \.site-chart-frame::after/);
  assert.match(css, /border: 2px solid var\(--site-chart-frame-color/);
  assert.doesNotMatch(css, /background-color:\s*var\(--site-chart-frame-color/);
  assert.match(terminal, /className="terminal-chart-plot-area /);
  assert.doesNotMatch(terminal, /className="site-chart-frame flex-1/);
});

test('chart frame accepts any hex color, without recoloring candles or plot surface', () => {
  const samples = ['#ffffff', '#ffcc00', '#fa23c9', '#000000', '#484848', '#22d3ee'];
  for (const color of samples) {
    assert.ok(isSafeChartColor(color), color + ' must be selectable');
    assert.equal(normalizeSiteAppearance({ chartColor: color }).chartColor, color);
    assert.ok(validateSiteAppearance({ ...DEFAULT_SITE_APPEARANCE, chartColor: color }));
  }
  assert.equal(isSafeChartColor('red'), false);
  assert.equal(isSafeChartColor('url(https://invalid.test)'), false);
  assert.ok(SITE_CHART_PRESETS.some(v => v.color === '#22d3ee'));
  assert.match(editor, /Колір рамок графіків/);
  assert.match(editor, /Власний колір рамки/);
  assert.doesNotMatch(editor, /Оберіть темніший колір/);
  assert.doesNotMatch(editor, /setChartColorError/);
  assert.match(css, /pointer-events: none;/);
  const dom = new JSDOM('<html><head></head><body><div id="root"></div></body></html>', { url: 'https://h00k.top/' });
  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = dom.window.document;
  try {
    applySiteAppearance({ ...DEFAULT_SITE_APPEARANCE, chartColor: '#ffffff' });
    assert.equal(dom.window.document.documentElement.style.getPropertyValue('--site-chart-frame-color'), '#ffffff');
    assert.equal(dom.window.document.documentElement.dataset.siteChartCustom, 'true');
    applySiteAppearance(DEFAULT_SITE_APPEARANCE);
    assert.equal(dom.window.document.documentElement.dataset.siteChartCustom, 'false');
  } finally {
    (globalThis as any).document = previousDocument;
    dom.window.close();
  }
});

test('Interface tab changes only client style until Save and keeps older preferences', () => {
  assert.match(profile, /setActiveProfileSection\('interface'\)/);
  assert.match(profile, /<ProfileInterfaceSettings \/>/);
  assert.match(editor, /applySiteAppearance\(next\)/);
  assert.match(editor, /await updateProfileData\(\{ siteAppearance: valid \}\)/);
  assert.match(editor, /useEffect\(\(\) => \(\) => \{ applySiteAppearance\(savedRef\.current\); \}, \[\]\)/);
  assert.match(auth, /applySiteAppearance\(appearance\)/);
  assert.match(auth, /cacheSiteAppearance\(appearance, uid\)/);
  assert.match(auth, /setSiteAppearanceIdentity\(null\)/);
});

test('Inter Light is selectable, uses Cyrillic-capable lazy stylesheet and 300 weight', () => {
  const font = SITE_FONTS.find(item => item.id === 'inter-light');
  assert.ok(font);
  assert.equal(font.css, "'Inter', Arial, sans-serif");
  assert.equal(normalizeSiteAppearance({ font: 'inter-light' }).font, 'inter-light');
  assert.ok(validateSiteAppearance({ ...DEFAULT_SITE_APPEARANCE, font: 'inter-light' }));
  assert.match(css, /html\[data-site-font="inter-light"\] body/);
  assert.match(css, /font-weight: 300;/);
  assert.match(editor, /ensureSiteFontLoaded\('inter-light'\)/);
  assert.match(editor, /Aa Яя/);
  const dom = new JSDOM('<html><head></head><body><div id="root"></div></body></html>', { url: 'https://h00k.top' });
  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = dom.window.document;
  try {
    ensureSiteFontLoaded('inter-light');
    ensureSiteFontLoaded('inter-light');
    const links = dom.window.document.querySelectorAll('link#h00k-site-inter-light-font');
    assert.equal(links.length, 1, 'Must not duplicate font stylesheet across routes');
    assert.match((links[0] as HTMLLinkElement).href, /fonts\.googleapis\.com\/css2\?family=Inter/);
    applySiteAppearance({ ...DEFAULT_SITE_APPEARANCE, font: 'inter-light' });
    assert.equal(dom.window.document.documentElement.dataset.siteFont, 'inter-light');
    assert.equal(dom.window.document.documentElement.style.getPropertyValue('--site-font-family'), font.css);
  } finally {
    (globalThis as any).document = previousDocument;
    dom.window.close();
  }
});

test('strict CSS compiler blocks external fetches, overlays and canvas selectors', () => {
  const safe = compilePersonalCss('.app-header { background-color: #19304a; }\n.rounded-xl { border-radius: 18px; }');
  assert.equal(safe.error, null);
  assert.equal(safe.css.includes('#root .app-header{background-color:#19304a}'), true);
  for (const raw of [
    '@import url(https://evil.test/a.css);',
    '.app-header { background-image: url(https://evil.test); }',
    '.app-header { position: fixed; }',
    '.app-header { display: none; }',
    '.app-header { opacity: 0; }',
    'canvas { filter: invert(1); }',
    '.app-header:hover { color: #fff; }',
    '.app-header { color: #fff !important; }',
    '.app-header { color: #fff; } @media screen { body { color: red; } }',
  ]) {
    assert.ok(compilePersonalCss(raw).error, 'Unsafe rule should be rejected: ' + raw);
  }
  assert.ok(!validateSiteAppearance({ ...DEFAULT_SITE_APPEARANCE, customCss: '.app-header { position: fixed; }' }));
  assert.ok(validateSiteAppearance({ ...DEFAULT_SITE_APPEARANCE, customCss: safe.css.replaceAll('#root ', '') }));
});

test('PostgreSQL validates only six fixed profile fields and sanitized CSS', () => {
  assert.match(server, /'tpSlConstructorSettings', 'siteAppearance'/);
  assert.match(server, /validateSiteAppearance\(appearance\)/);
  assert.match(server, /normalizeSiteAppearance\(appearance\)/);
  assert.ok(!validateSiteAppearance({ ...DEFAULT_SITE_APPEARANCE, extra: 'x' }));
});

test('separate accounts keep separate caches and remove personal CSS at logout', () => {
  const dom = new JSDOM('<html><head></head><body><div id="root"></div></body></html>', { url: 'https://h00k.top/' });
  const previousWindow = (globalThis as any).window;
  const previousDocument = (globalThis as any).document;
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  try {
    initializeSiteAppearance();
    const alice = {
      ...DEFAULT_SITE_APPEARANCE, surface: 'mist' as const, font: 'arial' as const,
      chartColor: '#191d25', customCss: '.app-header { background-color: #123456; }',
    };
    const bob = { ...DEFAULT_SITE_APPEARANCE, surface: 'plum' as const, textScale: 1.2 as const };
    cacheSiteAppearance(alice, 'alice');
    cacheSiteAppearance(bob, 'bob');
    setSiteAppearanceIdentity('alice');
    assert.equal(readCachedSiteAppearance('alice').surface, 'mist');
    assert.equal(dom.window.document.documentElement.dataset.siteSurface, 'mist');
    assert.equal(getSiteChartBackground(), '#191d25');
    assert.match(dom.window.document.getElementById('h00k-personal-interface-css')!.textContent!, /#root .app-header/);
    let redrawCount = 0;
    const unsubscribe = subscribeSiteChartBackground(() => { redrawCount += 1; });
    applySiteAppearance(alice);
    assert.equal(redrawCount, 0, 'No repaint on the same palette');
    setSiteAppearanceIdentity('bob');
    assert.equal(dom.window.document.documentElement.dataset.siteSurface, 'plum');
    assert.equal(getSiteChartBackground(), null);
    assert.equal(dom.window.document.getElementById('h00k-personal-interface-css'), null);
    assert.equal(readCachedSiteAppearance('bob').textScale, 1.2);
    setSiteAppearanceIdentity(null);
    assert.equal(dom.window.document.documentElement.dataset.siteSurface, 'classic');
    assert.equal(readCachedSiteAppearance().surface, 'classic');
    assert.ok(redrawCount <= 1);
    unsubscribe();
  } finally {
    setSiteAppearanceIdentity(null);
    (globalThis as any).window = previousWindow;
    (globalThis as any).document = previousDocument;
    dom.window.close();
  }
});

test('advanced interface labels resolve correctly in all four languages', () => {
  const expected: Record<'uk' | 'en' | 'ru' | 'pl', string> = {
    uk: 'Мій CSS', en: 'My CSS', ru: 'Мой CSS', pl: 'Mój CSS',
  };
  for (const code of ['uk', 'en', 'ru', 'pl'] as const) {
    assert.equal(translatePhrase(code, 'Мій CSS'), expected[code]);
    assert.equal(typeof locales[code].phrases['Колір рамок графіків'], 'string');
    assert.equal(typeof locales[code].phrases['Власний колір рамки'], 'string');
    assert.equal(typeof locales[code].phrases['Розмір тексту на сайті'], 'string');
    assert.equal(typeof locales[code].phrases['Оформлення сайту'], 'string');
    assert.ok(locales[code].phrases['Оформлення сайту'].length > 0);
  }
});


test('restore defaults clears all interface fields and user CSS, without resetting other profile groups', () => {
  assert.deepEqual(DEFAULT_SITE_APPEARANCE, {
    surface: 'classic', accent: 'cyan', font: 'verdana', textScale: 1,
    chartColor: '#131722', customCss: '',
  });
  assert.match(editor, /const resetToDefaults = async \(\) =>/);
  assert.match(editor, /onClick=\{\(\) => void resetToDefaults\(\)\}/);
  assert.match(editor, /await updateProfileData\(\{ siteAppearance: defaults \}\)/);
  assert.match(editor, /setDraft\(previouslySaved\)/);
  assert.match(editor, /applySiteAppearance\(previouslySaved\)/);
  assert.doesNotMatch(editor, /updateProfileData\(\{[\s\S]*?(?:hookChartPreferences|siteNotificationSettings|searchSettings):/);

  const dom = new JSDOM('<html><head></head><body><div id="root"></div></body></html>', {
    url: 'https://h00k.top/',
  });
  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = dom.window.document;
  try {
    applySiteAppearance({
      ...DEFAULT_SITE_APPEARANCE, surface: 'sand', accent: 'violet',
      font: 'inter-light', textScale: 1.2, chartColor: '#191d25',
      customCss: '.my-card { border-radius: 18px; }',
    });
    const root = dom.window.document.documentElement;
    assert.equal(root.dataset.siteSurface, 'sand');
    assert.ok(dom.window.document.getElementById('h00k-personal-interface-css'));
    applySiteAppearance({ ...DEFAULT_SITE_APPEARANCE });
    assert.equal(root.dataset.siteSurface, 'classic');
    assert.equal(root.dataset.siteAccent, 'cyan');
    assert.equal(root.dataset.siteFont, 'verdana');
    assert.equal(root.style.getPropertyValue('--site-text-scale'), '1');
    assert.equal(root.style.getPropertyValue('--site-chart-frame-color'), '#131722');
    assert.equal(getSiteChartBackground(), null);
    assert.equal(dom.window.document.getElementById('h00k-personal-interface-css'), null);
  } finally {
    applySiteAppearance(DEFAULT_SITE_APPEARANCE);
    (globalThis as any).document = previousDocument;
    dom.window.close();
  }
});

test('restore default action is translated in all four interface languages', () => {
  const expected = {
    uk: 'Налаштування за замовчуванням',
    en: 'Restore default settings',
    pl: 'Przywróć ustawienia domyślne',
    ru: 'Восстановить настройки по умолчанию',
  } as const;
  for (const lang of ['uk', 'en', 'pl', 'ru'] as const) {
    assert.equal(translatePhrase(lang, 'Налаштування за замовчуванням'), expected[lang]);
    assert.ok(translatePhrase(lang, 'Налаштування інтерфейсу повернуто до стандартних.').length > 0);
    assert.ok(translatePhrase(lang, 'Не вдалося відновити стандартні налаштування.').length > 0);
  }
});


test('Community-style dark mint is a separate surface, localized and safe for account persistence', () => {
  const variant = SITE_SURFACES.find(item => item.id === 'mint-dark');
  assert.ok(variant);
  assert.equal(variant.label, 'Мятний');
  assert.match(variant.preview, /linear-gradient/);
  assert.ok(SITE_SURFACES.some(item => item.id === 'mint'), 'Previous light-mint choice stays available');
  assert.equal(normalizeSiteAppearance({ surface: 'mint-dark' }).surface, 'mint-dark');
  assert.equal(validateSiteAppearance({ ...DEFAULT_SITE_APPEARANCE, surface: 'mint-dark' }), true);
  const names = { uk: 'Мятний', en: 'Mint', ru: 'Мятный', pl: 'Miętowy' } as const;
  for (const lang of ['uk', 'en', 'ru', 'pl'] as const) {
    assert.equal(translatePhrase(lang, 'Мятний'), names[lang]);
    if (lang !== 'uk') assert.notEqual(translatePhrase(lang, 'Темний синьо-м’ятний фон, як у Community'), 'Темний синьо-м’ятний фон, як у Community');
  }
  assert.ok(css.includes('html[data-site-surface="mint-dark"]'));
  assert.match(css, /--color-slate-900:#101928;/);
  assert.match(css, /--site-body-background:#080e18;/);
  const dom = new JSDOM('<html><head></head><body><div id="root"></div></body></html>');
  const prevDocument = (globalThis as any).document;
  (globalThis as any).document = dom.window.document;
  try {
    applySiteAppearance({ ...DEFAULT_SITE_APPEARANCE, surface: 'mint-dark' });
    assert.equal(dom.window.document.documentElement.dataset.siteSurface, 'mint-dark');
    applySiteAppearance(DEFAULT_SITE_APPEARANCE);
    assert.equal(dom.window.document.documentElement.dataset.siteSurface, 'classic');
  } finally {
    (globalThis as any).document = prevDocument;
    dom.window.close();
  }
});
