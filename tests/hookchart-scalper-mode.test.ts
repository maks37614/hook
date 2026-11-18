import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createScalperAnalyzer, scalperLabel, type ScalperCandle } from '../src/components/hookchart/scalperMode';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';
import { OriginalHookChartSettings, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';
import { terminalEcoPreferences } from '../src/components/hookchart/terminalEcoPreferences';

function oscillation(count = 80): ScalperCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const c = 10 + .3 * Math.sin(i * 2 * Math.PI / 11);
    return { t: 1_700_000_000_000 + i * 60_000, o: c, c, h: c + .025, l: c - .025 };
  });
}
function setBar(bar: ScalperCandle, c: number, h = c + .04, l = c - .04): ScalperCandle {
  return { ...bar, o: Math.min(h, Math.max(l, 10)), c, h, l };
}
function setup(scene: ReturnType<ReturnType<typeof createScalperAnalyzer>['evaluate']>, kind: string) {
  return scene.setups.find(s => s.kind === kind);
}

test('scalper defaults OFF, persists only explicit true, and ECO is a read-only override', () => {
  assert.equal(normalizeOriginalHookChartPreferences().scalperMode, false);
  assert.equal(normalizeOriginalHookChartPreferences({ scalperMode: true }).scalperMode, true);
  assert.equal(normalizeOriginalHookChartPreferences({ scalperMode: 'yes' as unknown as boolean }).scalperMode, false);
  const original = normalizeOriginalHookChartPreferences({ scalperMode: true });
  const eco = terminalEcoPreferences(original, true);
  assert.equal(eco.scalperMode, false);
  assert.equal(original.scalperMode, true);
  assert.equal(terminalEcoPreferences(original, false).scalperMode, true);
});

test('Scalper Mode help follows chart-specific EN/PL/RU locale even when site is Ukrainian', () => {
  for (const [language, title, description] of [
    ['en', 'Scalper Mode', 'Automatically draws touch-validated ranges'],
    ['pl', 'Tryb skalpera', 'Automatycznie rysuje'],
    ['ru', 'Режим Скальпера', 'Автоматически рисует'],
  ] as const) {
    const prefs = normalizeOriginalHookChartPreferences({
      language, siteLanguageAtSelection: 'uk', scalperMode: true,
    });
    const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
      open: true, embedded: true, prefs,
      onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
    }));
    assert.ok(html.includes(title), language + ' toggle label');
    assert.ok(html.includes(description), language + ' explanatory description');
    assert.doesNotMatch(html, /Автоматично показує на живому графіку/);
  }
});

test('at least two wick touches per side establish a bounded live range', () => {
  const rows = oscillation();
  rows[rows.length - 2] = setBar(rows[rows.length - 2], 10);
  rows[rows.length - 1] = setBar(rows[rows.length - 1], 10);
  const analyzer = createScalperAnalyzer();
  const snapshot = analyzer.evaluate(rows, 'binance:futures:BTCUSDT:1m');
  const range = setup(snapshot, 'range');
  assert.ok(range, 'range with repeated touches should be visible');
  assert.equal(range.status, 'forming');
  assert.equal(range.lines.length, 2);
  assert.ok(range.touches.length >= 4);
  assert.ok(snapshot.setups.length <= 2);
  assert.ok(snapshot.setups.every(s => s.touches.length <= 8));
});

test('duplicate live OHLC publications reuse a scalper scene without stale signals', () => {
  const analyzer = createScalperAnalyzer();
  const original = oscillation();
  const first = analyzer.evaluate(original, 'binance:futures:BTCUSDT:1m');
  assert.ok(first.setups.length, 'reference scene should contain a formation');
  const republished = original.map(bar => ({ ...bar }));
  assert.strictEqual(analyzer.evaluate(republished, 'binance:futures:BTCUSDT:1m'), first,
    'unchanged OHLC should preserve scene identity despite a newly allocated feed array');
  assert.strictEqual(analyzer.evaluate(original, 'binance:futures:BTCUSDT:1m'), first);

  const liveChanged = republished.map(bar => ({ ...bar }));
  liveChanged[liveChanged.length - 1].h += .01;
  const updated = analyzer.evaluate(liveChanged, 'binance:futures:BTCUSDT:1m');
  assert.notStrictEqual(updated, first, 'a real live wick change requires a fresh preview');
  assert.strictEqual(analyzer.evaluate(liveChanged.map(bar => ({ ...bar })),
    'binance:futures:BTCUSDT:1m'), updated);

  const lastClosedChanged = liveChanged.map(bar => ({ ...bar }));
  lastClosedChanged[lastClosedChanged.length - 2].c += .002;
  const revised = analyzer.evaluate(lastClosedChanged, 'binance:futures:BTCUSDT:1m');
  assert.notStrictEqual(revised, updated,
    'replacing the completed confirmation bar must not reuse an old breakout status');

  // Mutating an old closed candle in place is rare but must invalidate the
  // geometry cache. Never use array identity as a shortcut for that history.
  const oldRevised = lastClosedChanged;
  oldRevised[30].h += .04;
  const corrected = analyzer.evaluate(oldRevised, 'binance:futures:BTCUSDT:1m');
  assert.notStrictEqual(corrected, revised, 'in-place historical corrections must invalidate the scene');

  const regression = analyzer.evaluate(oldRevised, 'binance:futures:BTCUSDT:1m', true);
  assert.notStrictEqual(regression, corrected, 'regression toggles must rebuild the scene');
  const otherInstrument = analyzer.evaluate(oldRevised, 'bybit:futures:ETHUSDT:1m', true);
  assert.notStrictEqual(otherInstrument, regression, 'scopes must not share signal caches');
  analyzer.reset();
  assert.notStrictEqual(analyzer.evaluate(oldRevised, 'bybit:futures:ETHUSDT:1m', true),
    otherInstrument, 'reset must invalidate both history and live overlays');
});

test('Scalper quality score rewards recent repeated wick contacts, not isolated outlier wicks', () => {
  const baseline = oscillation();
  const clean = setup(createScalperAnalyzer().evaluate(baseline, 'scope'), 'range');
  assert.ok(clean);
  assert.ok(clean.score >= 0 && clean.score <= 100, 'quality is bounded, not a trade-win probability');

  const outlier = baseline.map(bar => ({ ...bar }));
  outlier[14] = { ...outlier[14], h: 12.5 };
  const noisy = setup(createScalperAnalyzer().evaluate(outlier, 'scope'), 'range');
  assert.ok(noisy, 'a single old wick spike does not erase otherwise valid levels');
  assert.ok(noisy.score < clean.score,
    'a stale anomalous wick should not increase the confidence of a respected range');

  const stale = baseline.map((bar, i) => i >= 62
    ? { ...bar, o: 10, c: 10, h: 10.01, l: 9.99 }
    : { ...bar });
  const oldTouches = setup(createScalperAnalyzer().evaluate(stale, 'scope'), 'range');
  assert.ok(oldTouches, 'old but still bounded levels can remain until they expire');
  assert.ok(oldTouches.score < clean.score,
    'a range with fewer recent valid wick touches is weaker than a freshly tested range');
});

test('Scalper confidence stays comparable on micro-price and high-price charts', () => {
  const baseline = oscillation();
  const source = setup(createScalperAnalyzer().evaluate(baseline, 'scope'), 'range');
  assert.ok(source);
  for (const multiplier of [0.000001, 100_000]) {
    const transformed = baseline.map(bar => ({
      ...bar, o: bar.o * multiplier, h: bar.h * multiplier,
      l: bar.l * multiplier, c: bar.c * multiplier,
    }));
    const result = setup(createScalperAnalyzer().evaluate(transformed, 'scope'), 'range');
    assert.ok(result, 'same price pattern must exist at every sensible quote precision');
    assert.ok(Math.abs(result.score - source.score) <= 2,
      'quality should depend on normalized contact/breach evidence, not nominal price');
  }
});

test('an open candle can show POSSIBLE; only a completed close can CONFIRM', () => {
  const rows = oscillation();
  rows[rows.length - 2] = setBar(rows[rows.length - 2], 10);
  rows[rows.length - 1] = setBar(rows[rows.length - 1], 10);
  const analyzer = createScalperAnalyzer();
  const base = analyzer.evaluate(rows, 'scope');
  assert.equal(setup(base, 'range')?.status, 'forming');
  // Editing the still-open candle must never change the historical structure.
  const live = rows.slice();
  live[live.length - 1] = setBar(live[live.length - 1], 10.8, 10.85, 9.99);
  const preview = analyzer.evaluate(live, 'scope');
  assert.equal(setup(preview, 'range')?.status, 'possible');
  assert.equal(setup(preview, 'range')?.breakout?.side, 'up');
  assert.deepEqual(setup(preview, 'range')?.lines, setup(base, 'range')?.lines);
  // Only the penultimate candle is considered completed.
  const completed = rows.slice();
  completed[completed.length - 2] = setBar(completed[completed.length - 2], 10.8, 10.85, 9.99);
  const confirmed = analyzer.evaluate(completed, 'scope');
  assert.equal(setup(confirmed, 'range')?.status, 'confirmed');
  assert.equal(setup(confirmed, 'range')?.breakout?.t, completed.at(-2)?.t);
});

test('a wick above the boundary that closes back inside is a failed breakout', () => {
  const rows = oscillation();
  rows[rows.length - 2] = setBar(rows[rows.length - 2], 10.05, 10.8, 9.99);
  rows[rows.length - 1] = setBar(rows[rows.length - 1], 10);
  const result = createScalperAnalyzer().evaluate(rows, 'scope');
  assert.equal(setup(result, 'range')?.status, 'failed');
});

test('converging confirmed high/low pivots produce a triangle with upper and lower trend lines', () => {
  const rows: ScalperCandle[] = Array.from({ length: 75 }, (_, i) => {
    const amplitude = .62 - i * .006;
    const c = 10 + amplitude * Math.sin(i * 2 * Math.PI / 11);
    return { t: 1_700_000_000_000 + i * 60_000, o: c, c, h: c + .02, l: c - .02 };
  });
  rows[rows.length - 2] = setBar(rows[rows.length - 2], 10);
  rows[rows.length - 1] = setBar(rows[rows.length - 1], 10);
  const result = createScalperAnalyzer().evaluate(rows, 'bybit:futures:ETHUSDT:1m');
  const triangle = setup(result, 'triangle');
  assert.ok(triangle, 'descending highs and ascending lows should converge into a triangle');
  assert.equal(triangle.lines.length, 2);
  assert.equal(triangle.status, 'forming');
});

test('averaged regression is OFF for existing accounts, independent of caption visibility and ECO', () => {
  const defaults = normalizeOriginalHookChartPreferences();
  assert.equal(defaults.scalperRegressionMode, false);
  assert.equal(normalizeOriginalHookChartPreferences({ scalperRegressionMode: true }).scalperRegressionMode, true);
  assert.equal(normalizeOriginalHookChartPreferences({ scalperRegressionMode: 'true' as unknown as boolean }).scalperRegressionMode, false);
  const saved = normalizeOriginalHookChartPreferences({
    scalperMode: true, scalperRegressionMode: true, showScalperLabels: false,
  });
  assert.equal(saved.scalperMode, true);
  assert.equal(saved.scalperRegressionMode, true);
  assert.equal(saved.showScalperLabels, false);
  assert.equal(terminalEcoPreferences(saved, true).scalperMode, false);
  assert.equal(saved.scalperRegressionMode, true, 'temporary ECO override must not erase regression preference');
});

test('legacy regression restores the averaged fit and changing mode invalidates the geometry cache', () => {
  const rows: ScalperCandle[] = Array.from({ length: 75 }, (_, i) => {
    const amplitude = .62 - i * .006;
    const c = 10 + amplitude * Math.sin(i * 2 * Math.PI / 11);
    return { t: 1_700_000_000_000 + i * 60_000, o: c, c, h: c + .02, l: c - .02 };
  });
  rows[rows.length - 2] = setBar(rows[rows.length - 2], 10);
  rows[rows.length - 1] = setBar(rows[rows.length - 1], 10);
  const scope = 'bybit:futures:ETHUSDT:1m';
  const analyzer = createScalperAnalyzer();
  const defaultWicks = analyzer.evaluate(rows, scope);
  assert.deepEqual(analyzer.evaluate(rows, scope, false), defaultWicks,
    'the old two-argument API must keep the wick-anchored default');
  const average = analyzer.evaluate(rows, scope, true);
  assert.ok(setup(average, 'triangle'), 'legacy least-squares fit still detects a converging triangle');
  assert.notDeepEqual(setup(average, 'triangle')?.lines, setup(defaultWicks, 'triangle')?.lines,
    'averaged regression should produce different geometry from exact two-wick anchoring');
  const recoveredWicks = analyzer.evaluate(rows, scope, false);
  assert.deepEqual(recoveredWicks, defaultWicks,
    'toggling mode must recompute prior wick geometry without a new candle');
  assert.deepEqual(analyzer.evaluate(rows, scope, true), average,
    're-enabled regression must recompute the same deterministic line');
});

test('regression switch and description are translated and wired to HookChart preferences', () => {
  const phrase = 'Усереднена регресійна лінія';
  const help = 'Альтернативна побудова, як у попередній версії: лінія усереднює підтверджені High/Low методом лінійної регресії. Вона може проходити між кінчиками тіней і через тіла свічок. Якщо вимкнено (за замовчуванням), лінії проходять через фактичні High/Low тіней. Змінює тільки алгоритм розмітки, не біржові дані.';
  for (const lang of ['uk', 'en', 'pl', 'ru'] as const) {
    assert.ok(translateHookChartPhrase(lang, phrase));
    assert.ok(translateHookChartPhrase(lang, help).length > 75);
    if (lang !== 'uk') {
      assert.notEqual(translateHookChartPhrase(lang, phrase), phrase);
      assert.notEqual(translateHookChartPhrase(lang, help), help);
    }
    const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
      open: true, embedded: true,
      prefs: normalizeOriginalHookChartPreferences({
        language: lang, siteLanguageAtSelection: 'uk', scalperMode: true,
        scalperRegressionMode: false,
      }),
      onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
    }));
    const label = translateHookChartPhrase(lang, phrase);
    assert.ok(html.includes(label), lang + ' regression switch label');
    assert.ok(html.includes(translateHookChartPhrase(lang, help)),
      lang + ' regression help text');
  }
  const canvas = readFileSync('src/components/hookchart/HookChartCanvas.tsx', 'utf8');
  assert.ok(canvas.includes('runtimeSettings.scalperRegressionMode === true'));
  assert.ok(canvas.includes('runtimeSettings.scalperMode, runtimeSettings.scalperRegressionMode'),
    'chart memoization must refresh when the selected fit method changes');
});

test('triangle lines begin precisely at actual High/Low WICK tips, not candle bodies or averages', () => {
  const rows: ScalperCandle[] = Array.from({ length: 75 }, (_, i) => {
    const amplitude = .62 - i * .006;
    const c = 10 + amplitude * Math.sin(i * 2 * Math.PI / 11);
    // Tall enough shadows to visibly separate wick tip from candle body.
    return { t: 1_700_000_000_000 + i * 60_000, o: c, c, h: c + .055, l: c - .055 };
  });
  rows[rows.length - 2] = setBar(rows[rows.length - 2], 10);
  rows[rows.length - 1] = setBar(rows[rows.length - 1], 10);
  const triangle = setup(createScalperAnalyzer().evaluate(rows, 'bybit:futures:ETHUSDT:1m'), 'triangle');
  assert.ok(triangle, 'triangle should still be found with wick-tip anchored lines');
  for (const line of triangle.lines) {
    const first = rows.find(row => row.t === line.from.t);
    assert.ok(first, 'line starts on a candle timestamp');
    const expectedWick = line.role === 'upper' ? first.h : first.l;
    const body = first.c;
    assert.ok(Math.abs(line.from.p - expectedWick) <= 1e-10,
      line.role + ' must intersect exact exchange wick tip');
    assert.ok(Math.abs(line.from.p - body) > .01,
      'line must not be anchored at the body close');
    assert.ok(line.to.t > line.from.t);
    const exactTipContacts = triangle.touches.filter(touch => {
      const candle = rows.find(row => row.t === touch.t);
      if (!candle) return false;
      const wick = line.role === 'upper' ? candle.h : candle.l;
      const projection = line.from.p + (line.to.p - line.from.p) *
        (touch.t - line.from.t) / (line.to.t - line.from.t);
      return Math.abs(projection - wick) < 1e-9 && Math.abs(touch.p - wick) < 1e-9;
    });
    assert.ok(exactTipContacts.length >= 2,
      'at least two real wick tips define each sloping line');
  }
});

test('no displayed sloping line can drift off its first confirmed wick', () => {
  const sets = [
    oscillation(),
    Array.from({ length: 75 }, (_, i) => {
      const amplitude = .62 - i * .006;
      const c = 10 + amplitude * Math.sin(i * 2 * Math.PI / 11);
      return { t: 1_700_000_000_000 + i * 60_000, o: c, c, h: c + .02, l: c - .02 };
    }),
  ];
  for (const rows of sets) {
    const scene = createScalperAnalyzer().evaluate(rows, 'bybit:futures:ETHUSDT:1m');
    for (const figure of scene.setups) for (const line of figure.lines) {
      const sourceBar = rows.find(row => row.t === line.from.t);
      assert.ok(sourceBar);
      if (line.role === 'upper') {
        assert.ok(Math.abs(line.from.p - sourceBar.h) < 1e-8 ||
          (figure.kind === 'range' && line.from.p >= sourceBar.h),
          'upper sloping lines must start on HIGH wick, not candle body');
      } else if (line.role === 'lower') {
        assert.ok(Math.abs(line.from.p - sourceBar.l) < 1e-8 ||
          (figure.kind === 'range' && line.from.p <= sourceBar.l),
          'lower sloping lines must start on LOW wick, not candle body');
      }
    }
  }
});

test('M/W caps and necklines start on their true wick candles, not a peak candle body', () => {
  for (const kind of ['double-top', 'double-bottom'] as const) {
    const rows: ScalperCandle[] = Array.from({ length: 80 }, (_, i) => ({
      t: 1_700_000_000_000 + i * 60_000, o: 10, c: 10, h: 10.03, l: 9.97,
    }));
    for (const i of [50, 65]) {
      if (kind === 'double-top') rows[i].h = 11;
      else rows[i].l = 9;
    }
    if (kind === 'double-top') rows[58].l = 8.5;
    else rows[58].h = 11.5;
    const figure = setup(createScalperAnalyzer().evaluate(rows, 'binance:futures:BTCUSDT:1m'), kind);
    assert.ok(figure, kind + ' needs two confirmed wick pivots');
    const neckline = figure.lines.find(line => line.role === 'neckline');
    assert.ok(neckline, kind + ' needs intervening neckline');
    const neckBar = rows.find(bar => bar.t === neckline.from.t);
    assert.ok(neckBar);
    assert.equal(neckline.from.t, rows[58].t, 'neckline starts at the intervening extreme candle');
    assert.equal(neckline.from.p, kind === 'double-top' ? neckBar.l : neckBar.h,
      'neckline crosses the true LOW/HIGH wick tip');
    const capRole = kind === 'double-top' ? 'upper' : 'lower';
    const cap = figure.lines.find(line => line.role === capRole);
    assert.ok(cap);
    const capBar = rows.find(bar => bar.t === cap.from.t);
    assert.ok(capBar);
    assert.equal(cap.from.p, kind === 'double-top' ? capBar.h : capBar.l);
  }
});

test('Scalper Mode caption switch is independent and translated in all four chart languages', () => {
  const defaults = normalizeOriginalHookChartPreferences();
  assert.equal(defaults.scalperMode, false);
  assert.equal(defaults.showScalperLabels, true);
  assert.equal(normalizeOriginalHookChartPreferences({ scalperMode: true, showScalperLabels: false }).showScalperLabels, false);
  assert.equal(normalizeOriginalHookChartPreferences({ showScalperLabels: 'no' as unknown as boolean }).showScalperLabels, true);
  assert.equal(terminalEcoPreferences({ scalperMode: true, showScalperLabels: false }, true).scalperMode, false);
  const text = 'Показувати підписи Режиму Скальпера';
  const description = 'Якщо вимкнено, приховує лише назви фігур та статуси біля автоматично намальованих ліній. Лінії, дотики тіней і позначки пробою залишаються видимими.';
  const localizedDescriptions = {
    uk: description,
    en: 'When disabled, only pattern names and statuses beside automatically drawn lines are hidden. Lines, wick contacts and breakout markers remain visible.',
    pl: 'Po wyłączeniu ukrywane są tylko nazwy formacji i statusy obok automatycznie rysowanych linii. Linie, dotknięcia knotów i znaczniki wybicia pozostają widoczne.',
    ru: 'Если выключено, скрываются только названия фигур и статусы рядом с автоматически нарисованными линиями. Линии, касания теней и отметки пробоя остаются видимыми.',
  };
  for (const language of ['uk', 'en', 'pl', 'ru'] as const) {
    assert.notEqual(translateHookChartPhrase(language, text), '', language);
    const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
      open: true, embedded: true,
      prefs: normalizeOriginalHookChartPreferences({ language, siteLanguageAtSelection: 'uk',
        scalperMode: true, showScalperLabels: false }),
      onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
    }));
    assert.ok(html.includes(translateHookChartPhrase(language, text)), language + ' caption control visible');
    assert.equal(translateHookChartPhrase(language, description), localizedDescriptions[language]);
    assert.ok(html.includes(localizedDescriptions[language]), language + ' caption explanation visible');
  }
  const canvas = readFileSync('src/components/hookchart/HookChartCanvas.tsx', 'utf8');
  const painter = readFileSync('src/components/hookchart/engine.tsx', 'utf8');
  assert.match(canvas, /showScalperLabels=\{runtimeSettings\.showScalperLabels !== false\}/);
  assert.match(painter, /if \(anchor && showScalperLabels\)/,
    'caption flag must gate only text painting, not lines, wick dots or breakout markers');
  assert.ok(painter.indexOf('if (anchor && showScalperLabels)') > painter.indexOf('for (const touch of setup.touches)'));
});

test('exactly equal consecutive High/Low plateaus count as one pivot per touch', () => {
  const rows: ScalperCandle[] = Array.from({ length: 80 }, (_, i) => {
    const phase = i % 12;
    return {
      t: 1_700_000_000_000 + i * 60_000,
      o: 10, c: 10,
      h: phase === 3 || phase === 4 ? 10.35 : 10.02,
      l: phase === 9 || phase === 10 ? 9.65 : 9.98,
    };
  });
  const scene = createScalperAnalyzer().evaluate(rows, 'binance:futures:BTCUSDT:1m');
  const range = setup(scene, 'range');
  assert.ok(range, 'multiple equal-price wick tests must establish a valid range');
  assert.ok(range.touches.length >= 4);
  assert.equal(new Set(range.touches.map(p => p.t)).size, range.touches.length,
    'one adjacent wick plateau must never generate duplicate touches');
});

test('historical outlier wick does not conceal a repeatedly respected range', () => {
  const rows = oscillation();
  rows[14] = { ...rows[14], h: 12.5 };
  const found = createScalperAnalyzer().evaluate(rows, 'binance:futures:BTCUSDT:1m');
  const range = setup(found, 'range');
  assert.ok(range, 'one isolated outlier must not override repeatedly touched highs/lows');
  assert.ok(range.lines[0].to.p < 11, 'upper boundary must follow the repeated touch cluster');
});

test('historical candle corrections invalidate geometry even when first/last bars are unchanged', () => {
  const rows = oscillation();
  const analyzer = createScalperAnalyzer();
  const initial = analyzer.evaluate(rows, 'scope');
  assert.ok(initial.setups.length, 'fixture must have at least one original setup');
  const repaired = rows.map(row => ({ ...row }));
  for (let i = 20; i <= 62; i++) {
    repaired[i] = { ...repaired[i], o: 11, c: 11, h: 11.04, l: 10.96 };
  }
  const correct = createScalperAnalyzer().evaluate(repaired, 'scope');
  assert.notDeepEqual(correct.setups, initial.setups, 'mid-history repair changes the actual pattern');
  assert.deepEqual(analyzer.evaluate(repaired, 'scope'), correct);
  // Also support rare in-place OHLC patches rather than relying on object identity.
  for (let i = 20; i <= 62; i++) {
    Object.assign(rows[i], { o: 11, c: 11, h: 11.04, l: 10.96 });
  }
  assert.deepEqual(createScalperAnalyzer().evaluate(rows, 'scope'),
    createScalperAnalyzer().evaluate(repaired, 'scope'));
  assert.deepEqual(analyzer.evaluate(rows, 'scope'),
    createScalperAnalyzer().evaluate(repaired, 'scope'));
});

test('missing exchange candles never create artificial trendlines through the gap', () => {
  const rows = oscillation();
  const gapped = rows.map((row, i) =>
    i >= 65 ? { ...row, t: row.t + 60_000 } : { ...row });
  assert.equal(createScalperAnalyzer().evaluate(gapped, 'binance:futures:BTCUSDT:1m').setups.length, 0,
    'fewer than 30 contiguous closed bars after gap cannot form a setup');
  const oldGap = rows.map((row, i) =>
    i >= 20 ? { ...row, t: row.t + 60_000 } : { ...row });
  assert.ok(setup(createScalperAnalyzer().evaluate(oldGap, 'binance:futures:BTCUSDT:1m'), 'range'),
    'old gaps should not suppress a fresh contiguous structure');
});

test('invalid live bar is rejected and cannot create a false preview', () => {
  const rows = oscillation();
  rows[rows.length - 1] = { ...rows.at(-1)!, c: NaN };
  assert.equal(createScalperAnalyzer().evaluate(rows, 'binance:futures:BTCUSDT:1m').setups.length, 0);
});

test('BTC-sized and micro-priced markets use relative geometry without absolute-price assumptions', () => {
  for (const multiplier of [0.000001, 100_000]) {
    const rows = oscillation().map(b => ({
      ...b, o: b.o * multiplier, h: b.h * multiplier, l: b.l * multiplier, c: b.c * multiplier,
    }));
    assert.ok(setup(createScalperAnalyzer().evaluate(rows, 'bybit:futures:SOLUSDT:1m'), 'range'));
  }
});

test('live wick does not become a confirmed swing pivot until enough bars close', () => {
  const rows = oscillation();
  const before = createScalperAnalyzer().evaluate(rows, 'scope');
  const withWick = rows.map(b => ({ ...b }));
  withWick[withWick.length - 1].h = 13;
  const after = createScalperAnalyzer().evaluate(withWick, 'scope');
  assert.deepEqual(after.setups.map(s => s.lines), before.setups.map(s => s.lines));
  assert.ok(after.setups.every(s => s.status !== 'confirmed'));
});

test('bad, incomplete, or unsorted candles are ignored rather than drawing fake setups', () => {
  const analyzer = createScalperAnalyzer();
  assert.equal(analyzer.evaluate(oscillation(12), 's').setups.length, 0);
  const nan = oscillation();
  nan[35] = { ...nan[35], h: NaN };
  assert.equal(analyzer.evaluate(nan, 's').setups.length, 0);
  // A recent disorder leaves too little fresh contiguous history to trust;
  // an old gap may be ignored after thirty new complete bars (tested above).
  const unsorted = oscillation();
  unsorted[74] = { ...unsorted[74], t: unsorted[73].t };
  assert.equal(analyzer.evaluate(unsorted, 'binance:futures:BTCUSDT:1m').setups.length, 0);
});

test('historical candle corrections invalidate cached scalp geometry even at the same timestamp', () => {
  const analyzer = createScalperAnalyzer();
  const original = oscillation();
  original[original.length - 2] = setBar(original[original.length - 2], 10);
  original[original.length - 1] = setBar(original[original.length - 1], 10);
  assert.ok(setup(analyzer.evaluate(original, 'same-scope'), 'range'));
  // The latest completed candle and array length are unchanged. A corrected
  // older bar must still invalidate the previous range or triangle.
  const revised = original.map(bar => ({ ...bar }));
  revised[35].h = NaN;
  assert.deepEqual(analyzer.evaluate(revised, 'same-scope').setups, []);
  // The cache must also recover when corrected history becomes valid again.
  assert.ok(setup(analyzer.evaluate(original, 'same-scope'), 'range'));
});

test('only a new close across the upper range border confirms a breakout', () => {
  const rows = oscillation();
  const analyzer = createScalperAnalyzer();
  rows[rows.length - 2] = setBar(rows[rows.length - 2], 10.8, 10.85, 9.99);
  rows[rows.length - 1] = setBar(rows[rows.length - 1], 10.8, 10.85, 10.75);
  const first = analyzer.evaluate(rows, 'binance:futures:BTCUSDT:1m');
  assert.equal(setup(first, 'range')?.status, 'confirmed', 'fresh closed-candle crossing is a confirmation');
  // Price remains above resistance. A second candle MUST NOT confirm the
  // same historical breakout again or suggest a fresh preliminary break.
  const alreadyOutside = rows.map(b => ({ ...b }));
  alreadyOutside[alreadyOutside.length - 3] = setBar(
    alreadyOutside[alreadyOutside.length - 3], 10.8, 10.85, 10.75);
  const after = analyzer.evaluate(alreadyOutside, 'binance:futures:BTCUSDT:1m');
  assert.ok(after.setups.every(s => s.status !== 'confirmed' && s.status !== 'possible'),
    'a sustained move outside the structure cannot repeatedly trigger a new breakout');
});

test('downside breakouts also require a fresh close through support', () => {
  const rows = oscillation();
  const analyzer = createScalperAnalyzer();
  rows[rows.length - 2] = setBar(rows[rows.length - 2], 9.2, 9.25, 9.15);
  rows[rows.length - 1] = setBar(rows[rows.length - 1], 9.2, 9.25, 9.15);
  const first = analyzer.evaluate(rows, 'bybit:futures:XRPUSDT:1m');
  assert.equal(setup(first, 'range')?.status, 'confirmed');
  assert.equal(setup(first, 'range')?.breakout?.side, 'down');
  const alreadyBelow = rows.map(b => ({ ...b }));
  alreadyBelow[alreadyBelow.length - 3] = setBar(
    alreadyBelow[alreadyBelow.length - 3], 9.2, 9.25, 9.15);
  const next = analyzer.evaluate(alreadyBelow, 'bybit:futures:XRPUSDT:1m');
  assert.ok(next.setups.every(s => s.status !== 'confirmed' && s.status !== 'possible'));
});

test('an old price break invalidates a range before new live ticks', () => {
  const rows = oscillation();
  assert.ok(setup(createScalperAnalyzer().evaluate(rows, 'scope'), 'range'));
  const broken = rows.map(b => ({ ...b }));
  // The most recent eight historic candle CLOSES are above resistance.
  for (let i = broken.length - 12; i < broken.length - 2; i++) {
    broken[i] = setBar(broken[i], 10.8, 10.85, 10.75);
  }
  const after = createScalperAnalyzer().evaluate(broken, 'scope');
  assert.equal(setup(after, 'range'), undefined,
    'a structure already broken in the cached history is not a new setup');
});

test('a closed-bar break older than eight bars cannot resurrect a range without new wick contacts', () => {
  const rows = oscillation(90).map(bar => ({ ...bar }));
  // Remove late pivots but leave a recently tested, otherwise intact range.
  // The last known upper/lower touches predate the isolated old break.
  for (let i = 68; i < rows.length; i++)
    rows[i] = { ...rows[i], o: 10, c: 10, h: 10.02, l: 9.98 };
  assert.ok(setup(createScalperAnalyzer().evaluate(rows, 'binance:futures:BTCUSDT:1m'), 'range'),
    'a quiet range should remain valid while its latest contacts are recent');
  const previouslyBroken = rows.map(bar => ({ ...bar }));
  previouslyBroken[75] = setBar(previouslyBroken[75], 10.8, 10.85, 9.98);
  assert.equal(setup(createScalperAnalyzer().evaluate(previouslyBroken, 'binance:futures:BTCUSDT:1m'), 'range'),
    undefined, 'a decisive historical close must invalidate the level even after eight quiet bars');
});

test('a newly re-established range is not banned by a break before its latest real contacts', () => {
  const rows = oscillation(90).map(bar => ({ ...bar }));
  // The market made fresh wick contacts long after this old break.
  rows[25] = setBar(rows[25], 10.8, 10.85, 9.98);
  assert.ok(setup(createScalperAnalyzer().evaluate(rows, 'binance:futures:BTCUSDT:1m'), 'range'),
    'a historical breach predating recent contacts must not hide a new respected range');
});

test('an untested M/W formation expires after 34 completed bars without wick contacts', () => {
  for (const kind of ['double-top', 'double-bottom'] as const) {
    const rows: ScalperCandle[] = Array.from({ length: 120 }, (_, i) => ({
      t: 1_700_000_000_000 + i * 60_000, o: 10, c: 10, h: 10.03, l: 9.97,
    }));
    for (const i of [50, 65]) {
      if (kind === 'double-top') rows[i].h = 11;
      else rows[i].l = 9;
    }
    if (kind === 'double-top') rows[58].l = 8.5;
    else rows[58].h = 11.5;
    assert.ok(setup(createScalperAnalyzer().evaluate(rows.slice(0, 85), 'scope'), kind),
      'two confirmed, recent wick peaks should be drawable');
    assert.equal(setup(createScalperAnalyzer().evaluate(rows, 'scope'), kind), undefined,
      'old unchanged pivots must not remain as active scalping opportunities');
  }
});

test('all rendered two-sided structures keep valid non-inverted boundaries', () => {
  const rows: ScalperCandle[] = Array.from({ length: 85 }, (_, i) => {
    const amplitude = Math.max(.05, .62 - i * .006);
    const c = 10 + amplitude * Math.sin(i * 2 * Math.PI / 11);
    return { t: 1_700_000_000_000 + i * 60_000, o: c, c, h: c + .02, l: c - .02 };
  });
  for (let n = 45; n <= 85; n++) {
    const scene = createScalperAnalyzer().evaluate(rows.slice(0, n), 'bybit:futures:ETHUSDT:1m');
    for (const candidate of scene.setups) {
      const upper = candidate.lines.find(line => line.role === 'upper');
      const lower = candidate.lines.find(line => line.role === 'lower');
      if (!upper || !lower) continue;
      assert.ok(upper.to.p > lower.to.p,
        'expired apex cannot show upside/downside breakout on inverted lines');
      assert.ok(upper.to.p > 0 && lower.to.p > 0);
    }
  }
});

test('40 independent Terminal-chart scalper analyzers handle live ticks within a bounded CPU budget', () => {
  const base = oscillation();
  const analyzers = Array.from({ length: 40 }, () => createScalperAnalyzer());
  const histories = analyzers.map((_, i) => base.map(b => {
    const factor = i % 2 ? 100_000 : 0.000001;
    return { ...b, o: b.o * factor, h: b.h * factor, l: b.l * factor, c: b.c * factor };
  }));
  const began = performance.now();
  for (let tick = 0; tick < 200; tick++) {
    for (let chart = 0; chart < analyzers.length; chart++) {
      const factor = chart % 2 ? 100_000 : 0.000001;
      const old = histories[chart];
      const close = (10 + .18 * Math.sin(tick / 17)) * factor;
      const open = 10 * factor;
      const live = {
        ...old[old.length - 1], o: open, c: close,
        h: Math.max(open, close) + .03 * factor,
        l: Math.min(open, close) - .03 * factor,
      };
      const scene = analyzers[chart].evaluate([...old.slice(0, -1), live],
        'binance:futures:COIN' + chart + ':1m');
      assert.ok(scene.setups.length <= 2);
    }
  }
  const elapsedMs = performance.now() - began;
  assert.ok(elapsedMs < 8000,
    'pure JS analysis of 8,000 chart/tick updates should stay bounded: ' + elapsedMs.toFixed(1) + 'ms');
});

test('completed-candle quality rescoring is bounded across 40 parallel chart analyzers', () => {
  const analyzers = Array.from({ length: 40 }, () => createScalperAnalyzer());
  const histories = analyzers.map((_, chart) => {
    const scale = chart % 2 === 0 ? 0.000001 : 100_000;
    return oscillation(80).map(bar => ({
      ...bar, o: bar.o * scale, h: bar.h * scale,
      l: bar.l * scale, c: bar.c * scale,
    }));
  });
  const started = performance.now();
  for (let candle = 0; candle < 20; candle++) {
    for (let chart = 0; chart < analyzers.length; chart++) {
      const previous = histories[chart];
      const scale = chart % 2 === 0 ? 0.000001 : 100_000;
      const close = (10 + .3 * Math.sin((80 + candle) * 2 * Math.PI / 11)) * scale;
      const live = {
        t: previous.at(-1)!.t + 60_000, o: close, c: close,
        h: close + .025 * scale, l: close - .025 * scale,
      };
      const next = [...previous.slice(1), live];
      histories[chart] = next;
      const scene = analyzers[chart].evaluate(next, 'binance:futures:COIN' + chart + ':1m');
      assert.ok(scene.setups.length <= 2, 'quality reranking cannot increase chart overlays');
      for (const candidate of scene.setups)
        assert.ok(candidate.score >= 0 && candidate.score <= 100);
    }
  }
  assert.ok(performance.now() - started < 12_000,
    '800 historical-quality rebuilds across 40 charts must stay within a generous CPU budget');
});

test('all four chart languages have scalper overlay labels', () => {
  const expected = {
    uk: ['Трикутник', 'Клин', 'Діапазон', 'Похила', 'Подвійна вершина', 'Подвійне дно', 'формується', 'можливий пробій', 'пробій підтверджено', 'хибний пробій'],
    en: ['Triangle', 'Wedge', 'Range', 'Trendline', 'Double top', 'Double bottom', 'forming', 'possible breakout', 'breakout confirmed', 'false breakout'],
    pl: ['Trójkąt', 'Klin', 'Konsolidacja', 'Linia trendu', 'Podwójny szczyt', 'Podwójne dno', 'tworzy się', 'możliwe wybicie', 'wybicie potwierdzone', 'fałszywe wybicie'],
    ru: ['Треугольник', 'Клин', 'Диапазон', 'Наклонная', 'Двойная вершина', 'Двойное дно', 'формируется', 'возможный пробой', 'пробой подтверждён', 'ложный пробой'],
  };
  for (const lang of ['uk', 'en', 'pl', 'ru'] as const) {
    let index = 0;
    for (const word of ['triangle', 'wedge', 'range', 'trend', 'double-top', 'double-bottom', 'forming', 'possible', 'confirmed', 'failed'] as const) {
      assert.equal(scalperLabel(word,lang), expected[lang][index++], lang + ':' + word);
    }
  }
});

test('scalper overlay uses only live candles and cannot persist into Replay or personal drawings', () => {
  const source = readFileSync('src/components/hookchart/HookChartCanvas.tsx', 'utf8');
  const painter = readFileSync('src/components/hookchart/engine.tsx', 'utf8');
  assert.match(source, /runtimeSettings\.scalperMode === true && !archiveMode && !replay && !externalData && !ecoActive/);
  assert.match(source, /scalperAnalyzer\.evaluate\(candles/);
  assert.match(source, /scalperResult=\{scalperResult\}/);
  assert.match(painter, /if \(scalperResult\?\.setups\.length\)/);
  assert.doesNotMatch(painter.slice(painter.indexOf('if (scalperResult?.setups.length)'),painter.indexOf('drawHookTimeMarkers(q,g,timeMarkers,mouse);')), /setDrawings/);
});
