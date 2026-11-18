import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const srgb = (hex: string) => {
  const channels = hex.replace('#', '').match(/.{2}/g);
  assert.ok(channels && channels.length === 3);
  return channels.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
};
const luminance = (hex: string) => {
  const [r, g, b] = srgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const bright = Math.max(luminance(a), luminance(b));
  const dark = Math.min(luminance(a), luminance(b));
  return (bright + 0.05) / (dark + 0.05);
};

test('exchange marks have readable brand colors even at small sizes', () => {
  const css = read('src/index.css');
  assert.match(css, /\.site-exchange-badge\[data-exchange="binance"\]/);
  assert.match(css, /\.site-exchange-badge\[data-exchange="bybit"\]/);
  assert.ok(contrast('#ffdf78', '#342504') >= 7, 'Binance label needs AAA text contrast');
  assert.ok(contrast('#ffd092', '#38210e') >= 7, 'Bybit label needs AAA text contrast');
  assert.match(css, /\.site-exchange-badge--compact/);
  assert.match(css, /font-weight: 800;/);
});

test('formation and screener listings use the exchange mark on both layouts', () => {
  const formations = read('src/components/FormationCard.tsx');
  const screener = read('src/components/CoinScreenerPage.tsx');
  assert.equal((formations.match(/data-exchange=\{coin\.exchange\}/g) ?? []).length, 2);
  assert.equal((screener.match(/data-exchange=\{coin\.exchange\}/g) ?? []).length, 2);
  assert.ok((formations.match(/site-exchange-badge/g) ?? []).length >= 2);
  assert.ok((screener.match(/site-exchange-badge/g) ?? []).length >= 2);
  assert.match(screener, /aria-pressed=\{exchange === 'binance'\}/);
  assert.match(screener, /aria-pressed=\{exchange === 'bybit'\}/);
});

test('crisper global icons use SVG strokes without touching chart raster or dimensions', () => {
  const css = read('src/index.css');
  const icons = read('src/components/PageIcons.tsx');
  const header = read('src/components/Header.tsx');
  // The block comment is multiline; locate its content, not its exact opening.
  const marker = css.indexOf('High-contrast UI glyphs');
  assert.ok(marker >= 0, 'global icon styling rules should exist');
  // Limit this assertion to the icon enhancement block. Later unrelated
  // site-theme rules can legitimately include transitions/animations.
  const iconRulesEnd = css.indexOf('/* Brand marks keep reliable exchange colors', marker);
  assert.ok(iconRulesEnd > marker, 'icon styling section must have an end');
  const newRules = css.slice(css.lastIndexOf('/*', marker), iconRulesEnd);
  assert.match(newRules, /#root svg\.lucide:is\(/);
  assert.match(newRules, /:not\(\.hookchart-root \*\)/);
  assert.doesNotMatch(newRules, /\b(?:filter|backdrop-filter|transform|image-rendering|animation)\s*:/);
  assert.ok((icons.match(/strokeWidth=\{1\.9\}/g) ?? []).length >= 2);
  assert.match(header, /<ScreenerIcon className="w-3\.5 h-3\.5 shrink-0" \/>/);
  assert.doesNotMatch(newRules, /canvas\s*\{/);
});

test('formation and screener brand badges match intended compact typography without global geometry overrides', () => {
  const css = read('src/index.css');
  const formations = read('src/components/FormationCard.tsx');
  const early = read('src/components/EarlyFormationCard.tsx');
  const screener = read('src/components/CoinScreenerPage.tsx');
  const start = css.indexOf('#root .site-exchange-badge {');
  const end = css.indexOf('#root .site-exchange-badge[data-exchange=', start);
  assert.ok(start >= 0 && end > start);
  const badgeGeometry = css.slice(start, end);
  assert.doesNotMatch(badgeGeometry, /(?:min-height|height|width|font-size|line-height|padding|margin|letter-spacing|display|border-radius|font-family)\s*:/);
  // Preserve chart-header styling and compact information-card exchange badges.
  assert.match(formations, /site-exchange-badge--compact shrink-0 text-\[10px\] px-1\.5 py-0\.5 rounded font-mono uppercase/);
  assert.match(formations, /site-exchange-badge--compact text-\[9px\] px-1\.5 py-0\.2 rounded font-sans font-bold uppercase whitespace-nowrap/);
  assert.match(early, /site-exchange-badge--compact text-\[9px\] px-1\.5 py-0\.2 rounded font-sans font-bold uppercase whitespace-nowrap/);
  assert.match(screener, /site-exchange-badge--compact text-\[8px\] px-1 py-0 rounded/);
  assert.match(screener, /site-exchange-badge--compact text-\[9px\] px-1\.5 py-0\.2 rounded/);
});
