import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';
import { kotapychDirectionRows } from '../src/locales/kotapychDirection20261115';

const components = [
  ['FormationGuideModal.tsx', 'export const FormationGuideModal'],
  ['encyclopedia/KotapychGuide.tsx', 'export function KotapychGuide'],
  ['encyclopedia/ClassicRulesGuide.tsx', 'export function ClassicRulesGuide'],
  ['encyclopedia/OpenInterestGuide.tsx', 'function DirectionIndicator'],
] as const;

test('Encyclopedia components have no raw Ukrainian visible text or accessibility label', () => {
  for (const [path, startMarker] of components) {
    const source = readFileSync(new URL('../src/components/' + path, import.meta.url), 'utf8');
    const start = source.indexOf(startMarker);
    assert.ok(start >= 0, 'component marker not found: ' + path);
    const rendered = source.slice(start);
    // tr("source") strings intentionally contain Ukrainian; their returned
    // value is localized. SectionBanner translates its title/subtitle props
    // inside that component.
    const lines = rendered.replace(/\btr\((["'])(.*?)\1\)/g, 'LOCALIZED').split('\n');
    for (const [i, line] of lines.entries()) {
      if (line.includes('<SectionBanner ')) continue;
      assert.doesNotMatch(line,
        />[^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*</,
        'unlocalized visible JSX text in ' + path + ':' + (i + 1));
      assert.doesNotMatch(line,
        /\b(?:aria-label|placeholder|title)="[^"]*[А-Яа-яІіЇїЄєҐґ][^"]*"/,
        'unlocalized accessibility label in ' + path + ':' + (i + 1));
    }
  }
});

test('Classic Rules banner props are translated by the SectionBanner renderer', () => {
  const source = readFileSync(new URL('../src/components/encyclopedia/ClassicRulesGuide.tsx', import.meta.url), 'utf8');
  const banner = source.slice(source.indexOf('function SectionBanner'), source.indexOf('export function ClassicRulesGuide'));
  assert.match(banner, /tr\(title\)/);
  assert.match(banner, /tr\(subtitle\)/);
});

test('Kotapych long/short presentation labels change with language without changing trading directions', () => {
  const data = readFileSync(new URL('../src/components/encyclopedia/KotapychGuide.tsx', import.meta.url), 'utf8');
  assert.match(data, /tr\(setup\.direction === 'LONG' \? 'ЛОНГ' : 'ШОРТ'\)/);
  assert.match(data, /tr\(item\.direction === 'LONG' \? 'ЛОНГ' : 'ШОРТ'\)/);
  assert.equal(kotapychDirectionRows.length, 2);
  for (const row of kotapychDirectionRows) {
    for (const [index, language] of (['uk','en','ru','pl'] as const).entries()) {
      assert.equal(translatePhrase(language, row[0]), row[index]);
    }
  }
  assert.equal(translatePhrase('en', 'ЛОНГ'), 'LONG');
  assert.equal(translatePhrase('pl', 'ШОРТ'), 'SHORT');
});
