import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/index.css');
const formations = read('../src/components/FormationCard.tsx');

const lightThemes = ['mist', 'sand', 'lavender', 'mint'] as const;
const readPalette = (surface: string): Record<string, string> => {
  const startTag = 'html[data-site-surface="' + surface + '"] {';
  const start = css.indexOf(startTag);
  assert.notEqual(start, -1, 'missing light theme ' + surface);
  const body = css.slice(start + startTag.length, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{6})/gi)]
      .map(([, key, value]) => [key, value.toLowerCase()]),
  );
};

const luminance = (hex: string): number => {
  const values = hex.slice(1).match(/.{2}/g);
  assert.ok(values && values.length === 3, 'expected six-digit hex color');
  const [r, g, b] = values.map(part => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastRatio = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

test('pastel secondary and muted labels meet WCAG AA on common light surfaces', () => {
  for (const surface of lightThemes) {
    const p = readPalette(surface);
    for (const foreground of ['color-slate-400', 'color-slate-500']) {
      for (const background of [
        'site-body-background', 'color-slate-800', 'color-slate-900', 'color-slate-950',
      ]) {
        const ratio = contrastRatio(p[foreground], p[background]);
        assert.ok(ratio >= 4.5, surface + ' ' + foreground + ' on ' + background
          + ': ' + ratio.toFixed(2) + ':1');
      }
    }
  }
});

test('quality detail labels and entry/target/stop microtext are readable', () => {
  // This card branch is displayed without a chart and scrolls its middle block.
  // Start with a stable section marker; responsive header markup may change.
  const detailsStart = formations.indexOf('{/* Middle Content: Formation Details */}');
  assert.ok(detailsStart > 0);
  const detailView = formations.slice(detailsStart);
  assert.match(detailView, /grid grid-cols-3 gap-1 text-\[10px\]/);
  assert.match(detailView, /mt-1 border-t border-slate-800 pt-1 text-\[10px\]/);
  assert.equal((detailView.match(/text-\[10px\] text-slate-500 font-mono truncate/g) ?? []).length, 2);
  assert.match(detailView, /text-\[10px\] text-cyan-300 font-mono font-medium/);
  // The separate expanded chart branch and its toolbar remain untouched.
  assert.match(formations.slice(0, detailsStart), /formation-chart-header/);
  assert.match(formations.slice(0, detailsStart), /<TradingViewChart/);
});
