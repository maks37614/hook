import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';
import { metaScalpModalRows } from '../src/locales/metaScalpModal20261115';

const source = readFileSync(new URL('../src/components/MetaScalpModal.tsx', import.meta.url), 'utf8');

test('MetaScalp settings, connection states and setup instructions render in selected language', () => {
  assert.match(source, /const \{ language \} = useLanguage\(\)/);
  assert.match(source, /const tr = \(source: string\) => translatePhrase\(language, source\)/);
  const labels = [...new Set([...source.matchAll(/\btr\((["'])(.*?)\1\)/g)].map(m=>m[2].replace(/\\u0027/g, "'")))];
  assert.ok(labels.length >= 40, 'expected connection, settings and tutorial labels');
  for (const key of labels) {
    assert.ok(translatePhrase('uk',key).trim(), 'missing Ukrainian phrase: ' + key);
    for (const language of ['en','ru','pl'] as const) {
      assert.ok(translatePhrase(language,key).trim(), 'missing '+language+' translation: '+key);
    }
  }
  const display = source.slice(source.indexOf('  return ('));
  const masked = display.replace(/\btr\((["'])(.*?)\1\)/g, 'LOCALIZED');
  assert.doesNotMatch(masked, />[^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*</,
    'hard-coded Ukrainian text remains in MetaScalp');
  assert.doesNotMatch(masked, /\b(?:title|aria-label|placeholder)="[^"]*[А-Яа-яІіЇїЄєҐґ]/,
    'hard-coded Ukrainian accessibility label remains');
  assert.match(source, /aria-label=\{tr\("Закрити"\)\}/);
  assert.match(source, /aria-label=\{tr\("Автоперемикання при виборі"\)\}/);
});

test('every additional MetaScalp phrase has UK, EN, RU and PL forms', () => {
  assert.equal(metaScalpModalRows.length,21);
  const seen = new Set<string>();
  for (const row of metaScalpModalRows) {
    assert.equal(row.length,4);
    assert.ok(!seen.has(row[0]), 'duplicate MetaScalp phrase');
    seen.add(row[0]);
    for (const [i,lang] of (['uk','en','ru','pl'] as const).entries()) {
      assert.equal(translatePhrase(lang,row[0]),row[i], lang+' mismatched MetaScalp phrase: '+row[0]);
    }
  }
  assert.equal(translatePhrase('pl', 'Terminal Link'), 'Połączenie z terminalem');
  assert.equal(translatePhrase('en','Немає зв\u0027язку'), 'Disconnected');
});

test('MetaScalp integration protocol, ports, binding and ticker behavior remain unchanged', () => {
  assert.match(source, /const PRESET_BINDINGS = \['001', '002', '003', '004', '005'\]/);
  assert.match(source, /const PRESET_PORTS = \[17845, 17846, 17847, 17848\]/);
  assert.match(source, /findActiveMetaScalpPort\(activePort\)/);
  assert.match(source, /sendTickerToMetaScalp\(currentSymbol, currentExchange, currentMarketType, \{/);
  assert.match(source, /formatMetaScalpTicker\(currentSymbol, currentExchange, currentMarketType\)/);
  assert.match(source, /navigator\.clipboard\.writeText\(testTickerStr\)/);
  assert.match(source, /onSettingsChange\(updated\)/);
});
