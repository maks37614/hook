import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateHookChartPhrase, resolveHookChartLanguage } from '../src/locales/hookchartLanguage';
import { normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';

const source = (path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('chart language overrides the site while the saved site-language context is current',()=>{
  const settings=normalizeOriginalHookChartPreferences({language:'ru',siteLanguageAtSelection:'uk'});
  assert.equal(resolveHookChartLanguage(settings,'uk'),'ru');
  assert.equal(resolveHookChartLanguage(settings,'pl'),'pl','a later site language change takes precedence');
  for(const lang of ['uk','en','pl','ru'] as const) {
    assert.equal(resolveHookChartLanguage(normalizeOriginalHookChartPreferences({language:lang,siteLanguageAtSelection:'uk'}),'uk'),lang);
  }
});

test('both settings help and visual context picker portals inherit chart language',()=>{
  const settings=source('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const chart=source('../src/components/hookchart/HookChartCanvas.tsx');
  const profile=source('../src/components/profile/ProfileHookChartSettings.tsx');
  const languageContext=source('../src/context/LanguageContext.tsx');
  assert.match(settings,/ChartSettingsLanguageContext\.Provider value=\{chartLanguage\}/);
  assert.ok((settings.match(/const language = useContext\(ChartSettingsLanguageContext\);/g)||[]).length >= 10,
    'all settings sections, controls, strategies, switches and portals must follow the chart language');
  assert.equal((settings.match(/data-hookchart-language=\{language\} lang=\{language\}/g)||[]).length,2,
    'both portal roots must be scoped: settings help and visual context menu');
  assert.match(chart,/<OriginalHookChartSettings\s+open\s+language=\{chartLanguage\}/);
  assert.match(profile,/data-hookchart-language=\{chartLanguage\} lang=\{chartLanguage\}/);
  assert.match(profile,/<OriginalHookChartSettings\s+open\s+language=\{chartLanguage\}\s+embedded/);
  assert.match(languageContext,/element\.closest\('\[data-hookchart-language\]'\)/);
});

test('embedded candle-history description and market count formatting follow each chart language',()=>{
  const help='Обсяг історії застосовується окремо до кожного графіка після відкриття. Фактична кількість свічок залежить від біржі.';
  for(const lang of ['en','pl','ru'] as const){
    const value=translateHookChartPhrase(lang,help);
    assert.notEqual(value,help,lang);
    assert.ok(value.length>20,lang);
  }
  const settings=source('../src/components/hookchart/OriginalHookChartSettings.tsx');
  for(const locale of ["'uk-UA'","'en-US'","'pl-PL'","'ru-RU'"]) assert.ok(settings.includes(locale));
  assert.equal((settings.match(/toLocaleString\(candleCountLocale\[chartLanguage\]\)/g)||[]).length,2);
});
