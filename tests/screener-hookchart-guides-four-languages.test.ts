import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  SCREENER_TOUR_COPY, SCREENER_TOUR_STEPS, screenerTourLanguage,
} from '../src/components/screenerTourContent';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const langKeys = ['uk', 'en', 'pl', 'ru'] as const;

test('Screener guided navigation has complete, nonempty copy in all four languages', () => {
  const actual = SCREENER_TOUR_STEPS.map(s => s.key);
  assert.equal(actual.length, 20);
  assert.equal(new Set(actual).size, actual.length, 'step keys are unique');
  assert.deepEqual(Object.keys(SCREENER_TOUR_COPY).sort(), [...langKeys].sort());
  assert.equal(screenerTourLanguage('pl'), 'pl');
  assert.equal(screenerTourLanguage('en'), 'en');
  assert.equal(screenerTourLanguage('invalid'), 'uk');
  for (const language of langKeys) {
    const copy = SCREENER_TOUR_COPY[language];
    assert.deepEqual(Object.keys(copy.steps).sort(), actual.slice().sort(), language + ' steps');
    assert.deepEqual(Object.keys(copy.chapters).sort(), ['navigation', 'filters', 'market', 'tools'].sort());
    for (const value of [copy.label, copy.pagesLabel, copy.close, copy.next, copy.previous, copy.finish, copy.note]) {
      assert.ok(value && value.trim().length >= 3, language + ' button or note must not be empty');
    }
    for (const { key } of SCREENER_TOUR_STEPS) {
      assert.ok(copy.steps[key].title.trim().length >= 4, language + ' title for ' + key);
      assert.ok(copy.steps[key].description.trim().length >= 36, language + ' explanation for ' + key);
    }
    if (language !== 'uk') {
      assert.notEqual(copy.label, SCREENER_TOUR_COPY.uk.label,
        language + ' heading must be localized');
      assert.notEqual(copy.pagesLabel, SCREENER_TOUR_COPY.uk.pagesLabel,
        language + ' site pages heading must be localized');
    }
  }
});

test('Screener tour selectors are grounded in the real Header and Screener, including guest states', () => {
  const header = read('../src/components/Header.tsx');
  const screener = read('../src/components/CoinScreenerPage.tsx');
  const overlay = read('../src/components/ScreenerGuide.tsx');
  const css = read('../src/components/screenerGuide.css');

  const buttonStart = header.indexOf('data-screener-guide="fullscreen"');
  const helpStart = header.indexOf('id="screener-help-btn"');
  const logoStart = header.indexOf('src="/h00k-robot-logo.svg"');
  assert.ok(helpStart > 0 && helpStart < logoStart && logoStart < buttonStart,
    'help must appear before the logo, with fullscreen on the right');
  assert.match(header, /\{screenerGuideOpen && \(/);
  assert.match(header, /LazyScreenerGuide = React\.lazy/);
  assert.match(header, /setScreenerGuideOpen\(true\)/);
  assert.match(header, /setScreenerGuideOpen\(false\); \}, \[activePage\]/);
  assert.match(header, /navigationOnly=\{activePage !== 'screener'\}/);
  assert.match(overlay, /navigationOnly && chapter !== 'navigation'/);
  assert.match(overlay, /navigationOnly \? copy\.pagesLabel : copy\.label/);
  for (const { key, selector } of SCREENER_TOUR_STEPS) {
    const ids = [...selector.matchAll(/#([a-z-]+)/g)].map(match => match[1]);
    for (const id of ids) {
      assert.ok(header.includes('id="' + id + '"') ||
        (id === 'open-site-notifications-btn' && read('../src/components/SiteNotificationBell.tsx').includes('id="' + id + '"')),
        'Missing actual header target for ' + key + ': ' + id);
    }
    const attributes = [...selector.matchAll(/data-screener-guide="([^"]+)"/g)].map(match => match[1]);
    for (const attribute of attributes) {
      assert.ok(screener.includes('data-screener-guide="' + attribute + '"'),
        'Missing real Screener target for ' + key + ': ' + attribute);
    }
    assert.ok(ids.length || attributes.length || selector.includes('data-screener-filter'),
      'Unexpected selector for ' + key);
  }
  assert.equal((screener.match(/data-screener-guide="results"/g) || []).length, 4,
    'loading, empty, table and card results must all be supported');
  assert.match(overlay, /createPortal\(/);
  assert.match(overlay, /scrollIntoView/);
  assert.match(overlay, /prefers-reduced-motion/);
  assert.match(overlay, /addEventListener\('scroll', schedule, true\)/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /prefers-reduced-motion/);
});

const objectProps = (input: ts.Expression): Map<string, ts.Expression> => {
  assert.ok(ts.isObjectLiteralExpression(input), 'translation must be an object literal');
  const entries = new Map<string, ts.Expression>();
  for (const p of input.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const name = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText();
    entries.set(name, p.initializer);
  }
  return entries;
};
const variable = (source: ts.SourceFile, variableName: string): ts.Expression => {
  for (const stmt of source.statements) if (ts.isVariableStatement(stmt)) {
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === variableName && d.initializer) return d.initializer;
    }
  }
  throw new Error('No variable ' + variableName);
};
const stepKeys = (source: ts.SourceFile): string[] => {
  let expr = variable(source, 'GUIDE_STEPS');
  if (ts.isSatisfiesExpression(expr)) expr = expr.expression;
  if (ts.isAsExpression(expr)) expr = expr.expression;
  assert.ok(ts.isArrayLiteralExpression(expr));
  return expr.elements.map(item => {
    assert.ok(ts.isObjectLiteralExpression(item));
    const key = objectProps(item).get('key');
    assert.ok(key && ts.isStringLiteral(key));
    return key.text;
  });
};

test('HookChart guided tour has all 27 translated steps and chapter names in UA/EN/PL/RU', () => {
  const path = '../src/components/hookchart/HookChartGuide.tsx';
  const source = ts.createSourceFile('HookChartGuide.tsx', read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  // The parser exposes diagnostics at runtime, but SourceFile omits the field
  // from the public TypeScript type on several supported compiler versions.
  const parsed = source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };
  assert.equal(parsed.parseDiagnostics?.length ?? 0, 0);
  const steps = stepKeys(source);
  assert.equal(steps.length, 27);
  assert.equal(new Set(steps).size, steps.length);
  const basic = ['timeframe', 'cursor', 'drawing', 'measure', 'candles', 'price', 'indicators', 'liq', 'stats', 'settings'];
  const advanced = steps.filter(key => !basic.includes(key));
  const copy = objectProps(variable(source, 'COPY'));
  const adv = objectProps(variable(source, 'ADVANCED'));
  const chapters = objectProps(variable(source, 'CHAPTERS'));
  for (const language of langKeys) {
    const langBasic = objectProps(copy.get(language)!);
    const langAdv = objectProps(adv.get(language)!);
    const langChapters = objectProps(chapters.get(language)!);
    const keysBasic = objectProps(langBasic.get('steps')!);
    assert.deepEqual([...keysBasic.keys()].sort(), basic.slice().sort(), language + ' basic tour coverage');
    assert.deepEqual([...langAdv.keys()].sort(), advanced.slice().sort(), language + ' advanced tour coverage');
    assert.deepEqual([...langChapters.keys()].sort(), ['basics', 'liq', 'levels', 'density', 'map'].sort());
    for (const item of [...keysBasic, ...langAdv]) {
      const values = objectProps(item[1]);
      for (const prop of ['title', 'description']) {
        const text = values.get(prop);
        assert.ok(text && ts.isStringLiteral(text), language + ' ' + item[0] + ' ' + prop);
        assert.ok(text.text.trim().length >= (prop === 'title' ? 4 : 30),
          language + ' ' + item[0] + ' needs nonempty ' + prop);
      }
    }
    for (const label of ['name', 'close', 'back', 'next', 'done', 'safe']) {
      const value = langBasic.get(label);
      assert.ok(value && ts.isStringLiteral(value) && value.text.length >= 3, language + ' ' + label);
    }
  }
  const hookchart = read('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(hookchart, /language=\{chartLanguage\}/);
  assert.match(hookchart, /<LazyHookChartGuide/);
  assert.match(hookchart, /className="hookchart-guide-entry"/);
  assert.match(hookchart, /\{drawingToolbarOpen && <div className="floatingDrawTools"/);
  assert.match(hookchart, /!terminalMode && !replay && !archiveMode && <React\.Fragment>/);
});

test('Screener help icon has no enclosing background, border or shadow in the header', () => {
  const header = read('../src/components/Header.tsx');
  const start = header.indexOf('id="screener-help-btn"');
  const end = header.indexOf('</button>', start);
  assert.ok(start >= 0 && end > start, 'the help button must exist next to fullscreen');
  const button = header.slice(start, end);
  const className = button.match(/className="([^"]+)"/)?.[1] || '';
  const classes = className.split(/\s+/);
  assert.ok(classes.includes('inline-flex') && !classes.includes('hidden'));
  assert.ok(classes.includes('h-8') && classes.includes('w-8'));
  assert.ok(classes.includes('bg-transparent'));
  assert.ok(classes.includes('border-0'));
  assert.ok(classes.includes('shadow-none'));
  assert.ok(classes.includes('hover:bg-transparent'));
  assert.ok(classes.includes('focus-visible:outline-none'));
  assert.ok(!classes.some(cls => /^(?:border|bg|shadow)-(?!0(?:$|-)|transparent$|none$)/.test(cls)),
    'the guide icon must not have an enclosing colored frame or fill');
  assert.match(button, /onClick=\{\(\) => setScreenerGuideOpen\(true\)\}/);
  assert.match(button, /<CircleHelp className="h-4 w-4"/);
  assert.match(button, /aria-label=\{pageGuideCopy\.open\}/);
});
